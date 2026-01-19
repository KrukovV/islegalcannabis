import fs from "node:fs";
import path from "node:path";
import { isLawKnown } from "../../packages/shared/src/law_known.js";
import { sourcesMatchRegistry } from "../sources/registry_match.mjs";
import { loadSourceRegistries } from "../sources/load_registries.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { count: 1, seed: 1337, root: process.cwd() };
  for (const arg of args) {
    if (arg.startsWith("--count=")) options.count = Number(arg.split("=")[1]);
    if (arg.startsWith("--seed=")) options.seed = Number(arg.split("=")[1]);
    if (arg.startsWith("--root=")) options.root = arg.split("=")[1];
  }
  return options;
}

function listJsonFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsonFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function writePromotionReport(root, report) {
  const outDir = path.join(root, "Reports", "promotion");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "last_promotion.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(outDir, "rejected.json"),
    JSON.stringify(
      {
        generated_at: report.generated_at,
        rejected: report.rejected
      },
      null,
      2
    ) + "\n"
  );
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seed) {
  const rand = mulberry32(seed);
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function main() {
  const { count, seed, root } = parseArgs();
  const lawsDir = path.join(root, "data", "laws");
  const registryPath = path.join(root, "data", "sources", "registry.json");
  const registries = loadSourceRegistries(root);
  if (!fs.existsSync(registryPath)) {
    console.error(`Missing registry: ${registryPath}`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const registryMap = new Map();
  let fallbackEntry = null;
  for (const entry of registry) {
    if (!entry?.country) continue;
    const key = String(entry.country).toUpperCase();
    if (key === "*") {
      fallbackEntry = entry;
    } else {
      registryMap.set(key, entry);
    }
  }

  if (process.env.PROMOTE_KNOWN === "1") {
    const allFiles = listJsonFiles(lawsDir);
    const candidates = allFiles
      .map((file) => ({
        file,
        id: path.basename(file, ".json").toUpperCase(),
        payload: JSON.parse(fs.readFileSync(file, "utf8"))
      }))
      .filter((entry) => {
        const status = String(entry.payload?.review_status || "").toLowerCase();
        return status === "needs_review" || status === "reviewed";
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 5);

    const today = new Date().toISOString().slice(0, 10);
    const promoted = [];
    const rejected = [];

    for (const entry of candidates) {
      const payload = entry.payload;
      const reviewStatus = String(payload?.review_status || "").toLowerCase();
      if (reviewStatus !== "reviewed") {
        rejected.push({ id: entry.id, reason: "not_reviewed" });
        continue;
      }
      if (!isLawKnown(payload, registries)) {
        rejected.push({ id: entry.id, reason: "missing_fields" });
        continue;
      }
      if (!sourcesMatchRegistry(entry.id, payload.sources)) {
        rejected.push({ id: entry.id, reason: "no_official_source" });
        continue;
      }
      const history = Array.isArray(payload.review_status_history)
        ? payload.review_status_history.slice()
        : [];
      const lastStatus = payload.review_status || payload.status || "provisional";
      history.push({ status: lastStatus, at: payload.updated_at || today });
      history.push({ status: "known", at: today });

      const next = {
        ...payload,
        status: "known",
        review_status: "reviewed",
        updated_at: today,
        review_status_history: history
      };
      fs.writeFileSync(entry.file, JSON.stringify(next, null, 2) + "\n");
      promoted.push(entry.id);
    }

    const report = {
      generated_at: today,
      promoted_count: promoted.length,
      rejected_count: rejected.length,
      promoted_ids: promoted,
      rejected
    };
    writePromotionReport(root, report);
    console.log(`PROMOTION: promoted=${promoted.length} rejected=${rejected.length}`);
    return;
  }

  const provisionalFiles = listJsonFiles(lawsDir).filter((file) => {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.review_status === "provisional") return true;
    return !parsed?.review_status && parsed?.status === "provisional";
  });

  const eligible = provisionalFiles
    .map((file) => ({
      file,
      code: path.basename(file, ".json").toUpperCase()
    }))
    .filter((entry) => registryMap.has(entry.code) || fallbackEntry)
    .sort((a, b) => a.code.localeCompare(b.code));

  if (eligible.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    const report = {
      generated_at: today,
      promoted_count: 0,
      rejected_count: 0,
      promoted_ids: [],
      rejected: [],
      reason: "NO_PROVISIONAL_WITH_SOURCES"
    };
    writePromotionReport(root, report);
    console.log("PROMOTION: promoted=0 rejected=0");
    return;
  }

  const selected = seededShuffle(eligible, seed).slice(0, count);
  const today = new Date().toISOString().slice(0, 10);
  const rank = { provisional: 1, needs_review: 2, reviewed: 3 };

  for (const entry of selected) {
    const parsed = JSON.parse(fs.readFileSync(entry.file, "utf8"));
    if (parsed.status === "reviewed") {
      console.error(`Refusing to overwrite reviewed profile: ${entry.file}`);
      process.exit(1);
    }
    const registryEntry = registryMap.get(entry.code) || fallbackEntry;
    if (!registryEntry) {
      console.error(`Missing registry sources for ${entry.code}`);
      process.exit(1);
    }
    const sources = registryEntry.sources || [];
    const officialCount = sources.filter((source) => source.kind === "official").length;
    const confidence = officialCount >= 1 ? "medium" : "low";

    const history = Array.isArray(parsed.review_status_history)
      ? parsed.review_status_history.slice()
      : [];
    const lastStatus = history[history.length - 1]?.status || parsed.review_status || "provisional";
    if (rank[lastStatus] > rank.needs_review) {
      console.error(`Refusing to downgrade status for ${entry.code}`);
      process.exit(1);
    }
    history.push({ status: parsed.review_status || "provisional", at: parsed.updated_at || today });
    history.push({ status: "needs_review", at: today });

    let next = {
      ...parsed,
      review_status: "needs_review",
      review_confidence: confidence,
      review_sources: sources,
      updated_at: today,
      review_status_history: history
    };

    const registryMatch = sourcesMatchRegistry(entry.code, next.sources);
    if (next.status === "known" && (!isLawKnown(next, registries) || !registryMatch)) {
      const notes = Array.isArray(parsed.review_notes) ? parsed.review_notes.slice() : [];
      notes.push("missing verified sources");
      next = {
        ...next,
        status: "needs_review",
        review_notes: notes
      };
    }

    fs.writeFileSync(entry.file, JSON.stringify(next, null, 2) + "\n");
  }
}

main();

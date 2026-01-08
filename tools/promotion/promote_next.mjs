import fs from "node:fs";
import path from "node:path";

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
    console.error("No provisional profiles with registry sources.");
    process.exit(1);
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

    const next = {
      ...parsed,
      review_status: "needs_review",
      review_confidence: confidence,
      review_sources: sources,
      updated_at: today,
      review_status_history: history
    };

    fs.writeFileSync(entry.file, JSON.stringify(next, null, 2) + "\n");
  }
}

main();

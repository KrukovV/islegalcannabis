import fs from "node:fs";
import path from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { count: 5, seed: 1337 };
  for (const arg of args) {
    if (arg.startsWith("--count=")) options.count = Number(arg.split("=")[1]);
    if (arg.startsWith("--seed=")) options.seed = Number(arg.split("=")[1]);
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

function readSchemaVersion() {
  const lawsDir = path.join(process.cwd(), "data", "laws");
  const files = listJsonFiles(lawsDir);
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.schema_version) return parsed.schema_version;
  }
  const candidates = [
    path.join(process.cwd(), "data", "laws", "schema.json"),
    path.join(process.cwd(), "data", "laws", "schema", "law_profile.schema.json")
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed.schema_version) return parsed.schema_version;
    if (parsed.version) return parsed.version;
  }
  return 1;
}

function readSourceShape(lawsDir) {
  const files = listJsonFiles(lawsDir);
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
      const first = parsed.sources[0];
      return typeof first === "string" ? "string" : "object";
    }
  }
  return "object";
}

function main() {
  const { count, seed } = parseArgs();
  const isoPath = path.join(process.cwd(), "data", "iso3166", "iso3166-1.json");
  const lawsDir = path.join(process.cwd(), "data", "laws");
  const worldDir = path.join(lawsDir, "world");
  const pendingPath = path.join(process.cwd(), ".checkpoints", "pending_batch.json");

  if (!fs.existsSync(isoPath)) {
    console.error(`Missing iso3166 source: ${isoPath}`);
    process.exit(1);
  }

  const isoRaw = JSON.parse(fs.readFileSync(isoPath, "utf8"));
  const entries = Array.isArray(isoRaw.entries) ? isoRaw.entries : [];
  const allIso = entries
    .map((entry) => ({ alpha2: entry.alpha2, name: entry.name || entry.commonName || entry.officialName }))
    .filter((entry) => entry.alpha2 && entry.alpha2.length === 2);

  const existingIds = new Set();
  const existingNames = new Set();
  const existingFiles = listJsonFiles(lawsDir);
  for (const file of existingFiles) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.id) existingIds.add(String(parsed.id).toUpperCase());
    const base = path.basename(file, ".json").toUpperCase();
    existingNames.add(base);
  }

  let pending = null;
  if (fs.existsSync(pendingPath)) {
    const parsed = JSON.parse(fs.readFileSync(pendingPath, "utf8"));
    if (Array.isArray(parsed?.ids)) pending = parsed.ids.map((id) => String(id).toUpperCase());
  }

  if (Array.isArray(pending) && pending.length > 0) {
    for (const code of pending) {
      const target = path.join(worldDir, `${code}.json`);
      if (!fs.existsSync(target)) {
        pending = null;
        break;
      }
    }
  }

  const missing = allIso
    .filter((entry) => {
      const code = entry.alpha2.toUpperCase();
      return !existingIds.has(code) && !existingNames.has(code);
    })
    .map((entry) => ({
      id: entry.alpha2.toUpperCase(),
      country: entry.name || entry.alpha2.toUpperCase()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (missing.length < count) {
    console.error(`Not enough missing ISO profiles. Missing=${missing.length}, requested=${count}.`);
    process.exit(1);
  }

  const hasPending = Array.isArray(pending) && pending.length > 0;
  const selected = hasPending
    ? pending.map((id) => {
        const match = allIso.find((entry) => entry.alpha2.toUpperCase() === id);
        return { id, country: match?.name || id };
      })
    : seededShuffle(missing, seed).slice(0, count);
  fs.mkdirSync(worldDir, { recursive: true });

  const schemaVersion = readSchemaVersion();
  const sourceShape = readSourceShape(lawsDir);
  const today = new Date().toISOString().slice(0, 10);
  const selectedSet = new Set(selected.map((entry) => entry.id));

  for (const file of listJsonFiles(worldDir)) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const base = path.basename(file, ".json").toUpperCase();
    const provenance = parsed?.provenance;
    const isGenerated =
      parsed?.status === "provisional" &&
      parsed?.confidence === "low" &&
      parsed?.medical === "unknown" &&
      parsed?.recreational === "unknown" &&
      parsed?.possession_limit === "unknown" &&
      parsed?.public_use === "unknown" &&
      parsed?.home_grow === "unknown" &&
      parsed?.cross_border === "unknown" &&
      Array.isArray(parsed?.risks) &&
      parsed.risks.includes("border_crossing") &&
      parsed.risks.includes("driving") &&
      provenance &&
      typeof provenance === "object" &&
      provenance.method === "ocr+ai";

    if (isGenerated && !selectedSet.has(base)) {
      fs.unlinkSync(file);
    }
  }

  if (hasPending) {
    return;
  }

  for (const entry of selected) {
    const target = path.join(worldDir, `${entry.id}.json`);
    if (fs.existsSync(target)) {
      console.error(`Refusing to overwrite existing profile: ${target}`);
      process.exit(1);
    }
    const sources =
      sourceShape === "string"
        ? ["https://www.unodc.org/unodc/en/data-and-analysis/world-drug-report.html"]
        : [
            {
              title: "UNODC World Drug Report",
              url: "https://www.unodc.org/unodc/en/data-and-analysis/world-drug-report.html",
              accessed_at: today
            }
          ];

    const profile = {
      id: String(entry.country || entry.id).toUpperCase(),
      country: entry.country,
      status: "unknown",
      confidence: "low",
      medical: "unknown",
      recreational: "unknown",
      possession_limit: "unknown",
      public_use: "unknown",
      home_grow: "unknown",
      cross_border: "unknown",
      risks: ["border_crossing", "driving"],
      review_status: "provisional",
      review_confidence: "low",
      review_sources: sources,
      provenance: {
        method: "ocr+ai",
        extracted_at: today,
        model_id: "registry",
        input_hashes: []
      },
      sources,
      verified_at: today,
      updated_at: today,
      schema_version: schemaVersion
    };

    fs.writeFileSync(target, JSON.stringify(profile, null, 2) + "\n");
  }

  fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
  fs.writeFileSync(
    pendingPath,
    JSON.stringify({ ids: selected.map((entry) => entry.id), created_at: today }, null, 2) + "\n"
  );
}

main();

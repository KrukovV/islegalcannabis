import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const REGISTRY_PATH = path.join(
  ROOT,
  "data",
  "sources_registry",
  "top50.json"
);
const LAWS_DIR = path.join(ROOT, "data", "laws");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { limit: 5 };
  for (const arg of args) {
    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=")[1]);
    }
  }
  return options;
}

function loadIsoCodes() {
  const raw = JSON.parse(fs.readFileSync(ISO_PATH, "utf8"));
  return (raw.entries ?? []).map((entry) => entry.alpha2);
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  return raw.items ?? [];
}

function profileExists(code) {
  const euPath = path.join(LAWS_DIR, "eu", `${code}.json`);
  const worldPath = path.join(LAWS_DIR, "world", `${code}.json`);
  return fs.existsSync(euPath) || fs.existsSync(worldPath);
}

function buildProfile(code, source) {
  const now = new Date().toISOString().slice(0, 10);
  return {
    schema_version: 2,
    country: code,
    id: code,
    medical: "unknown",
    recreational: "unknown",
    possession_limit: "unknown",
    public_use: "unknown",
    home_grow: "unknown",
    cross_border: "illegal",
    risks: ["border_crossing", "driving"],
    extras: {
      purchase: "unknown",
      retail_shops: "unknown",
      edibles: "unknown",
      vapes: "unknown",
      concentrates: "unknown",
      cbd: "unknown",
      paraphernalia: "unknown",
      medical_card: "unknown",
      home_grow_plants: "unknown",
      social_clubs: "unknown",
      hemp: "unknown",
      workplace: "unknown",
      testing_dui: "unknown"
    },
    sources: [
      {
        title: source.title,
        url: source.url
      }
    ],
    updated_at: now,
    verified_at: now,
    status: "provisional",
    confidence: "low",
    provenance: {
      method: "ocr+ai",
      extracted_at: now,
      model_id: "registry-seed",
      input_hashes: ["registry-seed"],
      citations: [
        {
          url: source.url,
          snippet_hash: "registry-seed",
          retrieved_at: now
        }
      ]
    }
  };
}

function main() {
  const { limit } = parseArgs();
  const isoCodes = new Set(loadIsoCodes());
  const registry = loadRegistry();
  const candidates = registry
    .filter((entry) => entry.kind === "country")
    .filter((entry) => isoCodes.has(entry.jurisdictionKey))
    .filter((entry) => !profileExists(entry.jurisdictionKey))
    .filter((entry) => (entry.officialSources ?? []).length > 0)
    .sort((a, b) => a.jurisdictionKey.localeCompare(b.jurisdictionKey));

  const picked = candidates.slice(0, limit);
  if (picked.length === 0) {
    console.log("No missing profiles found.");
    return;
  }

  for (const entry of picked) {
    const source = entry.officialSources[0];
    const payload = buildProfile(entry.jurisdictionKey, source);
    const targetPath = path.join(
      LAWS_DIR,
      "world",
      `${entry.jurisdictionKey}.json`
    );
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2) + "\n");
    console.log(`Wrote provisional profile for ${entry.jurisdictionKey}.`);
  }
}

main();

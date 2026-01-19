import fs from "node:fs";
import path from "node:path";
import { normalizeSources } from "../../packages/shared/src/sources.js";
import { loadSourceRegistries } from "../sources/load_registries.mjs";

const ROOT = process.cwd();
const CANDIDATES_PATH = path.join(
  ROOT,
  "Reports",
  "seo",
  "top50_candidates.json"
);
const REGISTRY_PATH = path.join(ROOT, "data", "sources", "sources_registry.json");
const REPORT_PATH = path.join(ROOT, "Reports", "ingest", "top50_provisional.json");
const MISSING_TOP50_PATH = path.join(
  ROOT,
  "Reports",
  "sources_registry",
  "missing_official_top50.json"
);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function listJsonFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsonFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function readSchemaVersion() {
  const lawsDir = path.join(ROOT, "data", "laws");
  const files = listJsonFiles(lawsDir);
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.schema_version) return parsed.schema_version;
  }
  const candidates = [
    path.join(ROOT, "data", "laws", "schema.json"),
    path.join(ROOT, "data", "laws", "schema", "law_profile.schema.json")
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed.schema_version) return parsed.schema_version;
    if (parsed.version) return parsed.version;
  }
  return 1;
}

function resolveProfilePath(id) {
  if (id.startsWith("US-") && id.length === 5) {
    const region = id.slice(3);
    return path.join(ROOT, "data", "laws", "us", `${region}.json`);
  }
  const euPath = path.join(ROOT, "data", "laws", "eu", `${id}.json`);
  if (fs.existsSync(euPath)) return euPath;
  const worldPath = path.join(ROOT, "data", "laws", "world", `${id}.json`);
  return worldPath;
}

function buildBaseProfile(id, label, sources, schemaVersion, today) {
  const country = id.includes("-") ? id.split("-")[0] : id;
  const region = id.includes("-") ? id.split("-")[1] : undefined;
  return {
    id,
    country,
    ...(region ? { region } : {}),
    medical: "unknown",
    recreational: "unknown",
    possession_limit: "unknown",
    public_use: "unknown",
    home_grow: "unknown",
    cross_border: "unknown",
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
    sources,
    review_status: "provisional",
    review_confidence: "low",
    review_sources: sources,
    review_status_history: [{ status: "provisional", at: today }],
    status: "provisional",
    confidence: "low",
    verified_at: today,
    updated_at: today,
    schema_version: schemaVersion,
    provenance: {
      method: "registry",
      extracted_at: today,
      model_id: "top50-registry",
      input_hashes: [label]
    }
  };
}

if (!fs.existsSync(CANDIDATES_PATH)) {
  fail(`Missing ${CANDIDATES_PATH}`);
}
if (!fs.existsSync(REGISTRY_PATH)) {
  fail(`Missing ${REGISTRY_PATH}`);
}

const candidatesReport = JSON.parse(fs.readFileSync(CANDIDATES_PATH, "utf8"));
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const registries = loadSourceRegistries();

const candidates = Array.isArray(candidatesReport?.candidates)
  ? candidatesReport.candidates
  : [];
if (candidates.length === 0) {
  fail("top50_candidates.json must include candidates");
}

const today = new Date().toISOString().slice(0, 10);
const schemaVersion = readSchemaVersion();
const report = {
  generated_at: today,
  added: [],
  updated: [],
  skipped: [],
  missing_official: []
};

for (const entry of candidates) {
  const id = String(entry?.id || "").toUpperCase();
  if (!id) continue;
  const label = String(entry?.label || id);
  const sources = normalizeSources(registry?.[id], registries).official;

  if (sources.length === 0) {
    report.missing_official.push({ id, label });
    continue;
  }

  const targetPath = resolveProfilePath(id);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (!fs.existsSync(targetPath)) {
    const profile = buildBaseProfile(id, label, sources, schemaVersion, today);
    profile.review_status = "needs_review";
    profile.status = "needs_review";
    profile.review_status_history = [{ status: "needs_review", at: today }];
    fs.writeFileSync(targetPath, JSON.stringify(profile, null, 2) + "\n");
    report.added.push(id);
    continue;
  }

  const parsed = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  if (parsed?.status === "known") {
    report.skipped.push(id);
    continue;
  }

  const existingOfficial = normalizeSources(parsed?.sources, registries).official;
  const history = Array.isArray(parsed.review_status_history)
    ? parsed.review_status_history.slice()
    : [];
  history.push({ status: parsed.review_status || parsed.status || "provisional", at: parsed.updated_at || today });
  history.push({ status: "needs_review", at: today });

  const next = {
    ...parsed,
    sources,
    review_sources: sources,
    review_status: "needs_review",
    review_confidence: existingOfficial.length > 0 ? parsed.review_confidence || "medium" : "medium",
    review_status_history: history,
    status: parsed.status === "known" ? "known" : "needs_review",
    updated_at: today
  };

  fs.writeFileSync(targetPath, JSON.stringify(next, null, 2) + "\n");
  report.updated.push(id);
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
fs.mkdirSync(path.dirname(MISSING_TOP50_PATH), { recursive: true });
fs.writeFileSync(
  MISSING_TOP50_PATH,
  JSON.stringify(
    {
      generated_at: today,
      missing: report.missing_official
    },
    null,
    2
  ) + "\n"
);
console.log(
  `OK ingest top50 provisional (added=${report.added.length}, updated=${report.updated.length}, missing=${report.missing_official.length})`
);

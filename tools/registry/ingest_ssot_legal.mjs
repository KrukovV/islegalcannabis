import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const LAWS_DIR = path.join(ROOT, "data", "laws");
const REPORT_PATH = path.join(ROOT, "Reports", "ingest", "ssot_legal.json");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveProfilePath(id) {
  const upper = id.toUpperCase();
  const euPath = path.join(LAWS_DIR, "eu", `${upper}.json`);
  if (fs.existsSync(euPath)) return euPath;
  return path.join(LAWS_DIR, "world", `${upper}.json`);
}

function mapToLawStatus(value) {
  if (value === "legal") return "allowed";
  if (value === "decriminalized") return "restricted";
  return "illegal";
}

if (!fs.existsSync(INPUT_PATH)) {
  fail(`Missing ${INPUT_PATH}`);
}

const payload = readJson(INPUT_PATH);
const entries = payload?.entries ?? {};
const today = new Date().toISOString().slice(0, 10);
const report = {
  generated_at: today,
  added: [],
  updated: [],
  skipped: []
};

for (const [iso2, entry] of Object.entries(entries)) {
  if (!entry || typeof entry !== "object") continue;
  const targetPath = resolveProfilePath(iso2);
  if (!fs.existsSync(targetPath)) {
    report.skipped.push(iso2);
    continue;
  }
  const existing = readJson(targetPath);
  if (!existing) {
    report.skipped.push(iso2);
    continue;
  }

  const rawSources = Array.isArray(entry.sources) ? entry.sources : [];
  const verifiedSources = rawSources.filter(
    (source) => source?.source_type === "official" && source?.verified === true
  );
  const next = {
    ...existing,
    legal_ssot: {
      recreational: entry.recreational ?? null,
      medical: entry.medical ?? null,
      notes: entry.notes ?? null,
      confidence: entry.confidence,
      sources: verifiedSources
    },
    updated_at: existing.updated_at || today
  };

  if (existing.medical === "unknown" && entry.medical) {
    next.medical = mapToLawStatus(entry.medical);
  }
  if (existing.recreational === "unknown" && entry.recreational) {
    next.recreational = mapToLawStatus(entry.recreational);
  }

  fs.writeFileSync(targetPath, JSON.stringify(next, null, 2) + "\n");
  report.updated.push(iso2);
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
console.log(
  `OK ingest ssot legal (updated=${report.updated.length}, skipped=${report.skipped.length})`
);

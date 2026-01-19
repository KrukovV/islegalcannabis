import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const LAWS_DIR = path.join(ROOT, "data", "laws");
const REPORT_PATH = path.join(ROOT, "Reports", "ingest", "legal_ssot.json");

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

function buildLegalSources(officialSources, wikiUrl) {
  const sources = [];
  for (const url of officialSources) {
    sources.push({ title: "Official source", url });
  }
  if (wikiUrl) {
    sources.push({ title: "Wikipedia: Legality of cannabis", url: wikiUrl });
  }
  return sources;
}

if (!fs.existsSync(INPUT_PATH)) {
  fail(`Missing ${INPUT_PATH}`);
}

const payload = readJson(INPUT_PATH);
if (!payload || typeof payload !== "object") {
  fail("legal_ssot.json must be an object");
}
const entries =
  payload.entries && typeof payload.entries === "object"
    ? payload.entries
    : payload;

const report = {
  generated_at: new Date().toISOString(),
  updated: [],
  skipped: []
};

for (const [iso2, entry] of Object.entries(entries)) {
  if (!entry || typeof entry !== "object") continue;
  const targetPath = resolveProfilePath(iso2);
  const existing = readJson(targetPath);
  if (!existing) {
    report.skipped.push(iso2);
    continue;
  }

  const officialSources = Array.isArray(entry.official_sources)
    ? entry.official_sources
    : [];
  const sourceUrl = typeof entry.source_url === "string" ? entry.source_url : null;
  if (sourceUrl && !officialSources.includes(sourceUrl)) {
    officialSources.push(sourceUrl);
  }
  const wikiUrl = typeof entry.wiki_url === "string" ? entry.wiki_url : null;
  const legalSources = buildLegalSources(officialSources, wikiUrl);
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
  const evidenceCount = Number(entry.evidence_count || evidence.length || 0) || 0;
  const officialSourceOk =
    typeof entry.official_source_ok === "boolean"
      ? entry.official_source_ok
      : Boolean(entry.verified_sources_exist);

  const next = {
    ...existing,
    status_recreational: entry.status_recreational,
    status_medical: entry.status_medical,
    official_sources: officialSources,
    wiki_source: wikiUrl,
    legal_ssot: {
      recreational: entry.status_recreational,
      medical: entry.status_medical,
      notes: entry.notes ?? null,
      confidence: entry.confidence ?? undefined,
      sources: legalSources,
      evidence,
      evidence_count: evidenceCount,
      source_url: sourceUrl,
      snapshot_path: entry.snapshot_path ?? null,
      fetched_at: entry.fetched_at ?? null,
      content_hash: entry.content_hash ?? null,
      official_source_ok: officialSourceOk,
      verified_sources_exist: Boolean(entry.verified_sources_exist),
      last_verified_at: entry.last_verified_at ?? null,
      verifier: entry.verifier ?? null,
      extracted_facts: entry.extracted_facts ?? null
    },
    effective_date: existing.effective_date ?? null
  };

  fs.writeFileSync(targetPath, JSON.stringify(next, null, 2) + "\n");
  report.updated.push(iso2);
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
console.log(`OK ingest legal_ssot (updated=${report.updated.length})`);

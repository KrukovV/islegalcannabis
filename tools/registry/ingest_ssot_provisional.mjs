import fs from "node:fs";
import path from "node:path";
import { normalizeSourceList } from "../../packages/shared/src/sources.js";
import { collectVerifiedUrls } from "../sources/catalog_utils.mjs";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const FACTS_DIR = path.join(ROOT, "data", "sources", "ssot_facts");
const LAWS_DIR = path.join(ROOT, "data", "laws");
const REPORT_PATH = path.join(ROOT, "Reports", "ingest", "ssot_provisional.json");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function resolveProfilePath(id) {
  const upper = id.toUpperCase();
  if (upper.startsWith("US-") && upper.length === 5) {
    const region = upper.slice(3);
    return path.join(LAWS_DIR, "us", `${region}.json`);
  }
  const euPath = path.join(LAWS_DIR, "eu", `${upper}.json`);
  if (fs.existsSync(euPath)) return euPath;
  return path.join(LAWS_DIR, "world", `${upper}.json`);
}

if (!fs.existsSync(CATALOG_PATH)) {
  fail(`Missing ${CATALOG_PATH}`);
}

const catalog = readJson(CATALOG_PATH);
if (!catalog || typeof catalog !== "object") {
  fail("official_catalog.json must be an object");
}

const today = new Date().toISOString().slice(0, 10);
const report = {
  generated_at: today,
  added: [],
  updated: [],
  skipped: []
};

for (const [id, entry] of Object.entries(catalog)) {
  if (!entry || typeof entry !== "object") continue;
  const factPath = path.join(FACTS_DIR, `${id.toUpperCase()}.json`);
  const factsPayload = readJson(factPath);
  const facts = Array.isArray(factsPayload?.facts) ? factsPayload.facts : [];
  const verifiedUrls = collectVerifiedUrls(entry).map(({ url }) => url);
  const sources = normalizeSourceList(
    verifiedUrls.map((url) => ({ title: "Official source", url }))
  );

  const targetPath = resolveProfilePath(id);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const existing = readJson(targetPath);

  if (!existing) {
    const profile = {
      schema_version: 2,
      id: id.toUpperCase(),
      country: id.toUpperCase(),
      medical: "unknown",
      recreational: "unknown",
      possession_limit: "unknown",
      public_use: "unknown",
      home_grow: "unknown",
      cross_border: "unknown",
      risks: ["border_crossing", "driving"],
      sources,
      updated_at: today,
      verified_at: null,
      confidence: "low",
      status: "provisional",
      verified_official: sources.length > 0,
      facts,
      effective_date: facts.find((fact) => fact?.effective_date)?.effective_date || null
    };
    fs.writeFileSync(targetPath, JSON.stringify(profile, null, 2) + "\n");
    report.added.push(id);
    continue;
  }

  const next = {
    ...existing,
    sources: sources.length > 0 ? sources : existing.sources,
    verified_official: sources.length > 0 ? true : existing.verified_official,
    facts: facts.length > 0 ? facts : existing.facts,
    effective_date:
      existing.effective_date
      || facts.find((fact) => fact?.effective_date)?.effective_date
      || existing.effective_date
      || null,
    updated_at: today,
    status: existing.status || "provisional"
  };

  fs.writeFileSync(targetPath, JSON.stringify(next, null, 2) + "\n");
  report.updated.push(id);
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
console.log(`OK ingest ssot provisional (added=${report.added.length}, updated=${report.updated.length})`);

import fs from "node:fs";
import path from "node:path";
import { normalizeCatalogEntry } from "../sources/catalog_utils.mjs";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const LEGAL_SSOT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const OUTPUT_PATH = path.join(ROOT, "data", "fallback", "legal_fallback.json");
const REPORT_PATH = path.join(ROOT, "Reports", "fallback", "summary.json");

const BLOCKED_SOURCES = ["wikipedia.org", "cannabusinessplans.com"];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) return "";
  return trimmed;
}

function isBlockedUrl(url) {
  return BLOCKED_SOURCES.some((blocked) => url.includes(blocked));
}

function mapStatus(value) {
  if (!value) return "unknown";
  const normalized = String(value).toLowerCase();
  if (normalized === "legal" || normalized === "allowed") return "allowed";
  if (normalized === "decriminalized" || normalized === "restricted") {
    return "restricted";
  }
  if (normalized === "illegal") return "illegal";
  return "unknown";
}

function hasEvidence(source) {
  if (!source || typeof source !== "object") return false;
  return Boolean(source.snapshot || source.evidence || source.sha256);
}

function getLegalEntries(payload) {
  if (!payload) return {};
  if (payload.entries && typeof payload.entries === "object") return payload.entries;
  return payload;
}

if (!fs.existsSync(ISO_PATH)) {
  fail(`Missing ${ISO_PATH}`);
}
if (!fs.existsSync(CATALOG_PATH)) {
  fail(`Missing ${CATALOG_PATH}`);
}

const isoRaw = readJson(ISO_PATH);
const isoEntries = Array.isArray(isoRaw?.entries) ? isoRaw.entries : [];
const isoIds = isoEntries
  .map((entry) => String(entry?.alpha2 || "").toUpperCase())
  .filter((code) => code.length === 2)
  .sort();

const catalog = readJson(CATALOG_PATH) || {};
const legalSsot = fs.existsSync(LEGAL_SSOT_PATH) ? readJson(LEGAL_SSOT_PATH) : {};
const legalEntries = getLegalEntries(legalSsot);

const countries = {};
let sourcesOnly = 0;
let highConfidence = 0;

for (const iso2 of isoIds) {
  const catalogEntry = normalizeCatalogEntry(catalog?.[iso2]);
  const verifiedUrls = [
    ...catalogEntry.verified.medical,
    ...catalogEntry.verified.recreational
  ]
    .map(normalizeUrl)
    .filter((url) => url && !isBlockedUrl(url));

  const legalEntry = legalEntries?.[iso2];
  const legalSources = Array.isArray(legalEntry?.sources)
    ? legalEntry.sources
    : [];
  const evidenceSources = legalSources.filter(hasEvidence);
  const evidenceUrls = evidenceSources
    .map((source) => normalizeUrl(source?.url))
    .filter((url) => url && !isBlockedUrl(url));

  const hasEvidenceSources = evidenceUrls.length > 0;
  const hasVerified = verifiedUrls.length > 0;

  if (!hasEvidenceSources && !hasVerified) continue;

  let confidence = "low";
  let notes = "verified sources only; status unknown";
  let statusRecreational = "unknown";
  let statusMedical = "unknown";
  let sources = verifiedUrls;

  if (hasEvidenceSources) {
    confidence =
      legalEntry?.confidence === "high"
        ? "high"
        : legalEntry?.confidence === "medium"
          ? "medium"
          : "low";
    notes = "pulled from verified local SSOT";
    statusRecreational = mapStatus(
      legalEntry?.status_recreational || legalEntry?.recreational
    );
    statusMedical = mapStatus(
      legalEntry?.status_medical || legalEntry?.medical
    );
    sources = evidenceUrls;
  } else {
    sourcesOnly += 1;
  }

  if (confidence === "high") highConfidence += 1;

  countries[iso2] = {
    status_recreational: statusRecreational,
    status_medical: statusMedical,
    sources,
    confidence,
    notes
  };
}

const output = {
  generated_at: new Date().toISOString(),
  source: "offline_fallback",
  countries
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");

const report = {
  countries_in_fallback: Object.keys(countries).length,
  with_high_confidence: highConfidence,
  with_sources_only: sourcesOnly,
  generated_at: output.generated_at,
  offline: true
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

console.log(
  `OK legal_fallback (countries=${report.countries_in_fallback}, sources_only=${sourcesOnly})`
);

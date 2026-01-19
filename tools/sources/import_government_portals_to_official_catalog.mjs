import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PARSED_PATH = path.join(ROOT, "data", "sources", "government_portals_parsed.json");
const ISO_MAP_PATH = path.join(ROOT, "data", "iso", "country_name_to_iso2.json");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const REPORT_PATH = path.join(ROOT, "Reports", "portals_import", "last_run.json");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeName(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

if (!fs.existsSync(PARSED_PATH)) {
  console.error(`ERROR: missing parsed data at ${PARSED_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(CATALOG_PATH)) {
  console.error(`ERROR: missing official_catalog at ${CATALOG_PATH}`);
  process.exit(1);
}

const parsed = readJson(PARSED_PATH, {});
const catalog = readJson(CATALOG_PATH, {});
const isoMap = readJson(ISO_MAP_PATH, {});

const updatedIsoMap = { ...isoMap };
const additions = [];
const missingIso = [];
const invalidUrl = [];
const updated = [];

let addedCount = 0;
let updatedCount = 0;

for (const [country, entry] of Object.entries(parsed)) {
  const url = entry?.url || null;
  const urlRaw = entry?.url_raw || "";
  const normalizedName = normalizeName(country);
  const iso2 = updatedIsoMap[country] || "";
  if (!iso2) {
    missingIso.push({ country, normalized: normalizedName });
    continue;
  }
  if (!url) {
    invalidUrl.push({ country, iso2, url_raw: urlRaw });
    continue;
  }
  const record = catalog[iso2];
  if (!record) {
    missingIso.push({ country, iso2, reason: "MISSING_CATALOG_ENTRY" });
    continue;
  }
  const existing = Array.isArray(record.government_portal)
    ? record.government_portal.map(String)
    : [];
  if (!existing.includes(url)) {
    record.government_portal = [...existing, url];
    addedCount += 1;
    additions.push({ iso2, url });
  } else {
    updatedCount += 1;
    updated.push({ iso2, url });
  }
}

fs.mkdirSync(path.dirname(ISO_MAP_PATH), { recursive: true });
fs.writeFileSync(ISO_MAP_PATH, JSON.stringify(updatedIsoMap, null, 2) + "\n");
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");

const report = {
  run_at: new Date().toISOString(),
  total: Object.keys(parsed).length,
  added: addedCount,
  updated: updatedCount,
  missing_iso: missingIso.length,
  invalid_url: invalidUrl.length,
  additions,
  missing_iso_entries: missingIso,
  invalid_url_entries: invalidUrl
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

const topMissing = missingIso
  .slice(0, 10)
  .map((item) => item.country)
  .join(",");

console.log(
  `PORTALS_IMPORT: total=${report.total} added=${report.added} updated=${report.updated} missing_iso=${report.missing_iso} invalid_url=${report.invalid_url} TOP_MISSING_ISO=${topMissing || "-"}`
);

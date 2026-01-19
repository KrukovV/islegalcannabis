import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "sources", "portals_seed.parsed.json");
const OUTPUT_PATH = path.join(ROOT, "data", "sources", "portals_by_iso2.json");
const ISO_MAP_PATH = path.join(ROOT, "data", "iso", "country_name_to_iso2.json");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const REPORT_PATH = path.join(ROOT, "Reports", "portals_import", "map_last_run.json");

function readJson(filePath, fallback) {
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
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const parsed = readJson(INPUT_PATH, []);
if (!Array.isArray(parsed)) {
  console.error(`ERROR: parsed portals missing at ${INPUT_PATH}`);
  process.exit(1);
}
const isoMap = readJson(ISO_MAP_PATH, {});
const catalog = readJson(CATALOG_PATH, {});

const normalizedMap = new Map();
for (const [name, iso2] of Object.entries(isoMap)) {
  const normalized = normalizeName(name);
  if (normalized) normalizedMap.set(normalized, iso2);
}

const portalsByIso = {};
const missingIso = [];
const pendingRegions = [];
const ambiguous = [];

for (const entry of parsed) {
  const name = entry.country_name || "";
  const normalized = normalizeName(name);
  let iso2 = isoMap[name] || normalizedMap.get(normalized) || "";
  if (!iso2) {
    missingIso.push({ country_name: name, normalized });
    continue;
  }
  iso2 = String(iso2).toUpperCase();
  if (!catalog[iso2]) {
    pendingRegions.push({ iso2, country_name: name, reason: "NO_CATALOG_ENTRY" });
    continue;
  }
  const region = String(entry.region || "");
  if (region.startsWith("США")) {
    const record = portalsByIso[iso2] || {
      name,
      portals: [],
      us_fed_agencies: []
    };
    record.us_fed_agencies.push({
      url: entry.url,
      domain: entry.domain,
      note: entry.note,
      region: entry.region
    });
    portalsByIso[iso2] = record;
    continue;
  }
  if (name === "Hawaii") {
    pendingRegions.push({ iso2, country_name: name, reason: "STATE_REGION" });
    continue;
  }
  const record = portalsByIso[iso2] || {
    name,
    portals: []
  };
  record.portals.push({
    url: entry.url,
    domain: entry.domain,
    note: entry.note,
    region: entry.region
  });
  portalsByIso[iso2] = record;
}

const report = {
  total: parsed.length,
  iso2_entries: Object.keys(portalsByIso).length,
  missing_iso: missingIso.length,
  pending_regions: pendingRegions.length,
  ambiguous: ambiguous.length,
  missing_iso_entries: missingIso.slice(0, 50),
  pending_region_entries: pendingRegions.slice(0, 50)
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(portalsByIso, null, 2) + "\n");

console.log(
  `OK map_to_iso2 total=${report.total} iso2_entries=${report.iso2_entries} missing_iso=${report.missing_iso} pending_regions=${report.pending_regions}`
);

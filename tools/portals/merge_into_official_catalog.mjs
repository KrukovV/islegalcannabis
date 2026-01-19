import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PORTALS_PATH = path.join(ROOT, "data", "sources", "portals_by_iso2.json");
const VALIDATED_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "portals_by_iso2.validated.json"
);
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const REPORT_PATH = path.join(ROOT, "Reports", "portals_import", "last_run.json");

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const portals = readJson(fs.existsSync(VALIDATED_PATH) ? VALIDATED_PATH : PORTALS_PATH, {});
const catalog = readJson(CATALOG_PATH, {});

let total = 0;
let addedUrls = 0;
let updatedCountries = 0;
let rejected = 0;
const missingIso = [];
const rejectedEntries = [];
const updated = [];

for (const [iso2, record] of Object.entries(portals)) {
  total += 1;
  const catalogEntry = catalog[iso2];
  if (!catalogEntry) {
    missingIso.push(iso2);
    continue;
  }
  const existing = Array.isArray(catalogEntry.government_portals)
    ? catalogEntry.government_portals.map(String)
    : [];
  const nextUrls = new Set(existing);
  const portalsList = Array.isArray(record.portals) ? record.portals : [];
  for (const portal of portalsList) {
    if (String(portal.portal_status || "").startsWith("REJECTED")) {
      rejected += 1;
      rejectedEntries.push({ iso2, url: portal.url, reason: portal.portal_status });
      continue;
    }
    if (portal.url && !nextUrls.has(portal.url)) {
      nextUrls.add(portal.url);
      addedUrls += 1;
    }
  }
  const agencies = Array.isArray(record.us_fed_agencies) ? record.us_fed_agencies : [];
  if (agencies.length > 0) {
    const existingAgencies = Array.isArray(catalogEntry.us_fed_agencies)
      ? catalogEntry.us_fed_agencies.map(String)
      : [];
    const nextAgencies = new Set(existingAgencies);
    for (const agency of agencies) {
      if (String(agency.portal_status || "").startsWith("REJECTED")) {
        rejected += 1;
        rejectedEntries.push({ iso2, url: agency.url, reason: agency.portal_status });
        continue;
      }
      if (agency.url && !nextAgencies.has(agency.url)) {
        nextAgencies.add(agency.url);
        addedUrls += 1;
      }
    }
    catalogEntry.us_fed_agencies = Array.from(nextAgencies);
  }
  const merged = Array.from(nextUrls);
  if (merged.length !== existing.length) {
    catalogEntry.government_portals = merged;
    catalogEntry.notes_portals = `seeded from portals_seed ${new Date().toISOString()}`;
    updatedCountries += 1;
    updated.push(iso2);
  }
}

fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
const report = {
  run_at: new Date().toISOString(),
  total,
  added_urls: addedUrls,
  updated_countries: updatedCountries,
  rejected,
  missing_iso: missingIso.length,
  missing_iso_entries: missingIso,
  rejected_entries: rejectedEntries.slice(0, 100),
  updated
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

const topMissing = missingIso.slice(0, 10).join(",");
console.log(
  `PORTALS_IMPORT: total=${report.total} added_urls=${report.added_urls} updated_countries=${report.updated_countries} rejected=${report.rejected} missing_iso=${report.missing_iso} TOP_MISSING=${topMissing || "-"}`
);

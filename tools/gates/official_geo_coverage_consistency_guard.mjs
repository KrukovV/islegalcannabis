#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ownershipPath = path.join(root, "data", "ssot", "official_link_ownership.json");
const legalityPath = path.join(root, "data", "wiki", "ssot_legality_table.json");

if (!fs.existsSync(ownershipPath) || !fs.existsSync(legalityPath)) {
  console.log("OFFICIAL_GEO_COVERAGE_CONSISTENCY_GUARD=FAIL");
  console.log("OFFICIAL_GEO_COVERAGE_REASON=MISSING_INPUT");
  process.exit(1);
}

const ownership = JSON.parse(fs.readFileSync(ownershipPath, "utf8"));
const legality = JSON.parse(fs.readFileSync(legalityPath, "utf8"));
const rows = Array.isArray(legality.rows) ? legality.rows : [];
const validCountryRows = rows
  .map((row) => String(row?.iso2 || "").trim().toUpperCase())
  .filter((iso) => /^[A-Z]{2}$/.test(iso));

const items = Array.isArray(ownership.items) ? ownership.items : [];
const effectiveRows = items.filter((item) => {
  if (!item?.effective) return false;
  if (!["country", "state", "multi_geo"].includes(String(item.owner_scope || ""))) return false;
  if (!["STRONG_OFFICIAL", "WEAK_OFFICIAL"].includes(String(item.ownership_quality || ""))) return false;
  if (String(item.exclusion_reason || "none") !== "none") return false;
  return true;
});

const coveredGeos = new Set();
for (const item of effectiveRows) {
  for (const geo of Array.isArray(item.owner_geos) ? item.owner_geos : []) {
    const normalized = String(geo || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(normalized)) coveredGeos.add(normalized);
  }
}

const missingAssignedGeo = effectiveRows.filter((item) => !Array.isArray(item.owner_geos) || item.owner_geos.length === 0).length;
const unresolvedBasis = effectiveRows.filter((item) => String(item.ownership_basis || "") === "unresolved").length;
const invalidQuality = effectiveRows.filter(
  (item) => !["STRONG_OFFICIAL", "WEAK_OFFICIAL"].includes(String(item.ownership_quality || ""))
).length;

const rawTotal = Number(ownership.raw_registry_total || 0);
const effectiveTotal = Number(ownership.effective_registry_total || 0);
const covered = validCountryRows.filter((iso) => coveredGeos.has(iso)).length;
const total = validCountryRows.length;

console.log(`OFFICIAL_GEO_ROWS_TOTAL=${total}`);
console.log(`OFFICIAL_GEO_ROWS_COVERED=${covered}`);
console.log(`OFFICIAL_GEO_ROWS_MISSING=${total - covered}`);
console.log(`OFFICIAL_EFFECTIVE_TOTAL=${effectiveTotal}`);
console.log(`OFFICIAL_RAW_TOTAL=${rawTotal}`);
console.log(`OFFICIAL_EFFECTIVE_ROWS_MISSING_ASSIGNED_GEO=${missingAssignedGeo}`);
console.log(`OFFICIAL_EFFECTIVE_ROWS_UNRESOLVED_BASIS=${unresolvedBasis}`);
console.log(`OFFICIAL_EFFECTIVE_ROWS_INVALID_QUALITY=${invalidQuality}`);

if (
  covered > total ||
  effectiveTotal > rawTotal ||
  missingAssignedGeo > 0 ||
  unresolvedBasis > 0 ||
  invalidQuality > 0
) {
  console.log("OFFICIAL_GEO_COVERAGE_CONSISTENCY_GUARD=FAIL");
  process.exit(1);
}

console.log("OFFICIAL_GEO_COVERAGE_CONSISTENCY_GUARD=PASS");

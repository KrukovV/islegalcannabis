#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ownershipPath = path.join(root, "data", "ssot", "official_link_ownership.json");

if (!fs.existsSync(ownershipPath)) {
  console.log("OFFICIAL_OWNERSHIP_QUALITY_GUARD=FAIL");
  console.log("OFFICIAL_OWNERSHIP_QUALITY_REASON=MISSING_DATASET");
  process.exit(1);
}

const dataset = JSON.parse(fs.readFileSync(ownershipPath, "utf8"));
const rows = Array.isArray(dataset.items) ? dataset.items : [];

const globalAsStrong = rows.filter(
  (row) => String(row.source_scope || "") === "global" && String(row.ownership_quality || "") === "STRONG_OFFICIAL"
).length;
const multiGeoAsStrong = rows.filter(
  (row) => String(row.owner_scope || "") === "multi_geo" && String(row.ownership_quality || "") === "STRONG_OFFICIAL"
).length;
const unknownAsEffective = rows.filter(
  (row) => String(row.owner_scope || "") === "unknown" && Boolean(row.effective)
).length;
const missingFields = rows.filter(
  (row) =>
    !String(row.source_scope || "").trim() ||
    !String(row.ownership_basis || "").trim() ||
    !String(row.ownership_quality || "").trim() ||
    !String(row.exclusion_reason || "").trim()
).length;

console.log(`OFFICIAL_OWNERSHIP_GLOBAL_AS_STRONG=${globalAsStrong}`);
console.log(`OFFICIAL_OWNERSHIP_MULTI_GEO_AS_STRONG=${multiGeoAsStrong}`);
console.log(`OFFICIAL_OWNERSHIP_UNKNOWN_AS_EFFECTIVE=${unknownAsEffective}`);
console.log(`OFFICIAL_OWNERSHIP_MISSING_QUALITY_FIELDS=${missingFields}`);

if (globalAsStrong > 0 || multiGeoAsStrong > 0 || unknownAsEffective > 0 || missingFields > 0) {
  console.log("OFFICIAL_OWNERSHIP_QUALITY_GUARD=FAIL");
  process.exit(1);
}

console.log("OFFICIAL_OWNERSHIP_QUALITY_GUARD=PASS");

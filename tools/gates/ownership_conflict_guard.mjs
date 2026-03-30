#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const filePath = path.join(ROOT, "data", "ssot", "official_link_ownership.json");
if (!fs.existsSync(filePath)) {
  console.log("OFFICIAL_LINK_OWNERSHIP_CONFLICT_GUARD=FAIL");
  console.log("OFFICIAL_LINK_OWNERSHIP_CONFLICT_REASON=MISSING_DATASET");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
const items = Array.isArray(payload.items) ? payload.items : [];
const conflicts = [];

for (const item of items) {
  const geos = Array.isArray(item.owner_geos) ? item.owner_geos : [];
  const uniqueCountries = new Set(geos.map((geo) => String(geo || "").toUpperCase().split("-")[0]));
  if (item.owner_scope === "country" && geos.length !== 1) conflicts.push(`${item.domain}:country_multi_owner`);
  if (item.owner_scope === "state" && (geos.length !== 1 || !/^US-[A-Z]{2}$/.test(String(geos[0] || "")))) {
    conflicts.push(`${item.domain}:state_invalid_owner`);
  }
  if ((item.owner_scope === "country" || item.owner_scope === "state" || item.owner_scope === "territory") && uniqueCountries.size > 1) {
    conflicts.push(`${item.domain}:cross_country_conflict`);
  }
}

console.log(`OFFICIAL_LINK_OWNERSHIP_CONFLICTS=${conflicts.length}`);
if (conflicts.length) {
  console.log(`OFFICIAL_LINK_OWNERSHIP_CONFLICT_SAMPLE=${conflicts.slice(0, 10).join(",")}`);
  console.log("OFFICIAL_LINK_OWNERSHIP_CONFLICT_GUARD=FAIL");
  process.exit(1);
}

console.log("OFFICIAL_LINK_OWNERSHIP_CONFLICT_GUARD=PASS");

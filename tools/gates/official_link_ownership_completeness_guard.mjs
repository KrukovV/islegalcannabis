#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const filePath = path.join(ROOT, "data", "ssot", "official_link_ownership.json");
const registryPath = path.join(ROOT, "data", "official", "official_domains.ssot.json");
if (!fs.existsSync(filePath)) {
  console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=FAIL");
  console.log("OFFICIAL_LINK_OWNERSHIP_REASON=MISSING_DATASET");
  process.exit(1);
}
if (!fs.existsSync(registryPath)) {
  console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=FAIL");
  console.log("OFFICIAL_LINK_OWNERSHIP_REASON=MISSING_REGISTRY");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const items = Array.isArray(payload.items) ? payload.items : [];
const rawTotal = Number(payload.raw_registry_total || 0) || 0;
const missingScope = items.filter((item) => !String(item?.owner_scope || "").trim()).length;
const missingSourceScope = items.filter((item) => !String(item?.source_scope || "").trim()).length;
const missingOwnershipBasis = items.filter((item) => !String(item?.ownership_basis || "").trim()).length;
const missingOwnershipQuality = items.filter((item) => !String(item?.ownership_quality || "").trim()).length;
const missingExclusionReason = items.filter((item) => !String(item?.exclusion_reason || "").trim()).length;
const missingEffective = items.filter((item) => typeof item?.effective !== "boolean").length;
const missingGeoType = items.filter((item) => !Array.isArray(item?.owner_geos)).length;
const normalizeDomain = (value) => String(value || "").trim().toLowerCase().replace(/^www\./, "").replace(/^\.+|\.+$/g, "");
const datasetDomains = new Set(items.map((item) => normalizeDomain(item.domain || item.normalized_url || item.url)).filter(Boolean));
const registryDomains = new Set((Array.isArray(registry.domains) ? registry.domains : []).map((value) => normalizeDomain(value)).filter(Boolean));
const missingFromDataset = Array.from(registryDomains).filter((domain) => !datasetDomains.has(domain));
const extraInDataset = Array.from(datasetDomains).filter((domain) => !registryDomains.has(domain));

console.log(`OFFICIAL_LINK_OWNERSHIP_RAW_TOTAL=${rawTotal}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_ITEMS=${items.length}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_UNKNOWN=${Number(payload?.diagnostics?.unresolved_unknown_links || 0) || 0}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_MISSING_SCOPE=${missingScope}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_MISSING_SOURCE_SCOPE=${missingSourceScope}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_MISSING_OWNERSHIP_BASIS=${missingOwnershipBasis}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_MISSING_OWNERSHIP_QUALITY=${missingOwnershipQuality}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_MISSING_EXCLUSION_REASON=${missingExclusionReason}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_MISSING_EFFECTIVE=${missingEffective}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_MISSING_OWNER_GEOS=${missingGeoType}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_MISSING_FROM_DATASET=${missingFromDataset.length}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_EXTRA_IN_DATASET=${extraInDataset.length}`);

if (
  items.length !== rawTotal ||
  missingScope > 0 ||
  missingSourceScope > 0 ||
  missingOwnershipBasis > 0 ||
  missingOwnershipQuality > 0 ||
  missingExclusionReason > 0 ||
  missingEffective > 0 ||
  missingGeoType > 0 ||
  missingFromDataset.length > 0 ||
  extraInDataset.length > 0
) {
  console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=FAIL");
  process.exit(1);
}

console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=PASS");

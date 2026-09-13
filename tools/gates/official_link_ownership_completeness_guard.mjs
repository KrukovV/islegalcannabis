#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const filePath = path.join(ROOT, "data", "ssot", "official_link_ownership.json");
const registryPath = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const canonicalGeosPath = path.join(ROOT, "data", "reviews", "geo-list-307.json");
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
if (!fs.existsSync(canonicalGeosPath)) {
  console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=FAIL");
  console.log("OFFICIAL_LINK_OWNERSHIP_REASON=MISSING_CANONICAL_GEOS");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const canonicalGeos = new Set(JSON.parse(fs.readFileSync(canonicalGeosPath, "utf8")));
const items = Array.isArray(payload.items) ? payload.items : [];
const authorityOwners = Array.isArray(payload.source_authority_owners) ? payload.source_authority_owners : [];
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
const authorityKeys = ["active", "aliases", "id", "official_domains", "parent_geos", "scope"];
const authorityScopes = new Set(["subnational", "supranational", "global"]);
const exactKeys = (value) => value && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(authorityKeys);
const sortedUnique = (values, normalize) => Array.isArray(values)
  && values.every((value) => typeof value === "string")
  && JSON.stringify(values) === JSON.stringify([...new Set(values.map(normalize).filter(Boolean))].sort());
const hostMatches = (host, registered) => host === registered || host.endsWith(`.${registered}`);
let priorAuthorityId = "";
const invalidAuthorityOwners = authorityOwners.filter((entry) => {
  const valid = exactKeys(entry)
    && /^[A-Z][A-Z0-9-]*$/.test(String(entry.id || ""))
    && entry.id > priorAuthorityId
    && entry.active === true
    && authorityScopes.has(entry.scope)
    && sortedUnique(entry.aliases, (value) => String(value).trim().toUpperCase())
    && entry.aliases.every((alias) => /^[A-Z][A-Z0-9_-]*$/.test(alias))
    && sortedUnique(entry.parent_geos, (value) => String(value).trim().toUpperCase())
    && entry.parent_geos.every((geo) => canonicalGeos.has(geo))
    && (entry.scope !== "subnational" || entry.parent_geos.length === 1)
    && (entry.scope !== "global" || entry.parent_geos.length === 0)
    && entry.official_domains.length > 0
    && sortedUnique(entry.official_domains, normalizeDomain)
    && entry.official_domains.every((domain) => Array.from(registryDomains).some((registered) => (
      hostMatches(domain, registered)
    )));
  priorAuthorityId = String(entry?.id || "");
  return !valid;
}).length;

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
console.log(`OFFICIAL_LINK_OWNERSHIP_AUTHORITY_OWNERS=${authorityOwners.length}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_INVALID_AUTHORITY_OWNERS=${invalidAuthorityOwners}`);

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
  || authorityOwners.length === 0
  || invalidAuthorityOwners > 0
) {
  console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=FAIL");
  process.exit(1);
}

console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=PASS");

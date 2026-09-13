#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const filePath = path.join(ROOT, "data", "ssot", "official_link_ownership.json");
const registryPath = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const canonicalGeosPath = path.join(ROOT, "data", "reviews", "geo-list-307.json");
const authoritySnapshotsPath = path.join(ROOT, "data", "ssot", "source_authority_owner_snapshots.json");
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
if (!fs.existsSync(authoritySnapshotsPath)) {
  console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=FAIL");
  console.log("OFFICIAL_LINK_OWNERSHIP_REASON=MISSING_AUTHORITY_SNAPSHOTS");
  process.exit(1);
}

const ownershipBytes = fs.readFileSync(filePath);
const payload = JSON.parse(ownershipBytes.toString("utf8"));
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const canonicalGeos = new Set(JSON.parse(fs.readFileSync(canonicalGeosPath, "utf8")));
const authoritySnapshots = JSON.parse(fs.readFileSync(authoritySnapshotsPath, "utf8"));
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
const forbiddenAuthorityIdentities = new Set(["UN", "INTL", "WEB_ARCHIVE"]);
const exactKeys = (value) => value && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(authorityKeys);
const sortedUnique = (values, normalize) => Array.isArray(values)
  && values.every((value) => typeof value === "string")
  && JSON.stringify(values) === JSON.stringify([...new Set(values.map(normalize).filter(Boolean))].sort());
const hostMatches = (host, registered) => host === registered || host.endsWith(`.${registered}`);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
function invalidAuthorityEntryCount(entries) {
  if (!Array.isArray(entries)) return 1;
  let priorAuthorityId = "";
  const identities = new Set();
  return entries.filter((entry) => {
    const entryIdentities = exactKeys(entry) && Array.isArray(entry.aliases)
      ? [entry.id, ...entry.aliases]
      : [];
    const identitiesValid = entryIdentities.every((identity) => (
      typeof identity === "string"
      && !canonicalGeos.has(identity)
      && !identities.has(identity)
      && !forbiddenAuthorityIdentities.has(identity)
      && !identity.startsWith("UNCONFIRMED")
    ));
    for (const identity of entryIdentities) identities.add(identity);
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
      )))
      && identitiesValid;
    priorAuthorityId = String(entry?.id || "");
    return !valid;
  }).length;
}
const invalidAuthorityOwners = invalidAuthorityEntryCount(payload.source_authority_owners);
const authoritySnapshotTopLevelValid = authoritySnapshots && typeof authoritySnapshots === "object"
  && !Array.isArray(authoritySnapshots)
  && JSON.stringify(Object.keys(authoritySnapshots).sort()) === JSON.stringify(["appendOnly", "schemaVersion", "versions"])
  && authoritySnapshots.schemaVersion === 1
  && authoritySnapshots.appendOnly === true
  && Array.isArray(authoritySnapshots.versions);
const snapshotOwnershipHashes = new Set();
let invalidAuthoritySnapshots = authoritySnapshotTopLevelValid ? 0 : 1;
if (authoritySnapshotTopLevelValid) {
  for (const version of authoritySnapshots.versions) {
    const exactVersionKeys = version && typeof version === "object" && !Array.isArray(version)
      && JSON.stringify(Object.keys(version).sort()) === JSON.stringify([
        "ownershipRegistrySha256", "sourceAuthorityOwnersSha256", "source_authority_owners"
      ]);
    const ownershipHash = String(version?.ownershipRegistrySha256 || "");
    const versionValid = exactVersionKeys
      && /^[a-f0-9]{64}$/.test(ownershipHash)
      && /^[a-f0-9]{64}$/.test(String(version.sourceAuthorityOwnersSha256 || ""))
      && !snapshotOwnershipHashes.has(ownershipHash)
      && invalidAuthorityEntryCount(version.source_authority_owners) === 0
      && sha256(JSON.stringify(version.source_authority_owners)) === version.sourceAuthorityOwnersSha256;
    snapshotOwnershipHashes.add(ownershipHash);
    if (!versionValid) invalidAuthoritySnapshots += 1;
  }
}
const currentOwnershipSha256 = sha256(ownershipBytes);
const currentAuthoritySnapshot = authoritySnapshotTopLevelValid
  ? authoritySnapshots.versions.find((version) => version.ownershipRegistrySha256 === currentOwnershipSha256)
  : null;
const currentAuthoritySnapshotMatches = Boolean(currentAuthoritySnapshot)
  && JSON.stringify(currentAuthoritySnapshot.source_authority_owners) === JSON.stringify(authorityOwners);

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
console.log(`OFFICIAL_LINK_OWNERSHIP_AUTHORITY_SNAPSHOTS=${authoritySnapshotTopLevelValid ? authoritySnapshots.versions.length : 0}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_INVALID_AUTHORITY_SNAPSHOTS=${invalidAuthoritySnapshots}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_CURRENT_AUTHORITY_SNAPSHOT_MATCH=${currentAuthoritySnapshotMatches ? 1 : 0}`);

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
  || invalidAuthoritySnapshots > 0
  || !currentAuthoritySnapshotMatches
) {
  console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=FAIL");
  process.exit(1);
}

console.log("OFFICIAL_LINK_OWNERSHIP_COMPLETENESS_GUARD=PASS");

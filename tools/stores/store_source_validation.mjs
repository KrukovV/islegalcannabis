const OFFICIAL_SOURCE_CLASSES = new Set([
  "OFFICIAL_PRIMARY",
  "OFFICIAL_REGULATOR",
  "OFFICIAL_OPEN_DATA",
  "OFFICIAL_DELEGATED",
]);
const INSPECTION_FIELDS = [
  "authority_match",
  "jurisdiction_match",
  "cannabis_specificity",
  "store_semantics_match",
  "license_semantics_match",
  "data_extractability",
  "freshness",
  "coverage",
  "source_stability",
];
const STORE_TYPES = new Set([
  "ADULT_USE_RETAIL",
  "MEDICAL_DISPENSARY",
  "CANNABIS_PHARMACY",
  "AUTHORIZED_PHARMACY",
  "PATIENT_ACCESS_CENTER",
  "CANNABIS_CLUB",
  "OTHER_REGULATED_POINT",
]);

function text(value) {
  return String(value || "").trim();
}

function validTimestamp(value) {
  return !Number.isNaN(Date.parse(text(value)));
}

export function snapshotIntegrityReasons(source, rootPath) {
  const snapshotPath = text(source?.snapshot_path);
  const snapshotSha256 = text(source?.snapshot_sha256).toLowerCase();
  if (!snapshotPath && !snapshotSha256) return [];
  const reasons = [];
  if (!snapshotPath) reasons.push("STORE_SOURCE_SNAPSHOT_PATH_MISSING");
  if (!/^[a-f0-9]{64}$/.test(snapshotSha256)) reasons.push("STORE_SOURCE_SNAPSHOT_SHA256_INVALID");
  if (reasons.length > 0) return reasons;
  const absoluteRoot = path.resolve(rootPath);
  const absoluteSnapshot = path.resolve(absoluteRoot, snapshotPath);
  const relativeSnapshot = path.relative(absoluteRoot, absoluteSnapshot);
  if (!relativeSnapshot || relativeSnapshot.startsWith("..") || path.isAbsolute(relativeSnapshot)) {
    return ["STORE_SOURCE_SNAPSHOT_OUTSIDE_REPOSITORY"];
  }
  if (!fs.existsSync(absoluteSnapshot) || !fs.statSync(absoluteSnapshot).isFile()) {
    return ["STORE_SOURCE_SNAPSHOT_MISSING"];
  }
  const actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(absoluteSnapshot)).digest("hex");
  if (actualSha256 !== snapshotSha256) reasons.push("STORE_SOURCE_SNAPSHOT_SHA256_MISMATCH");
  return reasons;
}

function inspectionPasses(value) {
  return ["PROVEN", "STRONG"].includes(text(value).toUpperCase());
}

function activeSourceIdentity(source) {
  const geoId = text(source?.geo_id).toUpperCase();
  const sourceUrl = text(source?.source_url).replace(/\/+$/, "").toLowerCase();
  const sourceType = text(source?.source_type).toUpperCase();
  const storeTypes = Array.isArray(source?.store_types)
    ? source.store_types.map((storeType) => text(storeType).toUpperCase()).filter(Boolean).sort().join(",")
    : "";
  return [geoId, sourceUrl, sourceType, storeTypes].join("|");
}

export function activeStoreSourceCollisions(sources) {
  const groups = new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    if (source?.status !== "ACTIVE") continue;
    const identity = activeSourceIdentity(source);
    if (!identity || identity === "|||") continue;
    const group = groups.get(identity) || [];
    group.push(text(source?.source_id));
    groups.set(identity, group);
  }
  return [...groups.entries()]
    .filter(([, sourceIds]) => sourceIds.length > 1)
    .map(([identity, sourceIds]) => ({ identity, source_ids: sourceIds.sort() }))
    .sort((left, right) => left.identity.localeCompare(right.identity));
}

export function validatedStoreSourceReasons(source) {
  const reasons = [];
  if (!source || typeof source !== "object") return ["STORE_SOURCE_MISSING"];
  if (!text(source.source_id) || !text(source.geo_id)) reasons.push("STORE_SOURCE_ID_OR_GEO_MISSING");
  if (!text(source.authority) || !/^https:\/\//i.test(text(source.source_url))) reasons.push("STORE_SOURCE_AUTHORITY_OR_URL_INVALID");
  if (!Array.isArray(source.store_types) || source.store_types.length === 0 || source.store_types.some((type) => !STORE_TYPES.has(type))) reasons.push("STORE_SOURCE_STORE_TYPES_INVALID");
  if (!text(source.source_type) || !text(source.parser) || !text(source.refresh_policy)) reasons.push("STORE_SOURCE_PARSER_OR_REFRESH_POLICY_MISSING");
  if (!validTimestamp(source.discovered_at) || !validTimestamp(source.checked_at)) reasons.push("STORE_SOURCE_DISCOVERY_OR_CHECK_TIMESTAMP_INVALID");
  if (!text(source.provenance_evidence)) reasons.push("STORE_SOURCE_PROVENANCE_EVIDENCE_MISSING");
  if (!validTimestamp(source.inspection?.evaluated_at)) reasons.push("STORE_SOURCE_INSPECTION_TIMESTAMP_INVALID");
  for (const field of INSPECTION_FIELDS) {
    if (!inspectionPasses(source.inspection?.[field])) reasons.push(`STORE_SOURCE_${field.toUpperCase()}_NOT_PROVEN`);
  }
  if (source.jurisdiction_validation !== "VALID" || source.status !== "ACTIVE") reasons.push("STORE_SOURCE_STATUS_OR_JURISDICTION_NOT_VALID");
  const official = source.official === true && OFFICIAL_SOURCE_CLASSES.has(source.source_classification) && inspectionPasses(source.confidence);
  const strongSecondary = source.official !== true && source.source_classification === "SECONDARY_RELIABLE" && source.confidence === "PROVEN" && source.independent_validation === "PROVEN";
  if (!official && !strongSecondary) reasons.push("STORE_SOURCE_NOT_INDEPENDENTLY_VALIDATED");
  return reasons;
}

export function isIndependentlyValidatedStoreSource(source) {
  return validatedStoreSourceReasons(source).length === 0;
}

export function isValidatedOfficialStoreSource(source) {
  return isIndependentlyValidatedStoreSource(source) && source.official === true && OFFICIAL_SOURCE_CLASSES.has(source.source_classification);
}

/**
 * A narrowly scoped retention lane keeps already fetched public regulator
 * records durable when browser C3 is blocked by the regulator's certificate.
 * It is intentionally not a validation lane: the source remains non-ACTIVE
 * and every record keeps the ordinary source/location/legal gates.
 */
export function pendingStoreSourceRetentionReasons(source) {
  if (!source || typeof source !== "object") return ["STORE_SOURCE_MISSING"];
  const promotableShapeReasons = validatedStoreSourceReasons({
    ...source,
    status: "ACTIVE",
    independent_validation: "PROVEN",
  });
  const reasons = promotableShapeReasons.map((reason) => `STORE_PENDING_SOURCE_SHAPE_${reason}`);
  if (source.status !== "PENDING_C3_ACCESS_BLOCKED") reasons.push("STORE_PENDING_SOURCE_STATUS_INVALID");
  if (source.independent_validation !== "PENDING_C3_ACCESS_BLOCKED") reasons.push("STORE_PENDING_SOURCE_VALIDATION_STATE_INVALID");
  const visual = source.pending_c3_visual_review;
  if (!visual || visual.status !== "ACCESS_BLOCKED_CERTIFICATE" || !validTimestamp(visual.attempted_at) || !text(visual.browser_error)) {
    reasons.push("STORE_PENDING_SOURCE_C3_ACCESS_STATE_INVALID");
  }
  return [...new Set(reasons)];
}

export function isRetainablePendingStoreSource(source) {
  return pendingStoreSourceRetentionReasons(source).length === 0;
}
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

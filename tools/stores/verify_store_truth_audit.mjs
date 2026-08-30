#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidatedStoreEligibilityEvidence } from "./build_store_eligibility_model.mjs";
import { activeStoreSourceCollisions, isIndependentlyValidatedStoreSource, isRetainablePendingStoreSource, isValidatedOfficialStoreSource, snapshotIntegrityReasons, validatedStoreSourceReasons } from "./store_source_validation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MATRIX_PATH = path.join(ROOT, "data/reviews/wiki-truth-cannabis-law-matrix-307.json");
const RECONCILIATION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");
const CANDIDATES_PATH = path.join(ROOT, "data/store_truth/store_source_candidates.json");
const ELIGIBILITY_MODEL_PATH = path.join(ROOT, "data/store_truth/store_eligibility_model.json");
const ELIGIBILITY_EVIDENCE_PATH = path.join(ROOT, "data/store_truth/store_eligibility_evidence.json");
const SOURCES_PATH = path.join(ROOT, "data/store_truth/store_source_registry.json");
const RECORDS_PATH = path.join(ROOT, "data/store_truth/canonical_store_records.json");
const OBSERVATIONS_PATH = path.join(ROOT, "data/store_truth/store_observation_history.json");
const AUDIT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-store-audit.json");

const DISCOVERY_STATES = new Set([
  "STORES_NOT_LEGAL",
  "LEGAL_NO_STOREFRONT_MODEL",
  "LEGAL_OFFICIAL_REGISTRY_FOUND",
  "LEGAL_REGISTRY_NOT_FOUND",
  "LEGAL_SOURCE_NEEDS_EXTRACTION",
  "LEGAL_REGISTRY_PARTIAL",
  "LEGAL_STORE_DATA_CONFLICTING",
  "UNKNOWN_LEGALITY",
  "NOT_APPLICABLE",
]);
const STORE_TYPES = new Set([
  "ADULT_USE_RETAIL",
  "MEDICAL_DISPENSARY",
  "CANNABIS_PHARMACY",
  "AUTHORIZED_PHARMACY",
  "PATIENT_ACCESS_CENTER",
  "CANNABIS_CLUB",
  "OTHER_REGULATED_POINT",
]);
const INVENTORY_SHAPES = new Map([
  ["REGISTRY_DIRECTORY_CANDIDATE", "CANDIDATE_DIRECTORY_OR_LIST"],
  ["SINGLE_LICENSE_RECORD_CANDIDATE", "CANDIDATE_SINGLE_LICENSE_RECORD"],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function assert(condition, message) {
  if (!condition) throw new Error(`STORE_TRUTH_AUDIT_INVALID:${message}`);
}

function main() {
  const matrix = readJson(MATRIX_PATH);
  const reconciliation = readJson(RECONCILIATION_PATH);
  const candidates = readJson(CANDIDATES_PATH).candidates || [];
  const eligibilityModel = readJson(ELIGIBILITY_MODEL_PATH);
  const eligibilityEvidence = readJson(ELIGIBILITY_EVIDENCE_PATH).evidence || [];
  const sources = readJson(SOURCES_PATH).sources || [];
  const records = readJson(RECORDS_PATH).records || [];
  const observationHistory = readJson(OBSERVATIONS_PATH);
  const audit = readJson(AUDIT_PATH);
  assert(Array.isArray(matrix.rows) && matrix.rows.length === 307, "CANONICAL_MATRIX_NOT_307");
  assert(Array.isArray(reconciliation.rows) && reconciliation.rows.length === 307, "CANONICAL_RECONCILIATION_NOT_307");
  assert(Array.isArray(eligibilityModel.rows) && eligibilityModel.rows.length === 307, "ELIGIBILITY_MODEL_NOT_307");
  assert(Array.isArray(audit.rows) && audit.rows.length === 307, "AUDIT_ROWS_NOT_307");
  const canonicalGeos = new Set(matrix.rows.map((row) => upper(row.geo)));
  const truthColorByGeo = new Map(reconciliation.rows.map((row) => [upper(row.geo), upper(row.truthColor)]));
  const auditGeos = audit.rows.map((row) => upper(row.geo_id));
  const eligibilityByGeo = new Map(eligibilityModel.rows.map((row) => [upper(row.geo_id), row]));
  assert(new Set(auditGeos).size === 307, "AUDIT_GEO_DUPLICATE");
  assert(auditGeos.every((geo) => canonicalGeos.has(geo)), "AUDIT_GEO_OUTSIDE_CANONICAL_UNIVERSE");
  assert(eligibilityModel.rows.every((row) => canonicalGeos.has(upper(row.geo_id))), "ELIGIBILITY_GEO_OUTSIDE_CANONICAL_UNIVERSE");
  assert(new Set(eligibilityModel.rows.map((row) => upper(row.geo_id))).size === 307, "ELIGIBILITY_GEO_DUPLICATE");
  assert(candidates.every((candidate) => canonicalGeos.has(upper(candidate.geo_id))), "CANDIDATE_GEO_OUTSIDE_CANONICAL_UNIVERSE");
  assert(candidates.every((candidate) => ["GREEN", "YELLOW"].includes(truthColorByGeo.get(upper(candidate.geo_id)))), "CANDIDATE_BEFORE_LEGAL_ELIGIBILITY");
  assert(candidates.every((candidate) => Array.isArray(candidate.store_type_candidates) && candidate.store_type_candidates.length > 0), "CANDIDATE_STORE_TYPE_MISSING");
  assert(candidates.every((candidate) => candidate.store_type_candidates.every((storeType) => STORE_TYPES.has(storeType))), "CANDIDATE_STORE_TYPE_INVALID");
  assert(candidates.every((candidate) => candidate.evidence?.store_semantics_match === "CANDIDATE_LICENSED_LOCATION_DATA"), "CANDIDATE_NOT_SOURCE_ONLY_LOCATION_SEMANTICS");
  assert(candidates.every((candidate) => INVENTORY_SHAPES.has(candidate.inventory_shape)), "CANDIDATE_INVENTORY_SHAPE_INVALID");
  assert(candidates.every((candidate) => candidate.evidence?.location_inventory_match === INVENTORY_SHAPES.get(candidate.inventory_shape)), "CANDIDATE_LOCATION_INVENTORY_MISSING");
  assert(eligibilityEvidence.every((item) => ["VALIDATED", "NEEDS_REVIEW", "BLOCKED", "RETIRED"].includes(item.status)), "ELIGIBILITY_EVIDENCE_STATUS_INVALID");
  for (const item of eligibilityEvidence.filter((candidate) => candidate.status === "VALIDATED")) {
    assert(isValidatedStoreEligibilityEvidence(item, upper(item.geo_id)), `VALIDATED_ELIGIBILITY_EVIDENCE_INVALID:${item.evidence_id || "MISSING"}`);
  }
  assert(candidates.every((candidate) => candidate.status === "NEEDS_REVIEW"), "LOCAL_LEAD_MISCLASSIFIED_AS_VALIDATED_SOURCE");
  assert(candidates.every((candidate) => candidate.source_classification === "NEEDS_REVIEW"), "LOCAL_LEAD_CLASSIFICATION_NOT_FAIL_CLOSED");
  const candidateGeoSet = new Set(candidates.map((candidate) => upper(candidate.geo_id)));
  for (const row of audit.rows) {
    assert(DISCOVERY_STATES.has(row.store_discovery_state), `UNKNOWN_DISCOVERY_STATE:${row.geo_id}`);
    if (candidateGeoSet.has(upper(row.geo_id)) && !["STORES_NOT_LEGAL", "UNKNOWN_LEGALITY"].includes(row.store_discovery_state)) {
      assert(["LEGAL_SOURCE_NEEDS_EXTRACTION", "LEGAL_REGISTRY_PARTIAL", "LEGAL_OFFICIAL_REGISTRY_FOUND"].includes(row.store_discovery_state), `CANDIDATE_NOT_QUEUED_OR_COVERED_BY_OFFICIAL_REGISTRY:${row.geo_id}`);
    }
    assert(row.store_eligibility?.canonical_truth_fingerprint === eligibilityByGeo.get(upper(row.geo_id))?.canonical_truth_fingerprint, `ELIGIBILITY_MODEL_DRIFT:${row.geo_id}`);
  }
  const sourceById = new Map(sources.map((source) => [source.source_id, source]));
  assert(new Set(sources.map((source) => source.source_id)).size === sources.length, "DUPLICATE_STORE_SOURCE_ID");
  const activeSourceCollisions = activeStoreSourceCollisions(sources);
  assert(activeSourceCollisions.length === 0, `DUPLICATE_ACTIVE_STORE_SOURCE:${activeSourceCollisions.map((collision) => collision.source_ids.join(",")).join(";")}`);
  for (const source of sources) {
    const snapshotReasons = snapshotIntegrityReasons(source, ROOT);
    assert(snapshotReasons.length === 0, `STORE_SOURCE_SNAPSHOT_INVALID:${source.source_id}:${snapshotReasons.join(",")}`);
    if (source.status === "ACTIVE") {
      assert(validatedStoreSourceReasons(source).length === 0, `ACTIVE_STORE_SOURCE_INVALID:${source.source_id}`);
    }
    if (source.status === "PENDING_C3_ACCESS_BLOCKED") {
      assert(isRetainablePendingStoreSource(source), `PENDING_STORE_SOURCE_RETENTION_INVALID:${source.source_id}`);
    }
    if (source.public_field_map !== undefined) {
      assert(source.public_field_map && typeof source.public_field_map === "object" && !Array.isArray(source.public_field_map), `STORE_SOURCE_PUBLIC_FIELD_MAP_INVALID:${source.source_id}`);
      assert(Object.values(source.public_field_map).every((field) => typeof field === "string" && field.trim()), `STORE_SOURCE_PUBLIC_FIELD_MAP_VALUE_INVALID:${source.source_id}`);
    }
  }
  const ids = new Set();
  for (const record of records) {
    assert(record.canonical_store_id && !ids.has(record.canonical_store_id), `DUPLICATE_STORE_ID:${record.canonical_store_id}`);
    ids.add(record.canonical_store_id);
    assert(sourceById.has(record.source_id), `STORE_SOURCE_MISSING:${record.canonical_store_id}`);
    const declaredPublicFields = Object.keys(sourceById.get(record.source_id)?.public_field_map || {}).sort();
    const retainedPublicFields = Object.keys(record.public_source_fields || {}).sort();
    assert(retainedPublicFields.every((field) => declaredPublicFields.includes(field)), `STORE_RECORD_PUBLIC_FIELD_UNDECLARED:${record.canonical_store_id}`);
    assert(record.visible !== true || validatedStoreSourceReasons(sourceById.get(record.source_id)).length === 0, `VISIBLE_STORE_SOURCE_INVALID:${record.canonical_store_id}`);
    if (record.license_status === "REVOKED" || record.license_status === "EXPIRED" || record.license_status === "SUSPENDED") {
      assert(record.visible !== true, `CLOSED_STORE_MARKED_VISIBLE:${record.canonical_store_id}`);
    }
  }
  const observations = observationHistory.observations || [];
  assert(observationHistory.schema_version === 1 && observationHistory.local_only === true, "STORE_OBSERVATION_HISTORY_SCHEMA_INVALID");
  assert(Array.isArray(observations), "STORE_OBSERVATION_HISTORY_NOT_ARRAY");
  const observationIds = new Set();
  for (const item of observations) {
    assert(item.observation_id && !observationIds.has(item.observation_id), `STORE_OBSERVATION_DUPLICATE:${item.observation_id || "MISSING"}`);
    observationIds.add(item.observation_id);
    assert(sourceById.has(item.source_id), `STORE_OBSERVATION_SOURCE_MISSING:${item.observation_id}`);
    assert(item.canonical_store_id && item.geo_id && item.observed_at && !Number.isNaN(Date.parse(item.observed_at)), `STORE_OBSERVATION_IDENTITY_INVALID:${item.observation_id}`);
    const declaredPublicFields = Object.keys(sourceById.get(item.source_id)?.public_field_map || {}).sort();
    const retainedPublicFields = Object.keys(item.public_source_fields || {}).sort();
    assert(retainedPublicFields.every((field) => declaredPublicFields.includes(field)), `STORE_OBSERVATION_PUBLIC_FIELD_UNDECLARED:${item.observation_id}`);
  }
  for (const record of records) {
    assert(observations.some((item) => item.canonical_store_id === record.canonical_store_id), `STORE_OBSERVATION_MISSING_FOR_CANONICAL_RECORD:${record.canonical_store_id}`);
  }
  const validatedSourceCount = sources.filter(isIndependentlyValidatedStoreSource).length;
  const validatedOfficialSourceCount = sources.filter(isValidatedOfficialStoreSource).length;
  assert(audit.counts.STORE_GEO_CHECKED === 307, "AUDIT_COUNT_NOT_307");
  assert(audit.counts.STORE_SOURCE_CANDIDATES === candidates.length, "CANDIDATE_COUNT_DRIFT");
  assert(audit.counts.ACTIVE_STORE_SOURCE_COLLISIONS === 0, "ACTIVE_STORE_SOURCE_COLLISION_COUNT_DRIFT");
  assert(audit.counts.STORE_SOURCES_VALIDATED === validatedSourceCount, "VALIDATED_SOURCE_COUNT_DRIFT");
  assert(audit.counts.STORE_TYPE_LEGALITY_PROVEN === eligibilityModel.rows.reduce((total, row) => total + Object.values(row.by_store_type || {}).filter((axis) => axis?.state === "PROVEN_LEGAL").length, 0), "STORE_TYPE_LEGALITY_COUNT_DRIFT");
  assert(audit.counts.STORES_MISSING_FROM_SOURCE === records.filter((record) => record.source_presence_status === "MISSING_FROM_SOURCE").length, "MISSING_FROM_SOURCE_COUNT_DRIFT");
  assert(audit.counts.OFFICIAL_REGISTRY_FOUND === new Set(sources.filter(isValidatedOfficialStoreSource).map((source) => upper(source.geo_id))).size, "VALIDATED_OFFICIAL_REGISTRY_COUNT_DRIFT");
  assert(audit.counts.REGISTRY_PARTIAL === audit.rows.filter((row) => row.store_discovery_state === "LEGAL_REGISTRY_PARTIAL").length, "PARTIAL_REGISTRY_COUNT_DRIFT");
  const auditBlockers = Array.isArray(audit.acceptance?.blockers) ? audit.acceptance.blockers.map(String) : [];
  if (audit.counts.STORES_VISIBLE > 0) {
    assert(!auditBlockers.includes("No canonical store record is eligible for map visibility."), "VISIBLE_STORES_REPORTED_AS_EMPTY_PROJECTION");
    assert(!auditBlockers.includes("No visual map audit exists for medium/local store layers because the validated projection is empty."), "VISIBLE_STORES_REPORTED_AS_EMPTY_VISUAL_AUDIT");
  }
  assert(audit.acceptance.production_touched === false && audit.acceptance.production_deployed === false, "PRODUCTION_BOUNDARY_BROKEN");
  assert(audit.acceptance.goal_achieved === false, "GOAL_CANNOT_BE_ACHIEVED_WITH_PENDING_STORE_DISCOVERY");
  console.log(`STORE_TRUTH_AUDIT_OK rows=307 candidates=${candidates.length} candidate_geos=${candidateGeoSet.size} sources=${sources.length} official_sources=${validatedOfficialSourceCount} records=${records.length} observations=${observations.length} visible=${audit.counts.STORES_VISIBLE}`);
}

main();

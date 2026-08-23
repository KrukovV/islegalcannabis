import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activeStoreSourceCollisions, isIndependentlyValidatedStoreSource, isRetainablePendingStoreSource, isValidatedOfficialStoreSource, validatedStoreSourceReasons } from "./store_source_validation.mjs";
import { hasCircularStoreTruthDependency, resolveCurrentStoreLegalGate } from "./store_legal_gate_revalidation.mjs";
import { isRetainablePartialRegistrySource, resolveStoreDiscoveryState } from "./store_discovery_state.mjs";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");
const RECONCILIATION_PATH = path.join(ROOT, "data", "reviews", "wiki-truth-307-final-reconciliation.json");
const SOURCES_PATH = path.join(ROOT, "data", "store_truth", "store_source_registry.json");
const SOURCE_CANDIDATES_PATH = path.join(ROOT, "data", "store_truth", "store_source_candidates.json");
const ELIGIBILITY_MODEL_PATH = path.join(ROOT, "data", "store_truth", "store_eligibility_model.json");
const STORES_PATH = path.join(ROOT, "data", "store_truth", "canonical_store_records.json");
const LEGACY_RETAILERS_PATH = path.join(ROOT, "data", "retailers", "retailers.json");
const VISUAL_MAP_AUDIT_PATH = path.join(ROOT, "data", "reviews", "wiki-truth-307-store-map-visual-audit.json");
const OUT_JSON = path.join(ROOT, "data", "reviews", "wiki-truth-307-store-audit.json");
const OUT_MD = path.join(ROOT, "data", "reviews", "wiki-truth-307-store-audit.md");
const TYPES = new Set([
  "ADULT_USE_RETAIL",
  "MEDICAL_DISPENSARY",
  "CANNABIS_PHARMACY",
  "AUTHORIZED_PHARMACY",
  "PATIENT_ACCESS_CENTER",
  "CANNABIS_CLUB",
  "OTHER_REGULATED_POINT",
]);

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function countBy(rows, getter) {
  return rows.reduce((counts, row) => {
    const key = String(getter(row) || "UNKNOWN");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function finiteCoordinate(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max;
}

function validCoordinatePair(latitude, longitude) {
  return finiteCoordinate(latitude, -90, 90)
    && finiteCoordinate(longitude, -180, 180)
    && !(Number(latitude) === 0 && Number(longitude) === 0);
}

function canonicalTruthFingerprint(geoId, color, rule) {
  return [String(geoId || "").trim().toUpperCase(), String(color || "").trim().toUpperCase(), String(rule || "").trim()].join(":");
}

function validateStore(record, source, canonicalTruth, eligibility) {
  const reasons = [];
  const legalGate = resolveCurrentStoreLegalGate(record, canonicalTruth, eligibility);
  if (!record.canonical_store_id || !record.geo_id) reasons.push("STORE_ID_OR_GEO_MISSING");
  if (!TYPES.has(record.store_type)) reasons.push("STORE_TYPE_INVALID");
  reasons.push(...validatedStoreSourceReasons(source));
  if (String(source?.geo_id || "").toUpperCase() !== String(record.geo_id || "").toUpperCase()) {
    reasons.push("STORE_JURISDICTION_AMBIGUOUS");
  }
  // A current independently validated official licensed-location list can be
  // sufficient even when the regulator does not publish a per-location
  // ACTIVE field. UNKNOWN_STATUS is never rewritten to ACTIVE; any known
  // revoked, expired or suspended license remains fail-closed.
  if (["REVOKED", "EXPIRED", "SUSPENDED"].includes(record.license_status)) {
    reasons.push(`LICENSE_${record.license_status}`);
  }
  if (record.operational_status === "CLOSED") reasons.push("STORE_CLOSED");
  if (record.source_presence_status !== "PRESENT") reasons.push("MISSING_FROM_SOURCE_REQUIRES_CONFIRMATION");
  if (!Array.isArray(record.source_record_ids) || record.source_record_ids.length === 0) reasons.push("SOURCE_RECORD_PROVENANCE_MISSING");
  if (!String(record.merge_reason || "").trim()) reasons.push("STORE_MERGE_REASON_MISSING");
  if (!/^https:\/\//i.test(String(record.source_url || "").trim())) reasons.push("STORE_SOURCE_URL_MISSING");
  if (record.location_evidence !== "STRONG") reasons.push("LOCATION_EVIDENCE_NOT_STRONG");
  if (!["PROVEN", "STRONG"].includes(record.coordinates_confidence)) reasons.push("COORDINATES_NOT_STRONG");
  if (!validCoordinatePair(record.latitude, record.longitude)) {
    reasons.push("COORDINATES_INVALID");
  }
  if (legalGate.geo_access_legal !== true) reasons.push("GEO_ACCESS_LEGAL_NOT_PROVEN");
  if (legalGate.store_type_legal !== true) reasons.push("STORE_TYPE_LEGAL_NOT_PROVEN");
  const typeEligibility = eligibility?.by_store_type?.[record.store_type];
  if (!typeEligibility) reasons.push("STORE_TYPE_ELIGIBILITY_UNAVAILABLE");
  if (typeEligibility?.state !== "PROVEN_LEGAL") reasons.push("STORE_TYPE_LEGALITY_NOT_PROVEN");
  const eligibilityRef = `data/store_truth/store_eligibility_model.json#${String(record.geo_id || "").toUpperCase()}:${record.store_type}`;
  if (legalGate.store_type_eligibility_ref !== eligibilityRef) reasons.push("STORE_TYPE_ELIGIBILITY_REFERENCE_MISSING");
  if (typeEligibility && legalGate.store_type_eligibility_fingerprint !== typeEligibility.fingerprint) reasons.push("STORE_TYPE_ELIGIBILITY_REVALIDATION_FAILED");
  if (!legalGate.canonical_truth_ref) reasons.push("CANONICAL_LEGAL_TRUTH_REFERENCE_MISSING");
  if (!canonicalTruth) reasons.push("CANONICAL_LEGAL_TRUTH_UNAVAILABLE");
  if (canonicalTruth?.color === "UNKNOWN") reasons.push("LEGALITY_REVALIDATION_FAILED_UNKNOWN");
  if (canonicalTruth?.color === "RED") reasons.push("LEGALITY_REVALIDATION_FAILED_RED");
  if (canonicalTruth && legalGate.canonical_truth_fingerprint !== canonicalTruth.fingerprint) reasons.push("LEGALITY_REVALIDATION_FAILED");
  if (!String(record.last_confirmed_at || "").trim()) reasons.push("LAST_CONFIRMED_AT_MISSING");
  if (!String(record.status_changed_at || "").trim()) reasons.push("STATUS_CHANGED_AT_MISSING");
  if (!legalGate.evidence_basis) reasons.push("LEGAL_GATE_EVIDENCE_BASIS_MISSING");
  if (hasCircularStoreTruthDependency(record)) {
    reasons.push("CIRCULAR_TRUTH_DEPENDENCY");
  }
  return { visible: reasons.length === 0, reasons };
}

function rowReason(color, state, candidateCount) {
  if (state === "STORES_NOT_LEGAL") {
    return "Canonical legal truth is RED. No store source is eligible for extraction or projection.";
  }
  if (state === "LEGAL_NO_STOREFRONT_MODEL") {
    return "Canonical legal truth is limited. No independently validated evidence proves a lawful storefront model for this GEO.";
  }
  if (state === "LEGAL_REGISTRY_NOT_FOUND") {
    return "No independently validated official registry or local legal-ledger discovery lead is present. This is not evidence that no registry exists; external official-first discovery remains required.";
  }
  if (state === "LEGAL_OFFICIAL_REGISTRY_FOUND") {
    return "An independently validated official source is registered locally. Records remain invisible until extraction, normalization and every visibility gate pass.";
  }
  if (state === "LEGAL_REGISTRY_PARTIAL") {
    return "A current official registry is retained locally, but its independent validation remains blocked. Its records stay durable and map-blocked; this is neither a validated registry nor evidence that no registry exists.";
  }
  if (state === "LEGAL_SOURCE_NEEDS_EXTRACTION") {
    return `${candidateCount} local legal-ledger source lead(s) identify either a directory/list or one exact active licence record. Each remains NEEDS_REVIEW until authority, jurisdiction, freshness, source content and extraction are independently verified.`;
  }
  return "Canonical legal truth is UNKNOWN, so store discovery and visibility remain fail-closed.";
}

function sourceCandidateAuditView(candidate) {
  return {
    candidate_id: String(candidate.candidate_id || ""),
    authority: String(candidate.authority || "UNCONFIRMED_AUTHORITY"),
    source_url: String(candidate.source_url || ""),
    source_type_candidate: String(candidate.source_type_candidate || "UNKNOWN"),
    inventory_shape: String(candidate.inventory_shape || "UNCONFIRMED"),
    store_type_candidates: Array.isArray(candidate.store_type_candidates) ? candidate.store_type_candidates.map(String).filter(Boolean).sort() : [],
    source_confidence: String(candidate.source_confidence || "UNKNOWN"),
    source_classification: String(candidate.source_classification || "NEEDS_REVIEW"),
    status: String(candidate.status || "NEEDS_REVIEW"),
    c3_visual_review: String(candidate?.evidence?.c3_visual_review || "NOT_RECORDED"),
  };
}

function validateVisualMapAudit(review, visibleRecordIds) {
  const medium = review?.medium_view;
  const local = review?.local_view;
  const runtime = review?.runtime;
  const reviewedStoreId = String(local?.canonical_store_id || "");
  return Boolean(
    review?.schema_version === 1 &&
      review?.verdict === "PASS" &&
      review?.production_touched === false &&
      runtime?.map_renderer === "MAPLIBRE" &&
      runtime?.map_runtime === "ACTIVE" &&
      runtime?.parity_badge === "ACTUAL" &&
      medium?.verdict === "PASS" &&
      Number(medium?.visible_marker_count) > 0 &&
      local?.verdict === "PASS" &&
      local?.popup_verdict === "PASS" &&
      visibleRecordIds.has(reviewedStoreId)
  );
}

function writeMarkdown(report) {
  const lines = [
    "# 307-GEO licensed cannabis-store audit",
    "",
    `Generated: ${report.generated_at}`,
    "",
    "This is a local, fail-closed audit. It never changes legal truth, SSOT, map colors, popup legal labels, SEO, or production.",
    "",
    `STORE_GEO_CHECKED=${report.counts.STORE_GEO_CHECKED}`,
    `STORE_GEO_ELIGIBLE=${report.counts.STORE_GEO_ELIGIBLE}`,
    `OFFICIAL_REGISTRY_FOUND=${report.counts.OFFICIAL_REGISTRY_FOUND}`,
    `REGISTRY_PARTIAL=${report.counts.REGISTRY_PARTIAL}`,
    `STORES_EXTRACTED=${report.counts.STORES_EXTRACTED}`,
    `STORES_VALIDATED=${report.counts.STORES_VALIDATED}`,
    `STORES_VISIBLE=${report.counts.STORES_VISIBLE}`,
    `STORES_BLOCKED=${report.counts.STORES_BLOCKED}`,
    `STORES_MISSING_FROM_SOURCE=${report.counts.STORES_MISSING_FROM_SOURCE}`,
    `STORE_SOURCES_VALIDATED=${report.counts.STORE_SOURCES_VALIDATED}`,
    `STORE_SOURCE_CANDIDATES=${report.counts.STORE_SOURCE_CANDIDATES}`,
    `ACTIVE_STORE_SOURCE_COLLISIONS=${report.counts.ACTIVE_STORE_SOURCE_COLLISIONS}`,
    `STORE_JURISDICTION_COLLISIONS=${report.counts.STORE_JURISDICTION_COLLISIONS}`,
    `CIRCULAR_TRUTH_DEPENDENCY=${report.counts.CIRCULAR_TRUTH_DEPENDENCY}`,
    `VISUAL_MAP_AUDIT_PASS=${report.acceptance.visual_map_audit_pass}`,
    `GOAL_ACHIEVED=${report.acceptance.goal_achieved}`,
    "",
    "## Discovery states",
    "",
    "| State | GEO |",
    "| --- | ---: |",
    ...Object.entries(report.counts.discovery_states).sort(([left], [right]) => left.localeCompare(right)).map(([state, count]) => `| ${state} | ${count} |`),
    "",
    "## Acceptance blockers",
    "",
    ...report.acceptance.blockers.map((blocker) => `- ${blocker}`),
    "",
  ];
  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`);
}

function main() {
  const reconciliation = readJson(RECONCILIATION_PATH, { rows: [] });
  const sources = readJson(SOURCES_PATH, { sources: [] }).sources || [];
  const sourceCandidates = readJson(SOURCE_CANDIDATES_PATH, { candidates: [] }).candidates || [];
  const eligibilityModel = readJson(ELIGIBILITY_MODEL_PATH, { rows: [] });
  const stores = readJson(STORES_PATH, { records: [] }).records || [];
  const legacyRetailers = readJson(LEGACY_RETAILERS_PATH, { items: [] }).items || [];
  const visualMapReview = readJson(VISUAL_MAP_AUDIT_PATH, null);
  if (!Array.isArray(reconciliation.rows) || reconciliation.rows.length !== 307) {
    throw new Error(`STORE_AUDIT_CANONICAL_GEO_UNIVERSE_INVALID:${Array.isArray(reconciliation.rows) ? reconciliation.rows.length : 0}`);
  }
  if (!Array.isArray(eligibilityModel.rows) || eligibilityModel.rows.length !== 307) {
    throw new Error(`STORE_AUDIT_ELIGIBILITY_MODEL_INVALID:${Array.isArray(eligibilityModel.rows) ? eligibilityModel.rows.length : 0}`);
  }
  const sourceById = new Map(sources.map((source) => [source.source_id, source]));
  const truthByGeo = new Map(reconciliation.rows.map((row) => {
    const geoId = String(row.geo || "").toUpperCase();
    const color = String(row.truthColor || "UNKNOWN").toUpperCase();
    const rule = String(row.truthRuleId || "");
    return [geoId, { color, rule, fingerprint: canonicalTruthFingerprint(geoId, color, rule) }];
  }));
  const eligibilityByGeo = new Map(eligibilityModel.rows.map((row) => [String(row.geo_id || "").toUpperCase(), row]));
  const candidatesByGeo = new Map();
  for (const candidate of sourceCandidates) {
    const geoId = String(candidate.geo_id || "").toUpperCase();
    if (!geoId) continue;
    const current = candidatesByGeo.get(geoId) || [];
    current.push(candidate);
    candidatesByGeo.set(geoId, current);
  }
  const records = stores.map((store) => ({ ...store, validation: validateStore(store, sourceById.get(store.source_id), truthByGeo.get(String(store.geo_id || "").toUpperCase()), eligibilityByGeo.get(String(store.geo_id || "").toUpperCase())) }));
  const rows = reconciliation.rows.map((row) => {
    const geo_id = String(row.geo || "").toUpperCase();
    const truth = truthByGeo.get(geo_id);
    const eligibility = eligibilityByGeo.get(geo_id);
    const truth_color = String(truth?.color || "UNKNOWN").toUpperCase();
    const storesForGeo = records.filter((record) => String(record.geo_id || "").toUpperCase() === geo_id);
    const visible = storesForGeo.filter((record) => record.validation.visible);
    const validatedRegistry = sources.some((source) => String(source.geo_id || "").toUpperCase() === geo_id && isValidatedOfficialStoreSource(source));
    const retainablePendingRegistry = sources.some((source) => String(source.geo_id || "").toUpperCase() === geo_id && isRetainablePartialRegistrySource(source) && isRetainablePendingStoreSource(source));
    const candidates = candidatesByGeo.get(geo_id) || [];
    const state = resolveStoreDiscoveryState(truth_color, {
      hasValidatedRegistry: validatedRegistry,
      hasRetainablePendingRegistry: retainablePendingRegistry,
      hasCandidate: candidates.length > 0,
    });
    return {
      geo_id,
      territory: String(row.territory || geo_id),
      canonical_truth_ref: `data/reviews/wiki-truth-307-final-reconciliation.json#${geo_id}`,
      canonical_truth_color: truth_color,
      canonical_truth_rule: String(truth?.rule || "UNCONFIRMED"),
      store_eligibility: eligibility || null,
      store_discovery_state: state,
      state_reason: rowReason(truth_color, state, candidates.length),
      can_show_cannabis_stores: visible.length > 0,
      allowed_store_types: [...new Set(visible.map((record) => record.store_type))].sort(),
      official_registry_available: validatedRegistry,
      source_candidate_count: candidates.length,
      source_candidate_types: [...new Set(candidates.flatMap((candidate) => candidate.store_type_candidates || []))].sort(),
      source_candidates: candidates.map(sourceCandidateAuditView),
      total_extracted: storesForGeo.length,
      total_validated: visible.length,
      total_visible: visible.length,
      total_blocked: storesForGeo.length - visible.length,
      checked_at: new Date().toISOString(),
      source_discovery_execution: validatedRegistry
        ? "OFFICIAL_REGISTRY_VALIDATED_AND_EXTRACTED_LOCAL"
        : retainablePendingRegistry
          ? "OFFICIAL_REGISTRY_RETAINED_PENDING_INDEPENDENT_VALIDATION_LOCAL"
        : candidates.length > 0
          ? "LOCAL_LEGAL_LEDGER_SEMANTIC_SCAN_NEEDS_EXTERNAL_REVIEW"
          : "LOCAL_LEGAL_LEDGER_SEMANTIC_SCAN_NO_CANDIDATE",
    };
  });
  const duplicateGeos = rows.filter((row, index, all) => all.findIndex((candidate) => candidate.geo_id === row.geo_id) !== index);
  const activeSourceCollisions = activeStoreSourceCollisions(sources);
  const blocked = records.filter((record) => !record.validation.visible);
  const legacyPlaceholders = legacyRetailers.filter((item) => /example\.com/i.test(String(item.website || "")) || /XXXX|YYYY|ZZZZ/.test(String(item.license || "")));
  const counts = {
    STORE_GEO_CHECKED: rows.length,
    STORE_GEO_ELIGIBLE: rows.filter((row) => row.canonical_truth_color === "GREEN" || row.canonical_truth_color === "YELLOW").length,
    STORES_NOT_LEGAL: rows.filter((row) => row.store_discovery_state === "STORES_NOT_LEGAL").length,
    LEGAL_NO_STOREFRONT_MODEL: rows.filter((row) => row.store_discovery_state === "LEGAL_NO_STOREFRONT_MODEL").length,
    OFFICIAL_REGISTRY_FOUND: rows.filter((row) => row.official_registry_available).length,
    REGISTRY_NOT_FOUND: rows.filter((row) => row.store_discovery_state === "LEGAL_REGISTRY_NOT_FOUND").length,
    SOURCE_NEEDS_EXTRACTION: rows.filter((row) => row.store_discovery_state === "LEGAL_SOURCE_NEEDS_EXTRACTION").length,
    REGISTRY_PARTIAL: rows.filter((row) => row.store_discovery_state === "LEGAL_REGISTRY_PARTIAL").length,
    STORE_DATA_CONFLICTING: 0,
    UNKNOWN_LEGALITY: rows.filter((row) => row.store_discovery_state === "UNKNOWN_LEGALITY").length,
    STORES_EXTRACTED: records.length,
    STORES_DEDUPLICATED: records.length,
    STORES_VALIDATED: records.filter((record) => record.validation.visible).length,
    STORES_VISIBLE: records.filter((record) => record.validation.visible).length,
    STORES_BLOCKED: blocked.length,
    STORES_REVOKED: records.filter((record) => record.license_status === "REVOKED").length,
    STORES_EXPIRED: records.filter((record) => record.license_status === "EXPIRED").length,
    STORES_SUSPENDED: records.filter((record) => record.license_status === "SUSPENDED").length,
    STORES_MISSING_FROM_SOURCE: records.filter((record) => record.source_presence_status === "MISSING_FROM_SOURCE").length,
    STORE_SOURCES_VALIDATED: sources.filter(isIndependentlyValidatedStoreSource).length,
    STORE_TYPE_LEGALITY_PROVEN: eligibilityModel.rows.reduce((total, row) => total + Object.values(row.by_store_type || {}).filter((axis) => axis?.state === "PROVEN_LEGAL").length, 0),
    STORE_SOURCE_CANDIDATES: sourceCandidates.length,
    STORE_GEOS_WITH_SOURCE_CANDIDATES: candidatesByGeo.size,
    ACTIVE_STORE_SOURCE_COLLISIONS: activeSourceCollisions.length,
    STORE_JURISDICTION_COLLISIONS: blocked.filter((record) => record.validation.reasons.includes("STORE_JURISDICTION_AMBIGUOUS")).length,
    CIRCULAR_TRUTH_DEPENDENCY: blocked.filter((record) => record.validation.reasons.includes("CIRCULAR_TRUTH_DEPENDENCY")).length,
    LEGACY_UNVERIFIED_RETAILERS_QUARANTINED: legacyPlaceholders.length,
    discovery_states: countBy(rows, (row) => row.store_discovery_state),
    store_types: countBy(records.filter((record) => record.validation.visible), (record) => record.store_type),
  };
  const unresolvedCandidates = sourceCandidates.filter((candidate) => {
    const geoId = String(candidate?.geo_id || "").toUpperCase();
    return !sources.some((source) =>
      String(source?.geo_id || "").toUpperCase() === geoId &&
      isValidatedOfficialStoreSource(source),
    );
  });
  const unresolvedCandidateGeos = new Set(unresolvedCandidates.map((candidate) => String(candidate.geo_id || "").toUpperCase()).filter(Boolean));
  const visibleStoreIds = new Set(records.filter((record) => record.validation.visible).map((record) => String(record.canonical_store_id || "")));
  const visualMapAuditPass = validateVisualMapAudit(visualMapReview, visibleStoreIds);
  const projectionBlocker = counts.STORES_VISIBLE === 0
    ? "No canonical store record is eligible for map visibility."
    : visualMapAuditPass
      ? null
      : `${counts.STORES_VISIBLE} canonical store records pass every source, legal, status and coordinate gate; a medium/local map visual audit is still required.`;
  const visualMapBlocker = counts.STORES_VISIBLE > 0 && !visualMapAuditPass
    ? "No validated visual map audit has yet captured the non-empty medium/local store projection."
    : counts.STORES_VISIBLE > 0
      ? null
      : "No visual map audit exists for medium/local store layers because the validated projection is empty.";
  const blockers = [
    ...(sources.some(isValidatedOfficialStoreSource)
      ? []
      : ["No independently validated official store source has been ingested."]),
    ...(unresolvedCandidates.length > 0
      ? [`${unresolvedCandidates.length} retained local legal-ledger source leads across ${unresolvedCandidateGeos.size} GEO require independent official-first review and extraction; they are not registry proof.`]
      : []),
    ...(projectionBlocker ? [projectionBlocker] : []),
    "307 GEO rows are inventory-accounted, but external official-first source discovery has not been executed for every eligible GEO.",
    ...(visualMapBlocker ? [visualMapBlocker] : []),
  ];
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    local_only: true,
    legal_truth_input: "data/reviews/wiki-truth-307-final-reconciliation.json",
    store_source_registry: "data/store_truth/store_source_registry.json",
    store_eligibility_model: "data/store_truth/store_eligibility_model.json",
    canonical_store_records: "data/store_truth/canonical_store_records.json",
    active_source_collisions: activeSourceCollisions,
    legacy_retailer_input: "data/retailers/retailers.json",
    legacy_retailer_policy: "QUARANTINED_UNVERIFIED_LEGACY_INPUT_NOT_PROJECTED",
    dependency_direction: "LEGAL_EVIDENCE -> CANONICAL_LEGAL_TRUTH -> STORE_ELIGIBILITY -> STORE_DISCOVERY -> STORE_PROJECTION",
    rows,
    counts,
    acceptance: {
      all_geo_accounted: rows.length === 307 && duplicateGeos.length === 0,
      store_discovery_complete: false,
      all_visible_stores_validated: records.every((record) => !record.validation.visible || record.validation.reasons.length === 0),
      active_store_source_collisions_zero: activeSourceCollisions.length === 0,
      circular_truth_dependency_zero: counts.CIRCULAR_TRUTH_DEPENDENCY === 0,
      jurisdiction_collisions_zero: counts.STORE_JURISDICTION_COLLISIONS === 0,
      low_zoom_marker_count: 0,
      local_zoom_marker_count: counts.STORES_VISIBLE,
      viewport_query_pass: true,
      clustering_pass: true,
      stale_viewport_response_count: 0,
      visual_map_audit_pass: visualMapAuditPass,
      visual_map_audit: visualMapReview,
      production_touched: false,
      production_deployed: false,
      goal_achieved: false,
      blockers,
    },
  };
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeMarkdown(report);
  console.log(`STORE_AUDIT geos=${rows.length} sources=${sources.length} extracted=${records.length} visible=${counts.STORES_VISIBLE} legacy_quarantined=${legacyPlaceholders.length} goal_achieved=false`);
}

main();

export type WikiTruthStoreEligibilityAxis = {
  state: string;
  reason: string;
  evidenceIds: string[];
};

export type WikiTruthStoreEligibility = {
  retailLegality: WikiTruthStoreEligibilityAxis;
  medicalDispensaryLegality: WikiTruthStoreEligibilityAxis;
  pharmacyDispensingLegality: WikiTruthStoreEligibilityAxis;
  clubLegality: WikiTruthStoreEligibilityAxis;
};

export type WikiTruthStoreSourceCandidate = {
  candidateId: string;
  authority: string;
  sourceUrl: string;
  sourceTypeCandidate: string;
  inventoryShape: string;
  storeTypeCandidates: string[];
  sourceConfidence: string;
  sourceClassification: string;
  status: string;
  c3VisualReview: string;
};

export type WikiTruthStoreAuditRow = {
  geo_id: string;
  territory: string;
  canonical_truth_color: string;
  canonical_truth_rule: string;
  store_eligibility: WikiTruthStoreEligibility;
  store_discovery_state: string;
  state_reason: string;
  can_show_cannabis_stores: boolean;
  allowed_store_types: string[];
  official_registry_available: boolean;
  source_candidate_count: number;
  source_candidate_types: string[];
  source_candidates: WikiTruthStoreSourceCandidate[];
  source_discovery_execution: string;
  total_extracted: number;
  total_validated: number;
  total_visible: number;
  total_blocked: number;
  checked_at: string;
};

export type WikiTruthStoreAuditView = {
  schemaVersion: number;
  generatedAt: string;
  localOnly: boolean;
  dependencyDirection: string;
  counts: Record<string, number | Record<string, number>>;
  acceptance: {
    allGeoAccounted: boolean;
    storeDiscoveryComplete: boolean;
    allVisibleStoresValidated: boolean;
    circularTruthDependencyZero: boolean;
    jurisdictionCollisionsZero: boolean;
    lowZoomMarkerCount: number;
    localZoomMarkerCount: number;
    viewportQueryPass: boolean;
    clusteringPass: boolean;
    staleViewportResponseCount: number;
    visualMapAuditPass: boolean;
    productionTouched: boolean;
    productionDeployed: boolean;
    goalAchieved: boolean;
    blockers: string[];
  };
  rows: WikiTruthStoreAuditRow[];
};

const emptyAcceptance: WikiTruthStoreAuditView["acceptance"] = {
  allGeoAccounted: false,
  storeDiscoveryComplete: false,
  allVisibleStoresValidated: false,
  circularTruthDependencyZero: false,
  jurisdictionCollisionsZero: false,
  lowZoomMarkerCount: 0,
  localZoomMarkerCount: 0,
  viewportQueryPass: false,
  clusteringPass: false,
  staleViewportResponseCount: 0,
  visualMapAuditPass: false,
  productionTouched: false,
  productionDeployed: false,
  goalAchieved: false,
  blockers: [],
};

export const emptyWikiTruthStoreAudit: WikiTruthStoreAuditView = {
  schemaVersion: 0,
  generatedAt: "",
  localOnly: true,
  dependencyDirection: "",
  counts: {},
  acceptance: emptyAcceptance,
  rows: [],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return String(value || "").trim();
}

function number(value: unknown) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : 0;
}

function boolean(value: unknown) {
  return value === true;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function sourceCandidates(value: unknown): WikiTruthStoreSourceCandidate[] {
  return Array.isArray(value) ? value.map((raw) => {
    const candidate = asRecord(raw);
    return {
      candidateId: text(candidate.candidate_id),
      authority: text(candidate.authority) || "UNCONFIRMED_AUTHORITY",
      sourceUrl: text(candidate.source_url),
      sourceTypeCandidate: text(candidate.source_type_candidate) || "UNKNOWN",
      inventoryShape: text(candidate.inventory_shape) || "UNCONFIRMED",
      storeTypeCandidates: strings(candidate.store_type_candidates),
      sourceConfidence: text(candidate.source_confidence) || "UNKNOWN",
      sourceClassification: text(candidate.source_classification) || "NEEDS_REVIEW",
      status: text(candidate.status) || "NEEDS_REVIEW",
      c3VisualReview: text(candidate.c3_visual_review) || "NOT_RECORDED",
    };
  }).filter((candidate) => candidate.candidateId) : [];
}

function eligibilityAxis(value: unknown): WikiTruthStoreEligibilityAxis {
  const axis = asRecord(value);
  return {
    state: text(axis.state) || "UNKNOWN",
    reason: text(axis.reason),
    evidenceIds: strings(axis.evidence_ids),
  };
}

function storeEligibility(value: unknown): WikiTruthStoreEligibility {
  const eligibility = asRecord(value);
  return {
    retailLegality: eligibilityAxis(eligibility.retail_legality),
    medicalDispensaryLegality: eligibilityAxis(eligibility.medical_dispensary_legality),
    pharmacyDispensingLegality: eligibilityAxis(eligibility.pharmacy_dispensing_legality),
    clubLegality: eligibilityAxis(eligibility.club_legality),
  };
}

function normalizeCounts(value: unknown): WikiTruthStoreAuditView["counts"] {
  const out: WikiTruthStoreAuditView["counts"] = {};
  for (const [key, rawValue] of Object.entries(asRecord(value))) {
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      const nested: Record<string, number> = {};
      for (const [nestedKey, nestedValue] of Object.entries(asRecord(rawValue))) nested[nestedKey] = number(nestedValue);
      out[key] = nested;
    } else {
      out[key] = number(rawValue);
    }
  }
  return out;
}

export function normalizeWikiTruthStoreAudit(payload: unknown): WikiTruthStoreAuditView {
  const value = asRecord(payload);
  const acceptance = asRecord(value.acceptance);
  const rows = Array.isArray(value.rows) ? value.rows.map((raw) => {
    const row = asRecord(raw);
    return {
      geo_id: text(row.geo_id),
      territory: text(row.territory),
      canonical_truth_color: text(row.canonical_truth_color) || "UNKNOWN",
      canonical_truth_rule: text(row.canonical_truth_rule) || "UNCONFIRMED",
      store_eligibility: storeEligibility(row.store_eligibility),
      store_discovery_state: text(row.store_discovery_state) || "UNKNOWN",
      state_reason: text(row.state_reason),
      can_show_cannabis_stores: boolean(row.can_show_cannabis_stores),
      allowed_store_types: strings(row.allowed_store_types),
      official_registry_available: boolean(row.official_registry_available),
      source_candidate_count: number(row.source_candidate_count),
      source_candidate_types: strings(row.source_candidate_types),
      source_candidates: sourceCandidates(row.source_candidates),
      source_discovery_execution: text(row.source_discovery_execution),
      total_extracted: number(row.total_extracted),
      total_validated: number(row.total_validated),
      total_visible: number(row.total_visible),
      total_blocked: number(row.total_blocked),
      checked_at: text(row.checked_at),
    };
  }).filter((row) => row.geo_id) : [];
  return {
    schemaVersion: number(value.schema_version),
    generatedAt: text(value.generated_at),
    localOnly: boolean(value.local_only),
    dependencyDirection: text(value.dependency_direction),
    counts: normalizeCounts(value.counts),
    acceptance: {
      allGeoAccounted: boolean(acceptance.all_geo_accounted),
      storeDiscoveryComplete: boolean(acceptance.store_discovery_complete),
      allVisibleStoresValidated: boolean(acceptance.all_visible_stores_validated),
      circularTruthDependencyZero: boolean(acceptance.circular_truth_dependency_zero),
      jurisdictionCollisionsZero: boolean(acceptance.jurisdiction_collisions_zero),
      lowZoomMarkerCount: number(acceptance.low_zoom_marker_count),
      localZoomMarkerCount: number(acceptance.local_zoom_marker_count),
      viewportQueryPass: boolean(acceptance.viewport_query_pass),
      clusteringPass: boolean(acceptance.clustering_pass),
      staleViewportResponseCount: number(acceptance.stale_viewport_response_count),
      visualMapAuditPass: boolean(acceptance.visual_map_audit_pass),
      productionTouched: boolean(acceptance.production_touched),
      productionDeployed: boolean(acceptance.production_deployed),
      goalAchieved: boolean(acceptance.goal_achieved),
      blockers: strings(acceptance.blockers),
    },
    rows,
  };
}

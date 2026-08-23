function text(value) {
  return String(value || "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

const CIRCULAR_STORE_TRUTH_REFERENCE = /(?:^|[^A-Z0-9])(?:CANONICAL_STORE_(?:ID|RECORD)|STORE_SOURCE_(?:RECORD|REGISTRY)|DATA\/STORE_TRUTH)(?:$|[^A-Z0-9])/i;

/**
 * A regulated-location term is not circular by itself: legal evidence often
 * legitimately says "retailer" or "dispensary". Only an explicit reference
 * to canonical Store Truth as the legal basis is circular.
 */
export function hasCircularStoreTruthDependency(record) {
  return CIRCULAR_STORE_TRUTH_REFERENCE.test(text(record?.legal_gate?.evidence_basis));
}

/**
 * Resolves the legal gate at projection time from the canonical truth and
 * independent store-type model.  A source snapshot may retain a historical
 * legal-gate fingerprint for provenance, but it must never become the legal
 * truth input for a map marker.
 */
export function resolveCurrentStoreLegalGate(record, canonicalTruth, eligibility) {
  const geoId = upper(record?.geo_id);
  const storeType = upper(record?.store_type);
  const typeEligibility = eligibility?.by_store_type?.[storeType];
  const canonicalTruthMatchesEligibility = Boolean(
    canonicalTruth &&
      eligibility &&
      text(eligibility.canonical_truth_fingerprint) === text(canonicalTruth.fingerprint),
  );
  return {
    canonical_truth_ref: geoId
      ? `data/reviews/wiki-truth-307-final-reconciliation.json#${geoId}`
      : "",
    canonical_truth_fingerprint: text(canonicalTruth?.fingerprint),
    geo_access_legal: ["GREEN", "YELLOW"].includes(upper(canonicalTruth?.color)),
    store_type_legal: canonicalTruthMatchesEligibility && typeEligibility?.state === "PROVEN_LEGAL",
    store_type_eligibility_ref: geoId && storeType
      ? `data/store_truth/store_eligibility_model.json#${geoId}:${storeType}`
      : "",
    store_type_eligibility_fingerprint: text(typeEligibility?.fingerprint),
    // This provenance field remains record-bound so the circular-dependency
    // guard can reject a source record that claims its own store data as law.
    evidence_basis: text(record?.legal_gate?.evidence_basis),
  };
}

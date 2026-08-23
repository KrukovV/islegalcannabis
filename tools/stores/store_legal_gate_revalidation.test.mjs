import assert from "node:assert/strict";
import test from "node:test";
import { hasCircularStoreTruthDependency, resolveCurrentStoreLegalGate } from "./store_legal_gate_revalidation.mjs";

const record = {
  geo_id: "US-EX",
  store_type: "ADULT_USE_RETAIL",
  legal_gate: {
    canonical_truth_fingerprint: "US-EX:GREEN:STALE_RULE",
    store_type_eligibility_fingerprint: "store-eligibility:stale",
    evidence_basis: "INDEPENDENT_OFFICIAL_LEGAL_TRUTH",
  },
};

const currentTruth = {
  color: "GREEN",
  fingerprint: "US-EX:GREEN:CURRENT_RULE",
};

const currentEligibility = {
  canonical_truth_fingerprint: currentTruth.fingerprint,
  by_store_type: {
    ADULT_USE_RETAIL: {
      state: "PROVEN_LEGAL",
      fingerprint: "store-eligibility:current",
    },
  },
};

test("uses current independent legal inputs rather than a snapshot fingerprint", () => {
  assert.deepEqual(resolveCurrentStoreLegalGate(record, currentTruth, currentEligibility), {
    canonical_truth_ref: "data/reviews/wiki-truth-307-final-reconciliation.json#US-EX",
    canonical_truth_fingerprint: "US-EX:GREEN:CURRENT_RULE",
    geo_access_legal: true,
    store_type_legal: true,
    store_type_eligibility_ref: "data/store_truth/store_eligibility_model.json#US-EX:ADULT_USE_RETAIL",
    store_type_eligibility_fingerprint: "store-eligibility:current",
    evidence_basis: "INDEPENDENT_OFFICIAL_LEGAL_TRUTH",
  });
});

test("fails closed for current Red, unknown, type-unproven, or drifted truth", () => {
  assert.equal(
    resolveCurrentStoreLegalGate(record, { ...currentTruth, color: "RED" }, currentEligibility).geo_access_legal,
    false,
  );
  assert.equal(
    resolveCurrentStoreLegalGate(record, { ...currentTruth, color: "UNKNOWN" }, currentEligibility).geo_access_legal,
    false,
  );
  assert.equal(
    resolveCurrentStoreLegalGate(record, currentTruth, {
      ...currentEligibility,
      by_store_type: { ADULT_USE_RETAIL: { state: "UNPROVEN", fingerprint: "store-eligibility:current" } },
    }).store_type_legal,
    false,
  );
  assert.equal(
    resolveCurrentStoreLegalGate(record, currentTruth, {
      ...currentEligibility,
      canonical_truth_fingerprint: "US-EX:GREEN:DIFFERENT_RULE",
    }).store_type_legal,
    false,
  );
});

test("detects actual Store Truth references without mistaking retailer terminology for circularity", () => {
  assert.equal(hasCircularStoreTruthDependency({
    legal_gate: { evidence_basis: "CURRENT_ALBERTA_OFFICIAL_RETAILER_EVIDENCE_NOT_EXPANDED_TO_COUNTRY_LEVEL_ELIGIBILITY" },
  }), false);
  assert.equal(hasCircularStoreTruthDependency({
    legal_gate: { evidence_basis: "CANONICAL_STORE_RECORD:CA:SOURCE:001" },
  }), true);
  assert.equal(hasCircularStoreTruthDependency({
    legal_gate: { evidence_basis: "data/store_truth/canonical_store_records.json" },
  }), true);
});

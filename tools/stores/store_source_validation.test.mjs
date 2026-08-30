import assert from "node:assert/strict";
import test from "node:test";
import { activeStoreSourceCollisions, isIndependentlyValidatedStoreSource, isRetainablePendingStoreSource, pendingStoreSourceRetentionReasons, snapshotIntegrityReasons, validatedStoreSourceReasons } from "./store_source_validation.mjs";

function source(overrides = {}) {
  return {
    source_id: "official-registry",
    geo_id: "US-CO",
    authority: "Example cannabis regulator",
    source_url: "https://regulator.example.gov/registry.json",
    source_type: "JSON",
    store_types: ["ADULT_USE_RETAIL"],
    source_classification: "OFFICIAL_REGULATOR",
    official: true,
    jurisdiction_validation: "VALID",
    status: "ACTIVE",
    discovered_at: "2026-08-12T00:00:00.000Z",
    checked_at: "2026-08-12T00:00:00.000Z",
    parser: "JSON_REGISTRY_V1",
    refresh_policy: "P7D",
    provenance_evidence: "Visual authority, jurisdiction and registry-content review.",
    independent_validation: "PROVEN",
    inspection: {
      evaluated_at: "2026-08-12T00:00:00.000Z",
      authority_match: "PROVEN",
      jurisdiction_match: "PROVEN",
      cannabis_specificity: "PROVEN",
      store_semantics_match: "PROVEN",
      license_semantics_match: "PROVEN",
      data_extractability: "PROVEN",
      freshness: "PROVEN",
      coverage: "PROVEN",
      source_stability: "PROVEN",
    },
    confidence: "STRONG",
    ...overrides,
  };
}

test("only a complete independently validated source can pass", () => {
  assert.deepEqual(validatedStoreSourceReasons(source()), []);
  assert.equal(isIndependentlyValidatedStoreSource(source()), true);
});

test("a URL or a government classification alone never validates a source", () => {
  const reasons = validatedStoreSourceReasons(source({ inspection: { evaluated_at: "2026-08-12T00:00:00.000Z" } }));
  assert.ok(reasons.includes("STORE_SOURCE_AUTHORITY_MATCH_NOT_PROVEN"));
  assert.equal(isIndependentlyValidatedStoreSource(source({ provenance_evidence: "" })), false);
  assert.equal(isIndependentlyValidatedStoreSource(source({ store_types: ["UNSPECIFIED"] })), false);
});

test("strong secondary sources require independently proven status", () => {
  const secondary = source({ official: false, source_classification: "SECONDARY_RELIABLE", confidence: "PROVEN", independent_validation: "PROVEN" });
  assert.deepEqual(validatedStoreSourceReasons(secondary), []);
  assert.equal(isIndependentlyValidatedStoreSource({ ...secondary, independent_validation: "STRONG" }), false);
});

test("snapshot metadata fails closed before a validated source can drift outside the repository", () => {
  assert.deepEqual(snapshotIntegrityReasons(source(), process.cwd()), []);
  assert.deepEqual(
    snapshotIntegrityReasons(source({ snapshot_path: "data/store_truth/source_snapshots/example.json" }), process.cwd()),
    ["STORE_SOURCE_SNAPSHOT_SHA256_INVALID"],
  );
  assert.deepEqual(
    snapshotIntegrityReasons(source({ snapshot_path: "/tmp/example.json", snapshot_sha256: "a".repeat(64) }), process.cwd()),
    ["STORE_SOURCE_SNAPSHOT_OUTSIDE_REPOSITORY"],
  );
});

test("rejects duplicate active views of the same official registry while allowing retired history", () => {
  const active = source();
  const duplicateActive = source({ source_id: "official-registry-refreshed" });
  assert.deepEqual(activeStoreSourceCollisions([active, duplicateActive]), [{
    identity: "US-CO|https://regulator.example.gov/registry.json|JSON|ADULT_USE_RETAIL",
    source_ids: ["official-registry", "official-registry-refreshed"],
  }]);
  assert.deepEqual(activeStoreSourceCollisions([active, { ...duplicateActive, status: "RETIRED" }]), []);
  assert.deepEqual(activeStoreSourceCollisions([active, { ...duplicateActive, store_types: ["MEDICAL_DISPENSARY"] }]), []);
});

test("allows explicit local retention after a certificate-blocked C3 without validating or activating the source", () => {
  const pending = source({
    status: "PENDING_C3_ACCESS_BLOCKED",
    independent_validation: "PENDING_C3_ACCESS_BLOCKED",
    pending_c3_visual_review: {
      status: "ACCESS_BLOCKED_CERTIFICATE",
      attempted_at: "2026-08-15T00:20:00.000Z",
      browser_error: "ERR_CERT_AUTHORITY_INVALID",
    },
  });
  assert.deepEqual(pendingStoreSourceRetentionReasons(pending), []);
  assert.equal(isRetainablePendingStoreSource(pending), true);
  assert.equal(isIndependentlyValidatedStoreSource(pending), false);
  assert.equal(isRetainablePendingStoreSource({ ...pending, status: "ACTIVE" }), false);
});

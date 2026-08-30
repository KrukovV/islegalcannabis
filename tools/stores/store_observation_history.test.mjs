import assert from "node:assert/strict";
import test from "node:test";
import { appendStoreObservationHistory } from "./store_observation_history.mjs";

function record(overrides = {}) {
  return {
    canonical_store_id: "US-EX:LICENSE:001",
    source_id: "official-example",
    geo_id: "US-EX",
    source_record_ids: ["row-001"],
    legal_name: "Example Store",
    license_number: "001",
    store_type: "MEDICAL_DISPENSARY",
    license_status: "ACTIVE",
    operational_status: "ACTIVE",
    source_presence_status: "PRESENT",
    source_url: "https://regulator.example.gov/registry",
    regulator_url: "https://regulator.example.gov/registry",
    legal_gate: {
      store_type_eligibility_fingerprint: "eligibility-001",
      canonical_truth_fingerprint: "US-EX:GREEN:RULE",
    },
    ...overrides,
  };
}

test("retains an immutable observation for every canonical record", () => {
  const result = appendStoreObservationHistory({ observations: [] }, [record()], "2026-08-13T00:00:00.000Z");
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].canonical_store_id, "US-EX:LICENSE:001");
  assert.equal(result.observations[0].source_presence_status, "PRESENT");
});

test("keeps prior observations when a later source snapshot no longer includes the record", () => {
  const first = appendStoreObservationHistory({ observations: [] }, [record()], "2026-08-13T00:00:00.000Z");
  const second = appendStoreObservationHistory(first, [record({ source_presence_status: "MISSING_FROM_SOURCE" })], "2026-08-14T00:00:00.000Z");
  assert.equal(second.observations.length, 2);
  assert.deepEqual(second.observations.map((item) => item.source_presence_status), ["PRESENT", "MISSING_FROM_SOURCE"]);
});

test("repeating the same observed record is idempotent", () => {
  const first = appendStoreObservationHistory({ observations: [] }, [record()], "2026-08-13T00:00:00.000Z");
  const second = appendStoreObservationHistory(first, [record()], "2026-08-13T00:00:00.000Z");
  assert.equal(second.observations.length, 1);
});

test("preserves explicitly approved public source fields in an immutable observation", () => {
  const result = appendStoreObservationHistory({ observations: [] }, [record({ public_source_fields: { renewal_date: "January 1, 2027" } })], "2026-08-13T00:00:00.000Z");
  assert.deepEqual(result.observations[0].public_source_fields, { renewal_date: "January 1, 2027" });
});

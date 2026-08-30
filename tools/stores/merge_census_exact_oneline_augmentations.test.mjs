import assert from "node:assert/strict";
import test from "node:test";
import { mergeCensusExactOnelineAugmentations } from "./merge_census_exact_oneline_augmentations.mjs";

function payload(overrides = {}) {
  return {
    input_snapshot_path: "data/store_truth/source.json",
    input_snapshot_sha256: "a".repeat(64),
    census_benchmark: "Public_AR_Current",
    requested_candidates: 1,
    accepted_records: 1,
    blocked_records: 0,
    records: [{ source_record_id: "A", latitude: 1, longitude: 2 }],
    ...overrides,
  };
}

test("merges disjoint exact Census batches without losing source binding", () => {
  const merged = mergeCensusExactOnelineAugmentations({
    base: { ...payload(), __path: "base.json", __sha256: "b".repeat(64) },
    append: { ...payload({ requested_candidates: 2, accepted_records: 1, blocked_records: 1, records: [{ source_record_id: "B", latitude: 3, longitude: 4 }] }), __path: "append.json", __sha256: "c".repeat(64) },
    generatedAt: "2026-08-21T00:00:00.000Z",
  });
  assert.equal(merged.requested_candidates, 3);
  assert.equal(merged.accepted_records, 2);
  assert.equal(merged.blocked_records, 1);
  assert.deepEqual(merged.records.map((record) => record.source_record_id), ["A", "B"]);
});

test("rejects a source-binding mismatch or conflicting record", () => {
  assert.throws(
    () => mergeCensusExactOnelineAugmentations({ base: payload(), append: payload({ input_snapshot_sha256: "b".repeat(64) }) }),
    /CENSUS_ONELINE_MERGE_SOURCE_BINDING_MISMATCH/,
  );
  assert.throws(
    () => mergeCensusExactOnelineAugmentations({ base: payload(), append: payload({ records: [{ source_record_id: "A", latitude: 9, longitude: 2 }] }) }),
    /CENSUS_ONELINE_MERGE_RECORD_CONFLICT:A/,
  );
});

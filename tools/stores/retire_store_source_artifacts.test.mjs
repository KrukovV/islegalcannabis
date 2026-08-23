import assert from "node:assert/strict";
import test from "node:test";
import { retireStoreSourceArtifacts } from "./retire_store_source_artifacts.mjs";

test("retired source cleanup removes only that source's derived artifacts", () => {
  const result = retireStoreSourceArtifacts({
    sourceId: "retired-source",
    source: { source_id: "retired-source", status: "RETIRED" },
    records: [{ source_id: "active-source" }, { source_id: "retired-source" }],
    history: { snapshots: [{ source_id: "active-source" }, { source_id: "retired-source" }] },
    observations: { observations: [{ source_id: "active-source" }, { source_id: "retired-source" }] },
  });
  assert.deepEqual(result.records, [{ source_id: "active-source" }]);
  assert.deepEqual(result.history.snapshots, [{ source_id: "active-source" }]);
  assert.deepEqual(result.observations.observations, [{ source_id: "active-source" }]);
  assert.deepEqual(result.summary, { source_id: "retired-source", removed_records: 1, removed_snapshots: 1, removed_observations: 1 });
});

test("cleanup refuses an active source", () => {
  assert.throws(() => retireStoreSourceArtifacts({
    sourceId: "active-source",
    source: { source_id: "active-source", status: "ACTIVE" },
    records: [],
    history: { snapshots: [] },
    observations: { observations: [] },
  }), /STORE_SOURCE_RETIRE_REQUIRES_RETIRED_SOURCE/);
});

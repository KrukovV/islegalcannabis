import assert from "node:assert/strict";
import test from "node:test";
import { sourceScopedObservationRecords } from "./ingest_store_snapshot.mjs";

test("adds observations only for the source whose snapshot is being ingested", () => {
  const records = [
    { canonical_store_id: "US-AA:LICENSE:1", source_id: "source-a" },
    { canonical_store_id: "US-BB:LICENSE:1", source_id: "source-b" },
  ];
  assert.deepEqual(sourceScopedObservationRecords(records, "source-a"), [records[0]]);
});

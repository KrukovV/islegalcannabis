import assert from "node:assert/strict";
import test from "node:test";
import { extractXlsxRows, selectXlsxStoreSnapshot } from "./fetch_xlsx_store_snapshot.mjs";

test("projects declared retail fields and excludes contact data", () => {
  const rows = [
    { License: "MN-1", Activity: "Retail/Manufacturing", Address: "1 Main", Email: "private@example.test" },
    { License: "MN-2", Activity: "Cultivation", Address: "2 Main", Email: "other@example.test" },
  ];
  const result = selectXlsxStoreSnapshot(rows, {
    contains: [{ field: "Activity", expected: "Retail" }],
    nonempty: ["Address"],
    fields: ["License", "Activity", "Address"],
  });
  assert.deepEqual(result, [{ License: "MN-1", Activity: "Retail/Manufacturing", Address: "1 Main" }]);
  assert.equal(JSON.stringify(result).includes("private@example.test"), false);
});

test("derives an opaque source-row identity only from explicitly declared public fields", () => {
  const result = selectXlsxStoreSnapshot([
    { Name: "CH Ouest Réunion", Postal: "97460", Email: "private@example.test" },
  ], {
    fields: ["Name", "Postal"],
    sourceRecordIdFields: ["Name", "Postal"],
  });
  assert.match(result[0].source_record_id, /^XLSX_ROW:[a-f0-9]{24}$/);
  assert.equal(JSON.stringify(result).includes("private@example.test"), false);
});

test("requires the declared sheet and extractor runtime", () => {
  assert.throws(() => extractXlsxRows({ bytes: Buffer.from("xlsx"), sheet: "Records", pythonPath: "" }), /STORE_XLSX_SNAPSHOT_PYTHON_REQUIRED/);
  const rows = extractXlsxRows({
    bytes: Buffer.from("xlsx"),
    sheet: "Records",
    pythonPath: "/bundled/python",
    spawnSyncImpl: () => ({ status: 0, stdout: '[{"License":"MN-1"}]', stderr: "" }),
  });
  assert.deepEqual(rows, [{ License: "MN-1" }]);
});

test("passes an explicitly declared non-first header row to the generic extractor", () => {
  let received;
  const rows = extractXlsxRows({
    bytes: Buffer.from("xlsx"),
    sheet: "Records",
    headerRow: 5,
    pythonPath: "/bundled/python",
    spawnSyncImpl: (_binary, args) => {
      received = args;
      return { status: 0, stdout: '[{"License":"RE-1"}]', stderr: "" };
    },
  });
  assert.deepEqual(rows, [{ License: "RE-1" }]);
  assert.equal(received.at(-1), "5");
  assert.throws(() => extractXlsxRows({ bytes: Buffer.from("xlsx"), sheet: "Records", headerRow: 0, pythonPath: "/bundled/python" }), /HEADER_ROW_INVALID/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { extractInlineJsonStoreSnapshot } from "./fetch_inline_json_store_snapshot.mjs";

test("extracts an explicitly named inline public JSON directory with a minimal projection", () => {
  const records = extractInlineJsonStoreSnapshot('<script>const publicPoints = [{"id":"1","name":"A [Point]","address":"1 Main","private":"omit"}];</script>', {
    variableName: "publicPoints",
    fields: ["id", "name", "address"],
  });
  assert.deepEqual(records, [{ id: "1", name: "A [Point]", address: "1 Main" }]);
});

test("fails closed for a missing declaration or a missing required public field", () => {
  assert.throws(() => extractInlineJsonStoreSnapshot('<script>const other = [];</script>', { variableName: "publicPoints", fields: ["id"] }), /VARIABLE_MISSING/);
  assert.throws(() => extractInlineJsonStoreSnapshot('<script>const publicPoints = [{"id":"1"}];</script>', { variableName: "publicPoints", fields: ["id", "name"] }), /REQUIRED_FIELD_MISSING/);
});

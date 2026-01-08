import test from "node:test";
import assert from "node:assert/strict";
import { shouldSkipOverwrite } from "./run_ingest.mjs";

test("shouldSkipOverwrite blocks known and needs_review", () => {
  assert.equal(shouldSkipOverwrite("known"), true);
  assert.equal(shouldSkipOverwrite("needs_review"), true);
  assert.equal(shouldSkipOverwrite("provisional"), false);
  assert.equal(shouldSkipOverwrite("unknown"), false);
});

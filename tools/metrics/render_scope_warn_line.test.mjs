import test from "node:test";
import assert from "node:assert/strict";
import { renderScopeWarnLine } from "./render_scope_warn_line.mjs";

test("renderScopeWarnLine warns only when delta is large", () => {
  assert.equal(renderScopeWarnLine({ delta: 105 }), "");
  assert.equal(
    renderScopeWarnLine({ delta: 250 }),
    "Warn: scope delta high (non-blocking)"
  );
});

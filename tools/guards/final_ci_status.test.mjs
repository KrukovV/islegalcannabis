import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFinalCiStatus } from "./final_ci_status.mjs";

test("mandatory tail failure cannot leave a green CI PASS headline", () => {
  const input = [
    "\u2705 CI PASS (Checked 20/0)",
    "Smoke 11/0 (total 12)",
    "CI_STATUS=PASS",
    "CI_QUALITY=OK",
    "PIPELINE_RC=0",
    "CI_RESULT status=PASS quality=OK reason=OK stop_reason=OK online=1 skipped=-",
    "FAIL_REASON=NONE",
    "POST_CHECKS_OK=1",
    "HUB_STAGE_REPORT_OK=1"
  ].join("\n") + "\n";

  const output = normalizeFinalCiStatus(input, {
    status: "FAIL",
    reason: "PROD_LIVE_GATE_FAIL_DEGRADATION"
  });

  assert.equal(output.split(/\r?\n/u)[0], "\u274c CI FAIL");
  assert.match(output, /^LOCAL_CI_STATUS=PASS checked=20\/0$/mu);
  assert.match(output, /^LOCAL_CI_QUALITY=OK$/mu);
  assert.match(output, /^LOCAL_PIPELINE_RC=0$/mu);
  assert.match(output, /^LOCAL_CI_RESULT status=PASS quality=OK/mu);
  assert.match(output, /^LOCAL_FAIL_REASON=NONE$/mu);
  assert.match(output, /^FINAL_FAIL_REASON=PROD_LIVE_GATE_FAIL_DEGRADATION$/mu);
  assert.doesNotMatch(output, /^CI_STATUS=PASS$/mu);
  assert.doesNotMatch(output, /^CI_RESULT\b.*\bstatus=PASS\b/mu);
  assert.doesNotMatch(output, /\bCI PASS\b/u);
});

test("passing output is left semantically unchanged", () => {
  const input = "\u2705 CI PASS (Checked 20/0)\nCI_STATUS=PASS\n";
  assert.equal(normalizeFinalCiStatus(input, { status: "PASS" }), input);
});

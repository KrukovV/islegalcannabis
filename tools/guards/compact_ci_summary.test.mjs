import test from "node:test";
import assert from "node:assert/strict";
import { compactCiSummary } from "./compact_ci_summary.mjs";

test("MVP summary keeps required proof lines and removes bloat", () => {
  const lines = [
    "✅ CI PASS (Checked 20/0)",
    "Smoke 11/0 (total 12)",
    "CI_STATUS=PASS",
    "CI_QUALITY=OK",
    "CI_RESULT status=PASS quality=OK reason=OK stop_reason=OK online=1 skipped=-",
    "EGRESS_TRUTH online=1 source=http reason=OK",
    "WIKI_GATE_OK=1",
    "WIKI_SYNC_ALL total_countries=0 states=0 total=0 revision=- changed=0 duration_ms=0 mode=SKIPPED rc=0 reason=UPDATE_MODE_0",
    "NOTES_TOTAL total=300 ok=243 placeholder=0",
    "NOTES5_STRICT_RESULT pass=1 checked=5",
    "NOTESALL_STRICT_RESULT pass=1 checked=300",
    "OFFICIAL_DOMAINS_TOTAL total=414",
    "OFFICIAL_DOMAINS_GUARD=PASS",
    "OFFICIAL_COVERAGE covered=70 total=201",
  ];
  for (let idx = 0; idx < 240; idx += 1) {
    lines.push(`DATA_SHRINK_GUARD sample=${idx}`);
    lines.push(`NOTES_BASELINE_OK=${idx}`);
  }
  lines.push("POST_CHECKS_OK=1");
  lines.push("HUB_STAGE_REPORT_OK=1");

  const output = compactCiSummary(`${lines.join("\n")}\n`, { maxLines: 60 });
  const outLines = output.trimEnd().split(/\r?\n/u);

  assert.ok(outLines.length <= 60);
  assert.match(output, /^EGRESS_TRUTH /mu);
  assert.match(output, /^WIKI_GATE_OK=1$/mu);
  assert.match(output, /^WIKI_SYNC_ALL /mu);
  assert.match(output, /^NOTES_TOTAL /mu);
  assert.match(output, /^NOTES5_STRICT_RESULT /mu);
  assert.match(output, /^NOTESALL_STRICT_RESULT /mu);
  assert.match(output, /^OFFICIAL_DOMAINS_TOTAL /mu);
  assert.match(output, /^OFFICIAL_DOMAINS_GUARD=PASS$/mu);
  assert.match(output, /^OFFICIAL_COVERAGE /mu);
  assert.match(output, /^POST_CHECKS_OK=1$/mu);
  assert.match(output, /^HUB_STAGE_REPORT_OK=1$/mu);
  assert.doesNotMatch(output, /DATA_SHRINK_GUARD sample=239/u);
});

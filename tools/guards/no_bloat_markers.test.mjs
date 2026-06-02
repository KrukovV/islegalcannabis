import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const guardPath = path.resolve("tools/guards/no_bloat_markers.mjs");

function runGuard(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "no-bloat-"));
  const file = path.join(dir, "summary.txt");
  fs.writeFileSync(file, text, "utf8");
  return spawnSync(process.execPath, [guardPath, "--file", file], {
    encoding: "utf8"
  });
}

test("FAIL summaries may include proof lines but never green PASS markers", () => {
  const proofLines = [
    "❌ CI FAIL",
    "CI_STATUS=FAIL PIPELINE_RC=1 FAIL_REASON=PROD_GATE_FAIL",
    "CI_RESULT=FAIL stop_reason=ERROR",
    "POST_CHECKS_OK=1",
    "HUB_STAGE_REPORT_OK=1"
  ];
  for (let idx = 0; idx < 40; idx += 1) proofLines.push(`PROOF_${idx}=1`);

  const ok = runGuard(`${proofLines.join("\n")}\n`);
  assert.equal(ok.status, 0, ok.stderr);

  const bad = runGuard(`${proofLines.join("\n")}\n✅ CI PASS (Checked 20/0)\n`);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /must not contain CI PASS/u);

  const badResult = runGuard(`${proofLines.join("\n")}\nCI_RESULT status=PASS quality=OK\n`);
  assert.notEqual(badResult.status, 0);
  assert.match(badResult.stderr, /PASS CI_RESULT/u);
});

test("PASS summary accepts the current CI PASS headline icon", () => {
  const pass = [
    "✅ CI PASS (Checked 20/0)",
    "Smoke 11/0 (total 12)",
    "SMOKE_STATUS=PASS",
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
    "OFFICIAL_COVERAGE covered=70 total=201"
  ].join("\n") + "\n";

  const result = runGuard(pass);
  assert.equal(result.status, 0, result.stderr);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function runWithMock(tmpDir, runId, payload) {
  const env = {
    ...process.env,
    ON_DEMAND_TEST: "1",
    ON_DEMAND_RUN_ID: runId,
    ON_DEMAND_TEST_DATA: JSON.stringify(payload)
  };
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "tools", "on_demand_verify.mjs"), "--iso=DE"],
    { encoding: "utf8", env, cwd: tmpDir }
  );
  return result;
}

test("on_demand_verify writes run.json and exits 0 on OK", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-demand-"));
  const runId = "test-ok";
  const result = runWithMock(tmpDir, runId, {
    exitCode: 0,
    stage: "EVIDENCE",
    reason: "OK"
  });
  assert.equal(result.status, 0);
  const runPath = path.join(tmpDir, "Reports", "on_demand", runId, "run.json");
  const payload = JSON.parse(fs.readFileSync(runPath, "utf8"));
  assert.equal(payload.stage, "EVIDENCE");
  assert.equal(payload.reason, "OK");
});

test("on_demand_verify exits 30 for NO_LAW_PAGE", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-demand-"));
  const runId = "test-law";
  const result = runWithMock(tmpDir, runId, {
    exitCode: 30,
    stage: "LAW_PAGE",
    reason: "NO_LAW_PAGE"
  });
  assert.equal(result.status, 30);
  const runPath = path.join(tmpDir, "Reports", "on_demand", runId, "run.json");
  const payload = JSON.parse(fs.readFileSync(runPath, "utf8"));
  assert.equal(payload.stage, "LAW_PAGE");
  assert.equal(payload.reason, "NO_LAW_PAGE");
});

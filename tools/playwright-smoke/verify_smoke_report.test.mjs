import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const verifier = path.resolve("tools/playwright-smoke/verify_smoke_report.mjs");

function withReport(report, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-smoke-report-"));
  const reportPath = path.join(dir, "smoke-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
  try {
    return run(reportPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function verify(reportPath) {
  return execFileSync(process.execPath, [verifier, reportPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test("accepts a fully accounted required smoke report", () => {
  const output = withReport(
    {
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      tests: [
        { name: "one", status: "pass" },
        { name: "two", status: "pass" }
      ]
    },
    verify
  );

  assert.match(output, /^SMOKE_ACCOUNTING_OK=1$/m);
  assert.match(output, /^SMOKE_SKIPPED=0$/m);
});

test("rejects an explicitly skipped mandatory smoke test", () => {
  assert.throws(
    () => withReport(
      {
        total: 2,
        passed: 1,
        failed: 0,
        skipped: 1,
        tests: [
          { name: "one", status: "pass" },
          { name: "two", status: "skipped" }
        ]
      },
      verify
    ),
    /SMOKE_ACCOUNTING_FAIL reason=SKIPPED count=1/
  );
});

test("rejects inconsistent aggregate smoke counters", () => {
  assert.throws(
    () => withReport(
      {
        total: 2,
        passed: 2,
        failed: 0,
        skipped: 0,
        tests: [
          { name: "one", status: "pass" },
          { name: "two", status: "skipped" }
        ]
      },
      verify
    ),
    /SMOKE_ACCOUNTING_FAIL reason=DECLARED_PASSED_MISMATCH/
  );
});

test("every smoke-consuming CI path uses the shared fail-closed verifier", () => {
  for (const sourcePath of ["Tools/ci-local.sh", "tools/pass_cycle.sh", "tools/pass_cycle.net_health.sh"]) {
    const source = fs.readFileSync(sourcePath, "utf8");
    assert.match(source, /tools\/playwright-smoke\/verify_smoke_report\.mjs/);
    assert.match(source, /SMOKE_SKIPPED/);
  }

  const passCycle = fs.readFileSync("tools/pass_cycle.sh", "utf8");
  assert.match(passCycle, /append_ci_line "SMOKE_SKIPPED=\$\{SMOKE_SKIPPED\}"/);
  assert.doesNotMatch(passCycle, /SMOKE_TOTAL_LATEST=.*head -n1/);

  const netHealth = fs.readFileSync("tools/pass_cycle.net_health.sh", "utf8");
  assert.doesNotMatch(netHealth, /SMOKE_TOTAL=.*grep -E '\^SMOKE_TOTAL='/);
});

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] || path.resolve("Reports/playwright-smoke.json");
const outputPath = process.argv[3] || path.resolve("Reports/smoke-report.json");

function collectTests(suites = [], acc = []) {
  for (const suite of suites) {
    if (Array.isArray(suite.specs)) {
      for (const spec of suite.specs) {
        const testRuns = Array.isArray(spec.tests) ? spec.tests : [];
        for (const testRun of testRuns) {
          const results = Array.isArray(testRun.results) ? testRun.results : [];
          const result = results[results.length - 1];
          acc.push({
            name: spec.title || testRun.projectName || "unnamed",
            status: result?.status === "passed" ? "pass" : "fail",
            duration_ms: typeof result?.duration === "number" ? result.duration : 0
          });
        }
      }
    }
    collectTests(suite.suites, acc);
  }
  return acc;
}

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const tests = collectTests(raw.suites);
const passed = tests.filter((test) => test.status === "pass").length;
const failed = tests.length - passed;

const report = {
  total: tests.length,
  passed,
  failed,
  tests
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`SMOKE_REPORT_WRITTEN=${outputPath}`);

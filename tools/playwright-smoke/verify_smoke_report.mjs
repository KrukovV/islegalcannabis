#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const reportPath = path.resolve(process.argv[2] || "Reports/smoke-report.json");

function fail(reason) {
  console.error(`SMOKE_ACCOUNTING_FAIL reason=${reason}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
} catch (error) {
  fail(`REPORT_UNREADABLE path=${reportPath} detail=${error instanceof Error ? error.message : String(error)}`);
}

const fields = ["total", "passed", "failed", "skipped"];
const values = Object.fromEntries(fields.map((field) => [field, Number(report?.[field])]));

for (const field of fields) {
  if (!Number.isInteger(values[field]) || values[field] < 0) {
    fail(`INVALID_${field.toUpperCase()} value=${String(report?.[field])}`);
  }
}

if (!Array.isArray(report.tests) || report.tests.length !== values.total) {
  fail(`TEST_LIST_TOTAL_MISMATCH tests=${Array.isArray(report.tests) ? report.tests.length : "invalid"} total=${values.total}`);
}

const derived = report.tests.reduce(
  (counts, test) => {
    if (test?.status === "pass") counts.passed += 1;
    else if (test?.status === "skipped") counts.skipped += 1;
    else if (test?.status === "fail") counts.failed += 1;
    else counts.invalid += 1;
    return counts;
  },
  { passed: 0, failed: 0, skipped: 0, invalid: 0 }
);

if (derived.invalid !== 0) {
  fail(`INVALID_TEST_STATUS count=${derived.invalid}`);
}

for (const field of ["passed", "failed", "skipped"]) {
  if (values[field] !== derived[field]) {
    fail(`DECLARED_${field.toUpperCase()}_MISMATCH declared=${values[field]} derived=${derived[field]}`);
  }
}

if (values.total !== values.passed + values.failed + values.skipped) {
  fail(`TOTAL_MISMATCH total=${values.total} passed=${values.passed} failed=${values.failed} skipped=${values.skipped}`);
}

if (values.skipped !== 0) {
  fail(`SKIPPED count=${values.skipped}`);
}

process.stdout.write(
  [
    "SMOKE_ACCOUNTING_OK=1",
    `SMOKE_TOTAL=${values.total}`,
    `SMOKE_PASSED=${values.passed}`,
    `SMOKE_FAILED=${values.failed}`,
    `SMOKE_SKIPPED=${values.skipped}`
  ].join("\n") + "\n"
);

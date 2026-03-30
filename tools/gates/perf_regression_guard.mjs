#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const reportPath = path.join(ROOT, "Reports", "perf_before_after.json");
if (!fs.existsSync(reportPath)) {
  console.log("PERF_REGRESSION_GUARD=FAIL reason=missing_report");
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const before = Array.isArray(report.before?.current) ? report.before.current : [];
const after = Array.isArray(report.after?.current) ? report.after.current : [];
let fail = false;
for (const current of after) {
  const baseline = before.find((entry) => entry.browser === current.browser && entry.path === current.path);
  if (!baseline) continue;
  if (baseline.interactiveMs && current.interactiveMs > baseline.interactiveMs * 1.25) fail = true;
  if (baseline.initialJsBytes && current.initialJsBytes > baseline.initialJsBytes * 1.25) fail = true;
}
console.log(`PERF_REGRESSION_GUARD before=${before.length} after=${after.length}`);
console.log(`PERF_REGRESSION_GUARD=${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);

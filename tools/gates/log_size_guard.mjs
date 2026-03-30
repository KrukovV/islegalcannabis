#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, "Reports");
const ARTIFACTS_DIR = path.join(ROOT, "Artifacts");
const maxReportBytes = 25 * 1024 * 1024;
const maxArtifactBytes = 250 * 1024 * 1024;

function dirBytes(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  return fs.readdirSync(dirPath).reduce((sum, entry) => {
    const filePath = path.join(dirPath, entry);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return sum + dirBytes(filePath);
    return sum + stat.size;
  }, 0);
}

const reportsBytes = dirBytes(REPORTS_DIR);
const artifactsBytes = dirBytes(ARTIFACTS_DIR);
const oversizedReport = fs.existsSync(path.join(REPORTS_DIR, "ci-final.txt")) && fs.statSync(path.join(REPORTS_DIR, "ci-final.txt")).size > maxReportBytes;
const fail = reportsBytes > maxReportBytes || artifactsBytes > maxArtifactBytes || oversizedReport;

console.log(`LOG_SIZE_GUARD reports_bytes=${reportsBytes} artifacts_bytes=${artifactsBytes} max_reports=${maxReportBytes} max_artifacts=${maxArtifactBytes}`);
console.log(`LOG_SIZE_GUARD=${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);

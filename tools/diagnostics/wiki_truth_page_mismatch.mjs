#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ARTIFACTS_DIR = path.join(ROOT, "Artifacts");
const FULL_AUDIT_PATH = path.join(ARTIFACTS_DIR, "full-country-audit.json");
const PAGE_SNAPSHOT_PATH = path.join(ARTIFACTS_DIR, "wiki-truth-page-snapshot.json");
const OUTPUT_PATH = path.join(ARTIFACTS_DIR, "wiki-truth-page-mismatch.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

if (!fs.existsSync(FULL_AUDIT_PATH)) {
  throw new Error(`missing_full_audit:${FULL_AUDIT_PATH}`);
}

if (!fs.existsSync(PAGE_SNAPSHOT_PATH)) {
  throw new Error(`missing_page_snapshot:${PAGE_SNAPSHOT_PATH}`);
}

const auditRows = readJson(FULL_AUDIT_PATH);
const pageRows = readJson(PAGE_SNAPSHOT_PATH);
const auditByGeo = new Map(
  (Array.isArray(auditRows) ? auditRows : []).map((row) => [String(row.geoId || row.iso2 || "").toUpperCase(), row])
);

const mismatches = [];
for (const row of Array.isArray(pageRows) ? pageRows : []) {
  const geo = String(row.geo || "").toUpperCase();
  const auditRow = auditByGeo.get(geo);
  if (!auditRow) continue;
  const mismatchReasons = [];
  if (String(row.finalRec || "") !== String(auditRow.finalRec || "")) mismatchReasons.push("FINAL_REC_MISMATCH");
  if (String(row.finalMed || "") !== String(auditRow.finalMed || "")) mismatchReasons.push("FINAL_MED_MISMATCH");
  if (String(row.finalMapCategory || "") !== String(auditRow.finalMapCategory || "")) mismatchReasons.push("MAP_CATEGORY_MISMATCH");
  if (String(row.truthSourceLabel || "") !== String(auditRow.truthSourceLabel || "")) mismatchReasons.push("TRUTH_SOURCE_MISMATCH");
  if (String(row.statusOverrideReason || "") !== String(auditRow.statusOverrideReason || "")) mismatchReasons.push("OVERRIDE_REASON_MISMATCH");
  if (String(row.evidenceDeltaApproved || "") !== String(auditRow.evidenceDeltaApproved || "")) mismatchReasons.push("APPROVAL_FLAG_MISMATCH");
  if (mismatchReasons.length > 0) {
    mismatches.push({
      geo,
      mismatchReasons,
      page: row,
      audit: auditRow
    });
  }
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(mismatches, null, 2));
console.log(JSON.stringify({ rows: pageRows.length, mismatchTotal: mismatches.length }, null, 2));

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SNAPSHOT_PATH = path.join(ROOT, "data", "ssot_snapshots", "latest.json");
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const MAX_DIFF_BYTES = 2 * 1024 * 1024;
const VALID_REC = new Set(["Decrim", "Illegal", "Legal", "Unknown"]);
const VALID_MED = new Set(["Illegal", "Legal", "Unknown"]);

function fail(reason, extra = "") {
  console.log(`SSOT_DRIFT_GUARD=FAIL reason=${reason}`);
  if (extra) console.log(extra);
  process.exit(1);
}

if (!fs.existsSync(SNAPSHOT_PATH)) {
  fail("SNAPSHOT_MISSING");
}

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
const snapshotSize = fs.statSync(SNAPSHOT_PATH).size;
const diffPath = path.join(ROOT, "data", "ssot_diffs.json");
const diffSize = fs.existsSync(diffPath) ? fs.statSync(diffPath).size : 0;

console.log(`SSOT_SNAPSHOT_ROWS=${rows.length}`);
console.log(`SSOT_SNAPSHOT_SIZE=${snapshotSize}`);
console.log(`SSOT_DIFF_REGISTRY_SIZE=${diffSize}`);

if (rows.length !== 300 || Number(snapshot?.row_count) !== 300) {
  fail("ROW_COUNT_DRIFT", `SSOT_SNAPSHOT_ERROR=expected_300 got=${rows.length}`);
}
if (snapshotSize > MAX_SNAPSHOT_BYTES) {
  fail("SNAPSHOT_TOO_LARGE", `SSOT_SNAPSHOT_ERROR=max=${MAX_SNAPSHOT_BYTES} got=${snapshotSize}`);
}
if (diffSize > MAX_DIFF_BYTES) {
  fail("DIFF_REGISTRY_TOO_LARGE", `SSOT_DIFF_REGISTRY_ERROR=max=${MAX_DIFF_BYTES} got=${diffSize}`);
}

for (const row of rows) {
  if (!row || typeof row !== "object") fail("SCHEMA_DRIFT", "SSOT_ROW_ERROR=non_object_row");
  if (!String(row.geo || "").trim()) fail("SCHEMA_DRIFT", "SSOT_ROW_ERROR=missing_geo");
  if (!VALID_REC.has(String(row.rec_status || ""))) fail("VALUE_DRIFT", `SSOT_ROW_ERROR=invalid_rec_status geo=${row.geo}`);
  if (!VALID_MED.has(String(row.med_status || ""))) fail("VALUE_DRIFT", `SSOT_ROW_ERROR=invalid_med_status geo=${row.geo}`);
  if (!String(row.notes_hash || "").trim()) fail("SCHEMA_DRIFT", `SSOT_ROW_ERROR=missing_notes_hash geo=${row.geo}`);
  if (!Array.isArray(row.official_sources)) fail("SCHEMA_DRIFT", `SSOT_ROW_ERROR=missing_official_sources geo=${row.geo}`);
}

console.log("SSOT_DRIFT_GUARD=PASS");

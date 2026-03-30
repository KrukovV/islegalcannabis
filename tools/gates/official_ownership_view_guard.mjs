#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const datasetPath = path.join(root, "data", "ssot", "official_link_ownership.json");

if (!fs.existsSync(datasetPath)) {
  console.log("OFFICIAL_OWNERSHIP_VIEW_GUARD=FAIL reason=DATASET_MISSING");
  process.exit(1);
}

const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
const rows = Array.isArray(dataset.items) ? dataset.items : [];
const rawTotal = Number(dataset.raw_registry_total || 0);

if (rawTotal < 418) {
  console.log(`OFFICIAL_OWNERSHIP_VIEW_GUARD=FAIL reason=RAW_TOTAL_SHRANK raw_total=${rawTotal}`);
  process.exit(1);
}

if (rows.length !== rawTotal) {
  console.log(`OFFICIAL_OWNERSHIP_VIEW_GUARD=FAIL reason=ROW_DROP rows=${rows.length} raw_total=${rawTotal}`);
  process.exit(1);
}

const missing = rows.filter((row) => !row || !row.url || !row.domain);
if (missing.length) {
  console.log(`OFFICIAL_OWNERSHIP_VIEW_GUARD=FAIL reason=MISSING_CORE_FIELDS count=${missing.length}`);
  process.exit(1);
}

console.log(`OFFICIAL_OWNERSHIP_RAW_TOTAL=${rawTotal}`);
console.log(`OFFICIAL_OWNERSHIP_ROWS_COUNT=${rows.length}`);
console.log("OFFICIAL_OWNERSHIP_VIEW_GUARD=PASS");

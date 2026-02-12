#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OFFICIAL_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const WIKI_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const LEGALITY_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");

function readJsonStrict(filePath) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, reason: `MISSING:${filePath}` };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, reason: `INVALID_JSON:${filePath}` };
  }
}

const official = readJsonStrict(OFFICIAL_PATH);
if (!official.ok) {
  console.log(`SSOT_INVALID reason=${official.reason}`);
  process.exit(2);
}
if (!Array.isArray(official.data?.domains)) {
  console.log("SSOT_INVALID reason=official_domains_missing");
  process.exit(2);
}

const wiki = readJsonStrict(WIKI_PATH);
if (!wiki.ok) {
  console.log(`SSOT_INVALID reason=${wiki.reason}`);
  process.exit(2);
}
if (!wiki.data?.items || typeof wiki.data.items !== "object") {
  console.log("SSOT_INVALID reason=wiki_claims_map_missing_items");
  process.exit(2);
}

const legality = readJsonStrict(LEGALITY_PATH);
if (!legality.ok) {
  console.log(`SSOT_INVALID reason=${legality.reason}`);
  process.exit(2);
}
if (!Array.isArray(legality.data?.rows)) {
  console.log("SSOT_INVALID reason=legality_table_missing_rows");
  process.exit(2);
}
if (typeof legality.data?.row_count !== "number") {
  console.log("SSOT_INVALID reason=legality_table_missing_row_count");
  process.exit(2);
}
if (legality.data.row_count !== legality.data.rows.length) {
  console.log("SSOT_INVALID reason=legality_table_row_count_mismatch");
  process.exit(2);
}

console.log("SSOT_VALID=1 reason=OK");
process.exit(0);

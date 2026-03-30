#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
const WIKI_ROWS_FLOOR = 202;

function fail(reason, extra = "") {
  console.log(`WIKI_ROWS_SHRINK_GUARD=FAIL reason=${reason}`);
  if (extra) console.log(extra);
  process.exit(1);
}

const payload = fs.existsSync(INPUT_PATH) ? JSON.parse(fs.readFileSync(INPUT_PATH, "utf8")) : null;
const rows = Array.isArray(payload?.rows) ? payload.rows : [];

if (!rows.length) {
  fail("MISSING_ROWS", `WIKI_ROWS_PATH=${INPUT_PATH}`);
}

console.log(`WIKI_ROWS_TOTAL=${rows.length}`);
console.log(`WIKI_ROWS_FLOOR=${WIKI_ROWS_FLOOR}`);

if (rows.length < WIKI_ROWS_FLOOR) {
  fail("ROWS_BELOW_FLOOR", `WIKI_ROWS_ERROR=expected_min=${WIKI_ROWS_FLOOR} got=${rows.length}`);
}

console.log("WIKI_ROWS_SHRINK_GUARD=PASS");

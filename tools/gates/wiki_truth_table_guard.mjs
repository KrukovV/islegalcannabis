#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
const MIN_ROWS = 200;

function fail(reason, extra = "") {
  console.log(`WIKI_TRUTH_TABLE_GUARD=FAIL reason=${reason}`);
  if (extra) console.log(extra);
  process.exit(1);
}

const payload = fs.existsSync(INPUT_PATH) ? JSON.parse(fs.readFileSync(INPUT_PATH, "utf8")) : null;
const rows = Array.isArray(payload?.rows) ? payload.rows : [];

console.log(`WIKI_TRUTH_TABLE_ROWS=${rows.length}`);
console.log(`WIKI_TRUTH_TABLE_MIN_ROWS=${MIN_ROWS}`);

if (rows.length < MIN_ROWS) {
  fail("TRUTH_ROWS_BELOW_MIN", `WIKI_TRUTH_TABLE_ERROR=expected_min=${MIN_ROWS} got=${rows.length}`);
}

console.log("WIKI_TRUTH_TABLE_GUARD=PASS");

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
const BASELINE_PATH = path.join(ROOT, "data", "ssot", "baselines", "country_wiki_rows.baseline.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

const payload = readJson(INPUT_PATH);
const rows = Array.isArray(payload?.rows)
  ? payload.rows
  : Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : [];

if (rows.length === 0) {
  console.log(`COUNTRY_WIKI_ROWS_SHRINK_GUARD=FAIL reason=MISSING_ROWS path=${INPUT_PATH}`);
  process.exit(2);
}

const normalized = rows.map((row) => ({
  iso2: String(row?.iso2 || "").toUpperCase(),
  country: String(row?.country || ""),
  rec_status: String(row?.rec_status || ""),
  med_status: String(row?.med_status || "")
}));
const sha = crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
const rowCount = rows.length;
const baseline = readJson(BASELINE_PATH);
const updateMode = process.env.UPDATE_MODE === "1" && process.env.SSOT_WRITE === "1";

if (!baseline) {
  if (updateMode) {
    writeJson(BASELINE_PATH, {
      count: rowCount,
      sha,
      source_path: INPUT_PATH,
      updated_at: new Date().toISOString()
    });
    console.log("COUNTRY_WIKI_ROWS_BASELINE_INIT=1");
    console.log(`COUNTRY_WIKI_ROWS_CURRENT=${rowCount}`);
    console.log(`COUNTRY_WIKI_ROWS_SHA=${sha}`);
    console.log("COUNTRY_WIKI_ROWS_SHRINK_GUARD=PASS");
    process.exit(0);
  }
  console.log("COUNTRY_WIKI_ROWS_SHRINK_GUARD=FAIL reason=BASELINE_MISSING");
  process.exit(1);
}

const prevCount = Number(baseline.count || 0);
const prevSha = String(baseline.sha || "");
const minAllowed = Math.floor(prevCount * 0.95);

console.log(`COUNTRY_WIKI_ROWS_BASELINE=${prevCount}`);
console.log(`COUNTRY_WIKI_ROWS_CURRENT=${rowCount}`);
console.log(`COUNTRY_WIKI_ROWS_BASELINE_SHA=${prevSha || "-"}`);
console.log(`COUNTRY_WIKI_ROWS_SHA=${sha}`);

if (rowCount < prevCount || rowCount < minAllowed) {
  console.log("COUNTRY_WIKI_ROWS_SHRINK_GUARD=FAIL reason=COUNT_SHRINK");
  process.exit(1);
}

if (updateMode) {
  writeJson(BASELINE_PATH, {
    count: rowCount,
    sha,
    source_path: INPUT_PATH,
    updated_at: new Date().toISOString()
  });
}

console.log("COUNTRY_WIKI_ROWS_SHRINK_GUARD=PASS");

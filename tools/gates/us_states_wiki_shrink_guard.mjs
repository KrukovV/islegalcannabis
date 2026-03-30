#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "ssot", "us_states_wiki.json");
const BASELINE_PATH = path.join(ROOT, "Reports", "us_states_wiki_shrink.baseline.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

const payload = readJson(INPUT_PATH);
if (!payload || !Array.isArray(payload.items)) {
  console.log(`US_STATES_WIKI_SHRINK_GUARD=FAIL reason=MISSING_FILE path=${INPUT_PATH}`);
  process.exit(2);
}

const keys = payload.items
  .map((row) => String(row?.geo || "").toUpperCase())
  .filter((geo) => /^US-[A-Z]{2}$/.test(geo))
  .sort();
const total = keys.length;
const sourceUrl = String(payload.source_url || "");
const mainArticleUrl = String(payload.main_article_url || "");
const sha = String(payload.sha || "");
const fetchedTs = String(payload.fetched_ts || payload.updatedAt || "");

if (!/^https?:\/\/.+/i.test(sourceUrl)) {
  console.log("US_STATES_WIKI_SHRINK_GUARD=FAIL reason=SOURCE_URL_MISSING");
  process.exit(1);
}
if (!/^https?:\/\/.+/i.test(mainArticleUrl)) {
  console.log("US_STATES_WIKI_SHRINK_GUARD=FAIL reason=MAIN_ARTICLE_URL_MISSING");
  process.exit(1);
}
if (!sha) {
  console.log("US_STATES_WIKI_SHRINK_GUARD=FAIL reason=SHA_MISSING");
  process.exit(1);
}
if (!fetchedTs) {
  console.log("US_STATES_WIKI_SHRINK_GUARD=FAIL reason=FETCHED_TS_MISSING");
  process.exit(1);
}
if (total < 50) {
  console.log(`US_STATES_WIKI_CLAIMS_TOTAL=${total}`);
  console.log("US_STATES_WIKI_SHRINK_GUARD=FAIL reason=BELOW_MIN_50");
  process.exit(1);
}

const snapshot = { total, keys, sha, source_url: sourceUrl, updated_at: new Date().toISOString() };
if (process.env.UPDATE_MODE === "1") {
  writeJson(BASELINE_PATH, snapshot);
  console.log(`US_STATES_WIKI_CLAIMS_TOTAL=${total}`);
  console.log(`US_STATES_WIKI_BASELINE_TOTAL=${total}`);
  console.log(`US_STATES_WIKI_SHA=${sha}`);
  console.log("US_STATES_WIKI_SHRINK_GUARD=PASS");
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  writeJson(BASELINE_PATH, snapshot);
  console.log("US_STATES_WIKI_BASELINE_INIT=1");
  console.log(`US_STATES_WIKI_CLAIMS_TOTAL=${total}`);
  console.log(`US_STATES_WIKI_SHA=${sha}`);
  console.log("US_STATES_WIKI_SHRINK_GUARD=PASS");
  process.exit(0);
}

const baseline = readJson(BASELINE_PATH) || {};
const prevTotal = Number(baseline.total || 0);
const prevKeys = Array.isArray(baseline.keys) ? baseline.keys.map((k) => String(k).toUpperCase()) : [];
const nowSet = new Set(keys);
const missing = prevKeys.filter((geo) => !nowSet.has(geo));
if (missing.length > 0) {
  console.log(`US_STATES_WIKI_MISSING_KEYS=${missing.slice(0, 20).join(",")}`);
}

console.log(`US_STATES_WIKI_CLAIMS_TOTAL=${total}`);
console.log(`US_STATES_WIKI_BASELINE_TOTAL=${prevTotal}`);
console.log(`US_STATES_WIKI_SHA=${sha}`);

if (total < prevTotal) {
  console.log("US_STATES_WIKI_SHRINK_GUARD=FAIL reason=COUNT_SHRINK");
  process.exit(1);
}

console.log("US_STATES_WIKI_SHRINK_GUARD=PASS");

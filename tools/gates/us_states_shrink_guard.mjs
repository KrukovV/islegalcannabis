#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "ssot", "us_states.json");
const BASELINE_PATH = path.join(ROOT, "Reports", "us_states_shrink.baseline.json");

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
  console.log(`US_STATES_SHRINK_GUARD=FAIL reason=MISSING_FILE path=${INPUT_PATH}`);
  process.exit(2);
}

const keys = payload.items
  .map((row) => String(row?.geo || "").toUpperCase())
  .filter((geo) => /^US-[A-Z]{2}$/.test(geo))
  .sort();
const total = keys.length;
const sourceUrl = String(payload.source_url || "");
const fetchedTs = String(payload.fetched_ts || payload.fetched_at || "");
const payloadSha = String(payload.sha || "");
const metaMissing = payload.items
  .filter((row) => /^US-[A-Z]{2}$/.test(String(row?.geo || "").toUpperCase()))
  .filter((row) => String(row?.primary_source || "") !== "WIKI_US_JURISDICTION")
  .map((row) => String(row?.geo || "").toUpperCase());

if (metaMissing.length > 0) {
  console.log(`US_STATES_META_MISSING=${metaMissing.slice(0, 20).join(",")}`);
  console.log("US_STATES_SHRINK_GUARD=FAIL reason=PRIMARY_SOURCE_MISSING");
  process.exit(1);
}

if (!/^https?:\/\/.+/i.test(sourceUrl)) {
  console.log(`US_STATES_SOURCE_URL=${sourceUrl || "-"}`);
  console.log("US_STATES_SHRINK_GUARD=FAIL reason=SOURCE_URL_MISSING");
  process.exit(1);
}

if (!fetchedTs) {
  console.log("US_STATES_FETCHED_TS=-");
  console.log("US_STATES_SHRINK_GUARD=FAIL reason=FETCHED_TS_MISSING");
  process.exit(1);
}

if (!payloadSha) {
  console.log("US_STATES_PAYLOAD_SHA=-");
  console.log("US_STATES_SHRINK_GUARD=FAIL reason=PAYLOAD_SHA_MISSING");
  process.exit(1);
}

if (total < 50) {
  console.log(`US_STATES_CLAIMS_TOTAL=${total}`);
  console.log("US_STATES_SHRINK_GUARD=FAIL reason=BELOW_MIN_50");
  process.exit(1);
}

const digestPayload = payload.items
  .filter((row) => /^US-[A-Z]{2}$/.test(String(row?.geo || "").toUpperCase()))
  .map((row) => ({
    geo: String(row.geo || "").toUpperCase(),
    rec_status: String(row.rec_status || ""),
    med_status: String(row.med_status || ""),
    source_url: String(row.source_url || "")
  }))
  .sort((a, b) => a.geo.localeCompare(b.geo));
const sha = crypto
  .createHash("sha256")
  .update(JSON.stringify({ sourceUrl, digestPayload }))
  .digest("hex");
if (payloadSha && payloadSha !== sha) {
  console.log(`US_STATES_PAYLOAD_SHA=${payloadSha}`);
  console.log(`US_STATES_SHA=${sha}`);
  console.log("US_STATES_SHRINK_GUARD=FAIL reason=PAYLOAD_SHA_MISMATCH");
  process.exit(1);
}

const snapshot = { total, keys, sha, source_url: sourceUrl, updated_at: new Date().toISOString() };
if (process.env.UPDATE_MODE === "1") {
  writeJson(BASELINE_PATH, snapshot);
  console.log(`US_STATES_CLAIMS_TOTAL=${total}`);
  console.log(`US_STATES_BASELINE_TOTAL=${total}`);
  console.log(`US_STATES_SHA=${sha}`);
  console.log(`US_STATES_SOURCE_URL=${sourceUrl}`);
  console.log("US_STATES_SHRINK_GUARD=PASS");
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  writeJson(BASELINE_PATH, snapshot);
  console.log("US_STATES_BASELINE_INIT=1");
  console.log(`US_STATES_CLAIMS_TOTAL=${total}`);
  console.log(`US_STATES_BASELINE_TOTAL=${total}`);
  console.log(`US_STATES_SHA=${sha}`);
  console.log(`US_STATES_SOURCE_URL=${sourceUrl}`);
  console.log("US_STATES_SHRINK_GUARD=PASS");
  process.exit(0);
}

const baseline = readJson(BASELINE_PATH) || {};
const prevTotal = Number(baseline.total || 0);
const prevSha = String(baseline.sha || "");
const prevKeys = Array.isArray(baseline.keys) ? baseline.keys.map((k) => String(k).toUpperCase()) : [];
const nowSet = new Set(keys);
const missing = prevKeys.filter((geo) => !nowSet.has(geo));

console.log(`US_STATES_CLAIMS_TOTAL=${total}`);
console.log(`US_STATES_BASELINE_TOTAL=${prevTotal}`);
console.log(`US_STATES_SHA=${sha}`);
console.log(`US_STATES_BASELINE_SHA=${prevSha || "-"}`);
console.log(`US_STATES_SOURCE_URL=${sourceUrl}`);
if (missing.length > 0) {
  console.log(`US_STATES_MISSING_KEYS=${missing.slice(0, 20).join(",")}`);
}

if (total < prevTotal) {
  if (process.env.US_STATES_SHRINK_OK === "1" && String(process.env.US_STATES_SHRINK_REASON || "").trim()) {
    console.log(`US_STATES_SHRINK_REASON=${String(process.env.US_STATES_SHRINK_REASON).trim()}`);
    console.log("US_STATES_SHRINK_GUARD=PASS");
    process.exit(0);
  }
  console.log("US_STATES_SHRINK_GUARD=FAIL reason=COUNT_SHRINK");
  process.exit(1);
}

if (prevSha && !sha) {
  console.log("US_STATES_SHRINK_GUARD=FAIL reason=SHA_MISSING");
  process.exit(1);
}

console.log("US_STATES_SHRINK_GUARD=PASS");

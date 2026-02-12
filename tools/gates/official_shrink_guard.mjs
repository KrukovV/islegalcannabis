#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "Reports", "official_domains.baseline.txt");
const SSOT_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const OFFICIAL_EXPECTED = 413;

function readCurrentCount() {
  if (!fs.existsSync(SSOT_PATH)) return null;
  const payload = JSON.parse(fs.readFileSync(SSOT_PATH, "utf8"));
  const list = Array.isArray(payload?.domains) ? payload.domains : [];
  return list.length;
}

function readCurrentHash() {
  if (!fs.existsSync(SSOT_PATH)) return "";
  const payload = JSON.parse(fs.readFileSync(SSOT_PATH, "utf8"));
  const list = Array.isArray(payload?.domains) ? payload.domains : [];
  return crypto.createHash("sha256").update(JSON.stringify(list)).digest("hex").slice(0, 12);
}

function readSourcesCounts() {
  if (!fs.existsSync(SSOT_PATH)) return [];
  const payload = JSON.parse(fs.readFileSync(SSOT_PATH, "utf8"));
  const sources = payload?.sources && typeof payload.sources === "object" ? payload.sources : {};
  const entries = Object.entries(sources);
  return entries.map(([source, count]) => ({
    source,
    count: Number(count) || 0
  }));
}

const current = readCurrentCount();
const baseline = current ?? 0;
const sourceCounts = readSourcesCounts();
const currentHash = readCurrentHash();

console.log(`OFFICIAL_DOMAINS_BASELINE_PATH=${BASELINE_PATH}`);
console.log(`OFFICIAL_DOMAINS_BASELINE=${baseline}`);
console.log(`OFFICIAL_BASELINE_COUNT=${baseline}`);
if (currentHash) {
  console.log(`OFFICIAL_SHA=${currentHash}`);
}

if (current === null) {
  console.log("OFFICIAL_DOMAINS_GUARD=FAIL");
  console.log("OFFICIAL_DOMAINS_ERROR=missing_ssot");
  process.exit(2);
}
if (current !== OFFICIAL_EXPECTED) {
  console.log("OFFICIAL_DOMAINS_GUARD=FAIL");
  console.log(`OFFICIAL_DOMAINS_ERROR=OFFICIAL_BASELINE_CHANGED expected=${OFFICIAL_EXPECTED} got=${current}`);
  process.exit(2);
}
console.log(`OFFICIAL_DOMAINS_CURRENT=${current}`);
console.log(`OFFICIAL_DOMAINS_NOW=${current}`);
const shrinkOk = process.env.OFFICIAL_SHRINK_OK === "1" ? "1" : "0";
console.log(`OFFICIAL_SHRINK_OK=${shrinkOk}`);
console.log(`OFFICIAL_DOMAINS_STATUS OFFICIAL_DOMAINS_NOW=${current} OFFICIAL_BASELINE=${baseline} OFFICIAL_SHRINK_OK=${shrinkOk}`);
for (const entry of sourceCounts) {
  console.log(`OFFICIAL_DOMAINS_SOURCE_COUNT source=${entry.source} count=${entry.count}`);
}

if (current < baseline) {
  const allow = process.env.OFFICIAL_SHRINK_OK === "1";
  const reason = String(process.env.OFFICIAL_SHRINK_REASON || "").trim();
  if (allow) {
    if (!reason) {
      console.log("OFFICIAL_DOMAINS_GUARD=FAIL");
      console.log("OFFICIAL_DOMAINS_ERROR=shrink_allowed_but_reason_missing");
      process.exit(3);
    }
    console.log("OFFICIAL_DOMAINS_ALLOW_SHRINK=1");
    console.log(`OFFICIAL_DOMAINS_SHRINK_REASON=${reason}`);
    console.log("OFFICIAL_DOMAINS_GUARD=PASS");
    process.exit(0);
  }
  console.log("OFFICIAL_DOMAINS_GUARD=FAIL");
  console.log(`OFFICIAL_DOMAINS_ERROR=shrink_detected baseline=${baseline} current=${current} delta=${baseline - current}`);
  console.log("HINT=set OFFICIAL_SHRINK_OK=1 and OFFICIAL_SHRINK_REASON=... if intentional");
  process.exit(1);
}

console.log("OFFICIAL_DOMAINS_GUARD=PASS");

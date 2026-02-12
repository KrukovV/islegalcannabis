#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "Reports", "official_domains.baseline.txt");
const SSOT_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  const raw = fs.readFileSync(BASELINE_PATH, "utf8").trim();
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function readCurrentCount() {
  if (!fs.existsSync(SSOT_PATH)) return null;
  const payload = JSON.parse(fs.readFileSync(SSOT_PATH, "utf8"));
  const list = Array.isArray(payload?.domains) ? payload.domains : [];
  return list.length;
}

const baseline = readBaseline();
const current = readCurrentCount();

console.log(`OFFICIAL_DOMAINS_BASELINE_PATH=${BASELINE_PATH}`);
if (baseline === null) {
  console.log("OFFICIAL_DOMAINS_GUARD=FAIL");
  console.log("OFFICIAL_DOMAINS_ERROR=missing_or_bad_baseline");
  process.exit(2);
}
console.log(`OFFICIAL_DOMAINS_BASELINE=${baseline}`);

if (current === null) {
  console.log("OFFICIAL_DOMAINS_GUARD=FAIL");
  console.log("OFFICIAL_DOMAINS_ERROR=missing_ssot");
  process.exit(2);
}
console.log(`OFFICIAL_DOMAINS_CURRENT=${current}`);

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

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "ssot", "wiki_pages_universe.json");
const BASELINE_PATH = path.join(ROOT, "Reports", "wiki_pages_universe_shrink.baseline.json");
const CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

const payload = readJson(INPUT_PATH);
const items = Array.isArray(payload?.items) ? payload.items : [];
if (items.length === 0) {
  console.log(`WIKI_PAGES_SHRINK_GUARD=FAIL reason=MISSING_FILE path=${INPUT_PATH}`);
  process.exit(2);
}

const total = items.length;
const linked = items.filter((row) => /^https?:\/\//i.test(String(row?.wiki_page_url || row?.expected_wiki_url || ""))).length;
const claimsPayload = readJson(CLAIMS_PATH);
const claimsItems = claimsPayload?.items && typeof claimsPayload.items === "object" ? claimsPayload.items : {};
const pseudoRows = items.filter((row) => {
  const iso2 = String(row?.iso2 || "").toUpperCase();
  const expectedUrl = String(row?.wiki_page_url || row?.expected_wiki_url || "").trim();
  const claimUrl = String(claimsItems?.[iso2]?.wiki_row_url || "").trim();
  return Boolean(!row?.from_cannabis_by_country && claimUrl && expectedUrl && expectedUrl !== claimUrl);
});
const sourceUrl = String(payload.source_url || "");
const fetchedTs = String(payload.fetched_ts || payload.fetched_at || "");
const sha = crypto
  .createHash("sha256")
  .update(
    JSON.stringify(
      items
        .map((row) => ({
          iso2: String(row?.iso2 || "").toUpperCase(),
          wiki_page_url: String(row?.wiki_page_url || row?.expected_wiki_url || "")
        }))
        .sort((a, b) => a.iso2.localeCompare(b.iso2))
    )
  )
  .digest("hex");

if (!/^https?:\/\/.+/i.test(sourceUrl)) {
  console.log("WIKI_PAGES_SHRINK_GUARD=FAIL reason=SOURCE_URL_MISSING");
  process.exit(1);
}
if (!fetchedTs) {
  console.log("WIKI_PAGES_SHRINK_GUARD=FAIL reason=FETCHED_TS_MISSING");
  process.exit(1);
}
if (total < 249) {
  console.log(`WIKI_PAGES_TOTAL=${total}`);
  console.log("WIKI_PAGES_SHRINK_GUARD=FAIL reason=TOTAL_BELOW_249");
  process.exit(1);
}

const snapshot = { total, linked, sha, updated_at: new Date().toISOString() };
if (process.env.UPDATE_MODE === "1") {
  writeJson(BASELINE_PATH, snapshot);
  console.log(`WIKI_PAGES_TOTAL=${total}`);
  console.log(`WIKI_PAGES_LINKED=${linked}`);
  console.log(`WIKI_PAGES_SHA=${sha}`);
  console.log("WIKI_PAGES_SHRINK_GUARD=PASS");
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  writeJson(BASELINE_PATH, snapshot);
  console.log("WIKI_PAGES_BASELINE_INIT=1");
  console.log(`WIKI_PAGES_TOTAL=${total}`);
  console.log(`WIKI_PAGES_LINKED=${linked}`);
  console.log(`WIKI_PAGES_SHA=${sha}`);
  console.log("WIKI_PAGES_SHRINK_GUARD=PASS");
  process.exit(0);
}

const baseline = readJson(BASELINE_PATH) || {};
const prevTotal = Number(baseline.total || 0);
const prevLinked = Number(baseline.linked || 0);
console.log(`WIKI_PAGES_TOTAL=${total}`);
console.log(`WIKI_PAGES_BASELINE_TOTAL=${prevTotal}`);
console.log(`WIKI_PAGES_LINKED=${linked}`);
console.log(`WIKI_PAGES_BASELINE_LINKED=${prevLinked}`);
console.log(`WIKI_PAGES_PSEUDO_URLS=${pseudoRows.length}`);
console.log(`WIKI_PAGES_SHA=${sha}`);

if (total < prevTotal) {
  console.log("WIKI_PAGES_SHRINK_GUARD=FAIL reason=TOTAL_SHRINK");
  process.exit(1);
}
if (linked < prevLinked) {
  console.log("WIKI_PAGES_SHRINK_GUARD=FAIL reason=LINKED_SHRINK");
  process.exit(1);
}
if (pseudoRows.length > 0) {
  console.log(`WIKI_PAGES_PSEUDO_SAMPLE=${pseudoRows.slice(0, 10).map((row) => String(row?.iso2 || "").toUpperCase()).join(",")}`);
  console.log("WIKI_PAGES_SHRINK_GUARD=FAIL reason=PSEUDO_URLS_PRESENT");
  process.exit(1);
}

console.log("WIKI_PAGES_SHRINK_GUARD=PASS");

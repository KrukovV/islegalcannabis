#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const SOURCE_URL = "https://en.wikipedia.org/wiki/Cannabis_in_the_United_States";
const SOURCE_PAGE = "Cannabis_in_the_United_States";
const MAIN_ARTICLE_URL = SOURCE_URL;
const JURISDICTION_SOURCE_URL =
  "https://en.wikipedia.org/wiki/Legality_of_cannabis_by_U.S._jurisdiction";
const IN_PATH = path.join(ROOT, "data", "ssot", "us_states.json");
const OUT_PATH = path.join(ROOT, "data", "ssot", "us_states_wiki.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function statusToMapValue(value) {
  const v = String(value || "").toUpperCase();
  if (v === "LEGAL") return "legal";
  if (v === "DECRIM") return "decriminalized";
  if (v === "LIMITED") return "limited";
  if (v === "ILLEGAL") return "illegal";
  return "unknown";
}

function recBucket(value) {
  const v = String(value || "").toUpperCase();
  if (v === "LEGAL") return "REC_LEGAL";
  if (v === "DECRIM") return "DECRIM";
  if (v === "ILLEGAL") return "ILLEGAL";
  return "UNKNOWN";
}

function medBucket(value) {
  const v = String(value || "").toUpperCase();
  if (v === "LEGAL") return "MED_LEGAL";
  if (v === "LIMITED") return "NO_COMPREHENSIVE_MED";
  if (v === "ILLEGAL") return "NO_COMPREHENSIVE_MED";
  return "UNKNOWN";
}

function buildPayload(items) {
  const normalized = items
    .filter((row) => /^US-[A-Z]{2}$/.test(String(row?.geo || "").toUpperCase()))
    .map((row) => ({
      geo: String(row.geo || "").toUpperCase(),
      state: String(row.state || String(row.geo || "").slice(3)).toUpperCase(),
      state_name: String(row.name || row.geo || ""),
      name: String(row.name || row.geo || ""),
      rec_status: statusToMapValue(row.rec_status),
      med_status: statusToMapValue(row.med_status),
      decrim_status: recBucket(row.rec_status) === "DECRIM" ? "decriminalized" : null,
      rec_wiki_bucket: recBucket(row.rec_status),
      med_wiki_bucket: medBucket(row.med_status),
      rec_bucket: recBucket(row.rec_status),
      med_bucket: medBucket(row.med_status),
      decrim_bucket: recBucket(row.rec_status) === "DECRIM" ? "DECRIM" : "UNKNOWN",
      source_url: SOURCE_URL,
      source_page: SOURCE_PAGE,
      jurisdiction_source_url: JURISDICTION_SOURCE_URL,
      secondary_source_url: JURISDICTION_SOURCE_URL,
      wiki_page_url: String(row.wiki_page_url || ""),
      wiki_section_anchor: String(row.name || row.geo || "")
        .trim()
        .replace(/\s+/g, "_"),
      primary_source: "WIKI_US_JURISDICTION"
    }))
    .sort((a, b) => a.geo.localeCompare(b.geo));

  const sha = crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  const now = new Date().toISOString();
  return {
    source_url: SOURCE_URL,
    sourceUrl: SOURCE_URL,
    source_page: SOURCE_PAGE,
    main_article_url: MAIN_ARTICLE_URL,
    jurisdiction_source_url: JURISDICTION_SOURCE_URL,
    updatedAt: now,
    fetched_ts: now,
    total: normalized.length,
    sha,
    items: normalized
  };
}

function main() {
  const input = readJson(IN_PATH);
  const items = Array.isArray(input?.items) ? input.items : [];
  if (items.length === 0) {
    console.log("US_STATES_WIKI_SYNC_OK=0");
    console.log("US_STATES_WIKI_SYNC_REASON=MISSING_BASE_STATES");
    process.exit(2);
  }

  const payload = buildPayload(items);
  const canWrite = process.env.UPDATE_MODE === "1" && process.env.SSOT_WRITE === "1";
  if (canWrite) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`US_STATES_WIKI_OUTPUT=${OUT_PATH}`);
  }
  console.log(`US_STATES_WIKI_TOTAL=${payload.total}`);
  console.log(`US_STATES_WIKI_SHA=${payload.sha}`);
  console.log("US_STATES_WIKI_SYNC_OK=1");
}

main();

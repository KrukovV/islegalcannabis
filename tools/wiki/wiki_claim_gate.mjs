#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const BASE_DIR =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(new URL(import.meta.url).pathname);
let ROOT = process.env.PROJECT_ROOT ?? path.resolve(BASE_DIR, "../../..");
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  ROOT = path.resolve(BASE_DIR, "../..");
}
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  console.error("FATAL: PROJECT_ROOT not resolved:", ROOT);
  process.exit(2);
}
if (process.cwd() !== ROOT) {
  console.warn(`WARN: cwd=${process.cwd()} root=${ROOT} (auto-chdir)`);
  process.chdir(ROOT);
}

const args = process.argv.slice(2);
const geosArgIndex = args.indexOf("--geos");
let geos = ["RU", "RO", "AU", "US-CA", "CA"];
if (geosArgIndex >= 0 && args[geosArgIndex + 1]) {
  geos = args[geosArgIndex + 1].split(",").map((geo) => geo.trim()).filter(Boolean);
}
const baselinePath = path.join(ROOT, "data", "wiki", "wiki_claim_baseline.json");
const ssotPath = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const officialBadgesPath = path.join(ROOT, "data", "wiki", "wiki_official_badges.json");

if (!fs.existsSync(baselinePath)) {
  console.error(`FATAL: baseline missing path=${baselinePath}`);
  process.exit(3);
}
if (!fs.existsSync(ssotPath)) {
  console.error(`FATAL: SSOT missing path=${ssotPath}`);
  process.exit(3);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const ssot = JSON.parse(fs.readFileSync(ssotPath, "utf8"));
const entries = ssot?.items || ssot?.entries || {};
let officialBadges = {};
try {
  if (fs.existsSync(officialBadgesPath)) {
    const payload = JSON.parse(fs.readFileSync(officialBadgesPath, "utf8"));
    officialBadges = payload?.items && typeof payload.items === "object" ? payload.items : {};
  }
} catch {
  officialBadges = {};
}
const baselineStrict = process.env.BASELINE_STRICT !== "0";
const allowShrink = process.env.WIKI_CLAIMS_ALLOW_SHRINK === "1";
const shrinkReason = String(process.env.WIKI_CLAIMS_SHRINK_REASON || "");
const offlineOk = process.env.WIKI_OFFLINE_OK === "1" ? "1" : "0";
const claimsPath = path.join(ROOT, "data", "wiki", "wiki_claims.json");
const metaPath = path.join(ROOT, "data", "wiki", "wiki_claims.meta.json");
let expectedTotal = 300;
let foundTotal = Object.keys(entries || {}).length;
let missingKey = "";
try {
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const counts = meta?.counts || {};
  if (Number.isFinite(Number(counts.total))) expectedTotal = Number(counts.total);
} catch {
}
try {
  const claims = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
  if (Array.isArray(claims)) {
    const claimKeys = new Set(claims.map((row) => row?.geo_key).filter(Boolean));
    for (const key of claimKeys) {
      if (!entries[key]) {
        missingKey = key;
        break;
      }
    }
  }
} catch {
}

const recIcons = new Map([
  ["legal", "🌿"],
  ["decrim", "🟨"],
  ["illegal", "❌"],
  ["unknown", "◻️"],
]);
const medIcons = new Map([
  ["legal", "💊"],
  ["limited", "🟨"],
  ["illegal", "❌"],
  ["unknown", "◻️"],
]);

const formatRec = (value) => {
  const text = value && String(value).trim() ? String(value).trim() : "Unknown";
  const icon = recIcons.get(text.toLowerCase()) || "◻️";
  return `${icon}${text}`;
};

const formatMed = (value) => {
  const text = value && String(value).trim() ? String(value).trim() : "Unknown";
  const icon = medIcons.get(text.toLowerCase()) || "◻️";
  return `${icon}${text}`;
};

console.log(`WIKI_GATE geos=${geos.join(",")} baseline_strict=${baselineStrict ? "1" : "0"} offline_ok=${offlineOk}`);
console.log(`WIKI_CLAIMS_BASELINE_PATH=${baselinePath}`);
console.log(`WIKI_CLAIMS_CURRENT_COUNT=${foundTotal}`);
const totalReason = foundTotal === expectedTotal ? "OK" : `MISSING_KEY:${missingKey || "-"}`;
let claimsGuardStatus = "PASS";
console.log(`WIKI_TOTAL_DIAG expected=${expectedTotal} found=${foundTotal} reason=${totalReason}`);
if (foundTotal !== expectedTotal) {
  if (foundTotal < expectedTotal && allowShrink) {
    if (!shrinkReason) {
      console.log("WIKI_CLAIMS_GUARD=FAIL");
      console.log("WIKI_CLAIMS_FAIL_REASON=WIKI_CLAIMS_SHRINK");
      console.log("WIKI_CLAIMS_ERROR=shrink_allowed_but_reason_missing");
      process.exit(1);
    }
    console.log("WIKI_CLAIMS_ALLOW_SHRINK=1");
    console.log(`WIKI_CLAIMS_SHRINK_REASON=${shrinkReason}`);
    claimsGuardStatus = "PASS";
  } else {
    console.log(`WIKI_TOTAL_MISMATCH expected=${expectedTotal} found=${foundTotal} reason=${totalReason}`);
    console.log("WIKI_CLAIMS_GUARD=FAIL");
    console.log("WIKI_CLAIMS_FAIL_REASON=WIKI_CLAIMS_SHRINK");
    process.exit(1);
  }
}

let failed = false;
const failures = [];
let okCount = 0;
let failCount = 0;

for (const geo of geos) {
  const entry = entries[geo];
  if (!entry) {
    failed = true;
    failures.push(`${geo}:NO_ROW`);
    failCount += 1;
    console.log(`❌ WIKI_CLAIM_FAIL geo=${geo} reason=MISSING`);
    continue;
  }
  const rec = entry.recreational_status || entry.rec_status || entry.wiki_rec || "";
  const med = entry.medical_status || entry.med_status || entry.wiki_med || "";
  const rowRef = String(entry.row_ref || "");
  const source = rowRef.startsWith("state:")
    ? "states"
    : rowRef.startsWith("country:")
      ? "countries"
      : "unknown";
  const revision = String(entry.wiki_revision_id || entry.revision_id || "");

  const baselineEntry = baseline[geo];
  const reasons = [];
  if (!rec || !med || rec === "Unknown" || med === "Unknown") {
    reasons.push("UNKNOWN");
  } else if (!["countries", "states"].includes(source) || (geo === "US-CA" && source !== "states") || (geo !== "US-CA" && source !== "countries")) {
    reasons.push("WRONG_SOURCE");
  } else if (!revision || !/^\d+$/.test(revision)) {
    reasons.push("NO_REVISION");
  } else if (baselineStrict && baselineEntry && (baselineEntry.rec !== rec || baselineEntry.med !== med || baselineEntry.source !== source)) {
    reasons.push("BASELINE_MISMATCH");
  }

  const notesText = String(entry.notes_text || "").trim();
  const notesLen = notesText.length;
  const sourcesCount = Number(entry.sources_count || (Array.isArray(entry.sources) ? entry.sources.length : 0) || 0);
  const officialBadgeCount = Number(Array.isArray(officialBadges?.[geo]) ? officialBadges[geo].length : 0);
  if (baselineEntry?.notes_nonempty === 1 && notesLen === 0) {
    reasons.push("NOTES_EMPTY");
  }
  if (Number.isFinite(Number(baselineEntry?.sources_min)) && sourcesCount < Number(baselineEntry.sources_min)) {
    reasons.push("SOURCES_LOW");
  }
  if (Number.isFinite(Number(baselineEntry?.official_badge_min)) && officialBadgeCount < Number(baselineEntry.official_badge_min)) {
    reasons.push("OFFICIAL_BADGE_LOW");
  }

  if (reasons.length > 0) {
    failed = true;
    failures.push(`${geo}:${reasons.join("+")}`);
    failCount += 1;
    console.log(`❌ WIKI_CLAIM_FAIL geo=${geo} reason=${reasons.join("+")}`);
  } else {
    okCount += 1;
    console.log(`🌿 WIKI_CLAIM_OK geo=${geo} rec=${formatRec(rec)} med=${formatMed(med)} source=${source} revision=${revision} notes_len=${notesLen} sources=${sourcesCount} official_badge=${officialBadgeCount}`);
  }
}

if (failed) {
  console.log(`WIKI_GATE_OK=0 ok=${okCount} fail=${failCount}`);
  console.log(`WIKI_CLAIM_GATE_FAIL reason_code=${failures.join(",")}`);
  process.exit(1);
}

console.log(`WIKI_GATE_OK=1 ok=${okCount} fail=${failCount}`);
console.log(`WIKI_CLAIMS_GUARD=${claimsGuardStatus}`);

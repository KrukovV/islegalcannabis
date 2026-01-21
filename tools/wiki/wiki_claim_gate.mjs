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
let geos = ["RU", "TH", "XK", "US", "US-CA", "CA"];
if (geosArgIndex >= 0 && args[geosArgIndex + 1]) {
  geos = args[geosArgIndex + 1].split(",").map((geo) => geo.trim()).filter(Boolean);
}
const baselinePath = path.join(ROOT, "data", "wiki", "wiki_claim_baseline.json");
const ssotPath = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");

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
const baselineStrict = process.env.BASELINE_STRICT !== "0";
const offlineOk = process.env.WIKI_OFFLINE_OK === "1" ? "1" : "0";

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
  let reason = "";
  if (!rec || !med || rec === "Unknown" || med === "Unknown") {
    reason = "UNKNOWN";
  } else if (!["countries", "states"].includes(source) || (geo === "US-CA" && source !== "states") || (geo !== "US-CA" && source !== "countries")) {
    reason = "WRONG_SOURCE";
  } else if (!revision || !/^\d+$/.test(revision)) {
    reason = "NO_REVISION";
  } else if (baselineStrict && baselineEntry && (baselineEntry.rec !== rec || baselineEntry.med !== med || baselineEntry.source !== source)) {
    reason = "BASELINE_MISMATCH";
  }

  if (reason) {
    failed = true;
    failures.push(`${geo}:${reason}`);
    failCount += 1;
    console.log(`❌ WIKI_CLAIM_FAIL geo=${geo} reason=${reason}`);
  } else {
    okCount += 1;
    console.log(`🌿 WIKI_CLAIM_OK geo=${geo} rec=${formatRec(rec)} med=${formatMed(med)} source=${source} revision=${revision}`);
  }
}

if (failed) {
  console.log(`WIKI_GATE_OK=0 ok=${okCount} fail=${failCount}`);
  console.log(`WIKI_CLAIM_GATE_FAIL reason_code=${failures.join(",")}`);
  process.exit(1);
}

console.log(`WIKI_GATE_OK=1 ok=${okCount} fail=${failCount}`);

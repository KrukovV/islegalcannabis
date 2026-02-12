#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "Reports", "wiki_shrink.baseline.json");
const CLAIMS_MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const REFS_PATH = fs.existsSync(path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json"))
  ? path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json")
  : path.join(ROOT, "data", "wiki", "wiki_refs.json");
const SOURCES_PATH = path.join(ROOT, "data", "sources", "sources_registry.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function countClaims(payload) {
  const items = payload?.items;
  if (items && typeof items === "object" && !Array.isArray(items)) {
    return Object.keys(items).length;
  }
  if (Array.isArray(payload)) return payload.length;
  return 0;
}

function countNotesPresent(payload) {
  const items = payload?.items;
  if (!items || typeof items !== "object") return 0;
  let count = 0;
  for (const entry of Object.values(items)) {
    const text = typeof entry?.notes_text === "string" ? entry.notes_text.trim() : "";
    if (text) count += 1;
  }
  return count;
}

function countRefs(payload) {
  const items = payload?.items || payload;
  if (!items || typeof items !== "object") return 0;
  if (Array.isArray(items)) {
    return items.reduce((sum, entry) => sum + (Array.isArray(entry?.refs) ? entry.refs.length : 0), 0);
  }
  let total = 0;
  for (const value of Object.values(items)) {
    if (Array.isArray(value)) total += value.length;
    else if (Array.isArray(value?.refs)) total += value.refs.length;
  }
  return total;
}

function countSources(payload) {
  const items = payload?.items;
  if (Array.isArray(items)) return items.length;
  if (items && typeof items === "object") return Object.keys(items).length;
  if (Array.isArray(payload)) return payload.length;
  return 0;
}

function writeBaseline(payload) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function exitWith(code, reason) {
  console.log(`WIKI_SHRINK_GUARD=${reason}`);
  process.exit(code);
}

if (!fs.existsSync(CLAIMS_MAP_PATH)) {
  console.log(`WIKI_SHRINK_ERROR=missing_ssot path=${CLAIMS_MAP_PATH}`);
  exitWith(2, "FAIL");
}
const claimsPayload = readJson(CLAIMS_MAP_PATH);
const refsPayload = fs.existsSync(REFS_PATH) ? readJson(REFS_PATH) : {};
const sourcesPayload = fs.existsSync(SOURCES_PATH) ? readJson(SOURCES_PATH) : {};

const nowClaims = countClaims(claimsPayload);
const nowRefs = countRefs(refsPayload);
const nowNotes = countNotesPresent(claimsPayload);
const nowSources = countSources(sourcesPayload);

if (!fs.existsSync(BASELINE_PATH)) {
  writeBaseline({
    claims_total: nowClaims,
    refs_total: nowRefs,
    notes_present: nowNotes,
    sources_total: nowSources
  });
  console.log("WIKI_SHRINK_BASELINE_INIT=1");
  console.log(`WIKI_COUNTS prev_claims_total=${nowClaims} now_claims_total=${nowClaims} prev_refs_total=${nowRefs} now_refs_total=${nowRefs} prev_notes_present=${nowNotes} now_notes_present=${nowNotes} prev_sources_total=${nowSources} now_sources_total=${nowSources}`);
  exitWith(0, "PASS");
}

const baseline = readJson(BASELINE_PATH);
const prevClaims = Number(baseline?.claims_total || 0) || 0;
const prevRefs = Number(baseline?.refs_total || 0) || 0;
const prevNotes = Number(baseline?.notes_present || 0) || 0;
const prevSources = Number(baseline?.sources_total || 0) || 0;

console.log(`WIKI_SHRINK_BASELINE_PATH=${BASELINE_PATH}`);
console.log(`WIKI_COUNTS prev_claims_total=${prevClaims} now_claims_total=${nowClaims} prev_refs_total=${prevRefs} now_refs_total=${nowRefs} prev_notes_present=${prevNotes} now_notes_present=${nowNotes} prev_sources_total=${prevSources} now_sources_total=${nowSources}`);

const regress =
  nowClaims < prevClaims ||
  nowRefs < prevRefs ||
  nowNotes < prevNotes ||
  nowSources < prevSources;

if (!regress) {
  exitWith(0, "PASS");
}

const allow = process.env.WIKI_SHRINK_OK === "1";
const reason = String(process.env.WIKI_SHRINK_REASON || "").trim();
if (allow) {
  if (!reason) {
    console.log("WIKI_SHRINK_ERROR=reason_missing");
    exitWith(3, "FAIL");
  }
  console.log("WIKI_SHRINK_OK=1");
  console.log(`WIKI_SHRINK_REASON=${reason}`);
  exitWith(0, "PASS");
}

exitWith(1, "FAIL");

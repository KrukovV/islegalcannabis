#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "Reports", "wiki_shrink.baseline.json");
const COUNTRIES_BASELINE_PATH = path.join(ROOT, "Reports", "wiki_shrink_countries.baseline.json");
const STATES_BASELINE_PATH = path.join(ROOT, "Reports", "wiki_shrink_states.baseline.json");
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

function writeBaseline(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function splitGeoKeys(payload) {
  const items = payload?.items;
  if (!items || typeof items !== "object" || Array.isArray(items)) return { countries: [], states: [] };
  const countries = [];
  const states = [];
  for (const key of Object.keys(items)) {
    const geo = String(key || "").toUpperCase();
    if (!geo) continue;
    if (/^US-/.test(geo)) states.push(geo);
    else countries.push(geo);
  }
  return { countries, states };
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
const stateSourceMissing = [];
if (claimsPayload?.items && typeof claimsPayload.items === "object") {
  for (const [geo, entry] of Object.entries(claimsPayload.items)) {
    if (!/^US-/.test(String(geo || ""))) continue;
    const primary = String(entry?.primary_source || "").trim();
    if (primary !== "WIKI_US_JURISDICTION") {
      if (stateSourceMissing.length < 20) stateSourceMissing.push(String(geo || "").toUpperCase());
    }
  }
}
if (stateSourceMissing.length > 0) {
  console.log(`WIKI_STATE_SOURCE_MISSING=${stateSourceMissing.join(",")}`);
  exitWith(1, "FAIL");
}

const nowClaims = countClaims(claimsPayload);
const nowRefs = countRefs(refsPayload);
const nowNotes = countNotesPresent(claimsPayload);
const nowSources = countSources(sourcesPayload);
const split = splitGeoKeys(claimsPayload);
const nowCountriesKeys = split.countries;
const nowStatesKeys = split.states;
const nowCountries = nowCountriesKeys.length;
const nowStates = nowStatesKeys.length;

if (process.env.UPDATE_MODE === "1") {
  writeBaseline(BASELINE_PATH, {
    claims_total: nowClaims,
    refs_total: nowRefs,
    notes_present: nowNotes,
    sources_total: nowSources
  });
  writeBaseline(COUNTRIES_BASELINE_PATH, {
    claims_total: nowCountries,
    geo_keys: nowCountriesKeys
  });
  writeBaseline(STATES_BASELINE_PATH, {
    claims_total: nowStates,
    geo_keys: nowStatesKeys
  });
  console.log("WIKI_SHRINK_BASELINE_UPDATE_MODE=1");
  console.log(`WIKI_COUNTS prev_claims_total=${nowClaims} now_claims_total=${nowClaims} prev_refs_total=${nowRefs} now_refs_total=${nowRefs} prev_notes_present=${nowNotes} now_notes_present=${nowNotes} prev_sources_total=${nowSources} now_sources_total=${nowSources}`);
  console.log(`WIKI_COUNTS_COUNTRIES prev_claims_total=${nowCountries} now_claims_total=${nowCountries}`);
  console.log(`WIKI_COUNTS_STATES prev_claims_total=${nowStates} now_claims_total=${nowStates}`);
  exitWith(0, "PASS");
}

if (!fs.existsSync(BASELINE_PATH)) {
  writeBaseline(BASELINE_PATH, {
    claims_total: nowClaims,
    refs_total: nowRefs,
    notes_present: nowNotes,
    sources_total: nowSources
  });
  writeBaseline(COUNTRIES_BASELINE_PATH, {
    claims_total: nowCountries,
    geo_keys: nowCountriesKeys
  });
  writeBaseline(STATES_BASELINE_PATH, {
    claims_total: nowStates,
    geo_keys: nowStatesKeys
  });
  console.log("WIKI_SHRINK_BASELINE_INIT=1");
  console.log(`WIKI_COUNTS prev_claims_total=${nowClaims} now_claims_total=${nowClaims} prev_refs_total=${nowRefs} now_refs_total=${nowRefs} prev_notes_present=${nowNotes} now_notes_present=${nowNotes} prev_sources_total=${nowSources} now_sources_total=${nowSources}`);
  console.log(`WIKI_COUNTS_COUNTRIES prev_claims_total=${nowCountries} now_claims_total=${nowCountries}`);
  console.log(`WIKI_COUNTS_STATES prev_claims_total=${nowStates} now_claims_total=${nowStates}`);
  exitWith(0, "PASS");
}

const baseline = readJson(BASELINE_PATH);
const prevClaims = Number(baseline?.claims_total || 0) || 0;
const prevRefs = Number(baseline?.refs_total || 0) || 0;
const prevNotes = Number(baseline?.notes_present || 0) || 0;
const prevSources = Number(baseline?.sources_total || 0) || 0;
const countriesBaselineExists = fs.existsSync(COUNTRIES_BASELINE_PATH);
const statesBaselineExists = fs.existsSync(STATES_BASELINE_PATH);
if (!countriesBaselineExists) {
  writeBaseline(COUNTRIES_BASELINE_PATH, {
    claims_total: nowCountries,
    geo_keys: nowCountriesKeys
  });
  console.log("WIKI_SHRINK_COUNTRIES_BASELINE_INIT=1");
}
if (!statesBaselineExists) {
  writeBaseline(STATES_BASELINE_PATH, {
    claims_total: nowStates,
    geo_keys: nowStatesKeys
  });
  console.log("WIKI_SHRINK_STATES_BASELINE_INIT=1");
}
const countriesBaseline = countriesBaselineExists
  ? readJson(COUNTRIES_BASELINE_PATH)
  : { claims_total: nowCountries, geo_keys: nowCountriesKeys };
const statesBaseline = statesBaselineExists
  ? readJson(STATES_BASELINE_PATH)
  : { claims_total: nowStates, geo_keys: nowStatesKeys };
const prevCountries = Number(countriesBaseline?.claims_total || 0) || 0;
const prevStates = Number(statesBaseline?.claims_total || 0) || 0;
const prevCountriesKeys = Array.isArray(countriesBaseline?.geo_keys) ? countriesBaseline.geo_keys.map((g) => String(g).toUpperCase()) : [];
const prevStatesKeys = Array.isArray(statesBaseline?.geo_keys) ? statesBaseline.geo_keys.map((g) => String(g).toUpperCase()) : [];
const nowCountriesSet = new Set(nowCountriesKeys);
const nowStatesSet = new Set(nowStatesKeys);

console.log(`WIKI_SHRINK_BASELINE_PATH=${BASELINE_PATH}`);
console.log(`WIKI_COUNTS prev_claims_total=${prevClaims} now_claims_total=${nowClaims} prev_refs_total=${prevRefs} now_refs_total=${nowRefs} prev_notes_present=${prevNotes} now_notes_present=${nowNotes} prev_sources_total=${prevSources} now_sources_total=${nowSources}`);
console.log(`WIKI_SHRINK_COUNTRIES_BASELINE_PATH=${COUNTRIES_BASELINE_PATH}`);
console.log(`WIKI_SHRINK_STATES_BASELINE_PATH=${STATES_BASELINE_PATH}`);
console.log(`WIKI_COUNTS_COUNTRIES prev_claims_total=${prevCountries} now_claims_total=${nowCountries}`);
console.log(`WIKI_COUNTS_STATES prev_claims_total=${prevStates} now_claims_total=${nowStates}`);

const regress =
  nowClaims < prevClaims ||
  nowRefs < prevRefs ||
  nowNotes < prevNotes ||
  nowSources < prevSources;
const regressCountries = nowCountries < prevCountries;
const regressStates = nowStates < prevStates;

if (!regress && !regressCountries && !regressStates) {
  exitWith(0, "PASS");
}

if (regressCountries) {
  const missing = prevCountriesKeys.filter((geo) => !nowCountriesSet.has(geo));
  if (missing.length) {
    console.log(`WIKI_SHRINK_MISSING_COUNTRIES=${missing.slice(0, 20).join(",")}`);
  }
}
if (regressStates) {
  const missing = prevStatesKeys.filter((geo) => !nowStatesSet.has(geo));
  if (missing.length) {
    console.log(`WIKI_SHRINK_MISSING_STATES=${missing.slice(0, 20).join(",")}`);
  }
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

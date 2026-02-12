const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const OFFICIAL_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const WIKI_CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const ALL_GEO_PATH = path.join(ROOT, "apps", "web", "src", "lib", "geo", "allGeo.ts");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeLine(key, value) {
  process.stdout.write(`${key}=${value}\n`);
}

function loadAllGeo() {
  if (!fs.existsSync(ALL_GEO_PATH)) return [];
  const raw = fs.readFileSync(ALL_GEO_PATH, "utf8");
  const match = raw.match(/ALL_GEO\\s*:\\s*string\\[]\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;/);
  if (!match) return [];
  const body = match[1];
  const items = body
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  return items;
}

function getWikiNotes(entry) {
  if (!entry || typeof entry !== "object") return "";
  return String(entry.notesWiki || entry.notes_text || entry.notes || "");
}

const official = readJson(OFFICIAL_PATH);
if (!official || !Array.isArray(official.domains)) {
  writeLine("SSOT_METRICS_OK", "0");
  writeLine("SSOT_METRICS_REASON", "OFFICIAL_SSOT_MISSING");
  process.exit(2);
}

const wiki = readJson(WIKI_CLAIMS_PATH);
if (!wiki || typeof wiki.items !== "object") {
  writeLine("SSOT_METRICS_OK", "0");
  writeLine("SSOT_METRICS_REASON", "WIKI_SSOT_MISSING");
  process.exit(2);
}

const allGeo = loadAllGeo();
if (!allGeo.length) {
  writeLine("SSOT_METRICS_OK", "0");
  writeLine("SSOT_METRICS_REASON", "ALL_GEO_MISSING");
  process.exit(2);
}

const wikiItems = wiki.items || {};
const wikiKeys = Object.keys(wikiItems);
const missing = allGeo.filter((geo) => !wikiItems[geo]);
let notesNonEmpty = 0;
for (const geo of wikiKeys) {
  const notes = getWikiNotes(wikiItems[geo]);
  if (notes.trim().length > 0) notesNonEmpty += 1;
}

const GEO_TOTAL = allGeo.length;
const WIKI_ROWS_TOTAL = wikiKeys.length;
const WIKI_MISSING_TOTAL = missing.length;
const WIKI_NOTES_NONEMPTY = notesNonEmpty;
const WIKI_NOTES_EMPTY = Math.max(0, WIKI_ROWS_TOTAL - WIKI_NOTES_NONEMPTY);
const OFFICIAL_LINKS_TOTAL = official.domains.length;

const shrinkDetected = WIKI_ROWS_TOTAL < GEO_TOTAL ? 1 : 0;
const geoOk = GEO_TOTAL === 300;
const officialOk = OFFICIAL_LINKS_TOTAL === 413;
const metricsOk = shrinkDetected === 0 && geoOk && officialOk;

writeLine("GEO_TOTAL", GEO_TOTAL);
writeLine("WIKI_ROWS_TOTAL", WIKI_ROWS_TOTAL);
writeLine("WIKI_MISSING_TOTAL", WIKI_MISSING_TOTAL);
writeLine("WIKI_NOTES_NONEMPTY", WIKI_NOTES_NONEMPTY);
writeLine("WIKI_NOTES_EMPTY", WIKI_NOTES_EMPTY);
writeLine("OFFICIAL_LINKS_TOTAL", OFFICIAL_LINKS_TOTAL);
writeLine("SHRINK_DETECTED", String(shrinkDetected));
writeLine("SSOT_METRICS_OK", metricsOk ? "1" : "0");

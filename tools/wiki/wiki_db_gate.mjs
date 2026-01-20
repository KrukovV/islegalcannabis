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

const GEOS_ARG = process.argv.find((arg) => arg === "--geos");
const geos = GEOS_ARG
  ? (process.argv[process.argv.indexOf("--geos") + 1] || "").split(",").map((g) => g.trim()).filter(Boolean)
  : ["RU", "TH", "XK", "US-CA", "CA"];

const claimsPath = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const refsPath = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const metaPath = path.join(ROOT, "data", "wiki", "wiki_claims.meta.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

if (!fs.existsSync(claimsPath) || !fs.existsSync(refsPath) || !fs.existsSync(metaPath)) {
  const missing = [
    !fs.existsSync(claimsPath) ? `claims=${claimsPath}` : null,
    !fs.existsSync(refsPath) ? `refs=${refsPath}` : null,
    !fs.existsSync(metaPath) ? `meta=${metaPath}` : null
  ].filter(Boolean).join(" ");
  console.log(`WIKI_DB_GATE geos=${geos.join(",")}`);
  console.log(`WIKI_DB_GATE_OK=0 ok=0 fail=1`);
  console.log(`WIKI_DB_GATE_FAIL reason=MISSING_FILES ${missing}`);
  process.exit(1);
}

const claimsPayload = readJson(claimsPath);
const refsPayload = readJson(refsPath);
const metaPayload = readJson(metaPath);
const claims = claimsPayload.items || {};
const refs = refsPayload.items || {};
const fetchedAt = String(metaPayload?.fetched_at || "-");
const pageRevisions = metaPayload?.pages || {};
const countriesRev = String(pageRevisions["Legality of cannabis"]?.revision_id || "-");
const statesRev = String(pageRevisions["Legality of cannabis by U.S. jurisdiction"]?.revision_id || "-");

console.log(`WIKI_DB_GATE geos=${geos.join(",")}`);

let ok = 0;
let fail = 0;
for (const geo of geos) {
  const claim = claims[geo];
  const refItems = Array.isArray(refs[geo]) ? refs[geo] : [];
  const sourcesTotal = refItems.length;
  const sourcesOfficial = refItems.filter((item) => item?.official === true).length;
  const officialBadge = sourcesOfficial > 0 ? 1 : 0;
  const wikiRec = claim?.wiki_rec || "-";
  const wikiMed = claim?.wiki_med || "-";
  const hasNotesField = claim && Object.prototype.hasOwnProperty.call(claim, "notes_text");
  const revision = geo.startsWith("US-") ? statesRev : countriesRev;
  const updatedAt = fetchedAt;
  let reason = "";
  if (!claim) reason = "NO_CLAIM";
  if (sourcesTotal === 0) reason = reason ? `${reason},NO_SOURCES` : "NO_SOURCES";
  if (!hasNotesField) reason = reason ? `${reason},NO_NOTES_FIELD` : "NO_NOTES_FIELD";
  if (revision === "-") reason = reason ? `${reason},NO_REVISION` : "NO_REVISION";
  if (reason) {
    console.log(
      `WIKI_DB_FAIL geo=${geo} reason=${reason} sources_total=${sourcesTotal} sources_official=${sourcesOfficial} official_badge=${officialBadge} wiki_revision=${revision} updated_at=${updatedAt}`
    );
    fail += 1;
    continue;
  }
  console.log(
    `WIKI_DB geo=${geo} wiki_rec=${wikiRec} wiki_med=${wikiMed} wiki_revision=${revision} sources_total=${sourcesTotal} sources_official=${sourcesOfficial} official_badge=${officialBadge} updated_at=${updatedAt}`
  );
  ok += 1;
}

const okLine = `WIKI_DB_GATE_OK=${fail === 0 ? 1 : 0} ok=${ok} fail=${fail}`;
console.log(okLine);
process.exit(fail === 0 ? 0 : 1);

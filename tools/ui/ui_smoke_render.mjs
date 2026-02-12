import fs from "node:fs";
import path from "node:path";
import { writeSsotLine } from "../ssot/write_line.mjs";

const BASE_DIR =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(new URL(import.meta.url).pathname);
let ROOT = process.env.PROJECT_ROOT ?? path.resolve(BASE_DIR, "../..");
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  ROOT = path.resolve(BASE_DIR, "..");
}
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  console.error("FATAL: PROJECT_ROOT not resolved:", ROOT);
  process.exit(2);
}
if (process.cwd() !== ROOT) {
  console.warn(`WARN: cwd=${process.cwd()} root=${ROOT} (auto-chdir)`);
  process.chdir(ROOT);
}

const SMOKE_SET = [
  "AU",
  "GH",
  "GY",
  "RO",
  "RU",
  "DE",
  "CZ",
  "TH",
  "NL",
  "FR",
  "GB",
  "PT",
  "ES",
  "IT",
  "PL",
  "UA",
  "CA",
  "US-CA",
  "US-NY"
];
const SMOKE_SET_EXPECTED = 19;
const SMOKE_COUNTRIES = SMOKE_SET.filter((value) => !value.startsWith("US-")).length;
const SMOKE_STATES = SMOKE_SET.length - SMOKE_COUNTRIES;
const SMOKE_TOTAL = SMOKE_SET.length;
if (process.env.SMOKE_SET && process.env.SMOKE_SET !== SMOKE_SET.join(",")) {
  console.error(`SMOKE_SET_DRIFT env=${process.env.SMOKE_SET} ssot=${SMOKE_SET.join(",")}`);
  process.exit(1);
}
if (SMOKE_SET.length !== SMOKE_SET_EXPECTED) {
  console.error(`SMOKE_SET_DRIFT expected=${SMOKE_SET_EXPECTED} got=${SMOKE_SET.length}`);
  process.exit(1);
}
const ssotWrite = (key, value) => {
  writeSsotLine(`${key}=${value}`, { dedupePrefix: `${key}=` });
};
const geos = SMOKE_SET;
const claimsPath = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const officialPath = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");

const smokeLines = [
  `SMOKE_TOTAL=${SMOKE_TOTAL}`,
  `SMOKE_COUNTRIES=${SMOKE_COUNTRIES}`,
  `SMOKE_STATES=${SMOKE_STATES}`,
  `SMOKE_SET=${SMOKE_SET.join(",")}`
];
for (const line of smokeLines) {
  writeSsotLine(line, { dedupePrefix: "SMOKE_" });
}

if (!fs.existsSync(claimsPath) || !fs.existsSync(officialPath)) {
  console.log("UI_SMOKE_OK=0 reason=MISSING_SSOT");
  process.exit(1);
}

const claimsPayload = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
const officialPayload = JSON.parse(fs.readFileSync(officialPath, "utf8"));
const claims = claimsPayload.items || {};
const official = officialPayload.items || {};

let ok = 0;
let fail = 0;
const failGeos = [];
const reportLines = [...smokeLines];
for (const geo of geos) {
  const claim = claims[geo];
  const badge = official[geo];
  if (!claim) {
    console.log(`UI_COUNTRY_FAIL geo=${geo} reason=NO_CLAIM`);
    failGeos.push(geo);
    fail += 1;
    continue;
  }
  const notes = String(claim.notes_text || "");
  const notesQuality = String(claim.notes_kind || "").toUpperCase() || "-";
  const preview = notes.replace(/\s+/g, " ").trim().slice(0, 120).replace(/"/g, "'");
  const fallbackSources =
    Number(claim.sources_count || 0) ||
    (Array.isArray(claim.notes_main_articles) ? claim.notes_main_articles.length : 0);
  const sourcesTotal = Number(badge?.sources_total ?? fallbackSources ?? 0);
  const sourcesMode = Number(badge?.sources_total ?? 0) > 0 ? "refs" : "fallback";
  const officialBadge = Number(badge?.official_badge ?? 0);
  reportLines.push(
    `UI_COUNTRY_OK geo=${geo} rec=${claim.wiki_rec || "-"} med=${claim.wiki_med || "-"} notes_quality=${notesQuality} notes_len=${notes.length} sources_total=${sourcesTotal} sources_mode=${sourcesMode} official_badge=${officialBadge} preview="${preview}"`
  );
  ok += 1;
}

if (fail === 0) {
  const okLine = `UI_SMOKE_OK=1 ok=${ok} fail=${fail}`;
  console.log(okLine);
  reportLines.push(okLine);
  ssotWrite("SMOKE_TOTAL", String(SMOKE_TOTAL));
  ssotWrite("SMOKE_OK", String(ok));
  ssotWrite("SMOKE_FAIL", String(fail));
  ssotWrite("SMOKE_FAIL_LIST", "-");
  const reportPath = path.join(ROOT, "Reports", "ui_smoke.txt");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportLines.join("\n") + "\n");
  writeSsotLine(okLine, { dedupePrefix: "UI_SMOKE_OK=" });
  await import("../ssot/ssot_last_values.mjs");
  process.exit(0);
}
const failLine = `UI_SMOKE_OK=0 ok=${ok} fail=${fail}`;
console.log(failLine);
reportLines.push(failLine);
ssotWrite("SMOKE_TOTAL", String(SMOKE_TOTAL));
ssotWrite("SMOKE_OK", String(ok));
ssotWrite("SMOKE_FAIL", String(fail));
ssotWrite("SMOKE_FAIL_LIST", failGeos.join(",") || "-");
const reportPath = path.join(ROOT, "Reports", "ui_smoke.txt");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, reportLines.join("\n") + "\n");
writeSsotLine(failLine, { dedupePrefix: "UI_SMOKE_OK=" });
await import("../ssot/ssot_last_values.mjs");
process.exit(1);

import fs from "node:fs";
import path from "node:path";
import { writeSsotLine } from "../ssot/write_line.mjs";

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
const REPORT_NOTES_COVERAGE = process.argv.includes("--report-notes-coverage");
const geosArgList = GEOS_ARG
  ? (process.argv[process.argv.indexOf("--geos") + 1] || "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean)
  : [];
let geos = geosArgList.length > 0 ? geosArgList : ["RU", "RO", "AU", "US-CA", "CA"];
const scopeAll = (!GEOS_ARG && process.env.NOTES_SCOPE === "ALL") ||
  geosArgList.some((g) => g.toUpperCase() === "ALL");
const scopedGate = Boolean(GEOS_ARG) && !scopeAll;
let gateScopeLabel = scopeAll ? "ALL" : geos.join(",");

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
if (scopeAll) {
  geos = Object.keys(claims);
  gateScopeLabel = "ALL";
}
const fetchedAt = String(metaPayload?.fetched_at || "-");
const pageRevisions = metaPayload?.pages || {};
const countriesRev = String(pageRevisions["Legality of cannabis"]?.revision_id || "-");
const statesRev = String(pageRevisions["Legality of cannabis by U.S. jurisdiction"]?.revision_id || "-");
const notesStrict = process.env.NOTES_STRICT === "1";
const notesEmptyThreshold = Number(process.env.NOTES_EMPTY_THRESHOLD || 0);
const notesMinLen = Number(process.env.NOTES_MIN_LEN || 20);
const minNotesByGeoEnv = process.env.NOTES_MIN_LEN_BY_GEO || "RU:80,RO:80,AU:80";
const minNotesByGeo = new Map(
  minNotesByGeoEnv
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [geo, len] = entry.split(":").map((part) => part.trim());
      return [geo?.toUpperCase(), Number(len || 0)];
    })
    .filter(([geo, len]) => geo && Number.isFinite(len) && len > 0)
);
const notesShortThreshold = Number(
  process.env.NOTES_SHORT_THRESHOLD ||
    (scopeAll || geos.length > 5 ? 10 : 0)
);
const weakThreshold = Number(process.env.WEAK_THRESHOLD || 50);
const notesWeakMax = Number(process.env.NOTES_WEAK_MAX || 999999);
const failOnWeak = process.env.NOTES_FAIL_ON_WEAK === "1";
const allowWeakMainOnly = process.env.NOTES_ALLOW_WEAK_MAIN_ONLY !== "0";
const treatMainOnlyAsPlaceholder =
  notesStrict && process.env.NOTES_TREAT_MAIN_ONLY_PLACEHOLDER !== "0";

console.log(`WIKI_DB_GATE geos=${gateScopeLabel}`);
if (REPORT_NOTES_COVERAGE) {
  const hasAll = reportNotesCoverage(claims);
  if (process.env.NOTES_ALL_GATE === "1" && !hasAll) {
    console.log("NOTES_ALL_GATE_FAIL reason=EMPTY_NOTES");
    process.exit(1);
  }
  process.exit(0);
}

function isMainOnlyRaw(raw) {
  const rawText = String(raw || "").replace(/\s+/g, " ").trim();
  return /^\{\{\s*main\s*\|[^}]+\}\}$/i.test(rawText);
}

function stripWikiMarkupForGate(value) {
  let text = String(value || "");
  text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<ref[^>]*\/?>/gi, " ");
  text = text.replace(/\{\{[\s\S]*?\}\}/g, " ");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function isPlaceholderNote(text, raw) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (isMainOnlyRaw(raw)) return false;
  if (/^Cannabis in\s+/i.test(normalized)) {
    const rawText = stripWikiMarkupForGate(raw);
    if (!rawText) return true;
    if (rawText !== normalized && rawText.length > normalized.length) {
      return true;
    }
    return false;
  }
  if (/^Main articles?:/i.test(normalized)) return true;
  if (/^Main article:/i.test(normalized)) return true;
  if (/^See also:/i.test(normalized)) return true;
  if (/^Further information:/i.test(normalized)) return true;
  return false;
}

function reportNotesCoverage(allClaims) {
  const minOkLen = 80;
  let total = 0;
  let ok = 0;
  let empty = 0;
  let placeholder = 0;
  let weak = 0;
  const emptyGeos = [];
  const weakGeos = [];
  for (const [geo, claim] of Object.entries(allClaims || {})) {
    total += 1;
    const notesText = String(claim?.notes_text || "");
    const notesRaw = String(claim?.notes_raw || "");
    const mainOnly = isMainOnlyRaw(notesRaw);
    const isEmpty = !notesText;
    const isPlaceholder = isPlaceholderNote(notesText, notesRaw) || mainOnly || /^Main article:/i.test(notesText);
    if (isEmpty) {
      empty += 1;
      if (emptyGeos.length < 10) emptyGeos.push(geo);
      continue;
    }
    if (isPlaceholder) {
      placeholder += 1;
      weak += 1;
      if (weakGeos.length < 10) weakGeos.push(geo);
      continue;
    }
    if (notesText.length < minOkLen) {
      weak += 1;
      if (weakGeos.length < 10) weakGeos.push(geo);
      continue;
    }
    ok += 1;
  }
  const withNotes = total - empty;
  const hasAll = empty === 0 ? 1 : 0;
  console.log(`NOTES_COVERAGE total_geo=${total} with_notes=${withNotes} ok=${ok} empty=${empty} placeholder=${placeholder} weak=${weak}`);
  console.log(`NOTES_ALL_HAVE_NOTES=${hasAll}`);
  console.log(`NOTES_COVERAGE_EMPTY_TOP10 ${emptyGeos.join(",") || "-"}`);
  console.log(`NOTES_COVERAGE_SAMPLE_WEAK geos=${weakGeos.join(",") || "-"}`);
  return hasAll === 1;
}

let ok = 0;
let fail = 0;
const expectedTotal = 300;
const totalClaims = Object.keys(claims).length;
let emptyNotes = 0;
let missingNotesField = 0;
let shortNotes = 0;
let placeholderNotes = 0;
let weakNotes = 0;
const weakSamples = [];
const scopedStats = {
  empty: 0,
  missing: 0,
  short: 0,
  placeholder: 0,
  weak: 0
};
const scopedWeakSamples = [];
const getMinLenForGeo = (geo) => {
  const scoped = minNotesByGeo.get(String(geo || "").toUpperCase());
  if (Number.isFinite(scoped) && scoped > 0) return scoped;
  return notesMinLen;
};
const accumulateStats = (claim, key, stats, samples, minLen) => {
  if (!claim || typeof claim !== "object") {
    stats.missing += 1;
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(claim, "notes_text")) {
    stats.missing += 1;
    return;
  }
  const notesText = String(claim.notes_text || "");
  const notesRaw = String(claim.notes_raw || "");
  const hasMainArticles = Array.isArray(claim.notes_main_articles) && claim.notes_main_articles.length > 0;
  const mainOnly = isMainOnlyRaw(notesRaw);
  if (mainOnly) {
    stats.weak += 1;
    if (samples.length < 10 && key) {
      samples.push(`WEAK_NOTES_SAMPLE geo=${key} reason=MAIN_ONLY`);
    }
    if (treatMainOnlyAsPlaceholder) {
      stats.placeholder += 1;
    }
    if (notesText === "") {
      return;
    }
  }
  if (notesText === "") {
    let weakReason = "";
    if (hasMainArticles || isMainOnlyRaw(notesRaw)) {
      weakReason = "MAIN_ONLY";
    } else if (!notesRaw.trim()) {
      weakReason = "NO_RAW";
    }
    if (weakReason) {
      stats.weak += 1;
      if (samples.length < 10 && key) {
        samples.push(`WEAK_NOTES_SAMPLE geo=${key} reason=${weakReason}`);
      }
    } else {
      stats.empty += 1;
    }
    return;
  }
  const placeholder = isPlaceholderNote(notesText, notesRaw);
  if (placeholder) stats.placeholder += 1;
  if (minLen > 0 && !mainOnly && notesText.length < minLen) {
    stats.short += 1;
  }
};

const globalStats = {
  empty: 0,
  missing: 0,
  short: 0,
  placeholder: 0,
  weak: 0
};

for (const [key, claim] of Object.entries(claims)) {
  accumulateStats(claim, key, globalStats, weakSamples, notesMinLen);
}
emptyNotes = globalStats.empty;
missingNotesField = globalStats.missing;
shortNotes = globalStats.short;
placeholderNotes = globalStats.placeholder;
weakNotes = globalStats.weak;

for (const geo of geos) {
  const claim = claims[geo];
  const scopedMin = getMinLenForGeo(geo);
  accumulateStats(claim, geo, scopedStats, scopedWeakSamples, scopedMin);
}

const shortCountForGate = scopeAll ? shortNotes : scopedStats.short;
const scopeGeoSet = scopeAll ? null : new Set(geos.map((geo) => geo.toUpperCase()));
const perGeoPairs = Array.from(minNotesByGeo.entries())
  .map(([geo, len]) => ({ geo: geo.toUpperCase(), len }))
  .filter((entry) => (scopeGeoSet ? scopeGeoSet.has(entry.geo) : true))
  .sort((a, b) => a.geo.localeCompare(b.geo));
const perGeoLabel = perGeoPairs.length
  ? ` per_geo=${perGeoPairs.map((entry) => `${entry.geo}:${entry.len}`).join(",")}`
  : " per_geo=none";
const scopeLabel = scopeAll ? "ALL" : `geos:${geos.join(",")}`;
console.log(
  `NOTES_LIMITS scope=${scopeLabel} strict=${notesStrict ? 1 : 0} global_min_len=${notesMinLen}${perGeoLabel} weak_threshold=${weakThreshold} fail_on_empty=1 fail_on_placeholder=1`
);
if (scopeAll) {
  console.log(
    `NOTES_TOTAL expected=${expectedTotal} found=${totalClaims} empty=${emptyNotes} short=${shortCountForGate} placeholder=${placeholderNotes} weak=${weakNotes} missing_field=${missingNotesField}`
  );
  console.log(`NOTES_PLACEHOLDER total=${placeholderNotes}`);
} else {
  console.log(
    `NOTES_GEOS_TOTAL expected=${geos.length} found=${geos.length - scopedStats.missing} empty=${scopedStats.empty} short=${shortCountForGate} placeholder=${scopedStats.placeholder} weak=${scopedStats.weak} missing_field=${scopedStats.missing}`
  );
}
writeSsotLine(`NOTES_PLACEHOLDER total=${placeholderNotes}`, { dedupePrefix: "NOTES_PLACEHOLDER " });
const weakTotal = scopeAll ? weakNotes : scopedStats.weak;
const weakSampleLines = scopeAll ? weakSamples : scopedWeakSamples;
if (weakTotal > 0) {
  console.log(`WEAK_NOTES total=${weakTotal}`);
  for (const line of weakSampleLines) console.log(line);
}
const coverageKeys = scopeAll ? Object.keys(claims) : geos;
let coveragePresent = 0;
let coverageEmpty = 0;
let coveragePlaceholder = 0;
let coverageWeak = 0;
for (const key of coverageKeys) {
  const claim = claims[key];
  if (!claim || !Object.prototype.hasOwnProperty.call(claim, "notes_text")) {
    coverageEmpty += 1;
    continue;
  }
  const notesText = String(claim.notes_text || "");
  const notesRaw = String(claim.notes_raw || "");
  if (!notesText) {
    coverageEmpty += 1;
    continue;
  }
  if (isPlaceholderNote(notesText, notesRaw) || (treatMainOnlyAsPlaceholder && isMainOnlyRaw(notesRaw))) {
    coveragePlaceholder += 1;
    continue;
  }
  const minLen = scopeAll ? notesMinLen : getMinLenForGeo(key);
  if (minLen > 0 && notesText.length < minLen) {
    coverageWeak += 1;
    continue;
  }
  coveragePresent += 1;
}
console.log(
  `NOTES_COVERAGE scope=${scopeLabel} total_geo=${coverageKeys.length} notes_present=${coveragePresent} empty=${coverageEmpty} placeholder=${coveragePlaceholder} weak=${coverageWeak}`
);
const strictStats = scopeAll ? globalStats : scopedStats;
const strictFailReasons = [];
if (notesStrict) {
  if (strictStats.empty > 0) strictFailReasons.push("EMPTY");
  if (!scopedGate && strictStats.placeholder > 0) strictFailReasons.push("PLACEHOLDER");
  if (strictStats.missing > 0) strictFailReasons.push("MISSING_FIELD");
  if (scopedGate && failOnWeak && strictStats.placeholder > 0) strictFailReasons.push("PLACEHOLDER");
}
let strictStatus = notesStrict
  ? (strictFailReasons.length === 0 ? "PASS" : "FAIL")
  : "SKIP";
let strictReason = strictFailReasons.length ? `FAIL_${strictFailReasons.join(",")}` : "OK";
if (weakTotal > 0) {
  console.log(`NOTES_WEAK_WARN threshold=${weakThreshold} weak=${weakTotal}`);
  if (notesStrict && strictFailReasons.length === 0 && failOnWeak && weakTotal > notesWeakMax) {
    strictStatus = "FAIL";
    strictReason = "FAIL_WEAK";
  } else if (notesStrict && strictFailReasons.length === 0 && failOnWeak) {
    strictReason = "OK_WEAK_ALLOWED";
  } else if (strictFailReasons.length === 0) {
    strictReason = "WARN_WEAK";
  }
}
console.log(
  `NOTES_STRICT_RESULT strict=${notesStrict ? 1 : 0} scope=${scopeLabel} empty=${strictStats.empty} placeholder=${strictStats.placeholder} missing_field=${strictStats.missing} weak=${weakTotal} status=${strictStatus} reason=${strictReason}`
);
if (notesStrict && strictFailReasons.length > 0) {
  const badEntries = [];
  const badKeys = scopeAll ? Object.keys(claims) : geos;
  for (const geo of badKeys) {
    const claim = claims[geo];
    if (!claim || typeof claim !== "object") {
      badEntries.push({ geo, kind: "MISSING_FIELD", notesLen: 0, preview: "" });
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(claim, "notes_text")) {
      badEntries.push({ geo, kind: "MISSING_FIELD", notesLen: 0, preview: "" });
      continue;
    }
    const notesText = String(claim.notes_text || "");
    const notesRaw = String(claim.notes_raw || "");
    const hasMain = Array.isArray(claim.notes_main_articles) && claim.notes_main_articles.length > 0;
    const mainOnly = isMainOnlyRaw(notesRaw);
    const placeholder = isPlaceholderNote(notesText, notesRaw);
    if (notesText === "" && !(hasMain || mainOnly || !notesRaw.trim())) {
      badEntries.push({ geo, kind: "PARSE_FAIL", notesLen: 0, preview: "" });
    } else if (placeholder) {
      badEntries.push({
        geo,
        kind: "PLACEHOLDER",
        notesLen: notesText.length,
        preview: notesText.replace(/\s+/g, " ").trim().slice(0, 80)
      });
    }
  }
  if (badEntries.length > 0) {
    console.log(`TOP_BAD_GEOS total=${badEntries.length}`);
    for (const entry of badEntries.slice(0, 20)) {
      console.log(
        `BAD_NOTES geo=${entry.geo} kind=${entry.kind} notes_len=${entry.notesLen} preview="${entry.preview.replace(/"/g, "'")}"`
      );
    }
  }
}
const sampleScopeKeys = scopeAll ? Object.keys(claims) : geos;
const sampleKeys = sampleScopeKeys
  .sort((a, b) => {
    const aNotes = String(claims[a]?.notes_text ?? "");
    const bNotes = String(claims[b]?.notes_text ?? "");
    if (aNotes.length !== bNotes.length) return aNotes.length - bNotes.length;
    return a.localeCompare(b);
  })
  .slice(0, 10);
for (const key of sampleKeys) {
  const claim = claims[key];
  const notes = String(claim?.notes_text ?? "");
  const preview = notes.replace(/\s+/g, " ").trim().slice(0, 80).replace(/"/g, "'");
  console.log(`NOTES_SAMPLE geo=${key} notes_len=${notes.length} preview="${preview}"`);
}
const shortSampleKeys = sampleScopeKeys
  .filter((key) => {
    const notes = String(claims[key]?.notes_text ?? "");
    const raw = String(claims[key]?.notes_raw ?? "");
    if (!notes) return false;
    const scopedMin = scopeAll ? notesMinLen : getMinLenForGeo(key);
    if (scopedMin <= 0) return false;
    if (isMainOnlyRaw(raw)) return false;
    return notes.length < scopedMin;
  })
  .sort((a, b) => {
    const aNotes = String(claims[a]?.notes_text ?? "");
    const bNotes = String(claims[b]?.notes_text ?? "");
    if (aNotes.length !== bNotes.length) return aNotes.length - bNotes.length;
    return a.localeCompare(b);
  })
  .slice(0, 10);
for (const key of shortSampleKeys) {
  const claim = claims[key];
  const notes = String(claim?.notes_text ?? "");
  const preview = notes.replace(/\s+/g, " ").trim().slice(0, 80).replace(/"/g, "'");
  console.log(`NOTES_SHORT_SAMPLE geo=${key} notes_len=${notes.length} preview="${preview}"`);
}
const placeholderSampleKeys = sampleScopeKeys
  .filter((key) => {
    const notes = String(claims[key]?.notes_text ?? "");
    const raw = String(claims[key]?.notes_raw ?? "");
    if (!notes) return false;
    if (isMainOnlyRaw(raw)) return false;
    return isPlaceholderNote(notes, raw);
  })
  .sort((a, b) => {
    const aNotes = String(claims[a]?.notes_text ?? "");
    const bNotes = String(claims[b]?.notes_text ?? "");
    if (aNotes.length !== bNotes.length) return aNotes.length - bNotes.length;
    return a.localeCompare(b);
  })
  .slice(0, 10);
for (const key of placeholderSampleKeys) {
  const claim = claims[key];
  const notes = String(claim?.notes_text ?? "");
  const preview = notes.replace(/\s+/g, " ").trim().slice(0, 80).replace(/"/g, "'");
  console.log(`NOTES_PLACEHOLDER_SAMPLE geo=${key} notes_len=${notes.length} preview="${preview}"`);
}
if (!scopedGate) {
  if (totalClaims !== expectedTotal || missingNotesField > 0) {
    console.log(
      `NOTES_TOTAL_MISMATCH expected=${expectedTotal} found=${totalClaims} missing_field=${missingNotesField}`
    );
    fail += 1;
  }
  if (notesStrict && strictFailReasons.length > 0) {
    fail += 1;
  }
}
for (const geo of geos) {
  const claim = claims[geo];
  const refItems = Array.isArray(refs[geo]) ? refs[geo] : [];
  const sourcesTotal = refItems.length || Number(claim?.sources_count || 0);
  const sourcesOfficial = refItems.filter((item) => item?.official === true).length;
  const officialBadge = sourcesOfficial > 0 ? 1 : 0;
  const wikiRec = claim?.wiki_rec || "-";
  const wikiMed = claim?.wiki_med || "-";
  const notesLen = String(claim?.notes_text ?? "").length;
  const notesRaw = String(claim?.notes_raw ?? "");
  const minLenForGeo = getMinLenForGeo(geo);
  const notesText = String(claim?.notes_text ?? "");
  const geoUpper = String(geo).toUpperCase();
  const ruNeedsCvt = geoUpper === "RU";
  const hasRuNumbers = ruNeedsCvt
    ? notesText.includes("6 g") && notesText.includes("2 g")
    : true;
  const hasRoMarkers = geoUpper === "RO"
    ? (notesText.includes("2013") && (notesText.includes("2–7") || notesText.includes("2-7")))
    : true;
  const hasAuMarkers = geoUpper === "AU"
    ? (notesText.includes("31 January 2020") && notesText.includes("50 g") && notesText.toLowerCase().includes("two plants"))
    : true;
  const hasNotesField = claim && Object.prototype.hasOwnProperty.call(claim, "notes_text");
  const revision = geo.startsWith("US-") ? statesRev : countriesRev;
  const updatedAt = fetchedAt;
  let reason = "";
  if (minLenForGeo > 0 && claim) {
    if (notesLen === 0) {
      console.log(`NOTES_GEO_FAIL geo=${geo} notes_len=0 reason=EMPTY`);
      if (notesStrict) fail += 1;
    } else if (isMainOnlyRaw(notesRaw)) {
      console.log(`NOTES_GEO_WEAK geo=${geo} reason=MAIN_ONLY`);
      if (notesStrict && failOnWeak && !allowWeakMainOnly) fail += 1;
    } else if (notesLen < minLenForGeo) {
      console.log(
        `NOTES_GEO_WEAK geo=${geo} notes_len=${notesLen} min_len=${minLenForGeo} reason=SHORT`
      );
      if (notesStrict && failOnWeak) fail += 1;
    } else if (!hasRuNumbers) {
      console.log(
        `NOTES_GEO_WEAK geo=${geo} notes_len=${notesLen} reason=CVT_MISSING`
      );
      if (notesStrict && failOnWeak) fail += 1;
    } else if (!hasRoMarkers) {
      console.log(
        `NOTES_GEO_WEAK geo=${geo} notes_len=${notesLen} reason=RO_MARKER_MISSING`
      );
      if (notesStrict && failOnWeak) fail += 1;
    } else if (!hasAuMarkers) {
      console.log(
        `NOTES_GEO_WEAK geo=${geo} notes_len=${notesLen} reason=AU_MARKER_MISSING`
      );
      if (notesStrict && failOnWeak) fail += 1;
    } else {
      console.log(
        `NOTES_GEO_OK geo=${geo} notes_len=${notesLen} min_len=${minLenForGeo} has_cvt_nums=1`
      );
    }
  }
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
await import("../ssot/ssot_last_values.mjs");
if (notesStrict && strictStatus === "FAIL") {
  process.exit(1);
}
process.exit(fail === 0 ? 0 : 1);

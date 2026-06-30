#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const AUDIT_DIR = path.join(ROOT, "Artifacts", "geo-sync");
const FULL_MANIFEST_PATH = path.join(AUDIT_DIR, "full-manifest.json");
const FULL_REPORT_PATH = path.join(AUDIT_DIR, "full-report.csv");
const FULL_SUMMARY_PATH = path.join(AUDIT_DIR, "full-summary.json");
const FULL_VALIDATION_PATH = path.join(AUDIT_DIR, "full-validation.json");
const FULL_INDEX_PATH = path.join(AUDIT_DIR, "full-index.html");
const EXPECTED_TOTAL = 307;

const REQUIRED_REPORT_HEADERS = [
  "code",
  "name",
  "type",
  "parent",
  "canonical_key",
  "wiki_page",
  "source_kind",
  "coverage_class",
  "resolver_confidence",
  "model_rule_ids",
  "applied_rules",
  "parser_version",
  "generator_run_id",
  "canonical_record_hash",
  "map_screenshot",
  "popup_screenshot",
  "seo_screenshot",
  "wiki_screenshot",
  "geo_analysis_json",
  "map_color_bucket",
  "map_color_evidence",
  "map_layer_id",
  "map_source_id",
  "popup_badge_bucket",
  "popup_status_label",
  "seo_badge_bucket",
  "seo_status_label",
  "normalized_color_bucket",
  "normalized_status",
  "popup_sections",
  "seo_sections",
  "wiki_sections",
  "popup_missing",
  "seo_missing",
  "wrong_geo_text",
  "duplicate_with_geo",
  "raw_urls",
  "source_errors",
  "status_color_conflicts",
  "color_mismatch_kind",
  "notes"
];

const FRESHNESS_TARGETS = [
  "apps/web/scripts/geo-sync-audit.ts",
  "apps/web/scripts/popup-visual-audit.ts",
  "apps/web/scripts/popup-seo-content-audit.ts",
  "apps/web/src/lib/countryPageStorage.ts",
  "apps/web/src/new-map/countrySource.ts",
  "apps/web/src/new-map/components/ViewportCountryPopup.tsx",
  "apps/web/src/new-map/components/UnifiedSeoStatusPanel.tsx",
  "data/cannabis_profiles/knowledge_db.json",
  "data/cannabis_profiles/first_wave_profiles.json",
  "tools/knowledge/harvest_cannabis_knowledge.mjs"
];

function fail(reason, details = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason, ...details }, null, 2)}\n`);
  process.stdout.write(`GEO_SYNC_AUDIT_GUARD=FAIL reason=${reason}\n`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("file://")) return raw.slice("file://".length);
  if (path.isAbsolute(raw)) return raw;
  return path.join(ROOT, raw);
}

function existingPath(value) {
  const normalized = normalizePath(value);
  return normalized && fs.existsSync(normalized) ? normalized : null;
}

function readTextIfExists(value) {
  const filePath = existingPath(value);
  if (!filePath) return "";
  return fs.readFileSync(filePath, "utf8");
}

function artifactSiblingText(screenshotPath, fileName) {
  const normalized = normalizePath(screenshotPath);
  if (!normalized) return "";
  return readTextIfExists(path.join(path.dirname(normalized), fileName));
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function bucketToSemanticColor(bucket) {
  const normalized = String(bucket || "").trim().toUpperCase();
  if (normalized === "ILLEGAL") return "RED";
  if (normalized === "LIMITED_OR_MEDICAL") return "YELLOW";
  if (normalized === "LEGAL_OR_DECRIM") return "GREEN";
  if (normalized === "UNKNOWN") return "UNKNOWN";
  return "UNKNOWN";
}

function hasWikiMedicalNegation(text) {
  return (
    /\bmedicinal\s+likely not prescribed by doctors\b/i.test(text) ||
    /\bmedical (?:cannabis|marijuana|use)\s+(?:is|remains|was|were)\s+(?:illegal|not allowed|not permitted|prohibited|banned)\b/i.test(text) ||
    /\bnot allowed for medical purposes\b/i.test(text) ||
    /\bno (?:comprehensive )?medical cannabis\b/i.test(text)
  );
}

function hasWikiControlledNarcoticConflict(text) {
  return (
    /\bcannabis(?: and hemp resin)? is listed.{0,160}\bnarcotics?\b/i.test(text) ||
    /\bcannabis and hemp resin is listed.{0,160}\bnarcotics?\b/i.test(text) ||
    /\bofficially illegal\b/i.test(text) ||
    /\buse is still illegal\b/i.test(text) ||
    /\bcriminal offe[nc]e to smoke\b/i.test(text) ||
    /\blegal status.{0,100}\bunclear\b/i.test(text)
  );
}

function hasWikiRecreationalIllegal(text) {
  return /\brecreational\s+illegal\b/i.test(text) || /\brecreational.{0,80}\billegal\b/i.test(text);
}

function deriveSemanticStatusConflicts(row) {
  const wikiText = artifactSiblingText(row.wiki_screenshot || row.wiki_fullpage_screenshot, "wiki-fullpage.txt");
  const popupText = artifactSiblingText(row.popup_screenshot || row.project_popup_screenshot, "project-popup.txt");
  const seoText = artifactSiblingText(row.seo_screenshot, "project-seo-fullpage.txt");
  const projectText = `${popupText} ${seoText}`;
  const projectSaysMedicalAccess =
    /\bmedical access exists\b/i.test(projectText) ||
    /\bmedical cannabis is legal\b/i.test(projectText) ||
    /\bmedical\s+legal\b/i.test(projectText);
  const anyGreen = [
    row.map_color_bucket,
    row.popup_badge_bucket,
    row.seo_badge_bucket,
    row.normalized_color_bucket
  ].some((bucket) => bucketToSemanticColor(bucket) === "GREEN");
  const recreationalIllegal = hasWikiRecreationalIllegal(wikiText);
  const medicalNegation = hasWikiMedicalNegation(wikiText);
  const controlledConflict = hasWikiControlledNarcoticConflict(wikiText);
  return [
    anyGreen && recreationalIllegal && medicalNegation ? "wiki_recreational_illegal_medical_negation_green" : "",
    anyGreen && recreationalIllegal && controlledConflict ? "wiki_controlled_narcotic_conflict_green" : "",
    projectSaysMedicalAccess && medicalNegation ? "project_medical_access_contradicts_wiki" : "",
    String(row.normalized_status || "").toUpperCase() === "ILLEGAL" &&
      bucketToSemanticColor(row.normalized_color_bucket) === "GREEN" &&
      (medicalNegation || controlledConflict)
      ? "normalized_illegal_green_with_wiki_conflict"
      : ""
  ].filter(Boolean);
}

function reportHeaders(filePath) {
  const firstLine = fs.readFileSync(filePath, "utf8").split(/\r?\n/)[0] || "";
  return firstLine.split(",");
}

function failIfAny(label, rows, details = {}) {
  if (rows.length === 0) return;
  fail(label, { count: rows.length, sample: rows.slice(0, 12), ...details });
}

for (const filePath of [FULL_MANIFEST_PATH, FULL_REPORT_PATH, FULL_SUMMARY_PATH, FULL_VALIDATION_PATH, FULL_INDEX_PATH]) {
  if (!fs.existsSync(filePath)) {
    fail("MISSING_GEO_SYNC_FILE", { file: path.relative(ROOT, filePath) });
  }
}

const manifest = readJson(FULL_MANIFEST_PATH);
const summary = readJson(FULL_SUMMARY_PATH);
const validation = readJson(FULL_VALIDATION_PATH);
const indexHtml = fs.readFileSync(FULL_INDEX_PATH, "utf8");
const headers = reportHeaders(FULL_REPORT_PATH);

for (const header of REQUIRED_REPORT_HEADERS) {
  if (!headers.includes(header)) fail("REPORT_HEADER_MISSING", { header });
}

const freshnessFiles = FRESHNESS_TARGETS.map((file) => path.join(ROOT, file)).filter((file) => fs.existsSync(file));
const manifestMtimeMs = fs.statSync(FULL_MANIFEST_PATH).mtimeMs;
const freshestSource = freshnessFiles
  .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
  .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
if (freshestSource && manifestMtimeMs < freshestSource.mtimeMs) {
  fail("FULL_GEO_SYNC_MANIFEST_STALE", {
    manifest_mtime_ms: manifestMtimeMs,
    freshest_source_mtime_ms: freshestSource.mtimeMs,
    freshest_source: path.relative(ROOT, freshestSource.file)
  });
}

const rows = arrayValue(manifest.rows);
const countFields = ["total_geo_count", "processed_geo_count", "mapCaptured", "popupCaptured", "seoCaptured", "wikiCaptured"];
for (const field of countFields) {
  if (manifest[field] !== EXPECTED_TOTAL) fail("FULL_COUNT_MISMATCH", { field, value: manifest[field], expected: EXPECTED_TOTAL });
  if (summary[field] !== EXPECTED_TOTAL) fail("SUMMARY_COUNT_MISMATCH", { field, value: summary[field], expected: EXPECTED_TOTAL });
}
if (rows.length !== EXPECTED_TOTAL) fail("ROW_COUNT_MISMATCH", { rows: rows.length, expected: EXPECTED_TOTAL });
if (validation.total_geo_count !== EXPECTED_TOTAL || validation.processed_geo_count !== EXPECTED_TOTAL) {
  fail("VALIDATION_COUNT_MISMATCH", {
    total_geo_count: validation.total_geo_count,
    processed_geo_count: validation.processed_geo_count
  });
}
if (validation.screenshot_pairs_ok !== true || validation.existing_paths_ok !== true) {
  fail("VALIDATION_PATHS_NOT_OK", {
    screenshot_pairs_ok: validation.screenshot_pairs_ok,
    existing_paths_ok: validation.existing_paths_ok,
    missing_artifacts: validation.missing_artifacts || []
  });
}
if (arrayValue(validation.regressions).length > 0 || arrayValue(validation.missing_artifacts).length > 0) {
  fail("VALIDATION_REGRESSIONS_PRESENT", {
    regressions: validation.regressions || [],
    missing_artifacts: validation.missing_artifacts || []
  });
}

const missingEvidence = [];
const sourceTraceRows = [];
const rawUrlRows = [];
const repeatedRows = [];
const wrongGeoRows = [];
const duplicateRows = [];
const statusConflictRows = [];
const colorMismatchRows = [];
const visualFailRows = [];
const seoNotRicherRows = [];
const hashRows = [];
const indexMissingRows = [];
const semanticConflictRows = [];

for (const row of rows) {
  const code = String(row.code || "").toUpperCase();
  const artifactDir = existingPath(row.artifact_dir);
  const requiredPaths = [
    ["map_screenshot", row.map_screenshot],
    ["popup_screenshot", row.popup_screenshot || row.project_popup_screenshot],
    ["seo_screenshot", row.seo_screenshot],
    ["seo_panel_screenshot", row.project_seo_panel_screenshot],
    ["wiki_screenshot", row.wiki_screenshot || row.wiki_fullpage_screenshot],
    ["geo_analysis_json", row.geo_analysis_json]
  ];
  if (artifactDir) {
    requiredPaths.push(
      ["map_json", path.join(artifactDir, "project-map.json")],
      ["popup_text", path.join(artifactDir, "project-popup.txt")],
      ["popup_json", path.join(artifactDir, "project-popup.json")],
      ["seo_text", path.join(artifactDir, "project-seo-fullpage.txt")],
      ["seo_json", path.join(artifactDir, "project-seo-fullpage.json")],
      ["wiki_text", path.join(artifactDir, "wiki-fullpage.txt")],
      ["wiki_html", path.join(artifactDir, "wiki-fullpage.html")],
      ["wiki_json", path.join(artifactDir, "wiki-fullpage.json")]
    );
  } else {
    requiredPaths.push(["artifact_dir", row.artifact_dir]);
  }
  const missing = requiredPaths.filter(([, value]) => !existingPath(value)).map(([field]) => field);
  if (missing.length > 0) missingEvidence.push({ code, missing });

  if (arrayValue(row.source_trace_errors).length > 0 || arrayValue(row.source_errors).length > 0) {
    sourceTraceRows.push({ code, source_trace_errors: row.source_trace_errors || [], source_errors: row.source_errors || [] });
  }
  if (arrayValue(row.raw_urls).length > 0) rawUrlRows.push({ code, raw_urls: row.raw_urls });
  if (arrayValue(row.repeated_text).length > 0) repeatedRows.push({ code, repeated_text: row.repeated_text });
  if (arrayValue(row.wrong_geo_text).length > 0) wrongGeoRows.push({ code, wrong_geo_text: row.wrong_geo_text });
  if (arrayValue(row.duplicate_with_geo).length > 0) duplicateRows.push({ code, duplicate_with_geo: row.duplicate_with_geo });
  if (arrayValue(row.status_color_conflicts).length > 0) statusConflictRows.push({ code, status_color_conflicts: row.status_color_conflicts });
  if (arrayValue(row.color_mismatch_kind).length > 0) colorMismatchRows.push({ code, color_mismatch_kind: row.color_mismatch_kind });
  const semanticConflicts = deriveSemanticStatusConflicts(row);
  if (semanticConflicts.length > 0) semanticConflictRows.push({ code, semantic_conflicts: semanticConflicts });
  const notes = arrayValue(row.notes).map(String);
  const failingNotes = notes.filter((item) => /=FAIL\b/.test(item));
  if (failingNotes.length > 0) visualFailRows.push({ code, notes: failingNotes });
  if (notes.some((item) => item === "SEO_NOT_RICHER_THAN_POPUP" || item === "SEO_NOT_CAPTURED")) seoNotRicherRows.push(code);
  if (!String(row.canonical_record_hash || "").trim()) hashRows.push(code);

  for (const field of ["map_screenshot", "popup_screenshot", "seo_screenshot", "wiki_screenshot", "geo_analysis_json"]) {
    const value = String(row[field] || "").trim();
    if (!value) continue;
    const href = path.isAbsolute(value) ? `file://${value}` : value;
    if (!indexHtml.includes(href)) indexMissingRows.push({ code, field, href });
  }
}

failIfAny("MISSING_EVIDENCE_ARTIFACTS", missingEvidence);
failIfAny("SOURCE_TRACE_ERRORS_PRESENT", sourceTraceRows);
failIfAny("RAW_URLS_PRESENT", rawUrlRows);
failIfAny("REPEATED_TEXT_PRESENT", repeatedRows);
failIfAny("WRONG_GEO_TEXT_PRESENT", wrongGeoRows);
failIfAny("DUPLICATE_GEO_TEXT_PRESENT", duplicateRows);
failIfAny("STATUS_COLOR_CONFLICTS_PRESENT", statusConflictRows);
failIfAny("COLOR_MISMATCH_PRESENT", colorMismatchRows);
failIfAny("SEMANTIC_STATUS_CONFLICTS_PRESENT", semanticConflictRows);
failIfAny("VISUAL_VERDICT_FAIL_PRESENT", visualFailRows);
failIfAny("SEO_NOT_RICHER_PRESENT", seoNotRicherRows);
failIfAny("CANONICAL_RECORD_HASH_MISSING", hashRows);
failIfAny("INDEX_LINK_MISSING", indexMissingRows);

const georgiaCountry = rows.find((row) => String(row.canonical_key || "").startsWith("GE|country|"));
const georgiaState = rows.find((row) => String(row.canonical_key || "").startsWith("US-GA|state|"));
if (!georgiaCountry || !georgiaState) fail("GEORGIA_CANARY_MISSING");
if (georgiaCountry.wiki_page === georgiaState.wiki_page) {
  fail("GEORGIA_CANARY_SAME_WIKI_SOURCE", {
    georgia_country: georgiaCountry.wiki_page,
    georgia_state: georgiaState.wiki_page
  });
}
if (georgiaCountry.canonical_record_hash === georgiaState.canonical_record_hash) {
  fail("GEORGIA_CANARY_SAME_RECORD_HASH", {
    canonical_record_hash: georgiaCountry.canonical_record_hash
  });
}
const georgiaCountryPopup = readTextIfExists(georgiaCountry.popup_screenshot ? path.join(path.dirname(normalizePath(georgiaCountry.popup_screenshot)), "project-popup.txt") : "");
const georgiaStatePopup = readTextIfExists(georgiaState.popup_screenshot ? path.join(path.dirname(normalizePath(georgiaState.popup_screenshot)), "project-popup.txt") : "");
if (georgiaCountryPopup && georgiaStatePopup && georgiaCountryPopup === georgiaStatePopup) {
  fail("GEORGIA_CANARY_IDENTICAL_POPUP_TEXT");
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  total_geo_count: manifest.total_geo_count,
  processed_geo_count: manifest.processed_geo_count,
  mapCaptured: manifest.mapCaptured,
  popupCaptured: manifest.popupCaptured,
  seoCaptured: manifest.seoCaptured,
  wikiCaptured: manifest.wikiCaptured,
  color_mismatch: 0,
  status_color_conflicts: 0,
  regressions: 0
}, null, 2)}\n`);
process.stdout.write("GEO_SYNC_AUDIT_GUARD=PASS\n");

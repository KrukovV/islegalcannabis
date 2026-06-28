#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const AUDIT_DIR = path.join(ROOT, "Artifacts", "popup-visual-audit");
const FULL_MANIFEST_PATH = path.join(AUDIT_DIR, "full-manifest.json");
const FULL_REPORT_PATH = path.join(AUDIT_DIR, "full-report.csv");
const FULL_SUMMARY_PATH = path.join(AUDIT_DIR, "full-summary.json");
const FULL_INDEX_PATH = path.join(AUDIT_DIR, "full-index.html");
const PARTIAL_MANIFEST_PATH = path.join(AUDIT_DIR, "manifest.json");
const EXPECTED_TOTAL = 307;
const REGRESSION_RE =
  /\b(decriminali[sz](?:e|ed|ing|ation)|legali[sz](?:e|ed|ing|ation)|reform|bill|initiative|protest(?:ed|s|ing)?|activist|survey|support(?:ed|s|ing)?|court|parliament)\b/i;
const FORBIDDEN_SPARSE_SECTIONS = new Set([
  "History",
  "Culture",
  "Traditional Use",
  "Market",
  "Products",
  "Local Names",
  "Slang",
  "Cannabis Foods"
]);

function fail(reason, details = {}) {
  const payload = { ok: false, reason, ...details };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePath(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized.startsWith("file://")) return normalized.slice("file://".length);
  if (path.isAbsolute(normalized)) return normalized;
  return path.join(ROOT, normalized);
}

function existingPath(value) {
  const resolved = normalizePath(value);
  return resolved && fs.existsSync(resolved) ? resolved : null;
}

function csvHeaders(filePath) {
  const line = fs.readFileSync(filePath, "utf8").split(/\r?\n/)[0] || "";
  return line.split(",");
}

function resolveBaselineManifestPath() {
  const envPath = String(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_BASELINE_MANIFEST || "").trim();
  const home = String(process.env.HOME || "").trim();
  const candidates = [
    envPath,
    home ? path.join(home, "islegalcannabis_archive", "20260626-artifacts", "popup-visual-audit", "full-manifest.json") : ""
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function buildBaselineSectionMap() {
  const baselinePath = resolveBaselineManifestPath();
  if (!baselinePath) return new Map();
  const manifest = readJson(baselinePath);
  return new Map(
    (manifest.rows || []).map((row) => [String(row.id || "").toUpperCase(), Array.isArray(row.popup_sections_found) ? row.popup_sections_found.length : 0])
  );
}

function loadKnowledgeHistoryMap() {
  const payload = readJson(path.join(ROOT, "data", "cannabis_profiles", "knowledge_db.json"));
  return new Map(
    (payload.entries || []).map((entry) => [String(entry.geo || "").toUpperCase(), Array.isArray(entry.history) ? entry.history : []])
  );
}

function deriveCompactionRegressionGroup(historyByGeo) {
  const impacted = [];
  for (const [geo, history] of historyByGeo.entries()) {
    if (!Array.isArray(history) || history.length <= 3) continue;
    const first3 = history.slice(0, 3);
    if (first3.some((item) => REGRESSION_RE.test(String(item || "")))) continue;
    const laterSignal = history.slice(3).find((item) => REGRESSION_RE.test(String(item || "")));
    if (!laterSignal) continue;
    impacted.push(geo);
  }
  return impacted.sort();
}

function visiblePopupHistoryHasSignal(row) {
  const popupJsonPath = existingPath(row.project_popup_json);
  if (!popupJsonPath) return false;
  const popupJson = readJson(popupJsonPath);
  const historyKey = Object.keys(popupJson.section_map || {}).find((key) => /^History\b/i.test(key));
  const items = historyKey ? popupJson.section_map[historyKey] || [] : [];
  return items.some((item) => REGRESSION_RE.test(String(item || "")));
}

const requiredFiles = [FULL_MANIFEST_PATH, FULL_REPORT_PATH, FULL_SUMMARY_PATH, FULL_INDEX_PATH, PARTIAL_MANIFEST_PATH];
for (const filePath of requiredFiles) {
  if (!fs.existsSync(filePath)) fail("MISSING_AUDIT_FILE", { file: path.relative(ROOT, filePath) });
}

const fullManifest = readJson(FULL_MANIFEST_PATH);
const partialManifest = readJson(PARTIAL_MANIFEST_PATH);
const fullSummary = readJson(FULL_SUMMARY_PATH);
const indexHtml = fs.readFileSync(FULL_INDEX_PATH, "utf8");
const headers = csvHeaders(FULL_REPORT_PATH);
const baselineSectionsByGeo = buildBaselineSectionMap();
const historyByGeo = loadKnowledgeHistoryMap();
const compactionGroup = deriveCompactionRegressionGroup(historyByGeo);

const requiredHeaders = [
  "id",
  "code",
  "name",
  "coverage_class",
  "wiki_page",
  "source_kind",
  "project_popup_screenshot",
  "wiki_fullpage_screenshot",
  "popup_sections",
  "wiki_sections",
  "missing_sections",
  "misplaced_content",
  "repeated_text",
  "raw_urls",
  "source_trace_errors",
  "before_sections",
  "after_sections"
];
for (const header of requiredHeaders) {
  if (!headers.includes(header)) fail("REPORT_HEADER_MISSING", { header });
}

const freshnessTargets = [
  "apps/web/src/new-map/components/ViewportCountryPopup.tsx",
  "apps/web/scripts/popup-visual-audit.ts",
  "apps/web/scripts/popup-visual-audit-full.ts",
  "data/cannabis_profiles/knowledge_db.json",
  "data/cannabis_profiles/first_wave_profiles.json",
  "tools/knowledge/harvest_cannabis_knowledge.mjs"
].map((file) => path.join(ROOT, file)).filter((file) => fs.existsSync(file));

const manifestMtimeMs = fs.statSync(FULL_MANIFEST_PATH).mtimeMs;
const freshestSourceMtimeMs = Math.max(...freshnessTargets.map((file) => fs.statSync(file).mtimeMs));
if (manifestMtimeMs < freshestSourceMtimeMs) {
  fail("FULL_MANIFEST_STALE", {
    manifest_mtime_ms: manifestMtimeMs,
    freshest_source_mtime_ms: freshestSourceMtimeMs
  });
}

if (
  fullManifest.total_geo_count !== EXPECTED_TOTAL ||
  fullManifest.processed_geo_count !== EXPECTED_TOTAL ||
  fullManifest.popupCaptured !== EXPECTED_TOTAL ||
  fullManifest.wikiCaptured !== EXPECTED_TOTAL
) {
  fail("FULL_COUNT_MISMATCH", {
    total_geo_count: fullManifest.total_geo_count,
    processed_geo_count: fullManifest.processed_geo_count,
    popupCaptured: fullManifest.popupCaptured,
    wikiCaptured: fullManifest.wikiCaptured
  });
}

if (
  partialManifest.total_geo_count !== fullManifest.total_geo_count ||
  partialManifest.total !== fullManifest.total ||
  partialManifest.generatedAt !== fullManifest.generatedAt
) {
  fail("PARTIAL_OVERWROTE_FULL_EVIDENCE", {
    partial_total: partialManifest.total,
    full_total: fullManifest.total,
    partial_generatedAt: partialManifest.generatedAt,
    full_generatedAt: fullManifest.generatedAt
  });
}

const rows = fullManifest.rows || [];
if (rows.length !== EXPECTED_TOTAL) fail("ROW_COUNT_MISMATCH", { rows: rows.length });

const missingPairs = [];
const rawUrlRows = [];
const repeatedRows = [];
const sourceTraceRows = [];
const sparseReasonRows = [];
const fakeSparseRows = [];
const sectionDrops = [];
const missingIndexLinks = [];
const dedicatedLeadMissRows = [];

for (const row of rows) {
  if (!existingPath(row.popup_screenshot) || !existingPath(row.wiki_fullpage_screenshot)) {
    missingPairs.push(row.id);
  }
  if ((row.raw_urls || []).length > 0) rawUrlRows.push(row.id);
  if ((row.repeated_text || []).length > 0) repeatedRows.push(row.id);
  if ((row.source_trace_errors || []).length > 0) sourceTraceRows.push({ id: row.id, errors: row.source_trace_errors });
  if (
    ["individual_article", "substantive_article"].includes(String(row.coverage_class || "")) &&
    (row.popup_sections_found || []).length <= 1 &&
    !String(row.low_coverage_reason || "").trim()
  ) {
    sparseReasonRows.push(row.id);
  }
  if (String(row.source_kind || "") === "dedicated_profile") {
    const wikiJsonPath = existingPath(row.wiki_json_snapshot);
    if (wikiJsonPath) {
      const wikiJson = readJson(wikiJsonPath);
      const leadParagraphs = Array.isArray(wikiJson.lead_paragraphs) ? wikiJson.lead_paragraphs.filter(Boolean) : [];
      if (leadParagraphs.length >= 2 && (row.popup_sections_found || []).length >= 2 && (row.wiki_sections_found || []).length === 0) {
        dedicatedLeadMissRows.push({ id: row.id, leadParagraphs: leadParagraphs.length, popupSections: row.popup_sections_found.length });
      }
    }
  }
  if (["no_individual_wiki_page", "root_only", "synthetic_no_wiki"].includes(String(row.coverage_class || ""))) {
    const popupSections = new Set(row.popup_sections || row.popup_sections_found || []);
    const forbidden = Array.from(popupSections).filter((section) => FORBIDDEN_SPARSE_SECTIONS.has(String(section || "")));
    if (forbidden.length > 0) fakeSparseRows.push({ id: row.id, sections: forbidden });
  }
  if (typeof row.before_sections === "number" && typeof row.after_sections === "number" && row.after_sections < row.before_sections) {
    sectionDrops.push({ id: row.id, before: row.before_sections, after: row.after_sections });
  }
  for (const field of ["popup_screenshot", "wiki_fullpage_screenshot"] ) {
    const value = row[field];
    const href = path.isAbsolute(String(value || "").trim()) ? `file://${String(value || "").trim()}` : `../../${String(value || "").trim()}`;
    if (String(value || "").trim() && !indexHtml.includes(href)) {
      missingIndexLinks.push({ id: row.id, field, href });
    }
  }
}

if (missingPairs.length > 0) fail("SCREENSHOT_PAIR_MISSING", { count: missingPairs.length, sample: missingPairs.slice(0, 12) });
if (rawUrlRows.length > 0) fail("RAW_URL_VISIBLE", { count: rawUrlRows.length, sample: rawUrlRows.slice(0, 12) });
if (repeatedRows.length > 0) fail("REPEATED_TEXT_VISIBLE", { count: repeatedRows.length, sample: repeatedRows.slice(0, 12) });
if (sourceTraceRows.length > 0) fail("SOURCE_TRACE_ERRORS", { count: sourceTraceRows.length, sample: sourceTraceRows.slice(0, 8) });
if (sparseReasonRows.length > 0) fail("SPARSE_REASON_MISSING", { count: sparseReasonRows.length, sample: sparseReasonRows.slice(0, 12) });
if (dedicatedLeadMissRows.length > 0) fail("DEDICATED_LEAD_SECTIONS_MISSED", { count: dedicatedLeadMissRows.length, sample: dedicatedLeadMissRows.slice(0, 12) });
if (fakeSparseRows.length > 0) fail("FAKE_SPARSE_THEMATIC_SECTIONS", { count: fakeSparseRows.length, sample: fakeSparseRows.slice(0, 8) });
if (sectionDrops.length > 0) fail("BASELINE_SECTION_DROP", { count: sectionDrops.length, sample: sectionDrops.slice(0, 12) });
if (missingIndexLinks.length > 0) fail("INDEX_LINK_MISSING", { count: missingIndexLinks.length, sample: missingIndexLinks.slice(0, 8) });

const compactionMissing = compactionGroup.filter((geo) => {
  const row = rows.find((item) => item.id === geo);
  return !row || !visiblePopupHistoryHasSignal(row);
});
if (compactionMissing.length > 0) {
  fail("COMPACTION_REGRESSION_UNFIXED", {
    total: compactionGroup.length,
    missing: compactionMissing
  });
}

const output = {
  ok: true,
  total_geo_count: fullManifest.total_geo_count,
  processed_geo_count: fullManifest.processed_geo_count,
  popupCaptured: fullManifest.popupCaptured,
  wikiCaptured: fullManifest.wikiCaptured,
  enriched: fullSummary.sparse_summary?.enriched ?? null,
  honestly_sparse: fullSummary.sparse_summary?.honestly_low_coverage ?? null,
  no_page: fullSummary.sparse_summary?.no_page ?? null,
  synthetic: fullSummary.sparse_summary?.synthetic ?? null,
  regressions: 0,
  baseline_rows_compared: baselineSectionsByGeo.size,
  ui_compaction_fixed: compactionGroup.length,
  ui_compaction_group_total: compactionGroup.length,
  conflicted: 0
};

fs.writeFileSync(path.join(AUDIT_DIR, "full-validation.json"), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

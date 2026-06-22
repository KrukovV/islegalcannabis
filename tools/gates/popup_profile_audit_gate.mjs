#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function repoRoot() {
  let current = process.cwd();
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "data"))) return current;
    current = path.dirname(current);
  }
  return process.cwd();
}

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const root = repoRoot();
const auditPath = path.resolve(root, readArg("--audit", "Reports/popup-profile-audit.json"));
const audit = readJson(auditPath);
const rows = Array.isArray(audit.rows) ? audit.rows : [];
const total = Number(audit.total_dataset_entities || rows.length || 0);
const processed = Number(audit.processed_count || 0);
const unprocessed = rows.filter((row) => !row?.processed).length;
const noPage = Number(audit.no_page_count || rows.filter((row) => row?.resolver_status === "no_individual_wiki_page").length || 0);
const templateSections = Number(audit.template_sections_count || 0);
const repeatedText = Number(audit.repeated_text_count || 0);
const garbageText =
  Number(audit.garbage_text_count || 0) ||
  rows.reduce((count, row) => count + (Array.isArray(row?.garbage_text) ? row.garbage_text.length : 0), 0);
const rawUrls = Number(audit.raw_url_count || 0);
const sourceErrors =
  Number(audit.source_errors_count || 0) ||
  rows.reduce((count, row) => count + (Array.isArray(row?.source_errors) ? row.source_errors.length : 0), 0);
const statusMismatches =
  Number(audit.status_mismatch_count || 0) ||
  rows.filter((row) => Boolean(row?.status_mismatch)).length;
const colorMismatches =
  Number(audit.color_mismatch_count || 0) ||
  rows.filter((row) => Boolean(row?.color_mismatch)).length;
const conflicts = Number(audit.conflicts_count || statusMismatches + colorMismatches);
const statusReviewOverrides =
  Number(audit.status_review_override_count || 0) ||
  rows.filter((row) => Boolean(row?.status_review_override)).length;
const noPageWithVisibleSections = rows.filter(
  (row) => row?.resolver_status === "no_individual_wiki_page" && Array.isArray(row?.sections) && row.sections.length > 0
).length;

const failures = [];
if (total <= 0) failures.push("TOTAL_DATASET_ENTITIES_EMPTY");
if (processed !== total) failures.push("PROCESSED_COUNT_MISMATCH");
if (unprocessed !== 0) failures.push("UNPROCESSED_ROWS_PRESENT");
if (templateSections !== 0) failures.push("TEMPLATE_SECTIONS_PRESENT");
if (repeatedText !== 0) failures.push("REPEATED_TEXT_PRESENT");
if (garbageText !== 0) failures.push("GARBAGE_TEXT_PRESENT");
if (rawUrls !== 0) failures.push("RAW_URLS_PRESENT");
if (sourceErrors !== 0) failures.push("SOURCE_ERRORS_PRESENT");
if (statusMismatches !== 0) failures.push("STATUS_MISMATCH_PRESENT");
if (colorMismatches !== 0) failures.push("COLOR_MISMATCH_PRESENT");
if (noPageWithVisibleSections !== 0) failures.push("NO_PAGE_ROWS_WITH_VISIBLE_SECTIONS");

console.log(`POPUP_PROFILE_TOTAL=${total}`);
console.log(`POPUP_PROFILE_PROCESSED=${processed}`);
console.log(`POPUP_PROFILE_UNPROCESSED=${unprocessed}`);
console.log(`POPUP_PROFILE_NO_PAGE=${noPage}`);
console.log(`POPUP_PROFILE_TEMPLATE_SECTIONS=${templateSections}`);
console.log(`POPUP_PROFILE_REPEATED_TEXT=${repeatedText}`);
console.log(`POPUP_PROFILE_GARBAGE_TEXT=${garbageText}`);
console.log(`POPUP_PROFILE_RAW_URLS=${rawUrls}`);
console.log(`POPUP_PROFILE_SOURCE_ERRORS=${sourceErrors}`);
console.log(`POPUP_PROFILE_STATUS_MISMATCHES=${statusMismatches}`);
console.log(`POPUP_PROFILE_COLOR_MISMATCHES=${colorMismatches}`);
console.log(`POPUP_PROFILE_CONFLICTS=${conflicts}`);
console.log(`POPUP_PROFILE_STATUS_REVIEW_OVERRIDES=${statusReviewOverrides}`);
console.log(`POPUP_PROFILE_NO_PAGE_WITH_VISIBLE_SECTIONS=${noPageWithVisibleSections}`);

if (failures.length > 0) {
  console.log("POPUP_PROFILE_AUDIT_OK=0");
  console.log(`POPUP_PROFILE_AUDIT_REASON=${failures.join(",")}`);
  process.exit(1);
}

console.log("POPUP_PROFILE_AUDIT_OK=1");

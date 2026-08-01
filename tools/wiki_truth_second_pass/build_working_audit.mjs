#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  classifySourceRelevance,
  compareLegalAxes,
  deriveAuditColor,
  makeCanonicalEvidenceRecord,
} from "../wiki/cannabis_evidence_model.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/wiki_truth_second_pass");
const SEARCH_DIR = path.join(OUT_DIR, "search");
const REVIEW_DIR = path.join(OUT_DIR, "reviews");
const SCREENSHOT_DIR = path.join(OUT_DIR, "screenshots", new Date().toISOString().slice(0, 10));

function abs(relativePath) {
  return path.isAbsolute(relativePath) ? relativePath : path.join(ROOT, relativePath);
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

function readJson(relativePath, fallback = null) {
  const filePath = abs(relativePath);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256FileMaybe(filePath) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
}

function sha256Object(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactJsonKey(value) {
  return JSON.stringify(value ?? null);
}

function mergeArrayRecords(primary = [], secondary = [], keyFn = compactJsonKey) {
  return uniqueBy(
    [
      ...(Array.isArray(primary) ? primary : []),
      ...(Array.isArray(secondary) ? secondary : []),
    ],
    keyFn,
  );
}

function linkRecordKey(item) {
  return `${item?.url || ""}|${item?.kind || ""}|${item?.sourceKind || ""}|${item?.title || ""}`;
}

function openedUrlRecordKey(item) {
  return `${item?.url || ""}|${item?.final_url || item?.finalUrl || ""}|${item?.result || ""}|${item?.screenshot_path || item?.screenshotPath || ""}`;
}

function screenshotRecordKey(item) {
  return `${item?.path || item?.screenshot_path || ""}|${item?.source_url || item?.url || ""}|${item?.sha256 || ""}`;
}

function mergeSearchLogPreservingEvidence(seedLog, existingLog, geo) {
  if (!existingLog || existingLog.geo !== geo) return seedLog;
  const merged = {
    ...seedLog,
    ...existingLog,
    schemaVersion: 1,
    generatedAt,
    geo: seedLog.geo,
    territory: existingLog.territory || seedLog.territory,
    jurisdiction_type: existingLog.jurisdiction_type || seedLog.jurisdiction_type,
    queries: mergeArrayRecords(existingLog.queries, seedLog.queries, (item) => item),
    domains_checked: mergeArrayRecords(existingLog.domains_checked, seedLog.domains_checked, (item) => item),
    baseline_domains_available: mergeArrayRecords(seedLog.baseline_domains_available, existingLog.baseline_domains_available, (item) => item),
    URLs_opened: mergeArrayRecords(existingLog.URLs_opened, seedLog.URLs_opened, openedUrlRecordKey),
    baseline_URLs_available: mergeArrayRecords(seedLog.baseline_URLs_available, existingLog.baseline_URLs_available, linkRecordKey),
    redirects: mergeArrayRecords(existingLog.redirects, seedLog.redirects, compactJsonKey),
    page_titles: mergeArrayRecords(existingLog.page_titles, seedLog.page_titles, (item) => `${item?.url || ""}|${item?.title || ""}`),
    relevant_terms_found: mergeArrayRecords(existingLog.relevant_terms_found, seedLog.relevant_terms_found, compactJsonKey),
    rejected_candidates: mergeArrayRecords(existingLog.rejected_candidates, seedLog.rejected_candidates, linkRecordKey),
    rejection_reasons: mergeArrayRecords(existingLog.rejection_reasons, seedLog.rejection_reasons, (item) => item),
    selected_primary_sources: mergeArrayRecords(existingLog.selected_primary_sources, seedLog.selected_primary_sources, linkRecordKey),
    selected_supporting_sources: mergeArrayRecords(existingLog.selected_supporting_sources, seedLog.selected_supporting_sources, linkRecordKey),
    data_preservation: {
      mode: "MERGE_EXISTING_SEARCH_ARTIFACT_WITH_BASELINE_SEED",
      existing_artifact_preserved: true,
      baseline_url_seed_count: seedLog.baseline_URLs_available?.length || 0,
      preserved_opened_url_count: existingLog.URLs_opened?.length || 0,
      preserved_rejected_candidate_count: existingLog.rejected_candidates?.length || 0,
    },
  };
  if (!isFreshSearchComplete(existingLog, geo)) {
    merged.fresh_search = false;
    merged.new_search_required = true;
  }
  return merged;
}

function mergeReviewLogPreservingEvidence(seedLog, existingLog, geo) {
  if (!existingLog || existingLog.geo !== geo) return seedLog;
  const merged = {
    ...seedLog,
    ...existingLog,
    schemaVersion: 1,
    generatedAt,
    geo: seedLog.geo,
    territory: existingLog.territory || seedLog.territory,
    jurisdiction_type: existingLog.jurisdiction_type || seedLog.jurisdiction_type,
    baseline_screenshot_paths: mergeArrayRecords(seedLog.baseline_screenshot_paths, existingLog.baseline_screenshot_paths, screenshotRecordKey),
    fresh_screenshot_paths: mergeArrayRecords(existingLog.fresh_screenshot_paths, seedLog.fresh_screenshot_paths, screenshotRecordKey),
    failed_screenshot_paths: mergeArrayRecords(existingLog.failed_screenshot_paths, seedLog.failed_screenshot_paths, screenshotRecordKey),
    rejected_screenshot_paths: mergeArrayRecords(existingLog.rejected_screenshot_paths, seedLog.rejected_screenshot_paths, screenshotRecordKey),
    data_preservation: {
      mode: "MERGE_EXISTING_REVIEW_ARTIFACT_WITH_BASELINE_SCREENSHOT_SEED",
      existing_artifact_preserved: true,
      baseline_screenshot_seed_count: seedLog.baseline_screenshot_paths?.length || 0,
      preserved_fresh_screenshot_count: existingLog.fresh_screenshot_paths?.length || 0,
      preserved_failed_screenshot_count: existingLog.failed_screenshot_paths?.length || 0,
    },
  };
  if (!isFreshReviewComplete(existingLog, geo)) {
    merged.screenshot_opened = false;
    merged.visually_read = false;
    merged.geo_identity_confirmed = false;
    merged.cannabis_relevance_confirmed = false;
    merged.negation_checked = false;
    merged.effective_law_checked = false;
    merged.bill_vs_law_checked = false;
    merged.review_result = existingLog.review_result || "PENDING_FRESH_BROWSER_REVIEW";
    merged.confidence = existingLog.confidence || "none";
  }
  return merged;
}

function safeHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function jurisdictionType(geo) {
  if (/^US-[A-Z]{2}$/.test(geo)) return "state";
  if (/^[A-Z]{2}$/.test(geo)) return "country";
  return "territory";
}

function officialLinks(row) {
  const buckets = [
    ["directOfficialCannabisLawLinks", "direct"],
    ["officialContextLinks", "context_only"],
    ["supplementalOfficialLinks", "supplemental"],
    ["candidateLinksAwaitingVisualReview", "candidate"],
  ];
  const out = [];
  for (const [field, kind] of buckets) {
    for (const link of row[field] || []) {
      if (!link?.url) continue;
      out.push({
        geo: row.geo,
        territory: row.territory,
        kind,
        title: link.title || null,
        url: link.url,
        note: link.note || null,
        sourceKind: link.sourceKind || null,
        evidenceScope: link.evidenceScope || link.evidence_scope || null,
        verification: link.verification || null,
        confidence: link.confidence || null,
        screenshotPath: link.screenshotPath || null,
        visualReview: link.visualReview || null,
        exclusionReason: link.exclusionReason || link.exclusion_reason || null,
      });
    }
  }
  return out;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function termsForQueries(termPayload) {
  return (termPayload.terms || [])
    .map((row) => String(row.term || "").trim())
    .filter(Boolean);
}

function buildQueries(row, terms) {
  const base = [
    `"${row.territory}" cannabis law official`,
    `"${row.territory}" marijuana law official`,
    `"${row.territory}" controlled substances cannabis schedule official`,
    `"${row.territory}" medical cannabis official law`,
    `"${row.territory}" gazette cannabis law`,
    `"${row.territory}" legal portal cannabis`,
  ];
  const termQueries = terms.map((term) => `"${row.territory}" ${term} law official`);
  return uniqueBy([...base, ...termQueries], (item) => item.toLowerCase());
}

function evidenceScopeForLink(link, row) {
  const directScopes = new Set([
    "DIRECT_CANNABIS_LAW",
    "DIRECT_CANNABIS_REGULATION",
    "DIRECT_CONTROLLED_SUBSTANCE_SCHEDULE",
    "DIRECT_MEDICAL_CANNABIS_PROGRAM",
    "DIRECT_HEMP_OR_DERIVATIVE_LAW",
    "COMPOSITE_OFFICIAL_EVIDENCE",
  ]);
  if (link.kind === "direct" || link.kind === "supplemental") {
    const relevance = classifySourceRelevance({
      geo: row.geo,
      title: link.title,
      url: link.url,
      sourceKind: link.sourceKind,
      note: link.note,
      visualReview: link.visualReview,
    });
    let scope = link.evidenceScope || link.evidence_scope || relevance.evidence_scope;
    const exclusion = link.exclusionReason || link.exclusion_reason || relevance.exclusion_reason;
    if (exclusion && directScopes.has(scope)) {
      return /NO_CANNABIS_FAMILY_TERM_OR_SCHEDULE_VISIBLE|CONTEXT_SENSITIVE_TERM_WITHOUT_CANNABIS_CONTEXT/i.test(exclusion)
        ? "NON_CANNABIS_OFFICIAL_PAGE"
        : "OFFICIAL_CONTEXT_ONLY";
    }
    if (/CONTEXT_NOT_|CONTEXT_ONLY|NOT_.*TREATY|NOT_.*LAW_TRANSPLANT/i.test(String(link.sourceKind || "")) && directScopes.has(scope)) {
      return "OFFICIAL_CONTEXT_ONLY";
    }
    return scope;
  }
  if (link.kind === "context_only") return "OFFICIAL_CONTEXT_ONLY";
  return "UNRESOLVED";
}

function strongestEvidenceScopeForLinks(links, row) {
  const priority = [
    "COMPOSITE_OFFICIAL_EVIDENCE",
    "DIRECT_CANNABIS_LAW",
    "DIRECT_CANNABIS_REGULATION",
    "DIRECT_CONTROLLED_SUBSTANCE_SCHEDULE",
    "DIRECT_MEDICAL_CANNABIS_PROGRAM",
    "DIRECT_HEMP_OR_DERIVATIVE_LAW",
    "OFFICIAL_CONTEXT_ONLY",
    "NON_CANNABIS_OFFICIAL_PAGE",
    "UNRESOLVED",
  ];
  const scopes = links.map((link) => evidenceScopeForLink(link, row));
  return priority.find((scope) => scopes.includes(scope)) || "UNRESOLVED";
}

function overallComparisonType(axisComparisons) {
  const values = Object.values(axisComparisons);
  const priority = [
    "PROJECT_STATUS_MISSING",
    "SOURCE_CONFLICT",
    "TEMPORAL_MISMATCH",
    "SCOPE_MISMATCH",
    "CONFIRMED_MISMATCH",
    "PARTIAL_MATCH",
    "INSUFFICIENT_OFFICIAL_EVIDENCE",
    "CONFIRMED_MATCH",
  ];
  return priority.find((item) => values.includes(item)) || "INSUFFICIENT_OFFICIAL_EVIDENCE";
}

function statusChangeProposal(row, axisComparisons) {
  if (!row.projectStatus || !row.officialStatus) return null;
  const proposedAxes = {};
  for (const [axis, comparison] of Object.entries(axisComparisons)) {
    if (comparison !== "CONFIRMED_MISMATCH" && comparison !== "PARTIAL_MATCH") continue;
    proposedAxes[axis] = {
      from: row.projectStatus[axis] || null,
      to: row.officialStatus[axis] || null,
      proposal_state: "REQUIRES_FRESH_SECOND_PASS_CONFIRMATION",
    };
  }
  return Object.keys(proposedAxes).length ? proposedAxes : null;
}

function isFreshSearchComplete(record, geo) {
  return record?.geo === geo &&
    record?.fresh_search === true &&
    Array.isArray(record?.URLs_opened) &&
    record.URLs_opened.length > 0 &&
    record?.review_result !== "PENDING_FRESH_BROWSER_SEARCH";
}

function isFreshReviewComplete(record, geo) {
  return record?.geo === geo &&
    record?.screenshot_opened === true &&
    record?.visually_read === true &&
    record?.geo_identity_confirmed === true &&
    record?.negation_checked === true &&
    record?.effective_law_checked === true &&
    record?.bill_vs_law_checked === true &&
    Array.isArray(record?.fresh_screenshot_paths) &&
    record.fresh_screenshot_paths.length > 0 &&
    record?.review_result !== "PENDING_FRESH_BROWSER_REVIEW";
}

const generatedAt = new Date().toISOString();
const baseline = readJson("artifacts/wiki_truth_second_pass/baseline.json");
if (!baseline) {
  throw new Error("Missing artifacts/wiki_truth_second_pass/baseline.json. Run build_baseline.mjs first.");
}

const matrix = readJson("data/reviews/wiki-truth-cannabis-law-matrix-307.json", { rows: [], counts: {} });
const termPayload = readJson("data/cannabis_profiles/query-derived-cannabis-terms.v1.json", { terms: [] });
const terms = termsForQueries(termPayload);

if (matrix.rows.length !== 307 || new Set(matrix.rows.map((row) => row.geo)).size !== 307) {
  throw new Error(`Expected 307 unique matrix rows, got ${matrix.rows.length}`);
}
if (terms.length < 16) {
  throw new Error(`Cannabis query-term inventory unexpectedly small: ${terms.length}`);
}

fs.mkdirSync(SEARCH_DIR, { recursive: true });
fs.mkdirSync(REVIEW_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const canonicalEvidenceRecords = [];
const proposedRows = [];
const statusChangeProposals = [];
const colorChangeProposals = [];
const searchArtifacts = [];
const reviewArtifacts = [];
const finalSearchRecords = [];
const finalReviewRecords = [];

for (const row of matrix.rows) {
  const links = officialLinks(row);
  const domains = uniqueBy(links.map((link) => safeHostname(link.url)).filter(Boolean), (item) => item);
  const baselineScreenshots = uniqueBy(
    [
      ...(row.screenshotPaths || []),
      ...links.map((link) => link.screenshotPath).filter(Boolean),
    ],
    (item) => item,
  ).map((screenshotPath) => ({
    path: screenshotPath,
    exists: fs.existsSync(screenshotPath),
    sha256: sha256FileMaybe(screenshotPath),
    provenance: "BASELINE_PREVIOUS_PASS_NOT_FRESH",
  }));

  const selectedPrimarySources = links.filter((link) => link.kind === "direct" || link.kind === "supplemental");
  const selectedSupportingSources = links.filter((link) => link.kind === "context_only");
  const rejectedCandidates = links
    .filter((link) => link.kind === "candidate" || link.exclusionReason)
    .map((link) => ({
      url: link.url,
      title: link.title,
      rejection_reason: link.exclusionReason || "PENDING_FRESH_BROWSER_REVIEW_NOT_ACCEPTED",
    }));

  const searchLog = {
    schemaVersion: 1,
    generatedAt,
    geo: row.geo,
    territory: row.territory,
    jurisdiction_type: jurisdictionType(row.geo),
    fresh_search: false,
    new_search_required: true,
    queries: buildQueries(row, terms),
    domains_checked: [],
    baseline_domains_available: domains,
    URLs_opened: [],
    baseline_URLs_available: links.map((link) => ({
      url: link.url,
      title: link.title,
      kind: link.kind,
      sourceKind: link.sourceKind,
    })),
    redirects: [],
    page_titles: [],
    relevant_terms_found: [],
    rejected_candidates: rejectedCandidates,
    rejection_reasons: uniqueBy(rejectedCandidates.map((item) => item.rejection_reason), (item) => item),
    selected_primary_sources: selectedPrimarySources,
    selected_supporting_sources: selectedSupportingSources,
    review_result: "PENDING_FRESH_BROWSER_SEARCH",
    reviewer_notes: "Created as a second-pass work item. Baseline URLs are preserved, but no fresh browser search has been performed in this artifact.",
  };
  const searchPath = path.join(SEARCH_DIR, `${row.geo}.json`);
  const existingSearchLog = fs.existsSync(searchPath) ? JSON.parse(fs.readFileSync(searchPath, "utf8")) : null;
  const finalSearchLog = mergeSearchLogPreservingEvidence(searchLog, existingSearchLog, row.geo);
  writeJson(searchPath, finalSearchLog);
  finalSearchRecords.push(finalSearchLog);
  searchArtifacts.push(rel(searchPath));

  const reviewLog = {
    schemaVersion: 1,
    generatedAt,
    geo: row.geo,
    territory: row.territory,
    jurisdiction_type: jurisdictionType(row.geo),
    screenshot_opened: false,
    visually_read: false,
    geo_identity_confirmed: false,
    cannabis_relevance_confirmed: false,
    negation_checked: false,
    effective_law_checked: false,
    bill_vs_law_checked: false,
    review_result: "PENDING_FRESH_BROWSER_REVIEW",
    summary: "Fresh second-pass browser review has not been performed yet.",
    confidence: "none",
    reviewer_notes: "Do not count baseline screenshots as fresh visual proof. They remain provenance only until a new browser-opened screenshot is captured and read.",
    baseline_screenshot_paths: baselineScreenshots,
    fresh_screenshot_paths: [],
  };
  const reviewPath = path.join(REVIEW_DIR, `${row.geo}.json`);
  const existingReviewLog = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, "utf8")) : null;
  const finalReviewLog = mergeReviewLogPreservingEvidence(reviewLog, existingReviewLog, row.geo);
  writeJson(reviewPath, finalReviewLog);
  finalReviewRecords.push(finalReviewLog);
  reviewArtifacts.push(rel(reviewPath));

  for (const link of links) {
    const evidenceScope = evidenceScopeForLink(link, row);
    const freshScreenshot = isFreshReviewComplete(finalReviewLog, row.geo)
      ? finalReviewLog.fresh_screenshot_paths?.[0]
      : null;
    canonicalEvidenceRecords.push(makeCanonicalEvidenceRecord({
      geo: row.geo,
      jurisdiction_type: jurisdictionType(row.geo),
      source_url: link.url,
      final_url: link.url,
      official_domain: safeHostname(link.url),
      page_title: link.title,
      source_type: link.sourceKind,
      evidence_scope: evidenceScope,
      exact_quote: freshScreenshot ? finalReviewLog.exact_quote || null : null,
      surrounding_context: freshScreenshot ? finalReviewLog.surrounding_context || link.note : link.note,
      screenshot_path: freshScreenshot?.path || link.screenshotPath,
      screenshot_hash: freshScreenshot?.sha256 || (link.screenshotPath ? sha256FileMaybe(link.screenshotPath) : null),
      viewed_at: freshScreenshot ? finalReviewLog.viewed_at || null : null,
      reviewer: freshScreenshot ? finalReviewLog.reviewer || null : null,
      translated_summary: freshScreenshot ? finalReviewLog.summary : link.visualReview,
      officialStatus: row.officialStatus,
      confidence: link.confidence,
      freshness: freshScreenshot ? "FRESH_SECOND_PASS_BROWSER_REVIEW" : "BASELINE_PREVIOUS_PASS_NOT_FRESH",
      exclusion_reason: link.exclusionReason,
    }, termPayload.terms));
  }

  const strongestEvidenceScope = selectedPrimarySources.length
    ? strongestEvidenceScopeForLinks(selectedPrimarySources, row)
    : selectedSupportingSources.length
      ? "OFFICIAL_CONTEXT_ONLY"
      : "UNRESOLVED";
  const axisComparisons = {
    recreational: compareLegalAxes({
      projectValue: row.projectStatus?.recreational,
      officialValue: row.officialStatus?.recreational,
      evidenceScope: strongestEvidenceScope,
    }),
    medical: compareLegalAxes({
      projectValue: row.projectStatus?.medical,
      officialValue: row.officialStatus?.medical,
      evidenceScope: strongestEvidenceScope,
    }),
    enforcement: compareLegalAxes({
      projectValue: row.projectStatus?.enforcement,
      officialValue: row.officialStatus?.enforcement,
      evidenceScope: strongestEvidenceScope,
    }),
  };
  const overall = overallComparisonType(axisComparisons);
  const auditColor = row.officialStatus && selectedPrimarySources.length
    ? deriveAuditColor(row.officialStatus)
    : "UNKNOWN";
  const statusProposal = statusChangeProposal(row, axisComparisons);
  if (statusProposal) {
    statusChangeProposals.push({
      geo: row.geo,
      territory: row.territory,
      proposal_state: isFreshSearchComplete(finalSearchLog, row.geo) && isFreshReviewComplete(finalReviewLog, row.geo)
        ? "REQUIRES_MANUAL_APPROVAL_NOT_APPLIED"
        : "REQUIRES_FRESH_SECOND_PASS_CONFIRMATION",
      axes: statusProposal,
      source_urls: selectedPrimarySources.map((link) => link.url),
    });
  }
  if (["GREEN", "YELLOW", "RED"].includes(auditColor)) {
    colorChangeProposals.push({
      geo: row.geo,
      territory: row.territory,
      proposal_state: isFreshSearchComplete(finalSearchLog, row.geo) && isFreshReviewComplete(finalReviewLog, row.geo)
        ? "REQUIRES_MANUAL_APPROVAL_NOT_APPLIED"
        : "REQUIRES_FRESH_SECOND_PASS_CONFIRMATION",
      audit_color: auditColor,
      current_map_color: baseline.currentProjectStatusesAndMapColors?.find((item) => item.geo === row.geo)?.mapColor || null,
      source_urls: selectedPrimarySources.map((link) => link.url),
    });
  }
  proposedRows.push({
    geo: row.geo,
    territory: row.territory,
    fresh_second_pass_confirmed: isFreshSearchComplete(finalSearchLog, row.geo) && isFreshReviewComplete(finalReviewLog, row.geo),
    project_status: row.projectStatus,
    current_map_color: baseline.currentProjectStatusesAndMapColors?.find((item) => item.geo === row.geo)?.mapColor || null,
    official_status_from_baseline_previous_pass: row.officialStatus,
    strongest_evidence_scope_from_baseline: strongestEvidenceScope,
    axis_comparisons_from_baseline: axisComparisons,
    comparison_type: overall,
    audit_color_from_baseline: auditColor,
    proposal_only: true,
    may_apply_to_ssot: false,
    reason: isFreshSearchComplete(finalSearchLog, row.geo) && isFreshReviewComplete(finalReviewLog, row.geo)
      ? "This row is a proposal-only working comparison from fresh second-pass evidence. It is not applied to SSOT or map colors; manual approval is required before any status/color mutation."
      : "This row is a proposal-only working comparison from baseline evidence. It is not actionable until fresh second-pass browser search, screenshot capture and visual review are complete.",
  });
}

const currentUrlKeys = new Set(matrix.rows.flatMap((row) => officialLinks(row).map((link) => `${row.geo}|${link.kind}|${link.url}`)));
const baselineUrlKeys = new Set((baseline.officialUrlInventory || []).map((link) => `${link.geo}|${link.kind}|${link.url}`));
const removedUrls = [...baselineUrlKeys].filter((key) => !currentUrlKeys.has(key));
const addedUrls = [...currentUrlKeys].filter((key) => !baselineUrlKeys.has(key));
const currentScreenshotPaths = new Set(matrix.rows.flatMap((row) => [
  ...(row.screenshotPaths || []),
  ...officialLinks(row).map((link) => link.screenshotPath).filter(Boolean),
]));
const baselineScreenshotPaths = new Set((baseline.referencedScreenshotHashes || []).map((item) => item.path));
const removedScreenshots = [...baselineScreenshotPaths].filter((item) => !currentScreenshotPaths.has(item));
const addedScreenshots = [...currentScreenshotPaths].filter((item) => !baselineScreenshotPaths.has(item));
const searchOpenedUrlCount = finalSearchRecords.reduce((total, record) => total + (record.URLs_opened?.length || 0), 0);
const searchRejectedCandidateCount = finalSearchRecords.reduce((total, record) => total + (record.rejected_candidates?.length || 0), 0);
const searchBaselineUrlReferenceCount = finalSearchRecords.reduce((total, record) => total + (record.baseline_URLs_available?.length || 0), 0);
const reviewBaselineScreenshotReferenceCount = finalReviewRecords.reduce((total, record) => total + (record.baseline_screenshot_paths?.length || 0), 0);
const reviewFreshScreenshotReferenceCount = finalReviewRecords.reduce((total, record) => total + (record.fresh_screenshot_paths?.length || 0), 0);
const reviewFailedScreenshotReferenceCount = finalReviewRecords.reduce((total, record) => total + (record.failed_screenshot_paths?.length || 0), 0);

const evidencePreservationDiff = {
  schemaVersion: 1,
  generatedAt,
  baselinePath: "artifacts/wiki_truth_second_pass/baseline.json",
  data_preserved: removedUrls.length === 0 && removedScreenshots.length === 0,
  removed_active_evidence: removedUrls.map((key) => ({
    old_id: key,
    replacement_id: null,
    archive_location: "artifacts/wiki_truth_second_pass/baseline.json",
    exclusion_reason: "UNCONFIRMED_REMOVED_FROM_ACTIVE_PROJECTION",
    data_preserved: false,
  })),
  added_active_evidence_after_baseline: addedUrls,
  removed_screenshot_paths: removedScreenshots,
  added_screenshot_paths_after_baseline: addedScreenshots,
  baseline_url_inventory_hash: baseline.hashes?.urlInventoryHash || null,
  current_url_inventory_hash: sha256Object([...currentUrlKeys].sort()),
  baseline_screenshot_inventory_hash: baseline.hashes?.referencedScreenshotHashInventoryHash || null,
  current_screenshot_inventory_hash: sha256Object([...currentScreenshotPaths].sort()),
  second_pass_artifact_preservation: {
    merge_existing_artifacts_with_generated_seed: true,
    search_opened_url_reference_count: searchOpenedUrlCount,
    search_rejected_candidate_reference_count: searchRejectedCandidateCount,
    search_baseline_url_reference_count: searchBaselineUrlReferenceCount,
    review_baseline_screenshot_reference_count: reviewBaselineScreenshotReferenceCount,
    review_fresh_screenshot_reference_count: reviewFreshScreenshotReferenceCount,
    review_failed_screenshot_reference_count: reviewFailedScreenshotReferenceCount,
    shrink_guard: "Existing search/review arrays are merged with baseline seeds; pending failures and old provenance are preserved instead of overwritten by blank work items.",
  },
};

const statusHashNow = sha256Object(matrix.rows.map((row) => ({ geo: row.geo, projectStatus: row.projectStatus || null })));
const colorHashNow = sha256Object(matrix.rows.map((row) => ({
  geo: row.geo,
  mapColor: baseline.currentProjectStatusesAndMapColors?.find((item) => item.geo === row.geo)?.mapColor || null,
})));
const freshSearchCount = finalSearchRecords.filter((record) => isFreshSearchComplete(record, record.geo)).length;
const freshVisualReviewCount = finalReviewRecords.filter((record) => isFreshReviewComplete(record, record.geo)).length;
const processedGeoCount = matrix.rows.filter((row) =>
  isFreshSearchComplete(finalSearchRecords.find((record) => record.geo === row.geo), row.geo) &&
  isFreshReviewComplete(finalReviewRecords.find((record) => record.geo === row.geo), row.geo)
).length;
const freshScreenshotCount = finalReviewRecords.reduce(
  (total, record) => total + (Array.isArray(record?.fresh_screenshot_paths) ? record.fresh_screenshot_paths.length : 0),
  0,
);
const allScreenshotsVisuallyRead = processedGeoCount === matrix.rows.length &&
  finalReviewRecords.every((record) => isFreshReviewComplete(record, record.geo));
const goalAchieved = matrix.rows.length === 307 &&
  processedGeoCount === 307 &&
  freshSearchCount === 307 &&
  freshVisualReviewCount === 307 &&
  allScreenshotsVisuallyRead &&
  evidencePreservationDiff.data_preserved &&
  baseline.hashes?.currentProjectStatusesHash === statusHashNow &&
  baseline.hashes?.currentMapColorsHash === colorHashNow;

const progressReport = {
  schemaVersion: 1,
  generatedAt,
  total_geo_count: matrix.rows.length,
  processed_geo_count: processedGeoCount,
  working_search_artifact_count: searchArtifacts.length,
  working_review_artifact_count: reviewArtifacts.length,
  fresh_search_count: freshSearchCount,
  fresh_visual_review_count: freshVisualReviewCount,
  screenshot_count: freshScreenshotCount,
  baseline_screenshot_count: baseline.counts?.archiveScreenshotFiles || 0,
  search_opened_url_reference_count: searchOpenedUrlCount,
  search_rejected_candidate_reference_count: searchRejectedCandidateCount,
  search_baseline_url_reference_count: searchBaselineUrlReferenceCount,
  review_baseline_screenshot_reference_count: reviewBaselineScreenshotReferenceCount,
  review_fresh_screenshot_reference_count: reviewFreshScreenshotReferenceCount,
  review_failed_screenshot_reference_count: reviewFailedScreenshotReferenceCount,
  canonical_evidence_record_count: canonicalEvidenceRecords.length,
  direct_evidence_count: canonicalEvidenceRecords.filter((item) => String(item.evidence_scope).startsWith("DIRECT_")).length,
  composite_evidence_count: canonicalEvidenceRecords.filter((item) => item.evidence_scope === "COMPOSITE_OFFICIAL_EVIDENCE").length,
  context_only_count: canonicalEvidenceRecords.filter((item) => item.evidence_scope === "OFFICIAL_CONTEXT_ONLY").length,
  negative_result_count: canonicalEvidenceRecords.filter((item) => item.evidence_scope === "NEGATIVE_SEARCH_RESULT").length,
  non_cannabis_rejected_count: canonicalEvidenceRecords.filter((item) => item.evidence_scope === "NON_CANNABIS_OFFICIAL_PAGE").length,
  confirmed_match_count: proposedRows.filter((item) => item.comparison_type === "CONFIRMED_MATCH").length,
  confirmed_mismatch_count: proposedRows.filter((item) => item.comparison_type === "CONFIRMED_MISMATCH").length,
  partial_match_count: proposedRows.filter((item) => item.comparison_type === "PARTIAL_MATCH").length,
  insufficient_evidence_count: proposedRows.filter((item) => item.comparison_type === "INSUFFICIENT_OFFICIAL_EVIDENCE").length,
  project_status_missing_count: proposedRows.filter((item) => item.comparison_type === "PROJECT_STATUS_MISSING").length,
  source_conflict_count: proposedRows.filter((item) => item.comparison_type === "SOURCE_CONFLICT").length,
  proposed_status_changes: statusChangeProposals.length,
  proposed_color_changes: colorChangeProposals.length,
  status_data_changed: baseline.hashes?.currentProjectStatusesHash !== statusHashNow,
  map_colors_changed: baseline.hashes?.currentMapColorsHash !== colorHashNow,
  production_touched: false,
  goal_achieved: goalAchieved,
  acceptance_flags: {
    TOTAL_GEO_COUNT: matrix.rows.length,
    PROCESSED_GEO_COUNT: processedGeoCount,
    FRESH_SEARCH_COUNT: freshSearchCount,
    FRESH_VISUAL_REVIEW_COUNT: freshVisualReviewCount,
    ALL_SCREENSHOTS_VISUALLY_READ: allScreenshotsVisuallyRead,
    CANNABIS_FAMILY_EVIDENCE_PRESERVED: evidencePreservationDiff.data_preserved,
    NON_CANNABIS_FALSE_POSITIVES_FILTERED: "PARTIAL_MODEL_GUARD_PRESENT_FRESH_AUDIT_PENDING",
    HUMAN_READABLE_WIKI_TRUTH: "PENDING",
    CONTRADICTORY_SUMMARIES: "UNCONFIRMED",
    MIXED_MACHINE_LANGUAGE_SUMMARIES: "UNCONFIRMED",
    UNJUSTIFIED_MISMATCHES: "UNCONFIRMED",
    STATUS_DATA_CHANGED: baseline.hashes?.currentProjectStatusesHash !== statusHashNow,
    MAP_COLORS_CHANGED: baseline.hashes?.currentMapColorsHash !== colorHashNow,
    PRODUCTION_TOUCHED: false,
    GOAL_ACHIEVED: goalAchieved,
  },
  artifacts: {
    search_dir: rel(SEARCH_DIR),
    review_dir: rel(REVIEW_DIR),
    screenshot_dir_reserved: rel(SCREENSHOT_DIR),
    canonical_evidence_records: "artifacts/wiki_truth_second_pass/canonical_evidence_records.json",
    proposed_status_differences: "artifacts/wiki_truth_second_pass/proposed_status_differences.json",
    evidence_preservation_diff: "artifacts/wiki_truth_second_pass/evidence_preservation_diff.json",
    status_change_proposals: "artifacts/wiki_truth_second_pass/status_change_proposals.json",
    color_change_proposals: "artifacts/wiki_truth_second_pass/color_change_proposals.json",
  },
};

writeJson(path.join(OUT_DIR, "canonical_evidence_records.json"), {
  schemaVersion: 1,
  generatedAt,
  freshness: "BASELINE_PREVIOUS_PASS_NOT_FRESH",
  records: canonicalEvidenceRecords,
});
writeJson(path.join(OUT_DIR, "proposed_status_differences.json"), {
  schemaVersion: 1,
  generatedAt,
  proposalOnly: true,
  mayApplyToSsot: false,
  rows: proposedRows,
});
writeJson(path.join(OUT_DIR, "status_change_proposals.json"), {
  schemaVersion: 1,
  generatedAt,
  proposalOnly: true,
  mayApplyToSsot: false,
  proposals: statusChangeProposals,
});
writeJson(path.join(OUT_DIR, "color_change_proposals.json"), {
  schemaVersion: 1,
  generatedAt,
  proposalOnly: true,
  mayApplyToMapColors: false,
  proposals: colorChangeProposals,
});
writeJson(path.join(OUT_DIR, "evidence_preservation_diff.json"), evidencePreservationDiff);
writeJson(path.join(OUT_DIR, "progress_report.json"), progressReport);

const md = `# Wiki Truth Second-Pass Progress

Generated: ${generatedAt}

This is a working report, not completion evidence. It preserves the existing evidence corpus and creates one pending search/review work item for every GEO, while keeping fresh counts at zero until new browser-opened screenshots are captured and visually read.

## Counts

- total_geo_count: ${progressReport.total_geo_count}
- processed_geo_count: ${progressReport.processed_geo_count}
- working_search_artifact_count: ${progressReport.working_search_artifact_count}
- working_review_artifact_count: ${progressReport.working_review_artifact_count}
- fresh_search_count: ${progressReport.fresh_search_count}
- fresh_visual_review_count: ${progressReport.fresh_visual_review_count}
- canonical_evidence_record_count: ${progressReport.canonical_evidence_record_count}
- direct_evidence_count: ${progressReport.direct_evidence_count}
- context_only_count: ${progressReport.context_only_count}
- non_cannabis_rejected_count: ${progressReport.non_cannabis_rejected_count}
- proposed_status_changes: ${progressReport.proposed_status_changes}
- proposed_color_changes: ${progressReport.proposed_color_changes}
- status_data_changed: ${progressReport.status_data_changed}
- map_colors_changed: ${progressReport.map_colors_changed}
- production_touched: ${progressReport.production_touched}
- goal_achieved: ${progressReport.goal_achieved}

## Gate

The goal remains open. Fresh browser search and screenshot-backed visual review are still required for all 307 GEO.
`;
fs.writeFileSync(path.join(OUT_DIR, "progress_report.md"), md);

console.log(`SECOND_PASS_TOTAL_GEO_COUNT=${progressReport.total_geo_count}`);
console.log(`SECOND_PASS_WORKING_SEARCH_ARTIFACTS=${progressReport.working_search_artifact_count}`);
console.log(`SECOND_PASS_WORKING_REVIEW_ARTIFACTS=${progressReport.working_review_artifact_count}`);
console.log(`SECOND_PASS_FRESH_SEARCH_COUNT=${progressReport.fresh_search_count}`);
console.log(`SECOND_PASS_FRESH_VISUAL_REVIEW_COUNT=${progressReport.fresh_visual_review_count}`);
console.log(`SECOND_PASS_CANONICAL_EVIDENCE_RECORDS=${progressReport.canonical_evidence_record_count}`);
console.log(`SECOND_PASS_EVIDENCE_PRESERVED=${evidencePreservationDiff.data_preserved}`);
console.log(`STATUS_DATA_CHANGED=${progressReport.status_data_changed}`);
console.log(`MAP_COLORS_CHANGED=${progressReport.map_colors_changed}`);
console.log(`PRODUCTION_TOUCHED=${progressReport.production_touched}`);

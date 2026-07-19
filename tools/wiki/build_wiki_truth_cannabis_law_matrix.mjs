#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const writeJson = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
const safeUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};
const normalizedUrlKey = (value) => {
  const parsed = safeUrl(value);
  if (!parsed) return String(value || "").trim();
  parsed.hash = "";
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
};
const isExcludedHost = (value) => {
  const parsed = safeUrl(value);
  return !parsed || /(^|\.)wikipedia\.org$|(^|\.)wikimedia\.org$/i.test(parsed.hostname);
};
const statusText = (project) => project
  ? `rec=${project.recreational}; med=${project.medical}; enforcement=${project.enforcement}`
  : "No project status";
const OUTPUT_PATH = "data/reviews/wiki-truth-cannabis-law-matrix-307.json";
const outputAbsolutePath = path.join(ROOT, OUTPUT_PATH);
const previousMatrix = fs.existsSync(outputAbsolutePath)
  ? JSON.parse(fs.readFileSync(outputAbsolutePath, "utf8"))
  : null;

const geoList = readJson("data/reviews/geo-list-307.json");
const collector = readJson("data/reviews/direct-cannabis-law-pages_v33_official/index.json");
const territoryContext = readJson("data/reviews/wiki-truth-uncovered-territories-matrix.json");
const curatedSources = readJson("data/official/cannabis_law_sources.audit.json");
const visualReviews = readJson("data/official/cannabis_law_visual_reviews.audit.json");
const greyColorReaudit = readJson("data/reviews/wiki-truth-grey-color-reaudit-39.json");
const collectorByGeo = new Map(collector.geos.map((row) => [row.geo, row]));
const contextByGeo = new Map((territoryContext.rows || []).map((row) => [row.geo, row]));
const curatedByGeo = new Map((curatedSources.rows || []).map((row) => [row.geo, row]));
const visualByGeo = new Map((visualReviews.rows || []).map((row) => [row.geo, row]));
const greyColorReauditByGeo = new Map((greyColorReaudit.rows || []).map((row) => [row.geo, row]));
const completedVisualReviewStatuses = new Set([
  "VISUALLY_VERIFIED",
  "VISUALLY_REVIEWED_NO_DIRECT_PAGE_FOUND",
  "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY"
]);

const rows = geoList.map((geo) => {
  const collected = collectorByGeo.get(geo) || { geo, name: geo, project: null, candidate_pages: [], mismatches: [] };
  const contextRow = contextByGeo.get(geo);
  const curatedRow = curatedByGeo.get(geo);
  const visualRow = visualByGeo.get(geo);
  const greyReauditRow = greyColorReauditByGeo.get(geo);
  const collectedCandidateLinks = [...new Map((collected.candidate_pages || [])
    .filter((candidate) => candidate?.candidate_kind === "official" && candidate?.fetched?.ok && candidate?.derived?.hasCannabis)
    .filter((candidate) => !isExcludedHost(candidate.url))
    .map((candidate) => [candidate.url, {
      title: `Unreviewed candidate (${candidate.source_kind || "official candidate"})`,
      url: candidate.url,
      sourceKind: candidate.source_kind || "official_candidate",
      verification: "NOT_VISUALLY_REVIEWED_NOT_ACCEPTED_AS_LAW_EVIDENCE",
      confidence: "none",
      note: "Candidate only. It is not cannabis-law evidence until the final rendered page is opened, inspected by eye, and captured in a screenshot.",
      screenshotPath: null,
      visualReview: "NOT_REVIEWED"
    }]))
    .values()];
  const visuallyReviewedIndexes = new Set(visualRow?.source_indexes || []);
  const screenshotByIndex = new Map();
  for (let index = 0; index < (visualRow?.source_indexes || []).length; index += 1) {
    screenshotByIndex.set(visualRow.source_indexes[index], visualRow.screenshot_paths?.[index] || null);
  }
  const curatedLinks = (curatedRow?.sources || []).map((source, sourceIndex) => ({
    title: source.title,
    url: source.url,
    sourceKind: source.source_kind,
    verification: visuallyReviewedIndexes.has(sourceIndex)
      ? "MANUAL_VISUAL_SCREENSHOT_REVIEW"
      : "OFFICIAL_SOURCE_IDENTIFIED_PENDING_VISUAL_REVIEW",
    confidence: visuallyReviewedIndexes.has(sourceIndex) ? "high" : "medium",
    note: `${source.publisher}; ${source.document_type}`,
    screenshotPath: screenshotByIndex.get(sourceIndex) || null,
    visualReview: visuallyReviewedIndexes.has(sourceIndex)
      ? visualRow?.conclusion || "Visible cannabis-specific official material confirmed."
      : visualRow?.status === "VISUAL_CAPTURE_BLOCKED"
        ? visualRow.conclusion
        : "PENDING"
  }));
  const standaloneVisualLinks = (visualRow?.status === "VISUALLY_VERIFIED" ? visualRow?.verified_sources || [] : []).map((source) => ({
    title: source.title,
    url: source.url,
    sourceKind: source.source_kind || "official_visual_review",
    verification: "MANUAL_VISUAL_SCREENSHOT_REVIEW",
    confidence: "high",
    note: visualRow.conclusion,
    screenshotPath: source.screenshot_path || null,
    visualReview: visualRow.conclusion
  }));
  const standaloneVisualContextLinks = (visualRow?.status === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY" ? visualRow?.verified_sources || [] : []).map((source) => ({
    title: source.title,
    url: source.url,
    sourceKind: source.source_kind || "official_visual_context_review",
    verification: "MANUAL_VISUAL_SCREENSHOT_REVIEW_CONTEXT_ONLY",
    confidence: "high",
    note: visualRow.conclusion,
    screenshotPath: source.screenshot_path || null,
    visualReview: "CONTEXT_ONLY"
  }));
  const explicitVisualContextLinks = (visualRow?.verified_context_sources || []).map((source) => ({
    title: source.title,
    url: source.url,
    sourceKind: source.source_kind || "official_visual_context_review",
    verification: "MANUAL_VISUAL_SCREENSHOT_REVIEW_CONTEXT_ONLY",
    confidence: "high",
    note: source.note || visualRow.conclusion,
    screenshotPath: source.screenshot_path || null,
    visualReview: "CONTEXT_ONLY"
  }));
  const directLinks = [...new Map([
    ...curatedLinks.filter((link) => link.verification === "MANUAL_VISUAL_SCREENSHOT_REVIEW"),
    ...standaloneVisualLinks
  ].map((link) => [normalizedUrlKey(link.url), link])).values()];
  const pendingCuratedLinks = curatedLinks.filter((link) => link.verification !== "MANUAL_VISUAL_SCREENSHOT_REVIEW");
  const visuallyVerifiedUrls = new Set(directLinks.map((link) => link.url));
  const pendingCollectedLinks = collectedCandidateLinks.filter((link) => !visuallyVerifiedUrls.has(link.url));
  const visualReviewComplete = completedVisualReviewStatuses.has(visualRow?.status);
  const candidateLinksAwaitingVisualReview = visualReviewComplete
    ? []
    : curatedRow
      ? pendingCuratedLinks
      : pendingCollectedLinks;
  const parserSignals = Array.isArray(collected.mismatches) ? collected.mismatches : [];
  const derived = (collected.candidate_pages || [])
    .filter((candidate) => candidate?.fetched?.ok && candidate?.derived?.hasCannabis && !isExcludedHost(candidate.url))
    .map((candidate) => candidate.derived)
    .find((value) => value?.recreational !== "UNKNOWN" || value?.medical !== "UNKNOWN") || null;
  const contextKinds = contextRow?.differenceKinds || [];

  let sourceCoverage = "NO_CANDIDATE_PAGE_FOUND";
  if (visualRow?.status === "VISUALLY_REVIEWED_NO_DIRECT_PAGE_FOUND") {
    sourceCoverage = "NO_CANDIDATE_PAGE_FOUND";
  } else if (visualRow?.status === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY") {
    sourceCoverage = "OFFICIAL_CONTEXT_ONLY";
  } else if (directLinks.length && visualRow?.status === "VISUALLY_VERIFIED") {
    sourceCoverage = "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW";
  } else if (curatedLinks.length) {
    sourceCoverage = "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW";
  } else if (collectedCandidateLinks.length) {
    sourceCoverage = "CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW";
  } else if (contextRow?.sources?.length) {
    sourceCoverage = "OFFICIAL_CONTEXT_ONLY";
  }

  let differenceStatus = "OFFICIAL_LINK_COVERAGE_GAP";
  let differenceDescription = "No candidate official cannabis-law page is present in the reviewed corpus. This is an evidence-coverage gap, not evidence that the project status is wrong.";
  if (!collected.project) {
    differenceStatus = "NO_PROJECT_STATUS";
    differenceDescription = "The runtime universe contains this territory, but the project has no legal status row. Any claimant-state material is context only until a territory rule is chosen deliberately.";
  }
  if (collectedCandidateLinks.length) {
    differenceStatus = "UNREVIEWED_CANDIDATE_EVIDENCE";
    differenceDescription = parserSignals.length
      ? `Unreviewed parser output exists (${parserSignals.join("; ")}), but no conflict is classified. The rendered candidate pages must be inspected by eye before comparison with ${statusText(collected.project)}.`
      : `Candidate URLs exist, but no status comparison is accepted until the rendered pages are inspected by eye and captured.`;
  }
  if (visualRow?.status === "VISUALLY_REVIEWED_NO_DIRECT_PAGE_FOUND") {
    differenceStatus = visualRow.project_comparison?.status || "NO_DIRECT_CANNABIS_PAGE_FOUND_AFTER_MANUAL_REVIEW";
    differenceDescription = visualRow.project_comparison?.reason || visualRow.conclusion;
  } else if (visualRow?.status === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY") {
    differenceStatus = visualRow.project_comparison?.status || "OFFICIAL_CONTEXT_ONLY_AFTER_MANUAL_REVIEW";
    differenceDescription = visualRow.project_comparison?.reason || visualRow.conclusion;
  } else if (directLinks.length && visualRow?.status === "VISUALLY_VERIFIED") {
    differenceStatus = visualRow.project_comparison?.status || "VISUAL_SOURCE_REVIEWED_STATUS_COMPARISON_PENDING";
    differenceDescription = visualRow.project_comparison?.reason || `${visualRow.conclusion} A structured project-status comparison has not yet been accepted from this screenshot review.`;
  } else if (curatedRow) {
    differenceStatus = "OFFICIAL_SOURCE_PENDING_VISUAL_REVIEW";
    differenceDescription = `${visualRow?.conclusion || "The official source URL has been identified but not visually verified."} No legal-status conclusion is accepted.`;
  } else if (contextKinds.includes("REAL_LAW_CHANGE_OR_SCOPE_MISMATCH")) {
    differenceStatus = "JURISDICTION_SCOPE_UNRESOLVED";
    differenceDescription = contextRow.verifiedConclusion;
  } else if (contextRow && differenceStatus === "OFFICIAL_LINK_COVERAGE_GAP") {
    differenceStatus = contextKinds.includes("NO_PROJECT_STATUS") ? "NO_PROJECT_STATUS" : "CLAIMANT_OR_TERRITORY_SCOPE_GAP";
    differenceDescription = contextRow.verifiedConclusion;
  }

  const legacyContextLinks = visualRow?.status === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY"
    ? []
    : (contextRow?.sources || []).map((source) => ({
      title: source.title,
      url: source.url,
      note: source.note,
      sourceKind: "claimant_or_territory_context",
      verification: "MANUAL_OFFICIAL_REVIEW",
      confidence: contextRow.confidence || "low",
      screenshotPath: null,
      visualReview: "CONTEXT_ONLY"
    }));
  const directUrlKeys = new Set(directLinks.map((link) => normalizedUrlKey(link.url)));
  const officialContextLinks = [...new Map([
    ...legacyContextLinks,
    ...standaloneVisualContextLinks,
    ...explicitVisualContextLinks,
  ].map((link) => [normalizedUrlKey(link.url), link])).values()]
    .filter((link) => !directUrlKeys.has(normalizedUrlKey(link.url)));

  const officialStatus = visualRow?.official_status || greyReauditRow?.officialStatusPatch ? {
    recreational: visualRow?.official_status?.recreational || null,
    medical: visualRow?.official_status?.medical || null,
    enforcement: visualRow?.official_status?.enforcement || null,
    ...(greyReauditRow?.officialStatusPatch || {})
  } : null;
  const screenshotPaths = visualRow?.screenshot_paths || [];
  const reviewNotes = visualRow
    ? `${visualRow.status || "VISUAL_REVIEW_PENDING"}: ${visualRow.conclusion || "Screenshot review has not been completed."}`
    : curatedRow
      ? "VISUAL_REVIEW_PENDING: Screenshot review has not been completed."
    : contextRow?.notes || "No territory-specific manual note recorded in the source corpus.";
  if (greyReauditRow) {
    const reauditReason = String(greyReauditRow.reasonRu || "").trim();
    if (reauditReason && !differenceDescription.includes(reauditReason)) {
      differenceDescription = `${differenceDescription} Повторный аудит: ${reauditReason}`;
    }
  }

  return {
    geo,
    territory: collected.name || contextRow?.territory || curatedRow?.territory || geo,
    projectStatus: collected.project ? {
      recreational: collected.project.recreational,
      medical: collected.project.medical,
      enforcement: collected.project.enforcement
    } : null,
    officialStatus,
    directOfficialCannabisLawLinks: directLinks,
    candidateLinksAwaitingVisualReview,
    officialContextLinks,
    sourceCoverage,
    differenceStatus,
    differenceDescription,
    parserSignals,
    derivedStatus: derived ? {
      recreational: derived.recreational,
      medical: derived.medical,
      enforcement: derived.enforcement
    } : null,
    visualReviewStatus: visualRow?.status || (curatedRow ? "PENDING" : "NOT_REVIEWED"),
    screenshotPaths,
    reviewConfidence: standaloneVisualContextLinks.length || explicitVisualContextLinks.length
      ? "high"
      : directLinks.length && visualRow?.status === "VISUALLY_VERIFIED"
      ? "high"
      : curatedRow
        ? "none"
        : collectedCandidateLinks.length
          ? "none"
          : contextRow?.confidence || "none",
    reviewNotes,
    latestColorReaudit: greyReauditRow ? {
      reviewedAt: greyColorReaudit.reviewedAt,
      result: greyReauditRow.result,
      reasonRu: greyReauditRow.reasonRu,
      freshOfficialSources: (greyReauditRow.freshOfficialSources || []).map((source) => ({
        title: source.title,
        url: source.url,
        role: source.role,
        visualReview: source.visualReview
      }))
    } : null
  };
});

if (rows.length !== 307 || new Set(rows.map((row) => row.geo)).size !== 307) {
  throw new Error(`Expected 307 unique GEO rows, got ${rows.length}/${new Set(rows.map((row) => row.geo)).size}`);
}
if (curatedByGeo.size !== 35 || [...curatedByGeo.keys()].some((geo) => !visualByGeo.has(geo))) {
  throw new Error(`Expected 35 curated US-state rows with visual-review records, got curated=${curatedByGeo.size} visual=${visualByGeo.size}`);
}
if (
  greyColorReaudit.sourceGreyCount !== 39 ||
  greyColorReauditByGeo.size !== 39 ||
  greyColorReaudit.resolvedColorCount !== [...greyColorReauditByGeo.values()].filter((row) => row.result === "COLOR_RESOLVED").length ||
  greyColorReaudit.retainedGreyCount !== [...greyColorReauditByGeo.values()].filter((row) => row.result === "HONEST_GREY_RETAINED").length
) {
  throw new Error(`Expected a complete 39-row grey color re-audit, got ${JSON.stringify({
    declared: greyColorReaudit.sourceGreyCount,
    unique: greyColorReauditByGeo.size,
    resolved: greyColorReaudit.resolvedColorCount,
    retainedGrey: greyColorReaudit.retainedGreyCount
  })}`);
}

const counts = {
  total: rows.length,
  manualVisualReviewComplete: rows.filter((row) => completedVisualReviewStatuses.has(row.visualReviewStatus)).length,
  visuallyVerifiedOfficialCannabisLaw: rows.filter((row) => row.sourceCoverage === "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW").length,
  visuallyReviewedNoDirectPageFound: rows.filter((row) => row.visualReviewStatus === "VISUALLY_REVIEWED_NO_DIRECT_PAGE_FOUND").length,
  visuallyReviewedOfficialContextOnly: rows.filter((row) => row.visualReviewStatus === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY").length,
  visualReviewRemaining: rows.filter((row) => !completedVisualReviewStatuses.has(row.visualReviewStatus)).length,
  officialSourceAwaitingVisualReview: rows.filter((row) => row.sourceCoverage === "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW").length,
  candidateRowsAwaitingVisualReview: rows.filter((row) => row.sourceCoverage === "CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW").length,
  officialContextOnly: rows.filter((row) => row.sourceCoverage === "OFFICIAL_CONTEXT_ONLY").length,
  noCandidatePageFound: rows.filter((row) => row.sourceCoverage === "NO_CANDIDATE_PAGE_FOUND").length,
  rawParserSignalRows: rows.filter((row) => row.parserSignals.length > 0).length,
  projectStatusMismatch: rows.filter((row) => row.differenceStatus === "PROJECT_STATUS_MISMATCH").length,
  taxonomyReviewRequired: rows.filter((row) => row.differenceStatus === "TAXONOMY_REVIEW_REQUIRED").length,
  visualCaptureBlocked: rows.filter((row) => row.visualReviewStatus === "VISUAL_CAPTURE_BLOCKED").length,
  noProjectStatus: rows.filter((row) => row.differenceStatus === "NO_PROJECT_STATUS").length,
  colorReauditRows: rows.filter((row) => row.latestColorReaudit).length,
  colorReauditResolved: rows.filter((row) => row.latestColorReaudit?.result === "COLOR_RESOLVED").length,
  colorReauditRetainedGrey: rows.filter((row) => row.latestColorReaudit?.result === "HONEST_GREY_RETAINED").length,
  colorReauditHumanVisualAccepted: greyColorReaudit.humanVisualAcceptedCount || 0,
  colorReauditDirectOrComposite: greyColorReaudit.directOrCompositeCannabisPages || 0,
  colorReauditContextClaimantOrNegative: greyColorReaudit.contextClaimantOrNegativeOnly || 0,
  rowsWithPublishedOfficialLinks: rows.filter(
    (row) => row.directOfficialCannabisLawLinks.length || row.officialContextLinks.length
  ).length
};
const exclusiveCoverageTotal =
  counts.visuallyVerifiedOfficialCannabisLaw +
  counts.officialSourceAwaitingVisualReview +
  counts.candidateRowsAwaitingVisualReview +
  counts.officialContextOnly +
  counts.noCandidatePageFound;
const visuallyVerifiedReviewRows = [...visualByGeo.values()].filter((row) => row.status === "VISUALLY_VERIFIED").length;
const blockedReviewRows = [...visualByGeo.values()].filter((row) => row.status === "VISUAL_CAPTURE_BLOCKED").length;
if (
  exclusiveCoverageTotal !== rows.length ||
  counts.visualReviewRemaining !== rows.length - counts.manualVisualReviewComplete ||
  counts.manualVisualReviewComplete !== counts.visuallyVerifiedOfficialCannabisLaw + counts.visuallyReviewedNoDirectPageFound + counts.visuallyReviewedOfficialContextOnly ||
  counts.visuallyVerifiedOfficialCannabisLaw !== visuallyVerifiedReviewRows ||
  counts.visualCaptureBlocked !== blockedReviewRows
) {
  throw new Error(`Unexpected evidence counts: ${JSON.stringify(counts)}`);
}

const directLinkCount = rows.reduce((total, row) => total + row.directOfficialCannabisLawLinks.length, 0);
const publishedLinkCount = rows.reduce(
  (total, row) => total + row.directOfficialCannabisLawLinks.length + row.officialContextLinks.length,
  0
);
const supplementalOfficialLinkCount = rows.reduce(
  (total, row) => total + (row.latestColorReaudit?.freshOfficialSources?.length || 0),
  0
);
const rowsWithPublishedOfficialLinks = rows.filter(
  (row) => row.directOfficialCannabisLawLinks.length || row.officialContextLinks.length
).length;
const rowsWithAnyOfficialUrl = rows.filter((row) =>
  row.directOfficialCannabisLawLinks.length ||
  row.officialContextLinks.length ||
  row.latestColorReaudit?.freshOfficialSources?.length
).length;
const directRowsWithoutOfficialStatus = rows.filter(
  (row) => row.directOfficialCannabisLawLinks.length && !row.officialStatus
);
const pendingComparisons = rows.filter(
  (row) => row.differenceStatus === "VISUAL_SOURCE_REVIEWED_STATUS_COMPARISON_PENDING"
);
const incompleteDifferenceRows = rows.filter(
  (row) => !row.differenceStatus || !row.differenceDescription
);
const directLinksWithoutScreenshots = rows.flatMap((row) =>
  row.directOfficialCannabisLawLinks
    .filter((link) => !link.screenshotPath)
    .map((link) => `${row.geo}|${link.url}`)
);
const invalidPublishedLinks = rows.flatMap((row) =>
  [
    ...row.directOfficialCannabisLawLinks,
    ...row.officialContextLinks,
    ...(row.latestColorReaudit?.freshOfficialSources || [])
  ]
    .filter((link) => !/^https?:\/\//i.test(link.url))
    .map((link) => `${row.geo}|${link.url}`)
);
const duplicatePublishedLinks = rows.flatMap((row) => {
  const urls = [
    ...row.directOfficialCannabisLawLinks,
    ...row.officialContextLinks,
  ].map((link) => normalizedUrlKey(link.url));
  return urls
    .filter((url, index) => urls.indexOf(url) !== index)
    .map((url) => `${row.geo}|${url}`);
});

if (
  counts.manualVisualReviewComplete < 307 ||
  counts.visuallyVerifiedOfficialCannabisLaw < 274 ||
  directLinkCount < 501 ||
  publishedLinkCount < 611 ||
  rowsWithPublishedOfficialLinks < 307 ||
  rowsWithAnyOfficialUrl < 307 ||
  directRowsWithoutOfficialStatus.length ||
  pendingComparisons.length ||
  incompleteDifferenceRows.length ||
  directLinksWithoutScreenshots.length ||
  invalidPublishedLinks.length ||
  duplicatePublishedLinks.length
) {
  throw new Error(`Cannabis audit completeness guard failed: ${JSON.stringify({
    manualVisualReviewComplete: counts.manualVisualReviewComplete,
    directRows: counts.visuallyVerifiedOfficialCannabisLaw,
    directLinkCount,
    publishedLinkCount,
    rowsWithPublishedOfficialLinks,
    rowsWithAnyOfficialUrl,
    directRowsWithoutOfficialStatus: directRowsWithoutOfficialStatus.map((row) => row.geo),
    pendingComparisons: pendingComparisons.map((row) => row.geo),
    incompleteDifferenceRows: incompleteDifferenceRows.map((row) => row.geo),
    directLinksWithoutScreenshots,
    invalidPublishedLinks,
    duplicatePublishedLinks
  })}`);
}

const protectedLinkKeys = (matrix) => new Set((matrix?.rows || []).flatMap((row) => [
  ...(row.directOfficialCannabisLawLinks || []).map((link) => `${row.geo}|${normalizedUrlKey(link.url)}`),
  ...(row.officialContextLinks || []).map((link) => `${row.geo}|${normalizedUrlKey(link.url)}`),
  ...(row.latestColorReaudit?.freshOfficialSources || []).map((link) => `${row.geo}|${normalizedUrlKey(link.url)}`)
]));
if (previousMatrix && process.env.CANNABIS_AUDIT_ALLOW_SHRINK !== "1") {
  const previousKeys = protectedLinkKeys(previousMatrix);
  const nextKeys = protectedLinkKeys({ rows });
  const removedKeys = [...previousKeys].filter((key) => !nextKeys.has(key));
  if (removedKeys.length) {
    throw new Error(`Cannabis audit non-shrinking guard rejected ${removedKeys.length} removed published link(s): ${removedKeys.join(", ")}`);
  }
}

if (process.env.CANNABIS_AUDIT_VALIDATE_ONLY !== "1") {
  writeJson(OUTPUT_PATH, {
    generatedAt: greyColorReaudit.reviewedAt || visualReviews.reviewed_at || collector.generated_at,
    sourceCorpusGeneratedAt: collector.generated_at,
    scope: "All 307 runtime GEO. Manual review is complete only after official material is opened in rendered form and inspected by eye. A direct cannabis-law link is accepted only when the cannabis-specific official page is also saved as a screenshot. A completed review may instead conclude honestly that no direct page was found or that only claimant/territory context exists. The 39-row grey-color re-audit is merged as supplemental evidence and may patch only derived official comparison fields. Project SSOT statuses are displayed for comparison and are not modified by this artifact.",
    counts,
    rows
  });
}

console.log(`WIKI_TRUTH_CANNABIS_MATRIX_ROWS=${rows.length}`);
console.log(`WIKI_TRUTH_CANNABIS_MANUAL_REVIEW_COMPLETE=${counts.manualVisualReviewComplete}`);
console.log(`WIKI_TRUTH_CANNABIS_VISUALLY_VERIFIED=${counts.visuallyVerifiedOfficialCannabisLaw}`);
console.log(`WIKI_TRUTH_CANNABIS_VISUAL_REVIEW_REMAINING=${counts.visualReviewRemaining}`);
console.log(`WIKI_TRUTH_CANNABIS_SOURCE_AWAITING_VISUAL=${counts.officialSourceAwaitingVisualReview}`);
console.log(`WIKI_TRUTH_CANNABIS_CANDIDATE_ROWS_AWAITING_VISUAL=${counts.candidateRowsAwaitingVisualReview}`);
console.log(`WIKI_TRUTH_CANNABIS_NO_CANDIDATE_PAGE=${counts.noCandidatePageFound}`);
console.log(`WIKI_TRUTH_CANNABIS_DIRECT_LINKS=${directLinkCount}`);
console.log(`WIKI_TRUTH_CANNABIS_PUBLISHED_LINKS=${publishedLinkCount}`);
console.log(`WIKI_TRUTH_CANNABIS_SUPPLEMENTAL_REAUDIT_LINKS=${supplementalOfficialLinkCount}`);
console.log(`WIKI_TRUTH_CANNABIS_ROWS_WITH_PUBLISHED_LINKS=${rowsWithPublishedOfficialLinks}`);
console.log(`WIKI_TRUTH_CANNABIS_ROWS_WITH_ANY_OFFICIAL_URL=${rowsWithAnyOfficialUrl}`);
console.log(`WIKI_TRUTH_GREY_REAUDIT_ROWS=${counts.colorReauditRows}`);
console.log(`WIKI_TRUTH_GREY_REAUDIT_RESOLVED=${counts.colorReauditResolved}`);
console.log(`WIKI_TRUTH_GREY_REAUDIT_RETAINED_GREY=${counts.colorReauditRetainedGrey}`);

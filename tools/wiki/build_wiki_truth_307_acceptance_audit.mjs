#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const { deriveOfficialTruthColor } = await import(path.join(
  ROOT,
  "apps",
  "web",
  "src",
  "lib",
  "wikiTruthColorEngine.js",
));

const TOTAL_GEO_EXPECTED = 307;
const REPORT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-truth-audit-report.json");
const FINAL_RECONCILIATION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");
const MATRIX_PATH = path.join(ROOT, "data/reviews/wiki-truth-cannabis-law-matrix-307.json");
const COLOR_PROPOSALS_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-proposals.json");
const COLOR_APPLY_PLAN_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-apply-plan.json");
const COLOR_APPLY_GATE_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-apply-gate.json");
const COLOR_REVIEW_DOSSIER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-review-dossier.json");
const COLOR_REVIEW_CLOSURE_DOSSIER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-review-closure-dossier.json");
const COLOR_AUTHORIZATION_PACKET_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-authorization-packet.json");
const COLOR_APPLY_PREVIEW_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-apply-preview.json");
const COLOR_TARGET_RESOLVER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-target-resolver.json");
const DISPUTED_TARGET_MAPPING_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-disputed-target-mapping.json");
const RUNTIME_CURRENT_RECONCILIATION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-current-reconciliation.json");
const RUNTIME_AUTHORIZATION_READINESS_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-authorization-readiness.json");
const RUNTIME_TRUTH_CONFLICT_AUDIT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-truth-conflict-audit.json");
const RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-safe-authorization-packet.json");
const THREE_COLOR_OVERLAY_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-three-color-overlay.json");
const RUNTIME_APPLY_DRY_RUN_DIFF_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-dry-run-diff.json");
const RUNTIME_APPLY_PREFLIGHT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-preflight.json");
const RUNTIME_APPLY_EXECUTION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-execution.json");
const RUNTIME_APPLY_ROLLBACK_PLAN_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-rollback-plan.json");
const RUNTIME_POST_APPLY_VERIFICATION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-post-apply-verification.json");
const BLOCKER_EXIT_DOSSIER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-blocker-exit-dossier.json");
const LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-legal-knowledge-axis-matrix.json");
const COMPLETION_GAP_DOSSIER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-completion-gap-dossier.json");
const RUNTIME_BLOCKER_AXIS_RECONCILIATION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-blocker-axis-reconciliation.json");
const PRIMARY_LAW_BLOCKERS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-primary-law-blockers.json",
);
const OUT_JSON_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-acceptance-audit.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-acceptance-audit.md");

const ALLOWED_TRUTH_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
const ACCEPTED_WIKI_STATUSES = new Set([
  "WIKI_CORRECT",
  "WIKI_OUTDATED",
  "WIKI_OVERSIMPLIFIED",
  "WIKI_WRONG",
  "WIKI_MISSING",
]);
const REQUIRED_EXTENDED_WIKI_STATUSES = Object.freeze([
  "WIKIPEDIA_CORRECT",
  "WIKIPEDIA_AHEAD",
  "WIKIPEDIA_BEHIND",
  "WIKIPEDIA_OVERSIMPLIFIES",
  "WIKIPEDIA_INCORRECT",
  "WIKIPEDIA_MISSING",
  "WIKIPEDIA_AMBIGUOUS",
]);
const ACCEPTED_EXTENDED_WIKI_STATUSES = new Set(REQUIRED_EXTENDED_WIKI_STATUSES);

const MISSING_AXIS_VALUES = new Set([
  "",
  "MISSING",
  "UNKNOWN",
  "UNCONFIRMED",
  "UNASSESSED",
  "NO_DIRECT",
  "NO_PGA",
  "NO_SPI",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isKnownAxisValue(value) {
  const normalized = normalizeStatus(value);
  return Boolean(normalized) && !MISSING_AXIS_VALUES.has(normalized);
}

function hasAnyKnownAxis(status) {
  if (!status || typeof status !== "object") return false;
  return Object.values(status).some(isKnownAxisValue);
}

function evidenceLinks(matrixRow) {
  return [
    ...(Array.isArray(matrixRow?.directOfficialCannabisLawLinks)
      ? matrixRow.directOfficialCannabisLawLinks
      : []),
    ...(Array.isArray(matrixRow?.officialContextLinks)
      ? matrixRow.officialContextLinks
      : []),
    ...(Array.isArray(matrixRow?.supplementalOfficialLinks)
      ? matrixRow.supplementalOfficialLinks
      : []),
    ...(Array.isArray(matrixRow?.latestColorReaudit?.freshOfficialSources)
      ? matrixRow.latestColorReaudit.freshOfficialSources
      : []),
  ];
}

function directEvidenceLinks(matrixRow) {
  const direct = Array.isArray(matrixRow?.directOfficialCannabisLawLinks)
    ? matrixRow.directOfficialCannabisLawLinks
    : [];
  const supplemental = Array.isArray(matrixRow?.supplementalOfficialLinks)
    ? matrixRow.supplementalOfficialLinks
    : [];
  const fresh = Array.isArray(matrixRow?.latestColorReaudit?.freshOfficialSources)
    ? matrixRow.latestColorReaudit.freshOfficialSources
    : [];
  const supplementalDirect = [...supplemental, ...fresh].filter((link) => {
    const scope = normalizeStatus(
      [
        link?.evidenceScope,
        link?.sourceKind,
        link?.source_type,
        link?.role,
        link?.verification,
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (!scope) return false;
    if (/CONTEXT_ONLY|CLAIMANT_JURISDICTION_SCOPE|BOUNDARY|NEGATIVE/.test(scope)) {
      return false;
    }
    return /DIRECT|CANNABIS_LAW|CANNABIS_PROGRAM|CONTROLLED_SUBSTANCE|REGULATION|GAZETTE|COURT|PARLIAMENT|MINISTRY|REGULATOR/.test(scope);
  });
  return [...direct, ...supplementalDirect];
}

function hasReadableLawText(matrixRow) {
  const links = evidenceLinks(matrixRow);
  const text = compact(
    [
      matrixRow?.differenceDescription,
      matrixRow?.reviewNotes,
      matrixRow?.latestColorReaudit?.reasonRu,
      ...links.flatMap((link) => [
        link?.title,
        link?.sourceKind,
        link?.role,
        link?.note,
        link?.visualReview,
        link?.freshVisualAnalysisRu,
        link?.exact_quote,
        link?.surrounding_context,
        link?.translated_summary,
      ]),
    ]
      .filter(Boolean)
      .join(" "),
  );
  return /\b(article|section|act|law|decree|regulation|schedule|gazette|judgment|court|statute|code|rule|rules|cannabis|marijuana|marihuana|hashish|hemp|patient|prescription|medical|medicinal|programme|program|license|licence|licensed)\b|\b(ley|art[ií]culo|decreto|arr[eê]t[eé]|loi|code|r[eè]glement|chanvre|cannabis|marihuana)\b|(?:статья|закон|кодекс|постановление|декрет|регламент|каннабис|марихуан|гашиш|конопл|пациент|рецепт|медицин)/i.test(text);
}

function inspectVisualProof(matrixRow) {
  const screenshots = Array.isArray(matrixRow?.screenshotPaths)
    ? matrixRow.screenshotPaths
    : [];
  const freshScreenshots = evidenceLinks(matrixRow).flatMap((link) => [
    ...(Array.isArray(link?.freshScreenshotPaths) ? link.freshScreenshotPaths : []),
    link?.screenshotPath,
  ]);
  const referencedPaths = [
    ...new Set(
      [...screenshots, ...freshScreenshots]
        .filter(Boolean)
        .map((value) => String(value)),
    ),
  ];
  const missingPaths = [];
  const emptyPaths = [];
  let existingPaths = 0;
  for (const screenshotPath of referencedPaths) {
    const resolvedPath = path.isAbsolute(screenshotPath)
      ? screenshotPath
      : path.resolve(ROOT, screenshotPath);
    try {
      const stat = fs.statSync(resolvedPath);
      if (stat.isFile() && stat.size > 0) {
        existingPaths += 1;
      } else {
        emptyPaths.push(screenshotPath);
      }
    } catch {
      missingPaths.push(screenshotPath);
    }
  }
  const visualReview = normalizeStatus(matrixRow?.visualReviewStatus);
  return {
    visualReview,
    referencedPaths: referencedPaths.length,
    existingPaths,
    missingPaths,
    emptyPaths,
    complete:
      /VERIFIED|VISUALLY_REVIEWED|MANUAL_VISUAL/.test(visualReview) &&
      referencedPaths.length > 0 &&
      existingPaths === referencedPaths.length,
  };
}

function hasVisualProof(matrixRow) {
  return inspectVisualProof(matrixRow).complete;
}

function hasInterpretiveLegalReview(matrixRow) {
  const layer = matrixRow?.truthLayers?.legalInterpretation || {};
  const text = compact(
    [
      layer.notes,
      matrixRow?.differenceDescription,
      matrixRow?.reviewNotes,
      matrixRow?.latestColorReaudit?.reasonRu,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return Boolean(text) && hasReadableLawText(matrixRow) && hasVisualProof(matrixRow);
}

function isContextOnlyLegalConclusion(matrixRow) {
  const layer = matrixRow?.truthLayers?.legalInterpretation || {};
  const text = compact(
    [
      layer.notes,
      matrixRow?.differenceDescription,
      matrixRow?.reviewNotes,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return /context[- ]only|official context|claimant context|claimant[- ]jurisdiction context|not accepted as|not accepted|no direct|no single|not found|не призна|не найден|нет прям|контекст/i.test(text);
}

function hasDocumentedNoApplicableTerritoryLaw(matrixRow) {
  const links = evidenceLinks(matrixRow);
  const text = compact(
    [
      matrixRow?.differenceDescription,
      matrixRow?.reviewNotes,
      matrixRow?.latestColorReaudit?.reasonRu,
      ...links.flatMap((link) => [
        link?.title,
        link?.sourceKind,
        link?.role,
        link?.evidenceScope,
        link?.verification,
        link?.visualReview,
        link?.note,
        link?.freshVisualAnalysisRu,
      ]),
    ]
      .filter(Boolean)
      .join(" "),
  );
  const hasScopeException =
    /unclaimed|disputed|claimant|without choosing sovereign|no public lawmaker|no territorial cannabis-law|no territorial law|not territory-issued|no single territorial|no unitary|national jurisdiction dependent|aggregation of|scope unresolved|jurisdiction[- ]scope unresolved|no local medical cannabis program|no territory-issued cannabis page|без выбора суверена|не выбирая|спорн|нет общего|единого уголовного кодекса|не выдумывая/i.test(text);
  return hasScopeException && hasReadableLawText(matrixRow) && hasVisualProof(matrixRow);
}

function evaluation(status, reason, evidence = {}) {
  return { status, reason, evidence };
}

function summarizePrimaryLawBlocker(primaryLawBlocker) {
  if (!primaryLawBlocker) return null;
  return {
    status: primaryLawBlocker.status || "UNKNOWN",
    blockerType: primaryLawBlocker.blockerType || "UNKNOWN",
    requiredNextEvidence: primaryLawBlocker.requiredNextEvidence || "",
    freshPrimaryLawSearchAudit: primaryLawBlocker.freshPrimaryLawSearchAudit
      ? {
          result:
            primaryLawBlocker.freshPrimaryLawSearchAudit.result || "UNKNOWN",
          executedAt:
            primaryLawBlocker.freshPrimaryLawSearchAudit.executedAt || "",
          queryCount: Array.isArray(
            primaryLawBlocker.freshPrimaryLawSearchAudit.queries,
          )
            ? primaryLawBlocker.freshPrimaryLawSearchAudit.queries.length
            : 0,
          officialSourceCount: Array.isArray(
            primaryLawBlocker.freshPrimaryLawSearchAudit.officialSourcesReviewed,
          )
            ? primaryLawBlocker.freshPrimaryLawSearchAudit
                .officialSourcesReviewed.length
            : 0,
          directCannabisPrimaryLawFinds: [
            ...(Array.isArray(
              primaryLawBlocker.freshPrimaryLawSearchAudit.queries,
            )
              ? primaryLawBlocker.freshPrimaryLawSearchAudit.queries
              : []),
            ...(Array.isArray(
              primaryLawBlocker.freshPrimaryLawSearchAudit
                .officialSourcesReviewed,
            )
              ? primaryLawBlocker.freshPrimaryLawSearchAudit
                  .officialSourcesReviewed
              : []),
          ].filter((item) => item.directCannabisPrimaryLawFound === true)
            .length,
          conclusion:
            primaryLawBlocker.freshPrimaryLawSearchAudit.conclusion || "",
        }
      : null,
    negativeSearches: Array.isArray(primaryLawBlocker.negativeSearches)
      ? primaryLawBlocker.negativeSearches.map((search) => ({
          source: search.source || "UNKNOWN",
          countryFilter: search.countryFilter || "",
          term: search.term || "",
          found: Number(search.found || 0),
          url: search.url || "",
        }))
      : [],
  };
}

function evaluatePrimaryLaw(reportRow, matrixRow, primaryLawBlocker) {
  const links = directEvidenceLinks(matrixRow);
  const effectiveSourceCoverage =
    reportRow.effectiveSourceCoverage ||
    reportRow.diagnostics?.evidence?.effectiveSourceCoverage ||
    reportRow.sourceCoverage;
  if (
    effectiveSourceCoverage === "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW" &&
    links.length > 0
  ) {
    return evaluation("PROVEN", "Direct visually verified official cannabis-law evidence exists.", {
      effectiveSourceCoverage,
      directLinkCount: links.length,
    });
  }
  if (
    effectiveSourceCoverage === "COMPOSITE_APPLICABLE_PRIMARY_LAW" &&
    evidenceLinks(matrixRow).length > 0 &&
    hasReadableLawText(matrixRow) &&
    hasVisualProof(matrixRow)
  ) {
    return evaluation("PROVEN", "Composite official evidence proves an applicable primary-law route for this GEO without treating context-only claimant material as territorial law.", {
      effectiveSourceCoverage,
      rawSourceCoverage: reportRow.sourceCoverage,
      evidenceLinkCount: evidenceLinks(matrixRow).length,
    });
  }
  if (
    effectiveSourceCoverage === "OFFICIAL_CONTEXT_ONLY" &&
    hasDocumentedNoApplicableTerritoryLaw(matrixRow)
  ) {
    return evaluation("PROVEN", "Official evidence documents that no single territory-issued or determinable applicable cannabis-law regime can honestly be selected; this is the permitted uncolored/scope-exception case.", {
      effectiveSourceCoverage,
      rawSourceCoverage: reportRow.sourceCoverage,
      evidenceLinkCount: evidenceLinks(matrixRow).length,
    });
  }
  if (
    effectiveSourceCoverage === "OFFICIAL_CONTEXT_ONLY" &&
    reportRow?.truth?.color === "UNKNOWN" &&
    /OFFICIAL_CONTEXT_ONLY_NO_DIRECT_CANNABIS_STATUTE|NO_APPLICABLE_TERRITORY_LAW|NO_OWN_TERRITORY_REGIME/.test(
      String(reportRow?.truth?.ruleId || reportRow?.truth?.source || ""),
    ) &&
    evidenceLinks(matrixRow).length > 0 &&
    hasVisualProof(matrixRow)
  ) {
    return evaluation(
      "PROVEN",
      "Primary Law review is complete and honestly concludes that cannabis-specific applicable territorial law is not proven; the GEO remains uncolored.",
      {
        effectiveSourceCoverage,
        rawSourceCoverage: reportRow.sourceCoverage,
        truthColor: reportRow.truth.color,
        truthRuleId: reportRow.truth.ruleId || reportRow.truth.source,
        evidenceLinkCount: evidenceLinks(matrixRow).length,
      },
    );
  }
  if ((matrixRow?.officialContextLinks || []).length > 0 || reportRow.sourceCoverage === "OFFICIAL_CONTEXT_ONLY") {
    return evaluation("PARTIAL", "Only official context is proven; this is not accepted as primary cannabis law.", {
      effectiveSourceCoverage,
      contextLinkCount: matrixRow?.officialContextLinks?.length || 0,
      blocker: summarizePrimaryLawBlocker(primaryLawBlocker),
    });
  }
  return evaluation("MISSING", "No direct primary cannabis-law source is proven for this GEO.", {
    directLinkCount: links.length,
    blocker: summarizePrimaryLawBlocker(primaryLawBlocker),
  });
}

export function evaluateLegalInterpretation(reportRow, matrixRow) {
  const layer = matrixRow?.truthLayers?.legalInterpretation || {};
  const source = layer.source || "NONE";
  const hasKnownAxis = hasAnyKnownAxis(layer.axis);
  const hasReview = hasInterpretiveLegalReview(matrixRow);
  const documentedScopeException =
    source === "UNAVAILABLE" &&
    isContextOnlyLegalConclusion(matrixRow) &&
    hasDocumentedNoApplicableTerritoryLaw(matrixRow);
  if (documentedScopeException) {
    return evaluation("PROVEN", "Independent review proves that no single applicable territorial cannabis-law regime can be selected.", {
      source,
      knownAxis: hasKnownAxis,
      scopeException: true,
    });
  }
  if (source === "MANUAL_LEGAL_INTERPRETATION" && (hasKnownAxis || hasReview)) {
    return evaluation("PROVEN", "Independent manual legal interpretation layer is present.", {
      source,
      knownAxis: hasKnownAxis,
      reviewText: hasReview,
    });
  }
  if (source === "OFFICIAL_TEXT_DERIVED" && hasReview) {
    return evaluation("PROVEN", "Legal interpretation is recorded as an independent review of the visible official text.", {
      source,
      knownAxis: hasKnownAxis,
      reviewText: true,
    });
  }
  if (source === "UNAVAILABLE" && hasReview && isContextOnlyLegalConclusion(matrixRow)) {
    return evaluation("PROVEN", "Independent review records that the available official material is context-only, so no direct cannabis-law axis is claimed.", {
      source,
      knownAxis: hasKnownAxis,
      reviewText: true,
    });
  }
  if (matrixRow?.derivedStatus && hasAnyKnownAxis(matrixRow.derivedStatus)) {
    return evaluation("PARTIAL", "Derived status exists, but independent manual legal interpretation is not proven.", {
      source: "DERIVED_STATUS",
    });
  }
  if (reportRow?.legalInterpretation && hasAnyKnownAxis(reportRow.legalInterpretation)) {
    return evaluation("PARTIAL", "Legal interpretation is copied or derived from official axes, not independently proven.", {
      source: reportRow.diagnostics?.officialInterpretation?.status || "REPORT_AXIS",
    });
  }
  return evaluation("MISSING", "No legal interpretation axis is available.", {
    source: "NONE",
  });
}

function evaluateWikiAudit(reportRow) {
  const status = reportRow.diagnostics?.wiki?.status;
  if (ACCEPTED_WIKI_STATUSES.has(status)) {
    return evaluation("PROVEN", "Wikipedia is evaluated as a separate audit layer.", {
      status,
      reason: reportRow.diagnostics?.wiki?.reason || "",
    });
  }
  return evaluation("MISSING", "Wikipedia audit status is absent or outside the accepted taxonomy.", {
    status: status || "MISSING",
  });
}

function evaluateWikiExtendedAudit(reportRow) {
  const extended = reportRow.diagnostics?.wiki?.extended || null;
  if (extended && ACCEPTED_EXTENDED_WIKI_STATUSES.has(extended.status)) {
    return evaluation("PROVEN", "Wikipedia has an extended Truth-First audit status.", {
      status: extended.status,
      officialAxisDelta: extended.officialAxisDelta || "MISSING",
      ssotAxisDelta: extended.ssotAxisDelta || "MISSING",
      officialSource: extended.officialSource || null,
    });
  }
  return evaluation("MISSING", "Extended Wikipedia audit status is absent or outside the accepted taxonomy.", {
    status: extended?.status || "MISSING",
  });
}

function evaluateSsotCompare(reportRow) {
  const status = reportRow.diagnostics?.ssot?.status;
  if (reportRow.hasProjectStatus && status) {
    return evaluation("PROVEN", "SSOT/project status is compared to the official/legal layer.", {
      status,
      reason: reportRow.diagnostics?.ssot?.reason || "",
      hasProjectStatus: true,
    });
  }
  if (status) {
    return evaluation("PROVEN", "SSOT/project absence is explicitly compared and retained as a no-project-status audit finding.", {
      status,
      reason: reportRow.diagnostics?.ssot?.reason || "",
      hasProjectStatus: false,
    });
  }
  return evaluation("MISSING", "SSOT/project status is absent, so simultaneous SSOT comparison is incomplete.", {
    status: status || "MISSING",
  });
}

function evaluateColorAudit(reportRow) {
  const truth = reportRow.truth || {};
  const colorStatus = reportRow.diagnostics?.color?.status;
  if (ALLOWED_TRUTH_COLORS.has(truth.color) && truth.ruleId && colorStatus) {
    return evaluation("PROVEN", "Truth color is produced by a deterministic rule and audited against current map color.", {
      truthColor: truth.color,
      ruleId: truth.ruleId,
      colorStatus,
    });
  }
  return evaluation("MISSING", "Deterministic color rule metadata is incomplete.", {
    truthColor: truth.color || "MISSING",
    ruleId: truth.ruleId || "MISSING",
    colorStatus: colorStatus || "MISSING",
  });
}

function evaluateLawText(reportRow, matrixRow) {
  if (hasReadableLawText(matrixRow)) {
    return evaluation("PROVEN", "At least one evidence record carries article/source text or visual legal analysis.", {
      sourceCount: evidenceLinks(matrixRow).length,
    });
  }
  return evaluation("MISSING", "No article/text/legal-analysis snippet is visible in the row evidence.", {
    sourceCount: evidenceLinks(matrixRow).length,
    sourceCoverage: reportRow.sourceCoverage,
  });
}

function evaluateVisualProof(matrixRow) {
  const proof = inspectVisualProof(matrixRow);
  if (proof.complete) {
    return evaluation("PROVEN", "Visual review and every referenced screenshot proof file are present.", {
      visualReviewStatus: matrixRow.visualReviewStatus || "MISSING",
      referencedPaths: proof.referencedPaths,
      existingPaths: proof.existingPaths,
      missingPaths: proof.missingPaths,
      emptyPaths: proof.emptyPaths,
    });
  }
  return evaluation("PARTIAL", "Manual visual review may be recorded, but one or more referenced screenshot proof files are incomplete.", {
    visualReviewStatus: matrixRow?.visualReviewStatus || "MISSING",
    referencedPaths: proof.referencedPaths,
    existingPaths: proof.existingPaths,
    missingPaths: proof.missingPaths,
    emptyPaths: proof.emptyPaths,
  });
}

function rowAcceptance(reportRow, matrixRow, primaryLawBlocker) {
  const requirements = {
    primaryLaw: evaluatePrimaryLaw(reportRow, matrixRow, primaryLawBlocker),
    legalInterpretation: evaluateLegalInterpretation(reportRow, matrixRow),
    wikipediaAudit: evaluateWikiAudit(reportRow),
    wikiExtendedAudit: evaluateWikiExtendedAudit(reportRow),
    ssotComparison: evaluateSsotCompare(reportRow),
    colorAudit: evaluateColorAudit(reportRow),
    lawTextEvidence: evaluateLawText(reportRow, matrixRow),
    visualProof: evaluateVisualProof(matrixRow),
  };
  const statuses = Object.values(requirements).map((item) => item.status);
  const status = statuses.includes("MISSING")
    ? "INCOMPLETE"
    : statuses.includes("PARTIAL")
      ? "PARTIAL"
      : "PROVEN";
  return {
    geo: reportRow.geo,
    territory: reportRow.territory,
    status,
    requirements,
    colorStatus: reportRow.diagnostics?.color?.status || "MISSING",
    truthRuleId: reportRow.truth?.ruleId || "MISSING",
  };
}

function countRequirementRows(rows, requirementId) {
  const counts = {};
  for (const row of rows) {
    const status = row.requirements?.[requirementId]?.status || "MISSING";
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "MISSING";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function guardCase(name, input, expectedColor, expectedRulePattern) {
  const result = deriveOfficialTruthColor({
    sourceCoverage: input.sourceCoverage || "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: input.officialStatus,
  });
  const ruleOk = expectedRulePattern
    ? new RegExp(expectedRulePattern).test(result.ruleId || result.source || "")
    : true;
  return {
    name,
    expectedColor,
    actualColor: result.color,
    ruleId: result.ruleId || null,
    status: result.color === expectedColor && ruleOk ? "PROVEN" : "FAILED",
    reason: result.reason || "",
  };
}

function buildSystemGuards() {
  return [
    guardCase(
      "production_not_patient_access",
      { officialStatus: { recreational: "ILLEGAL", medical: "AUTHORIZED_PRODUCTION_ONLY_CULTIVATION_EXPORT", enforcement: "STRICT" } },
      "YELLOW",
      "LIMITED_LAWFUL_MODE",
    ),
    guardCase(
      "research_not_patient_programme",
      { officialStatus: { recreational: "ILLEGAL", medical: "RESEARCH_ONLY_SCIENTIFIC_AUTHORIZATION", enforcement: "STRICT" } },
      "YELLOW",
      "LIMITED_LAWFUL_MODE",
    ),
    guardCase(
      "cbd_or_sativex_not_full_medical_cannabis",
      { officialStatus: { recreational: "ILLEGAL", medical: "CBD_MEDICINE_AND_SATIVEX_ONLY", enforcement: "STRICT" } },
      "YELLOW",
      "LIMITED_LAWFUL_MODE",
    ),
    guardCase(
      "bill_not_operational_law",
      { officialStatus: { recreational: "ILLEGAL", medical: "MEDICAL_CANNABIS_BILL_NOT_COMMENCED", enforcement: "STRICT" } },
      "UNKNOWN",
      "NON_CURRENT_LIFECYCLE_ONLY",
    ),
    guardCase(
      "operational_patient_access_can_green",
      { officialStatus: { recreational: "ILLEGAL", medical: "OPERATIONAL_PATIENT_PROGRAMME_WITH_DOCTOR_PRESCRIPTION_AND_PHARMACY_DISPENSING", enforcement: "STRICT" } },
      "GREEN",
      "PATIENT_ACCESS_OPERATIONAL",
    ),
    guardCase(
      "adult_use_can_green",
      { officialStatus: { recreational: "LEGAL_ADULT_USE_REGULATED", medical: "UNKNOWN", enforcement: "SOFT" } },
      "GREEN",
      "RECREATIONAL_LEGAL",
    ),
    guardCase(
      "claimant_not_territory_law",
      { officialStatus: { recreational: "ILLEGAL_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME", medical: "NONE_NO_PATIENT_ACCESS", enforcement: "STRICT" } },
      "UNKNOWN",
      "SCOPE_EXCLUSION",
    ),
    guardCase(
      "federal_state_not_mixed",
      { officialStatus: { recreational: "LEGAL_ADULT_USE_REGULATED_FEDERAL", medical: "REGULATED_PATIENT_ACCESS_STATE_SCOPE", enforcement: "SOFT" } },
      "UNKNOWN",
      "SCOPE_EXCLUSION",
    ),
    guardCase(
      "context_only_uncolored",
      {
        sourceCoverage: "OFFICIAL_CONTEXT_ONLY",
        officialStatus: { recreational: "LEGAL_ADULT_USE_REGULATED", medical: "REGULATED_PATIENT_ACCESS_WITH_DOCTOR_PRESCRIPTION", enforcement: "SOFT" },
      },
      "UNKNOWN",
      "OFFICIAL_CONTEXT_ONLY",
    ),
    guardCase(
      "no_patient_pathway_not_yellow",
      {
        sourceCoverage: "COMPOSITE_APPLICABLE_PRIMARY_LAW",
        officialStatus: { recreational: "ILLEGAL_UNDER_APPLICABLE_CRIMINAL_LAW", medical: "NONE_NO_LOCAL_MEDICAL_CANNABIS_PATIENT_PATHWAY_PROVEN", enforcement: "STRICT" },
      },
      "RED",
      "PATIENT_ACCESS_NEGATIVE|FULL_NEGATIVE",
    ),
  ];
}

function sourceHasGeoException(sourcePath, geos) {
  const text = fs.readFileSync(sourcePath, "utf8");
  return geos.filter((geo) => {
    const escapedGeo = geo.replaceAll("-", "\\-");
    const quotedGeo = "[\"'\\x60]" + escapedGeo + "[\"'\\x60]";
    const branchByGeo = new RegExp(
      "\\b(?:if|else\\s+if)\\s*\\([^\\n)]*\\b(?:geo|country|territory)\\b\\s*(?:===|!==|==|!=)\\s*" + quotedGeo,
    );
    const branchByLiteral = new RegExp(
      "\\b(?:if|else\\s+if)\\s*\\([^\\n)]*" + quotedGeo + "\\s*(?:===|!==|==|!=)\\s*\\b(?:geo|country|territory)\\b",
    );
    const switchCase = new RegExp("\\bcase\\s+" + quotedGeo + "\\s*:");
    return branchByGeo.test(text) || branchByLiteral.test(text) || switchCase.test(text);
  });
}

function buildColorProposalCoverage(report, colorProposals) {
  const expectedRows = report.rows.filter((row) => row.diagnostics?.color?.status !== "COLOR_MATCH");
  const expectedGeos = new Set(expectedRows.map((row) => row.geo));
  const proposals = Array.isArray(colorProposals?.proposals) ? colorProposals.proposals : [];
  const proposedGeos = new Set(proposals.map((row) => row.geo).filter(Boolean));
  const missingGeos = [...expectedGeos].filter((geo) => !proposedGeos.has(geo)).sort();
  const extraGeos = [...proposedGeos].filter((geo) => !expectedGeos.has(geo)).sort();
  return {
    artifactExists: Boolean(colorProposals),
    nonMutating: colorProposals?.nonMutating === true,
    expectedDifferences: expectedRows.length,
    proposalsTotal: proposals.length,
    missingGeos,
    extraGeos,
    actionCounts: colorProposals?.counts?.proposalAction || {},
    proposedTruthColorCounts: colorProposals?.counts?.proposedTruthColor || {},
    artifactPath: path.relative(ROOT, COLOR_PROPOSALS_PATH),
  };
}

function unresolvedPrimaryLawRows(rowAudits, primaryLawBlockersByGeo) {
  return rowAudits
    .filter((row) => row.requirements.primaryLaw.status !== "PROVEN")
    .map((row) => ({
      geo: row.geo,
      territory: row.territory,
      status: row.requirements.primaryLaw.status,
      reason: row.requirements.primaryLaw.reason,
      blocker: summarizePrimaryLawBlocker(primaryLawBlockersByGeo.get(row.geo)),
    }));
}

function primaryLawAll307Evidence(rowAudits, primaryLawBlockersByGeo) {
  return {
    counts: countRequirementRows(rowAudits, "primaryLaw"),
    unresolvedRows: unresolvedPrimaryLawRows(rowAudits, primaryLawBlockersByGeo),
  };
}

function buildColorApplyPlanCoverage(colorProposals, colorApplyPlan) {
  const proposals = Array.isArray(colorProposals?.proposals) ? colorProposals.proposals : [];
  const planRows = Array.isArray(colorApplyPlan?.rows) ? colorApplyPlan.rows : [];
  const proposalGeos = new Set(proposals.map((row) => row.geo).filter(Boolean));
  const planGeos = new Set(planRows.map((row) => row.geo).filter(Boolean));
  const missingGeos = [...proposalGeos].filter((geo) => !planGeos.has(geo)).sort();
  const extraGeos = [...planGeos].filter((geo) => !proposalGeos.has(geo)).sort();
  return {
    artifactExists: Boolean(colorApplyPlan),
    nonMutating: colorApplyPlan?.nonMutating === true,
    applyStatus: colorApplyPlan?.applyStatus || "MISSING",
    requiresExplicitAuthorization: colorApplyPlan?.requiresExplicitAuthorization === true,
    safeToAutoApply: colorApplyPlan?.safeToAutoApply === true,
    proposalRows: proposals.length,
    planRows: planRows.length,
    missingGeos,
    extraGeos,
    appliedRows: Number(colorApplyPlan?.validation?.appliedRows || 0),
    rowsMatchProposals: colorApplyPlan?.validation?.rowsMatchProposals === true,
    geosMatchProposals: colorApplyPlan?.validation?.geosMatchProposals === true,
    allowedTargetColorsOnly: colorApplyPlan?.validation?.allowedTargetColorsOnly === true,
    actionCounts: colorApplyPlan?.counts?.proposalAction || {},
    dispositionCounts: colorApplyPlan?.counts?.applyDisposition || {},
    artifactPath: path.relative(ROOT, COLOR_APPLY_PLAN_PATH),
  };
}

function buildColorApplyGateCoverage(colorApplyPlan, colorApplyGate) {
  const planRows = Array.isArray(colorApplyPlan?.rows) ? colorApplyPlan.rows : [];
  const gateRows = Array.isArray(colorApplyGate?.rows) ? colorApplyGate.rows : [];
  const planGeos = new Set(planRows.map((row) => row.geo).filter(Boolean));
  const gateGeos = new Set(gateRows.map((row) => row.geo).filter(Boolean));
  const missingGeos = [...planGeos].filter((geo) => !gateGeos.has(geo)).sort();
  const extraGeos = [...gateGeos].filter((geo) => !planGeos.has(geo)).sort();
  return {
    artifactExists: Boolean(colorApplyGate),
    nonMutating: colorApplyGate?.nonMutating === true,
    localOnly: colorApplyGate?.localOnly === true,
    gateStatus: colorApplyGate?.gateStatus || "MISSING",
    planRows: planRows.length,
    gateRows: gateRows.length,
    missingGeos,
    extraGeos,
    appliedRows: Number(colorApplyGate?.appliedRows || 0),
    mutationAttempted: colorApplyGate?.mutationAttempted === true,
    ssotMutationAttempted: colorApplyGate?.ssotMutationAttempted === true,
    mapMutationAttempted: colorApplyGate?.mapMutationAttempted === true,
    productionTouched: colorApplyGate?.productionTouched === true,
    authorizationPresent: colorApplyGate?.authorization?.present === true,
    ssotWriteEnabled: colorApplyGate?.environment?.ssotWriteEnabled === true,
    primaryLawBlockerGeos: colorApplyGate?.primaryLawBlockers?.geos || [],
    blockingReasons: colorApplyGate?.blockingReasons || [],
    rowsMatchPlan: colorApplyGate?.validation?.rowsMatchPlan === true,
    failClosedByDefault: colorApplyGate?.validation?.failClosedByDefault === true,
    protectedHashProofCount: Array.isArray(colorApplyGate?.protectedHashProof)
      ? colorApplyGate.protectedHashProof.length
      : 0,
    artifactPath: path.relative(ROOT, COLOR_APPLY_GATE_PATH),
  };
}

function buildColorReviewDossierCoverage(colorProposals, colorApplyPlan, colorApplyGate, colorReviewDossier) {
  const proposals = Array.isArray(colorProposals?.proposals) ? colorProposals.proposals : [];
  const planRows = Array.isArray(colorApplyPlan?.rows) ? colorApplyPlan.rows : [];
  const gateRows = Array.isArray(colorApplyGate?.rows) ? colorApplyGate.rows : [];
  const dossierRows = Array.isArray(colorReviewDossier?.rows)
    ? colorReviewDossier.rows
    : [];
  const proposalGeos = new Set(proposals.map((row) => row.geo).filter(Boolean));
  const dossierGeos = new Set(dossierRows.map((row) => row.geo).filter(Boolean));
  const missingGeos = [...proposalGeos].filter((geo) => !dossierGeos.has(geo)).sort();
  const extraGeos = [...dossierGeos].filter((geo) => !proposalGeos.has(geo)).sort();
  return {
    artifactExists: Boolean(colorReviewDossier),
    nonMutating: colorReviewDossier?.nonMutating === true,
    localOnly: colorReviewDossier?.localOnly === true,
    reviewStatus: colorReviewDossier?.reviewStatus || "MISSING",
    proposalRows: proposals.length,
    planRows: planRows.length,
    gateRows: gateRows.length,
    dossierRows: dossierRows.length,
    missingGeos,
    extraGeos,
    appliedRows: Number(colorReviewDossier?.appliedRows || 0),
    readyPendingAuthorizationRows: Number(
      colorReviewDossier?.readyPendingAuthorizationRows || 0,
    ),
    blockedRows: Number(colorReviewDossier?.blockedRows || 0),
    primaryLawBlockerGeos: colorReviewDossier?.primaryLawBlockerGeos || [],
    allRowsHaveReviewDecision:
      colorReviewDossier?.validation?.allRowsHaveReviewDecision === true,
    allRowsHaveLegalBasisClass:
      colorReviewDossier?.validation?.allRowsHaveLegalBasisClass === true,
    allowedColorsOnly: colorReviewDossier?.validation?.allowedColorsOnly === true,
    rowsMatchProposals:
      colorReviewDossier?.validation?.rowsMatchProposals === true,
    rowsMatchPlan: colorReviewDossier?.validation?.rowsMatchPlan === true,
    rowsMatchGate: colorReviewDossier?.validation?.rowsMatchGate === true,
    reviewDecisionCounts: colorReviewDossier?.counts?.reviewDecision || {},
    legalBasisCounts: colorReviewDossier?.counts?.legalBasisClass || {},
    artifactPath: path.relative(ROOT, COLOR_REVIEW_DOSSIER_PATH),
  };
}

function buildColorReviewClosureDossierCoverage(colorReviewClosureDossier) {
  return {
    artifactExists: Boolean(colorReviewClosureDossier),
    nonMutating: colorReviewClosureDossier?.nonMutating === true,
    localOnly: colorReviewClosureDossier?.localOnly === true,
    safeToAutoApply: colorReviewClosureDossier?.safeToAutoApply === true,
    closureStatus: colorReviewClosureDossier?.closureStatus || "MISSING",
    colorReviewClosureClaimAllowed:
      colorReviewClosureDossier?.colorReviewClosureClaimAllowed === true,
    appliedRows: Number(colorReviewClosureDossier?.appliedRows || 0),
    productionTouched: colorReviewClosureDossier?.productionTouched === true,
    ssotMutationAttempted: colorReviewClosureDossier?.ssotMutationAttempted === true,
    mapMutationAttempted: colorReviewClosureDossier?.mapMutationAttempted === true,
    summary: colorReviewClosureDossier?.summary || {},
    validation: colorReviewClosureDossier?.validation || {},
    guardrails: Array.isArray(colorReviewClosureDossier?.guardrails)
      ? colorReviewClosureDossier.guardrails
      : [],
    remainingClosureBlockerCount: Array.isArray(colorReviewClosureDossier?.remainingClosureBlockers)
      ? colorReviewClosureDossier.remainingClosureBlockers.length
      : 0,
    hashProofCount: Array.isArray(colorReviewClosureDossier?.hashProof)
      ? colorReviewClosureDossier.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, COLOR_REVIEW_CLOSURE_DOSSIER_PATH),
  };
}

function buildColorAuthorizationPacketCoverage(colorProposals, colorApplyPlan, colorApplyGate, colorReviewDossier, colorAuthorizationPacket) {
  const proposals = Array.isArray(colorProposals?.proposals) ? colorProposals.proposals : [];
  const planRows = Array.isArray(colorApplyPlan?.rows) ? colorApplyPlan.rows : [];
  const gateRows = Array.isArray(colorApplyGate?.rows) ? colorApplyGate.rows : [];
  const dossierRows = Array.isArray(colorReviewDossier?.rows) ? colorReviewDossier.rows : [];
  const packetRows = Array.isArray(colorAuthorizationPacket?.rows)
    ? colorAuthorizationPacket.rows
    : [];
  const proposalGeos = new Set(proposals.map((row) => row.geo).filter(Boolean));
  const packetGeos = new Set(packetRows.map((row) => row.geo).filter(Boolean));
  return {
    artifactExists: Boolean(colorAuthorizationPacket),
    nonMutating: colorAuthorizationPacket?.nonMutating === true,
    localOnly: colorAuthorizationPacket?.localOnly === true,
    packetStatus: colorAuthorizationPacket?.packetStatus || "MISSING",
    proposalRows: proposals.length,
    planRows: planRows.length,
    gateRows: gateRows.length,
    dossierRows: dossierRows.length,
    packetRows: packetRows.length,
    missingGeos: [...proposalGeos].filter((geo) => !packetGeos.has(geo)).sort(),
    extraGeos: [...packetGeos].filter((geo) => !proposalGeos.has(geo)).sort(),
    appliedRows: Number(colorAuthorizationPacket?.appliedRows || 0),
    wouldApplyRowsAfterAuthorization: Number(
      colorAuthorizationPacket?.wouldApplyRowsAfterAuthorization || 0,
    ),
    inputHashProofCount: Array.isArray(colorAuthorizationPacket?.inputHashProof)
      ? colorAuthorizationPacket.inputHashProof.length
      : 0,
    protectedTargetHashProofCount: Array.isArray(colorAuthorizationPacket?.protectedTargetHashProof)
      ? colorAuthorizationPacket.protectedTargetHashProof.length
      : 0,
    validation: colorAuthorizationPacket?.validation || {},
    artifactPath: path.relative(ROOT, COLOR_AUTHORIZATION_PACKET_PATH),
  };
}

function buildColorApplyPreviewCoverage(colorProposals, colorAuthorizationPacket, colorApplyPreview) {
  const proposals = Array.isArray(colorProposals?.proposals) ? colorProposals.proposals : [];
  const packetRows = Array.isArray(colorAuthorizationPacket?.rows)
    ? colorAuthorizationPacket.rows
    : [];
  const previewRows = Array.isArray(colorApplyPreview?.statusSnapshotRows)
    ? colorApplyPreview.statusSnapshotRows
    : [];
  return {
    artifactExists: Boolean(colorApplyPreview),
    nonMutating: colorApplyPreview?.nonMutating === true,
    localOnly: colorApplyPreview?.localOnly === true,
    previewStatus: colorApplyPreview?.previewStatus || "MISSING",
    proposalRows: proposals.length,
    packetRows: packetRows.length,
    previewRows: previewRows.length,
    appliedRows: Number(colorApplyPreview?.appliedRows || 0),
    statusSnapshotMatches: Number(
      colorApplyPreview?.statusSnapshotSummary?.currentColorMatches || 0,
    ),
    statusSnapshotMissing: Number(
      colorApplyPreview?.statusSnapshotSummary?.missingRows || 0,
    ),
    statusSnapshotMismatches: Number(
      colorApplyPreview?.statusSnapshotSummary?.currentColorMismatches || 0,
    ),
    indexDirectColorTarget: colorApplyPreview?.indexSummary?.directColorTarget === true,
    blockingReasons: Array.isArray(colorApplyPreview?.blockingReasons)
      ? colorApplyPreview.blockingReasons
      : [],
    hashProofCount: Array.isArray(colorApplyPreview?.hashProof)
      ? colorApplyPreview.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, COLOR_APPLY_PREVIEW_PATH),
  };
}

function buildColorTargetResolverCoverage(colorProposals, colorAuthorizationPacket, colorTargetResolver) {
  const proposals = Array.isArray(colorProposals?.proposals) ? colorProposals.proposals : [];
  const packetRows = Array.isArray(colorAuthorizationPacket?.rows)
    ? colorAuthorizationPacket.rows
    : [];
  const resolverRows = Array.isArray(colorTargetResolver?.rows)
    ? colorTargetResolver.rows
    : [];
  return {
    artifactExists: Boolean(colorTargetResolver),
    nonMutating: colorTargetResolver?.nonMutating === true,
    localOnly: colorTargetResolver?.localOnly === true,
    resolverStatus: colorTargetResolver?.resolverStatus || "MISSING",
    proposalRows: proposals.length,
    packetRows: packetRows.length,
    resolverRows: resolverRows.length,
    appliedRows: Number(colorTargetResolver?.appliedRows || 0),
    countryJsonTargets: Number(colorTargetResolver?.summary?.countryJsonTargets || 0),
    statusV9FallbackTargets: Number(colorTargetResolver?.summary?.statusV9FallbackTargets || 0),
    unresolvedTargets: Number(colorTargetResolver?.summary?.unresolvedTargets || 0),
    packetCurrentRuntimeMismatches: Number(
      colorTargetResolver?.summary?.packetCurrentRuntimeMismatches || 0,
    ),
    directMutationAllowedNow:
      colorTargetResolver?.summary?.directMutationAllowedNow === true,
    blockingReasons: Array.isArray(colorTargetResolver?.blockingReasons)
      ? colorTargetResolver.blockingReasons
      : [],
    unresolvedGeos: Array.isArray(colorTargetResolver?.unresolvedGeos)
      ? colorTargetResolver.unresolvedGeos
      : [],
    hashProofCount: Array.isArray(colorTargetResolver?.hashProof)
      ? colorTargetResolver.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, COLOR_TARGET_RESOLVER_PATH),
  };
}

function buildDisputedTargetMappingCoverage(colorTargetResolver, disputedTargetMapping) {
  const unresolvedDisputedGeos = Array.isArray(colorTargetResolver?.unresolvedGeos)
    ? colorTargetResolver.unresolvedGeos
    : [];
  const rows = Array.isArray(disputedTargetMapping?.rows)
    ? disputedTargetMapping.rows
    : [];
  const rowGeos = new Set(rows.map((row) => row.geo).filter(Boolean));
  return {
    artifactExists: Boolean(disputedTargetMapping),
    nonMutating: disputedTargetMapping?.nonMutating === true,
    localOnly: disputedTargetMapping?.localOnly === true,
    mappingStatus: disputedTargetMapping?.mappingStatus || "MISSING",
    resolverUnresolvedDisputedRows: unresolvedDisputedGeos.length,
    mappingRows: rows.length,
    missingGeos: unresolvedDisputedGeos.filter((geo) => !rowGeos.has(geo)).sort(),
    extraGeos: rows
      .map((row) => row.geo)
      .filter((geo) => !unresolvedDisputedGeos.includes(geo))
      .sort(),
    appliedRows: Number(disputedTargetMapping?.appliedRows || 0),
    directMutationAllowedNow:
      disputedTargetMapping?.summary?.directMutationAllowedNow === true,
    statusV9TargetsPresent: Number(
      disputedTargetMapping?.summary?.statusV9TargetsPresent || 0,
    ),
    manualOverridesPresent: Number(
      disputedTargetMapping?.summary?.manualOverridesPresent || 0,
    ),
    allRowsDisputedMapped:
      disputedTargetMapping?.validation?.allRowsDisputedMapped === true,
    allRowsDirectTargetAbsent:
      disputedTargetMapping?.validation?.allRowsDirectTargetAbsent === true,
    allRowsMutationBlocked:
      disputedTargetMapping?.validation?.allRowsMutationBlocked === true,
    allRowsHaveClaimants:
      disputedTargetMapping?.validation?.allRowsHaveClaimants === true,
    noAutomaticStatusTargetsCreated:
      disputedTargetMapping?.validation?.noAutomaticStatusTargetsCreated === true,
    allRowsHaveScopeDecision:
      disputedTargetMapping?.validation?.allRowsHaveScopeDecision === true,
    guardrails: Array.isArray(disputedTargetMapping?.guardrails)
      ? disputedTargetMapping.guardrails
      : [],
    hashProofCount: Array.isArray(disputedTargetMapping?.hashProof)
      ? disputedTargetMapping.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, DISPUTED_TARGET_MAPPING_PATH),
  };
}

function buildRuntimeCurrentReconciliationCoverage(colorTargetResolver, runtimeCurrentReconciliation) {
  const resolverMismatchCount = Number(
    colorTargetResolver?.summary?.packetCurrentRuntimeMismatches || 0,
  );
  const rows = Array.isArray(runtimeCurrentReconciliation?.rows)
    ? runtimeCurrentReconciliation.rows
    : [];
  return {
    artifactExists: Boolean(runtimeCurrentReconciliation),
    nonMutating: runtimeCurrentReconciliation?.nonMutating === true,
    localOnly: runtimeCurrentReconciliation?.localOnly === true,
    reconciliationStatus:
      runtimeCurrentReconciliation?.reconciliationStatus || "MISSING",
    resolverPacketCurrentRuntimeMismatches: resolverMismatchCount,
    reconciliationRows: rows.length,
    appliedRows: Number(runtimeCurrentReconciliation?.appliedRows || 0),
    runtimeAlreadyAtTruthTarget: Number(
      runtimeCurrentReconciliation?.summary?.runtimeAlreadyAtTruthTarget || 0,
    ),
    runtimeDiffersFromTruthTarget: Number(
      runtimeCurrentReconciliation?.summary?.runtimeDiffersFromTruthTarget || 0,
    ),
    directMutationAllowedNow:
      runtimeCurrentReconciliation?.summary?.directMutationAllowedNow === true,
    rowsMatchResolverMismatches:
      runtimeCurrentReconciliation?.validation?.rowsMatchResolverMismatches === true,
    allRowsMarkPacketCurrentStale:
      runtimeCurrentReconciliation?.validation?.allRowsMarkPacketCurrentStale === true,
    allRowsMutationBlocked:
      runtimeCurrentReconciliation?.validation?.allRowsMutationBlocked === true,
    allRowsHaveDisposition:
      runtimeCurrentReconciliation?.validation?.allRowsHaveDisposition === true,
    noRowsApplied:
      runtimeCurrentReconciliation?.validation?.noRowsApplied === true,
    relationCountsAddUp:
      runtimeCurrentReconciliation?.validation?.relationCountsAddUp === true,
    guardrails: Array.isArray(runtimeCurrentReconciliation?.guardrails)
      ? runtimeCurrentReconciliation.guardrails
      : [],
    hashProofCount: Array.isArray(runtimeCurrentReconciliation?.hashProof)
      ? runtimeCurrentReconciliation.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_CURRENT_RECONCILIATION_PATH),
  };
}

function buildRuntimeAuthorizationReadinessCoverage(colorAuthorizationPacket, colorTargetResolver, runtimeAuthorizationReadiness) {
  const packetRows = Array.isArray(colorAuthorizationPacket?.rows)
    ? colorAuthorizationPacket.rows
    : [];
  const resolverRows = Array.isArray(colorTargetResolver?.rows)
    ? colorTargetResolver.rows
    : [];
  const readinessRows = Array.isArray(runtimeAuthorizationReadiness?.rows)
    ? runtimeAuthorizationReadiness.rows
    : [];
  return {
    artifactExists: Boolean(runtimeAuthorizationReadiness),
    nonMutating: runtimeAuthorizationReadiness?.nonMutating === true,
    localOnly: runtimeAuthorizationReadiness?.localOnly === true,
    readinessStatus: runtimeAuthorizationReadiness?.readinessStatus || "MISSING",
    packetRows: packetRows.length,
    resolverRows: resolverRows.length,
    readinessRows: readinessRows.length,
    appliedRows: Number(runtimeAuthorizationReadiness?.appliedRows || 0),
    readyForAuthorizedRuntimeAxisPatch: Number(
      runtimeAuthorizationReadiness?.summary?.readyForAuthorizedRuntimeAxisPatch || 0,
    ),
    noOpRuntimeAlreadyTruthTarget: Number(
      runtimeAuthorizationReadiness?.summary?.noOpRuntimeAlreadyTruthTarget || 0,
    ),
    blockedRows: Number(runtimeAuthorizationReadiness?.summary?.blockedRows || 0),
    blockedUnresolvedTarget: Number(
      runtimeAuthorizationReadiness?.summary?.blockedUnresolvedTarget || 0,
    ),
    blockedRuntimeTruthConflict: Number(
      runtimeAuthorizationReadiness?.summary?.blockedRuntimeTruthConflict || 0,
    ),
    wouldApplyRowsAfterAuthorization: Number(
      runtimeAuthorizationReadiness?.summary?.wouldApplyRowsAfterAuthorization || 0,
    ),
    directMutationAllowedNow:
      runtimeAuthorizationReadiness?.summary?.directMutationAllowedNow === true,
    requiresExplicitAuthorization:
      runtimeAuthorizationReadiness?.summary?.requiresExplicitAuthorization === true,
    rowsMatchAuthorizationPacket:
      runtimeAuthorizationReadiness?.validation?.rowsMatchAuthorizationPacket === true,
    rowsMatchTargetResolver:
      runtimeAuthorizationReadiness?.validation?.rowsMatchTargetResolver === true,
    decisionCountsAddUp:
      runtimeAuthorizationReadiness?.validation?.decisionCountsAddUp === true,
    allRowsHaveDecision:
      runtimeAuthorizationReadiness?.validation?.allRowsHaveDecision === true,
    allRowsMutationBlockedNow:
      runtimeAuthorizationReadiness?.validation?.allRowsMutationBlockedNow === true,
    readyRowsWouldApplyAfterAuthorization:
      runtimeAuthorizationReadiness?.validation?.readyRowsWouldApplyAfterAuthorization === true,
    noOpRowsWouldNotApply:
      runtimeAuthorizationReadiness?.validation?.noOpRowsWouldNotApply === true,
    blockedRowsWouldNotApply:
      runtimeAuthorizationReadiness?.validation?.blockedRowsWouldNotApply === true,
    blockedRowsHaveBlockingReasons:
      runtimeAuthorizationReadiness?.validation?.blockedRowsHaveBlockingReasons === true,
    appliedRowsZero:
      runtimeAuthorizationReadiness?.validation?.appliedRowsZero === true,
    validationRequiresExplicitAuthorization:
      runtimeAuthorizationReadiness?.validation?.requiresExplicitAuthorization === true,
    guardrails: Array.isArray(runtimeAuthorizationReadiness?.guardrails)
      ? runtimeAuthorizationReadiness.guardrails
      : [],
    hashProofCount: Array.isArray(runtimeAuthorizationReadiness?.hashProof)
      ? runtimeAuthorizationReadiness.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_AUTHORIZATION_READINESS_PATH),
  };
}

function buildRuntimeTruthConflictAuditCoverage(runtimeAuthorizationReadiness, runtimeTruthConflictAudit) {
  const rows = Array.isArray(runtimeTruthConflictAudit?.rows)
    ? runtimeTruthConflictAudit.rows
    : [];
  return {
    artifactExists: Boolean(runtimeTruthConflictAudit),
    nonMutating: runtimeTruthConflictAudit?.nonMutating === true,
    localOnly: runtimeTruthConflictAudit?.localOnly === true,
    conflictAuditStatus: runtimeTruthConflictAudit?.conflictAuditStatus || "MISSING",
    readinessBlockedRuntimeTruthConflict: Number(
      runtimeAuthorizationReadiness?.summary?.blockedRuntimeTruthConflict || 0,
    ),
    auditRows: rows.length,
    appliedRows: Number(runtimeTruthConflictAudit?.appliedRows || 0),
    currentRuntimeGreenTruthYellow: Number(
      runtimeTruthConflictAudit?.summary?.currentRuntimeGreenTruthYellow || 0,
    ),
    allRequireAxisRefresh:
      runtimeTruthConflictAudit?.summary?.allRequireAxisRefresh === true,
    directMutationAllowedNow:
      runtimeTruthConflictAudit?.summary?.directMutationAllowedNow === true,
    rowsMatchReadinessBlockedRuntimeTruthConflict:
      runtimeTruthConflictAudit?.validation?.rowsMatchReadinessBlockedRuntimeTruthConflict === true,
    allRowsRuntimeGreenTruthYellow:
      runtimeTruthConflictAudit?.validation?.allRowsRuntimeGreenTruthYellow === true,
    allRowsMutationBlocked:
      runtimeTruthConflictAudit?.validation?.allRowsMutationBlocked === true,
    allRowsRequireAxisRefresh:
      runtimeTruthConflictAudit?.validation?.allRowsRequireAxisRefresh === true,
    allRowsHaveOfficialEvidence:
      runtimeTruthConflictAudit?.validation?.allRowsHaveOfficialEvidence === true,
    appliedRowsZero:
      runtimeTruthConflictAudit?.validation?.appliedRowsZero === true,
    guardrails: Array.isArray(runtimeTruthConflictAudit?.guardrails)
      ? runtimeTruthConflictAudit.guardrails
      : [],
    hashProofCount: Array.isArray(runtimeTruthConflictAudit?.hashProof)
      ? runtimeTruthConflictAudit.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_TRUTH_CONFLICT_AUDIT_PATH),
  };
}

function buildRuntimeSafeAuthorizationPacketCoverage(runtimeAuthorizationReadiness, runtimeSafeAuthorizationPacket) {
  return {
    artifactExists: Boolean(runtimeSafeAuthorizationPacket),
    nonMutating: runtimeSafeAuthorizationPacket?.nonMutating === true,
    localOnly: runtimeSafeAuthorizationPacket?.localOnly === true,
    packetStatus: runtimeSafeAuthorizationPacket?.packetStatus || "MISSING",
    originalPacketRows: Number(runtimeSafeAuthorizationPacket?.originalPacketRows || 0),
    readinessRows: Number(runtimeSafeAuthorizationPacket?.readinessRows || 0),
    safeRowsTotal: Number(runtimeSafeAuthorizationPacket?.safeRowsTotal || 0),
    excludedRowsTotal: Number(runtimeSafeAuthorizationPacket?.excludedRowsTotal || 0),
    appliedRows: Number(runtimeSafeAuthorizationPacket?.appliedRows || 0),
    wouldApplyRowsAfterAuthorization: Number(
      runtimeSafeAuthorizationPacket?.wouldApplyRowsAfterAuthorization || 0,
    ),
    readinessReadyRows: Number(
      runtimeAuthorizationReadiness?.summary?.readyForAuthorizedRuntimeAxisPatch || 0,
    ),
    readinessNoOpRows: Number(
      runtimeAuthorizationReadiness?.summary?.noOpRuntimeAlreadyTruthTarget || 0,
    ),
    readinessBlockedRows: Number(runtimeAuthorizationReadiness?.summary?.blockedRows || 0),
    noOpRowsExcluded: Number(runtimeSafeAuthorizationPacket?.summary?.noOpRowsExcluded || 0),
    blockedRowsExcluded: Number(runtimeSafeAuthorizationPacket?.summary?.blockedRowsExcluded || 0),
    blockedUnresolvedTargetExcluded: Number(
      runtimeSafeAuthorizationPacket?.summary?.blockedUnresolvedTargetExcluded || 0,
    ),
    blockedRuntimeTruthConflictExcluded: Number(
      runtimeSafeAuthorizationPacket?.summary?.blockedRuntimeTruthConflictExcluded || 0,
    ),
    directMutationAllowedNow:
      runtimeSafeAuthorizationPacket?.summary?.directMutationAllowedNow === true,
    rowsMatchReadinessReadyCount:
      runtimeSafeAuthorizationPacket?.validation?.rowsMatchReadinessReadyCount === true,
    excludedRowsMatchReadinessNonReady:
      runtimeSafeAuthorizationPacket?.validation?.excludedRowsMatchReadinessNonReady === true,
    allSafeRowsReady:
      runtimeSafeAuthorizationPacket?.validation?.allSafeRowsReady === true,
    noSafeRowsNoOp:
      runtimeSafeAuthorizationPacket?.validation?.noSafeRowsNoOp === true,
    noSafeRowsBlocked:
      runtimeSafeAuthorizationPacket?.validation?.noSafeRowsBlocked === true,
    allExcludedRowsWouldNotApply:
      runtimeSafeAuthorizationPacket?.validation?.allExcludedRowsWouldNotApply === true,
    allRowsMutationBlockedNow:
      runtimeSafeAuthorizationPacket?.validation?.allRowsMutationBlockedNow === true,
    allSafeRowsRequireAuthorization:
      runtimeSafeAuthorizationPacket?.validation?.allSafeRowsRequireAuthorization === true,
    appliedRowsZero:
      runtimeSafeAuthorizationPacket?.validation?.appliedRowsZero === true,
    noProdMutation:
      runtimeSafeAuthorizationPacket?.validation?.noProdMutation === true,
    noSsotMutation:
      runtimeSafeAuthorizationPacket?.validation?.noSsotMutation === true,
    guardrails: Array.isArray(runtimeSafeAuthorizationPacket?.guardrails)
      ? runtimeSafeAuthorizationPacket.guardrails
      : [],
    hashProofCount: Array.isArray(runtimeSafeAuthorizationPacket?.hashProof)
      ? runtimeSafeAuthorizationPacket.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH),
  };
}

function buildThreeColorOverlayCoverage(report, threeColorOverlay) {
  const rows = Array.isArray(threeColorOverlay?.rows) ? threeColorOverlay.rows : [];
  const reportRows = Array.isArray(report?.rows) ? report.rows : [];
  const reportGeos = new Set(reportRows.map((row) => row.geo).filter(Boolean));
  const overlayGeos = new Set(rows.map((row) => row.geo).filter(Boolean));
  const reportTruthColorCounts = countBy(reportRows, (row) => row.truth?.color || "MISSING");
  const overlayTruthColorCounts = threeColorOverlay?.counts?.truthColor || {};
  const countKeys = new Set([
    ...Object.keys(reportTruthColorCounts),
    ...Object.keys(overlayTruthColorCounts),
  ]);
  const countsMatchTruthReport = [...countKeys].every(
    (key) => Number(reportTruthColorCounts[key] || 0) === Number(overlayTruthColorCounts[key] || 0),
  );
  const paintColorsUsed = [...new Set(rows.map((row) => row.paintColor).filter(Boolean))].sort();
  return {
    artifactExists: Boolean(threeColorOverlay),
    nonMutating: threeColorOverlay?.nonMutating === true,
    localOnly: threeColorOverlay?.localOnly === true,
    overlayStatus: threeColorOverlay?.overlayStatus || "MISSING",
    rowsTotal: rows.length,
    reportRows: reportRows.length,
    missingGeos: [...reportGeos].filter((geo) => !overlayGeos.has(geo)).sort(),
    extraGeos: [...overlayGeos].filter((geo) => !reportGeos.has(geo)).sort(),
    appliedRows: Number(threeColorOverlay?.appliedRows || 0),
    productionTouched: threeColorOverlay?.productionTouched === true,
    ssotMutationAttempted: threeColorOverlay?.ssotMutationAttempted === true,
    mapMutationAttempted: threeColorOverlay?.mapMutationAttempted === true,
    allowedTruthColorsOnly:
      threeColorOverlay?.validation?.allowedTruthColorsOnly === true,
    allowedPaintPaletteOnly:
      threeColorOverlay?.validation?.allowedPaintPaletteOnly === true,
    paletteHasOnlyThreePaintColors:
      threeColorOverlay?.validation?.paletteHasOnlyThreePaintColors === true,
    unknownRowsUncolored:
      threeColorOverlay?.validation?.unknownRowsUncolored === true,
    nonUnknownRowsPainted:
      threeColorOverlay?.validation?.nonUnknownRowsPainted === true,
    noWikipediaTruthSource:
      threeColorOverlay?.validation?.noWikipediaTruthSource === true,
    deterministicFromTruthReport:
      threeColorOverlay?.validation?.deterministicFromTruthReport === true,
    rowsMatchTruthReport:
      threeColorOverlay?.validation?.rowsMatchTruthReport === true,
    colorCountsAddUp:
      threeColorOverlay?.validation?.colorCountsAddUp === true,
    paintCountsAddUp:
      threeColorOverlay?.validation?.paintCountsAddUp === true,
    noMutation: threeColorOverlay?.validation?.noMutation === true,
    appliedRowsZero: threeColorOverlay?.validation?.appliedRowsZero === true,
    countsMatchTruthReport,
    truthColorCounts: overlayTruthColorCounts,
    paintTokenCounts: threeColorOverlay?.counts?.paintToken || {},
    paintColorsUsed,
    paintColorsUsedTotal: paintColorsUsed.length,
    hashProofCount: Array.isArray(threeColorOverlay?.hashProof)
      ? threeColorOverlay.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, THREE_COLOR_OVERLAY_PATH),
  };
}

function buildRuntimeApplyDryRunDiffCoverage(runtimeSafeAuthorizationPacket, runtimeApplyDryRunDiff) {
  const safeRows = Array.isArray(runtimeSafeAuthorizationPacket?.rows)
    ? runtimeSafeAuthorizationPacket.rows
    : [];
  const diffRows = Array.isArray(runtimeApplyDryRunDiff?.rows)
    ? runtimeApplyDryRunDiff.rows
    : [];
  const safeGeos = new Set(safeRows.map((row) => row.geo).filter(Boolean));
  const diffGeos = new Set(diffRows.map((row) => row.geo).filter(Boolean));
  return {
    artifactExists: Boolean(runtimeApplyDryRunDiff),
    nonMutating: runtimeApplyDryRunDiff?.nonMutating === true,
    localOnly: runtimeApplyDryRunDiff?.localOnly === true,
    dryRunStatus: runtimeApplyDryRunDiff?.dryRunStatus || "MISSING",
    safeRows: safeRows.length,
    diffRows: diffRows.length,
    missingGeos: [...safeGeos].filter((geo) => !diffGeos.has(geo)).sort(),
    extraGeos: [...diffGeos].filter((geo) => !safeGeos.has(geo)).sort(),
    appliedRows: Number(runtimeApplyDryRunDiff?.appliedRows || 0),
    wouldWriteRowsNow: Number(runtimeApplyDryRunDiff?.wouldWriteRowsNow || 0),
    wouldApplyRowsAfterAuthorization: Number(
      runtimeApplyDryRunDiff?.wouldApplyRowsAfterAuthorization || 0,
    ),
    productionTouched: runtimeApplyDryRunDiff?.productionTouched === true,
    ssotMutationAttempted: runtimeApplyDryRunDiff?.ssotMutationAttempted === true,
    mapMutationAttempted: runtimeApplyDryRunDiff?.mapMutationAttempted === true,
    targetFilesTotal: Number(runtimeApplyDryRunDiff?.targetFilesTotal || 0),
    countryJsonTargetRows: Number(
      runtimeApplyDryRunDiff?.counts?.targetFamily?.COUNTRY_PAGE_JSON_RUNTIME_SOURCE || 0,
    ),
    statusV9FallbackRows: Number(
      runtimeApplyDryRunDiff?.counts?.targetFamily?.STATUS_ENGINE_V9_FALLBACK_SOURCE || 0,
    ),
    operationPathCounts: runtimeApplyDryRunDiff?.counts?.operationPath || {},
    proposedTruthColorCounts: runtimeApplyDryRunDiff?.counts?.proposedTruthColor || {},
    rowsMatchSafePacket:
      runtimeApplyDryRunDiff?.validation?.rowsMatchSafePacket === true,
    expectedSafeRows:
      runtimeApplyDryRunDiff?.validation?.expectedSafeRows === true,
    allTargetsResolved:
      runtimeApplyDryRunDiff?.validation?.allTargetsResolved === true,
    allowedTargetFamiliesOnly:
      runtimeApplyDryRunDiff?.validation?.allowedTargetFamiliesOnly === true,
    allowedTruthColorsOnly:
      runtimeApplyDryRunDiff?.validation?.allowedTruthColorsOnly === true,
    allRowsHaveOperations:
      runtimeApplyDryRunDiff?.validation?.allRowsHaveOperations === true,
    allOperationsHaveOldNew:
      runtimeApplyDryRunDiff?.validation?.allOperationsHaveOldNew === true,
    allDerivedColorsMatchTruth:
      runtimeApplyDryRunDiff?.validation?.allDerivedColorsMatchTruth === true,
    allRowsWouldApplyAfterAuthorization:
      runtimeApplyDryRunDiff?.validation?.allRowsWouldApplyAfterAuthorization === true,
    noRowsWouldWriteNow:
      runtimeApplyDryRunDiff?.validation?.noRowsWouldWriteNow === true,
    noRowsAppliedNow:
      runtimeApplyDryRunDiff?.validation?.noRowsAppliedNow === true,
    allRowsRequireAuthorization:
      runtimeApplyDryRunDiff?.validation?.allRowsRequireAuthorization === true,
    allRowsRequireSsotWrite:
      runtimeApplyDryRunDiff?.validation?.allRowsRequireSsotWrite === true,
    allRowsRequireAxisPatchReview:
      runtimeApplyDryRunDiff?.validation?.allRowsRequireAxisPatchReview === true,
    noWikipediaTruthSource:
      runtimeApplyDryRunDiff?.validation?.noWikipediaTruthSource === true,
    safePacketValidated:
      runtimeApplyDryRunDiff?.validation?.safePacketValidated === true,
    operationTotalPositive:
      runtimeApplyDryRunDiff?.validation?.operationTotalPositive === true,
    targetFileCountPositive:
      runtimeApplyDryRunDiff?.validation?.targetFileCountPositive === true,
    appliedRowsZero:
      runtimeApplyDryRunDiff?.validation?.appliedRowsZero === true,
    noMutation: runtimeApplyDryRunDiff?.validation?.noMutation === true,
    guardrails: Array.isArray(runtimeApplyDryRunDiff?.guardrails)
      ? runtimeApplyDryRunDiff.guardrails
      : [],
    hashProofCount: Array.isArray(runtimeApplyDryRunDiff?.hashProof)
      ? runtimeApplyDryRunDiff.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_APPLY_DRY_RUN_DIFF_PATH),
  };
}

function buildRuntimeApplyPreflightCoverage(runtimeApplyDryRunDiff, runtimeApplyPreflight) {
  const dryRunRows = Array.isArray(runtimeApplyDryRunDiff?.rows)
    ? runtimeApplyDryRunDiff.rows
    : [];
  const preflightRows = Array.isArray(runtimeApplyPreflight?.rows)
    ? runtimeApplyPreflight.rows
    : [];
  const dryRunGeos = new Set(dryRunRows.map((row) => row.geo).filter(Boolean));
  const preflightGeos = new Set(preflightRows.map((row) => row.geo).filter(Boolean));
  return {
    artifactExists: Boolean(runtimeApplyPreflight),
    nonMutating: runtimeApplyPreflight?.nonMutating === true,
    localOnly: runtimeApplyPreflight?.localOnly === true,
    preflightStatus: runtimeApplyPreflight?.preflightStatus || "MISSING",
    dryRunRows: dryRunRows.length,
    preflightRows: preflightRows.length,
    missingGeos: [...dryRunGeos].filter((geo) => !preflightGeos.has(geo)).sort(),
    extraGeos: [...preflightGeos].filter((geo) => !dryRunGeos.has(geo)).sort(),
    targetFilesTotal: Number(runtimeApplyPreflight?.targetFilesTotal || 0),
    targetDriftFiles: Number(runtimeApplyPreflight?.targetDriftFiles || 0),
    targetDriftRows: Number(runtimeApplyPreflight?.targetDriftRows || 0),
    appliedRows: Number(runtimeApplyPreflight?.appliedRows || 0),
    wouldWriteRowsNow: Number(runtimeApplyPreflight?.wouldWriteRowsNow || 0),
    wouldWriteRowsAfterAuthorization: Number(
      runtimeApplyPreflight?.wouldWriteRowsAfterAuthorization || 0,
    ),
    productionTouched: runtimeApplyPreflight?.productionTouched === true,
    ssotMutationAttempted: runtimeApplyPreflight?.ssotMutationAttempted === true,
    mapMutationAttempted: runtimeApplyPreflight?.mapMutationAttempted === true,
    authorizationPresent: runtimeApplyPreflight?.authorization?.present === true,
    authorizationAccepted: runtimeApplyPreflight?.authorization?.accepted === true,
    ssotWriteEnabled: runtimeApplyPreflight?.environment?.ssotWriteEnabled === true,
    dryRunDiffReady: runtimeApplyPreflight?.validation?.dryRunDiffReady === true,
    dryRunRowsExpected: runtimeApplyPreflight?.validation?.dryRunRowsExpected === true,
    safePacketRowsExpected: runtimeApplyPreflight?.validation?.safePacketRowsExpected === true,
    targetFilesMatchDryRunTotal:
      runtimeApplyPreflight?.validation?.targetFilesMatchDryRunTotal === true,
    allTargetsExist: runtimeApplyPreflight?.validation?.allTargetsExist === true,
    allTargetsAllowed: runtimeApplyPreflight?.validation?.allTargetsAllowed === true,
    allTargetHashesMatchDryRun:
      runtimeApplyPreflight?.validation?.allTargetHashesMatchDryRun === true,
    noTargetDrift: runtimeApplyPreflight?.validation?.noTargetDrift === true,
    authorizationMissing:
      runtimeApplyPreflight?.validation?.authorizationMissing === true,
    ssotWriteDisabled:
      runtimeApplyPreflight?.validation?.ssotWriteDisabled === true,
    failClosedByDefault:
      runtimeApplyPreflight?.validation?.failClosedByDefault === true,
    allRowsBlockedNow:
      runtimeApplyPreflight?.validation?.allRowsBlockedNow === true,
    noRowsWouldWriteNow:
      runtimeApplyPreflight?.validation?.noRowsWouldWriteNow === true,
    noRowsAppliedNow:
      runtimeApplyPreflight?.validation?.noRowsAppliedNow === true,
    allRowsRequireExplicitAuthorization:
      runtimeApplyPreflight?.validation?.allRowsRequireExplicitAuthorization === true,
    allRowsDerivedColorsMatchTruth:
      runtimeApplyPreflight?.validation?.allRowsDerivedColorsMatchTruth === true,
    noWikipediaTruthSource:
      runtimeApplyPreflight?.validation?.noWikipediaTruthSource === true,
    upstreamApplyGateFailClosed:
      runtimeApplyPreflight?.validation?.upstreamApplyGateFailClosed === true,
    noMutation: runtimeApplyPreflight?.validation?.noMutation === true,
    appliedRowsZero: runtimeApplyPreflight?.validation?.appliedRowsZero === true,
    gateDecisionCounts: runtimeApplyPreflight?.counts?.gateDecision || {},
    blockingReasonCounts: runtimeApplyPreflight?.counts?.blockingReason || {},
    targetFileHashCounts: runtimeApplyPreflight?.counts?.targetFileHash || {},
    guardrails: Array.isArray(runtimeApplyPreflight?.guardrails)
      ? runtimeApplyPreflight.guardrails
      : [],
    hashProofCount: Array.isArray(runtimeApplyPreflight?.hashProof)
      ? runtimeApplyPreflight.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_APPLY_PREFLIGHT_PATH),
  };
}

function buildRuntimeApplyExecutionCoverage(runtimeApplyDryRunDiff, runtimeApplyPreflight, runtimeApplyExecution) {
  const dryRunRows = Array.isArray(runtimeApplyDryRunDiff?.rows)
    ? runtimeApplyDryRunDiff.rows
    : [];
  const preflightRows = Array.isArray(runtimeApplyPreflight?.rows)
    ? runtimeApplyPreflight.rows
    : [];
  const executionRows = Array.isArray(runtimeApplyExecution?.rows)
    ? runtimeApplyExecution.rows
    : [];
  const dryRunGeos = new Set(dryRunRows.map((row) => row.geo).filter(Boolean));
  const executionGeos = new Set(executionRows.map((row) => row.geo).filter(Boolean));
  return {
    artifactExists: Boolean(runtimeApplyExecution),
    nonMutating: runtimeApplyExecution?.nonMutating === true,
    localOnly: runtimeApplyExecution?.localOnly === true,
    executionStatus: runtimeApplyExecution?.executionStatus || "MISSING",
    dryRunRows: dryRunRows.length,
    preflightRows: preflightRows.length,
    executionRows: executionRows.length,
    missingGeos: [...dryRunGeos].filter((geo) => !executionGeos.has(geo)).sort(),
    extraGeos: [...executionGeos].filter((geo) => !dryRunGeos.has(geo)).sort(),
    appliedRows: Number(runtimeApplyExecution?.appliedRows || 0),
    wouldWriteRowsNow: Number(runtimeApplyExecution?.wouldWriteRowsNow || 0),
    writtenTargetFilesTotal: Number(runtimeApplyExecution?.writtenTargetFilesTotal || 0),
    productionTouched: runtimeApplyExecution?.productionTouched === true,
    ssotMutationAttempted: runtimeApplyExecution?.ssotMutationAttempted === true,
    mapMutationAttempted: runtimeApplyExecution?.mapMutationAttempted === true,
    applyFlagPresent: runtimeApplyExecution?.cli?.applyFlagPresent === true,
    authorizationPresent: runtimeApplyExecution?.authorization?.present === true,
    authorizationAccepted: runtimeApplyExecution?.authorization?.accepted === true,
    ssotWriteEnabled: runtimeApplyExecution?.environment?.ssotWriteEnabled === true,
    dryRunRowsExpected: runtimeApplyExecution?.validation?.dryRunRowsExpected === true,
    dryRunReady: runtimeApplyExecution?.validation?.dryRunReady === true,
    preflightReadyOrFailClosed:
      runtimeApplyExecution?.validation?.preflightReadyOrFailClosed === true,
    allTargetHashesMatchDryRun:
      runtimeApplyExecution?.validation?.allTargetHashesMatchDryRun === true,
    allTargetsAllowed: runtimeApplyExecution?.validation?.allTargetsAllowed === true,
    applyFlagMissing: runtimeApplyExecution?.validation?.applyFlagMissing === true,
    authorizationMissing:
      runtimeApplyExecution?.validation?.authorizationMissing === true,
    ssotWriteDisabled: runtimeApplyExecution?.validation?.ssotWriteDisabled === true,
    failClosedWithoutApplyFlag:
      runtimeApplyExecution?.validation?.failClosedWithoutApplyFlag === true,
    failClosedWithoutAuthorization:
      runtimeApplyExecution?.validation?.failClosedWithoutAuthorization === true,
    failClosedWithoutSsotWrite:
      runtimeApplyExecution?.validation?.failClosedWithoutSsotWrite === true,
    allRowsBlockedWhenGateClosed:
      runtimeApplyExecution?.validation?.allRowsBlockedWhenGateClosed === true,
    noRowsAppliedWhenGateClosed:
      runtimeApplyExecution?.validation?.noRowsAppliedWhenGateClosed === true,
    noProdMutation: runtimeApplyExecution?.validation?.noProdMutation === true,
    noWikipediaTruthSource:
      runtimeApplyExecution?.validation?.noWikipediaTruthSource === true,
    executionDecisionCounts: runtimeApplyExecution?.counts?.executionDecision || {},
    blockingReasonCounts: runtimeApplyExecution?.counts?.blockingReason || {},
    targetHashCounts: runtimeApplyExecution?.counts?.targetHash || {},
    guardrails: Array.isArray(runtimeApplyExecution?.guardrails)
      ? runtimeApplyExecution.guardrails
      : [],
    hashProofCount: Array.isArray(runtimeApplyExecution?.hashProof)
      ? runtimeApplyExecution.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_APPLY_EXECUTION_PATH),
  };
}

function buildRuntimeApplyRollbackPlanCoverage(runtimeApplyDryRunDiff, runtimeApplyExecution, runtimeApplyRollbackPlan) {
  const dryRunRows = Array.isArray(runtimeApplyDryRunDiff?.rows)
    ? runtimeApplyDryRunDiff.rows
    : [];
  const executionRows = Array.isArray(runtimeApplyExecution?.rows)
    ? runtimeApplyExecution.rows
    : [];
  const rollbackRows = Array.isArray(runtimeApplyRollbackPlan?.rows)
    ? runtimeApplyRollbackPlan.rows
    : [];
  const dryRunGeos = new Set(dryRunRows.map((row) => row.geo).filter(Boolean));
  const rollbackGeos = new Set(rollbackRows.map((row) => row.geo).filter(Boolean));
  return {
    artifactExists: Boolean(runtimeApplyRollbackPlan),
    nonMutating: runtimeApplyRollbackPlan?.nonMutating === true,
    localOnly: runtimeApplyRollbackPlan?.localOnly === true,
    rollbackStatus: runtimeApplyRollbackPlan?.rollbackStatus || "MISSING",
    dryRunRows: dryRunRows.length,
    executionRows: executionRows.length,
    rollbackRows: rollbackRows.length,
    missingGeos: [...dryRunGeos].filter((geo) => !rollbackGeos.has(geo)).sort(),
    extraGeos: [...rollbackGeos].filter((geo) => !dryRunGeos.has(geo)).sort(),
    targetFilesTotal: Number(runtimeApplyRollbackPlan?.targetFilesTotal || 0),
    appliedRows: Number(runtimeApplyRollbackPlan?.appliedRows || 0),
    wouldRollbackRowsNow: Number(runtimeApplyRollbackPlan?.wouldRollbackRowsNow || 0),
    productionTouched: runtimeApplyRollbackPlan?.productionTouched === true,
    ssotMutationAttempted: runtimeApplyRollbackPlan?.ssotMutationAttempted === true,
    mapMutationAttempted: runtimeApplyRollbackPlan?.mapMutationAttempted === true,
    dryRunDiffReady:
      runtimeApplyRollbackPlan?.validation?.dryRunDiffReady === true,
    executionFailClosedNoMutation:
      runtimeApplyRollbackPlan?.validation?.executionFailClosedNoMutation === true,
    rowsMatchDryRun:
      runtimeApplyRollbackPlan?.validation?.rowsMatchDryRun === true,
    expectedRows:
      runtimeApplyRollbackPlan?.validation?.expectedRows === true,
    targetFilesMatchDryRunTotal:
      runtimeApplyRollbackPlan?.validation?.targetFilesMatchDryRunTotal === true,
    allTargetsAllowed:
      runtimeApplyRollbackPlan?.validation?.allTargetsAllowed === true,
    allTargetHashesMatchDryRun:
      runtimeApplyRollbackPlan?.validation?.allTargetHashesMatchDryRun === true,
    allDryRunOldValuesMatchCurrent:
      runtimeApplyRollbackPlan?.validation?.allDryRunOldValuesMatchCurrent === true,
    allTargetExpectedHashesUnique:
      runtimeApplyRollbackPlan?.validation?.allTargetExpectedHashesUnique === true,
    allSimulatedApplyChangesTarget:
      runtimeApplyRollbackPlan?.validation?.allSimulatedApplyChangesTarget === true,
    allSimulatedRollbackRestoresOriginal:
      runtimeApplyRollbackPlan?.validation?.allSimulatedRollbackRestoresOriginal === true,
    allRowsHaveRollbackOperations:
      runtimeApplyRollbackPlan?.validation?.allRowsHaveRollbackOperations === true,
    rollbackOpsReverseDryRun:
      runtimeApplyRollbackPlan?.validation?.rollbackOpsReverseDryRun === true,
    allRowsRollbackWouldNotRunNow:
      runtimeApplyRollbackPlan?.validation?.allRowsRollbackWouldNotRunNow === true,
    noWikipediaTruthSource:
      runtimeApplyRollbackPlan?.validation?.noWikipediaTruthSource === true,
    validationNonMutating:
      runtimeApplyRollbackPlan?.validation?.nonMutating === true,
    validationLocalOnly:
      runtimeApplyRollbackPlan?.validation?.localOnly === true,
    appliedRowsZero:
      runtimeApplyRollbackPlan?.validation?.appliedRowsZero === true,
    noProdMutation:
      runtimeApplyRollbackPlan?.validation?.noProdMutation === true,
    rollbackDispositionCounts: runtimeApplyRollbackPlan?.counts?.rollbackDisposition || {},
    targetPlanHashCounts: runtimeApplyRollbackPlan?.counts?.targetPlanHash || {},
    guardrails: Array.isArray(runtimeApplyRollbackPlan?.guardrails)
      ? runtimeApplyRollbackPlan.guardrails
      : [],
    hashProofCount: Array.isArray(runtimeApplyRollbackPlan?.hashProof)
      ? runtimeApplyRollbackPlan.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_APPLY_ROLLBACK_PLAN_PATH),
  };
}

function buildRuntimePostApplyVerificationCoverage(runtimeApplyDryRunDiff, runtimeAuthorizationReadiness, runtimeSafeAuthorizationPacket, threeColorOverlay, runtimeApplyRollbackPlan, runtimePostApplyVerification) {
  const dryRunRows = Array.isArray(runtimeApplyDryRunDiff?.rows)
    ? runtimeApplyDryRunDiff.rows
    : [];
  const readinessRows = Array.isArray(runtimeAuthorizationReadiness?.rows)
    ? runtimeAuthorizationReadiness.rows
    : [];
  const safePacketRows = Array.isArray(runtimeSafeAuthorizationPacket?.rows)
    ? runtimeSafeAuthorizationPacket.rows
    : [];
  const overlayRows = Array.isArray(threeColorOverlay?.rows)
    ? threeColorOverlay.rows
    : [];
  const postApplyRows = Array.isArray(runtimePostApplyVerification?.rows)
    ? runtimePostApplyVerification.rows
    : [];
  const dryRunGeos = new Set(dryRunRows.map((row) => row.geo).filter(Boolean));
  const postApplyGeos = new Set(postApplyRows.map((row) => row.geo).filter(Boolean));
  return {
    artifactExists: Boolean(runtimePostApplyVerification),
    nonMutating: runtimePostApplyVerification?.nonMutating === true,
    localOnly: runtimePostApplyVerification?.localOnly === true,
    postApplyStatus:
      runtimePostApplyVerification?.postApplyStatus || "MISSING",
    dryRunRows: dryRunRows.length,
    readinessRows: readinessRows.length,
    safePacketRows: safePacketRows.length,
    overlayRows: overlayRows.length,
    postApplyRows: postApplyRows.length,
    missingGeos: [...dryRunGeos].filter((geo) => !postApplyGeos.has(geo)).sort(),
    extraGeos: [...postApplyGeos].filter((geo) => !dryRunGeos.has(geo)).sort(),
    targetFilesTotal: Number(runtimePostApplyVerification?.targetFilesTotal || 0),
    appliedRows: Number(runtimePostApplyVerification?.appliedRows || 0),
    wouldApplyRowsAfterAuthorization: Number(
      runtimePostApplyVerification?.wouldApplyRowsAfterAuthorization || 0,
    ),
    truthAlignedRowsAfterAuthorizedApply: Number(
      runtimePostApplyVerification?.truthAlignedRowsAfterAuthorizedApply || 0,
    ),
    blockedRowsAfterAuthorizedApply: Number(
      runtimePostApplyVerification?.blockedRowsAfterAuthorizedApply || 0,
    ),
    coverageRowsTotal: Number(runtimePostApplyVerification?.coverageRowsTotal || 0),
    coverageRowsExpected: Number(runtimePostApplyVerification?.coverageRowsExpected || 0),
    productionTouched: runtimePostApplyVerification?.productionTouched === true,
    ssotMutationAttempted: runtimePostApplyVerification?.ssotMutationAttempted === true,
    mapMutationAttempted: runtimePostApplyVerification?.mapMutationAttempted === true,
    validationNonMutating:
      runtimePostApplyVerification?.validation?.nonMutating === true,
    validationLocalOnly:
      runtimePostApplyVerification?.validation?.localOnly === true,
    overlayRows307:
      runtimePostApplyVerification?.validation?.overlayRows307 === true,
    readinessRowsExpected:
      runtimePostApplyVerification?.validation?.readinessRowsExpected === true,
    safeRowsExpected:
      runtimePostApplyVerification?.validation?.safeRowsExpected === true,
    safePacketRowsExpected:
      runtimePostApplyVerification?.validation?.safePacketRowsExpected === true,
    noOpRowsExpected:
      runtimePostApplyVerification?.validation?.noOpRowsExpected === true,
    blockedRows5:
      runtimePostApplyVerification?.validation?.blockedRows5 === true,
    alreadyTruthRowsExpected:
      runtimePostApplyVerification?.validation?.alreadyTruthRowsExpected === true,
    coverageRowsTotal307:
      runtimePostApplyVerification?.validation?.coverageRowsTotal307 === true,
    truthAlignedRowsAfterAuthorizedApplyExpected:
      runtimePostApplyVerification?.validation
        ?.truthAlignedRowsAfterAuthorizedApplyExpected === true,
    targetFilesExpected:
      runtimePostApplyVerification?.validation?.targetFilesExpected === true,
    allTargetsAllowed:
      runtimePostApplyVerification?.validation?.allTargetsAllowed === true,
    allTargetHashesMatchDryRun:
      runtimePostApplyVerification?.validation?.allTargetHashesMatchDryRun === true,
    allDryRunOldValuesMatchCurrent:
      runtimePostApplyVerification?.validation?.allDryRunOldValuesMatchCurrent === true,
    allTargetExpectedHashesUnique:
      runtimePostApplyVerification?.validation?.allTargetExpectedHashesUnique === true,
    allSimulatedApplyChangesTarget:
      runtimePostApplyVerification?.validation?.allSimulatedApplyChangesTarget === true,
    rowsMatchSafePacket:
      runtimePostApplyVerification?.validation?.rowsMatchSafePacket === true,
    blockedRowsRemainExcluded:
      runtimePostApplyVerification?.validation?.blockedRowsRemainExcluded === true,
    noOpRowsRemainExcluded:
      runtimePostApplyVerification?.validation?.noOpRowsRemainExcluded === true,
    noOpRowsAlreadyTruthTarget:
      runtimePostApplyVerification?.validation?.noOpRowsAlreadyTruthTarget === true,
    allSimulatedSafeRowsMatchTruth:
      runtimePostApplyVerification?.validation?.allSimulatedSafeRowsMatchTruth === true,
    allSimulatedSafeRowsMatchDryRunDerived:
      runtimePostApplyVerification?.validation
        ?.allSimulatedSafeRowsMatchDryRunDerived === true,
    allPostApplyColorsAllowed:
      runtimePostApplyVerification?.validation?.allPostApplyColorsAllowed === true,
    allTruthOverlayColorsAllowed:
      runtimePostApplyVerification?.validation?.allTruthOverlayColorsAllowed === true,
    onlyThreePaintColorsPlusUncolored:
      runtimePostApplyVerification?.validation?.onlyThreePaintColorsPlusUncolored === true,
    noFalseGreenAfterApply:
      runtimePostApplyVerification?.validation?.noFalseGreenAfterApply === true,
    noWikipediaTruthSource:
      runtimePostApplyVerification?.validation?.noWikipediaTruthSource === true,
    preflightFailClosed:
      runtimePostApplyVerification?.validation?.preflightFailClosed === true,
    executionFailClosed:
      runtimePostApplyVerification?.validation?.executionFailClosed === true,
    rollbackReady:
      runtimePostApplyVerification?.validation?.rollbackReady === true &&
      runtimeApplyRollbackPlan?.rollbackStatus ===
        "RUNTIME_APPLY_ROLLBACK_PLAN_READY_NO_MUTATION",
    appliedRowsZero:
      runtimePostApplyVerification?.validation?.appliedRowsZero === true,
    noProdMutation:
      runtimePostApplyVerification?.validation?.noProdMutation === true,
    noSsotMutation:
      runtimePostApplyVerification?.validation?.noSsotMutation === true,
    noMapMutation:
      runtimePostApplyVerification?.validation?.noMapMutation === true,
    safePostApplyColorCounts:
      runtimePostApplyVerification?.counts?.safePostApplyColor || {},
    readinessDecisionCounts:
      runtimePostApplyVerification?.counts?.readinessDecision || {},
    blockedDecisionCounts:
      runtimePostApplyVerification?.counts?.blockedDecision || {},
    targetPlanHashCounts:
      runtimePostApplyVerification?.counts?.targetPlanHash || {},
    postApplyDispositionCounts:
      runtimePostApplyVerification?.counts?.postApplyDisposition || {},
    guardrails: Array.isArray(runtimePostApplyVerification?.guardrails)
      ? runtimePostApplyVerification.guardrails
      : [],
    hashProofCount: Array.isArray(runtimePostApplyVerification?.hashProof)
      ? runtimePostApplyVerification.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_POST_APPLY_VERIFICATION_PATH),
  };
}

function buildBlockerExitDossierCoverage(runtimeAuthorizationReadiness, runtimeTruthConflictAudit, disputedTargetMapping, runtimePostApplyVerification, blockerExitDossier) {
  const readinessBlockedGeos = new Set(
    (Array.isArray(runtimeAuthorizationReadiness?.rows)
      ? runtimeAuthorizationReadiness.rows
      : [])
      .filter((row) => String(row.decision || "").startsWith("BLOCKED_"))
      .map((row) => row.geo)
      .filter(Boolean),
  );
  const dossierRows = Array.isArray(blockerExitDossier?.rows)
    ? blockerExitDossier.rows
    : [];
  const dossierGeos = new Set(dossierRows.map((row) => row.geo).filter(Boolean));
  return {
    artifactExists: Boolean(blockerExitDossier),
    nonMutating: blockerExitDossier?.nonMutating === true,
    localOnly: blockerExitDossier?.localOnly === true,
    dossierStatus: blockerExitDossier?.dossierStatus || "MISSING",
    rowsTotal: dossierRows.length,
    readinessBlockedRows: readinessBlockedGeos.size,
    missingGeos: [...readinessBlockedGeos].filter((geo) => !dossierGeos.has(geo)).sort(),
    extraGeos: [...dossierGeos].filter((geo) => !readinessBlockedGeos.has(geo)).sort(),
    blockedRowsTotal: Number(blockerExitDossier?.summary?.blockedRowsTotal || 0),
    disputedTargetBlockers: Number(blockerExitDossier?.summary?.disputedTargetBlockers || 0),
    runtimeTruthConflictBlockers: Number(blockerExitDossier?.summary?.runtimeTruthConflictBlockers || 0),
    exitReadyNow: Number(blockerExitDossier?.summary?.exitReadyNow || 0),
    excludedFromSafeApply: Number(blockerExitDossier?.summary?.excludedFromSafeApply || 0),
    safeApplyRows: Number(blockerExitDossier?.summary?.safeApplyRows || 0),
    noOpRows: Number(blockerExitDossier?.summary?.noOpRows || 0),
    postApplyTruthAlignedRows: Number(blockerExitDossier?.summary?.postApplyTruthAlignedRows || 0),
    postApplyCoverageRows: Number(blockerExitDossier?.summary?.postApplyCoverageRows || 0),
    targetFiles: Number(blockerExitDossier?.summary?.targetFiles || 0),
    appliedRows: Number(blockerExitDossier?.appliedRows || 0),
    productionTouched: blockerExitDossier?.productionTouched === true,
    ssotMutationAttempted: blockerExitDossier?.ssotMutationAttempted === true,
    mapMutationAttempted: blockerExitDossier?.mapMutationAttempted === true,
    validation: blockerExitDossier?.validation || {},
    blockerClassCounts: blockerExitDossier?.counts?.blockerClass || {},
    readinessDecisionCounts: blockerExitDossier?.counts?.readinessDecision || {},
    proposedTruthColorCounts: blockerExitDossier?.counts?.proposedTruthColor || {},
    currentRuntimeColorCounts: blockerExitDossier?.counts?.currentRuntimeColor || {},
    runtimeConflictClassCounts: blockerExitDossier?.counts?.runtimeConflictClass || {},
    guardrails: Array.isArray(blockerExitDossier?.guardrails)
      ? blockerExitDossier.guardrails
      : [],
    hashProofCount: Array.isArray(blockerExitDossier?.hashProof)
      ? blockerExitDossier.hashProof.length
      : 0,
    upstreamReadinessBlockedRows: Number(runtimeAuthorizationReadiness?.summary?.blockedRows || 0),
    upstreamConflictRows: Number(runtimeTruthConflictAudit?.summary?.runtimeTruthConflictRows || 0),
    upstreamDisputedRows: Number(disputedTargetMapping?.summary?.unresolvedDisputedTargets || 0),
    upstreamPostApplyBlockedRows: Number(runtimePostApplyVerification?.summary?.blockedRows || 0),
    artifactPath: path.relative(ROOT, BLOCKER_EXIT_DOSSIER_PATH),
  };
}

function buildLegalKnowledgeAxisMatrixCoverage(legalKnowledgeAxisMatrix) {
  return {
    artifactExists: Boolean(legalKnowledgeAxisMatrix),
    nonMutating: legalKnowledgeAxisMatrix?.nonMutating === true,
    localOnly: legalKnowledgeAxisMatrix?.localOnly === true,
    matrixStatus: legalKnowledgeAxisMatrix?.matrixStatus || "MISSING",
    rowsTotal: Number(legalKnowledgeAxisMatrix?.rowsTotal || 0),
    rowsExpected: Number(legalKnowledgeAxisMatrix?.rowsExpected || 0),
    requiredAxisTotal: Number(legalKnowledgeAxisMatrix?.requiredAxisTotal || 0),
    cellsTotal: Number(legalKnowledgeAxisMatrix?.cellsTotal || 0),
    knownAxisCells: Number(legalKnowledgeAxisMatrix?.summary?.knownAxisCells || 0),
    unknownAxisCells: Number(legalKnowledgeAxisMatrix?.summary?.unknownAxisCells || 0),
    rowsWithUnknownAxes: Number(legalKnowledgeAxisMatrix?.summary?.rowsWithUnknownAxes || 0),
    rowsWithAllAxesKnown: Number(legalKnowledgeAxisMatrix?.summary?.rowsWithAllAxesKnown || 0),
    appliedRows: Number(legalKnowledgeAxisMatrix?.appliedRows || 0),
    productionTouched: legalKnowledgeAxisMatrix?.productionTouched === true,
    ssotMutationAttempted: legalKnowledgeAxisMatrix?.ssotMutationAttempted === true,
    mapMutationAttempted: legalKnowledgeAxisMatrix?.mapMutationAttempted === true,
    validation: legalKnowledgeAxisMatrix?.validation || {},
    axisStatusCounts: legalKnowledgeAxisMatrix?.counts?.axisStatus || {},
    evidenceClassCounts: legalKnowledgeAxisMatrix?.counts?.evidenceClass || {},
    guardrails: Array.isArray(legalKnowledgeAxisMatrix?.guardrails)
      ? legalKnowledgeAxisMatrix.guardrails
      : [],
    hashProofCount: Array.isArray(legalKnowledgeAxisMatrix?.hashProof)
      ? legalKnowledgeAxisMatrix.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH),
  };
}

function buildRuntimeBlockerAxisReconciliationCoverage(runtimeBlockerAxisReconciliation) {
  return {
    artifactExists: Boolean(runtimeBlockerAxisReconciliation),
    nonMutating: runtimeBlockerAxisReconciliation?.nonMutating === true,
    localOnly: runtimeBlockerAxisReconciliation?.localOnly === true,
    safeToAutoApply: runtimeBlockerAxisReconciliation?.safeToAutoApply === true,
    dossierStatus: runtimeBlockerAxisReconciliation?.dossierStatus || "MISSING",
    blockerRowsTotal: Number(runtimeBlockerAxisReconciliation?.summary?.blockerRowsTotal || 0),
    runtimeTruthConflictRows: Number(runtimeBlockerAxisReconciliation?.summary?.runtimeTruthConflictRows || 0),
    disputedScopeRows: Number(runtimeBlockerAxisReconciliation?.summary?.disputedScopeRows || 0),
    freshReconciledRows: Number(runtimeBlockerAxisReconciliation?.summary?.freshReconciledRows || 0),
    pendingFreshAxisRows: Number(runtimeBlockerAxisReconciliation?.summary?.pendingFreshAxisRows || 0),
    candidateTruthColorChangeRows: Number(
      runtimeBlockerAxisReconciliation?.summary?.candidateTruthColorChangeRows || 0,
    ),
    candidateGreenRows: Number(runtimeBlockerAxisReconciliation?.summary?.candidateGreenRows || 0),
    candidateYellowRows: Number(runtimeBlockerAxisReconciliation?.summary?.candidateYellowRows || 0),
    candidateRedRows: Number(runtimeBlockerAxisReconciliation?.summary?.candidateRedRows || 0),
    candidateUnknownRows: Number(
      runtimeBlockerAxisReconciliation?.summary?.candidateUnknownRows || 0,
    ),
    candidateKnownThreeColorRows: Number(
      runtimeBlockerAxisReconciliation?.summary?.candidateKnownThreeColorRows || 0,
    ),
    candidateKnownTruthColorRows: Number(
      runtimeBlockerAxisReconciliation?.summary?.candidateKnownTruthColorRows || 0,
    ),
    candidateFalseGreenCorrectionRows: Number(
      runtimeBlockerAxisReconciliation?.summary?.candidateFalseGreenCorrectionRows || 0,
    ),
    appliedRows: Number(runtimeBlockerAxisReconciliation?.appliedRows || 0),
    productionTouched: runtimeBlockerAxisReconciliation?.productionTouched === true,
    ssotMutationAttempted: runtimeBlockerAxisReconciliation?.ssotMutationAttempted === true,
    mapMutationAttempted: runtimeBlockerAxisReconciliation?.mapMutationAttempted === true,
    validation: runtimeBlockerAxisReconciliation?.validation || {},
    statusCounts: runtimeBlockerAxisReconciliation?.summary?.rowsByStatus || {},
    previousTruthColorCounts: runtimeBlockerAxisReconciliation?.summary?.previousTruthColor || {},
    freshTruthColorCounts: runtimeBlockerAxisReconciliation?.summary?.freshTruthColor || {},
    guardrails: Array.isArray(runtimeBlockerAxisReconciliation?.guardrails)
      ? runtimeBlockerAxisReconciliation.guardrails
      : [],
    rowsTotal: Array.isArray(runtimeBlockerAxisReconciliation?.rows)
      ? runtimeBlockerAxisReconciliation.rows.length
      : 0,
    hashProofCount: Array.isArray(runtimeBlockerAxisReconciliation?.hashProof)
      ? runtimeBlockerAxisReconciliation.hashProof.length
      : 0,
    artifactPath: path.relative(ROOT, RUNTIME_BLOCKER_AXIS_RECONCILIATION_PATH),
  };
}

function buildGlobalRequirements(report, rowAudits, matrixRows, colorProposals, primaryLawBlockersByGeo, colorApplyPlan, colorApplyGate, colorReviewDossier, colorReviewClosureDossier, colorAuthorizationPacket, colorApplyPreview, colorTargetResolver, disputedTargetMapping, runtimeCurrentReconciliation, runtimeAuthorizationReadiness, runtimeTruthConflictAudit, runtimeSafeAuthorizationPacket, threeColorOverlay, runtimeApplyDryRunDiff, runtimeApplyPreflight, runtimeApplyExecution, runtimeApplyRollbackPlan, runtimePostApplyVerification, blockerExitDossier, legalKnowledgeAxisMatrix, runtimeBlockerAxisReconciliation, finalReconciliation) {
  const geos = report.rows.map((row) => row.geo);
  const finalReconciliationEvidence = {
    artifactExists: Boolean(finalReconciliation),
    reportVersion: String(finalReconciliation?.reportVersion || "MISSING"),
    complete: finalReconciliation?.complete === true,
    rowsTotal: Number(finalReconciliation?.rowsTotal || 0),
    rowsExpected: Number(finalReconciliation?.rowsExpected || 0),
    currentMapCaptureComplete:
      finalReconciliation?.acceptance?.currentMapCaptureComplete === true,
    freshOfficialVisualReviewComplete:
      finalReconciliation?.acceptance?.freshOfficialVisualReviewComplete === true,
    freshVisualEvidenceGeoCount: Array.isArray(
      finalReconciliation?.acceptance?.freshOfficialVisualReviewGeos,
    )
      ? finalReconciliation.acceptance.freshOfficialVisualReviewGeos.length
      : 0,
    liveMapCaptureGeoCount: Array.isArray(
      finalReconciliation?.acceptance?.liveMapCapturedGeos,
    )
      ? finalReconciliation.acceptance.liveMapCapturedGeos.length
      : 0,
  };
  const sourceFiles = [
    path.join(ROOT, "apps/web/src/lib/wikiTruthColorEngine.js"),
    path.join(ROOT, "apps/web/src/lib/wikiTruthColorComparison.ts"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_truth_audit_report.mjs"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_three_color_overlay.mjs"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_runtime_apply_dry_run_diff.mjs"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_runtime_apply_preflight.mjs"),
    path.join(ROOT, "tools/wiki/apply_wiki_truth_307_runtime_axes.mjs"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_runtime_apply_rollback_plan.mjs"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_runtime_post_apply_verification.mjs"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_blocker_exit_dossier.mjs"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_legal_knowledge_axis_matrix.mjs"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_completion_gap_dossier.mjs"),
    path.join(ROOT, "tools/wiki/build_wiki_truth_307_runtime_blocker_axis_reconciliation.mjs"),
  ];
  const exceptionHits = sourceFiles.flatMap((sourcePath) =>
    sourceHasGeoException(sourcePath, geos).map((geo) => ({
      geo,
      sourcePath: path.relative(ROOT, sourcePath),
    })),
  );
  const guardCases = buildSystemGuards();
  const declaredWikiTaxonomy = new Set(report.wikiExtendedTaxonomy || report.audit?.wiki?.extendedTaxonomy || []);
  const rowExtendedStatuses = new Set(
    report.rows.map((row) => row.diagnostics?.wiki?.extended?.status).filter(Boolean),
  );
  const colorProposalCoverage = buildColorProposalCoverage(report, colorProposals);
  const colorApplyPlanCoverage = buildColorApplyPlanCoverage(colorProposals, colorApplyPlan);
  const colorApplyGateCoverage = buildColorApplyGateCoverage(colorApplyPlan, colorApplyGate);
  const colorReviewDossierCoverage = buildColorReviewDossierCoverage(
    colorProposals,
    colorApplyPlan,
    colorApplyGate,
    colorReviewDossier,
  );
  const colorReviewClosureDossierCoverage = buildColorReviewClosureDossierCoverage(
    colorReviewClosureDossier,
  );
  const colorAuthorizationPacketCoverage = buildColorAuthorizationPacketCoverage(
    colorProposals,
    colorApplyPlan,
    colorApplyGate,
    colorReviewDossier,
    colorAuthorizationPacket,
  );
  const colorApplyPreviewCoverage = buildColorApplyPreviewCoverage(
    colorProposals,
    colorAuthorizationPacket,
    colorApplyPreview,
  );
  const colorTargetResolverCoverage = buildColorTargetResolverCoverage(
    colorProposals,
    colorAuthorizationPacket,
    colorTargetResolver,
  );
  const disputedTargetMappingCoverage = buildDisputedTargetMappingCoverage(
    colorTargetResolver,
    disputedTargetMapping,
  );
  const runtimeCurrentReconciliationCoverage = buildRuntimeCurrentReconciliationCoverage(
    colorTargetResolver,
    runtimeCurrentReconciliation,
  );
  const runtimeAuthorizationReadinessCoverage = buildRuntimeAuthorizationReadinessCoverage(
    colorAuthorizationPacket,
    colorTargetResolver,
    runtimeAuthorizationReadiness,
  );
  const runtimeTruthConflictAuditCoverage = buildRuntimeTruthConflictAuditCoverage(
    runtimeAuthorizationReadiness,
    runtimeTruthConflictAudit,
  );
  const runtimeSafeAuthorizationPacketCoverage = buildRuntimeSafeAuthorizationPacketCoverage(
    runtimeAuthorizationReadiness,
    runtimeSafeAuthorizationPacket,
  );
  const threeColorOverlayCoverage = buildThreeColorOverlayCoverage(
    report,
    threeColorOverlay,
  );
  const runtimeApplyDryRunDiffCoverage = buildRuntimeApplyDryRunDiffCoverage(
    runtimeSafeAuthorizationPacket,
    runtimeApplyDryRunDiff,
  );
  const runtimeApplyPreflightCoverage = buildRuntimeApplyPreflightCoverage(
    runtimeApplyDryRunDiff,
    runtimeApplyPreflight,
  );
  const runtimeApplyExecutionCoverage = buildRuntimeApplyExecutionCoverage(
    runtimeApplyDryRunDiff,
    runtimeApplyPreflight,
    runtimeApplyExecution,
  );
  const runtimeApplyRollbackPlanCoverage = buildRuntimeApplyRollbackPlanCoverage(
    runtimeApplyDryRunDiff,
    runtimeApplyExecution,
    runtimeApplyRollbackPlan,
  );
  const runtimePostApplyVerificationCoverage = buildRuntimePostApplyVerificationCoverage(
    runtimeApplyDryRunDiff,
    runtimeAuthorizationReadiness,
    runtimeSafeAuthorizationPacket,
    threeColorOverlay,
    runtimeApplyRollbackPlan,
    runtimePostApplyVerification,
  );
  const blockerExitDossierCoverage = buildBlockerExitDossierCoverage(
    runtimeAuthorizationReadiness,
    runtimeTruthConflictAudit,
    disputedTargetMapping,
    runtimePostApplyVerification,
    blockerExitDossier,
  );
  const legalKnowledgeAxisMatrixCoverage = buildLegalKnowledgeAxisMatrixCoverage(
    legalKnowledgeAxisMatrix,
  );
  const runtimeBlockerAxisReconciliationCoverage =
    buildRuntimeBlockerAxisReconciliationCoverage(
      runtimeBlockerAxisReconciliation,
    );
  const requiredWikiTaxonomyPresent = REQUIRED_EXTENDED_WIKI_STATUSES.every((status) =>
    declaredWikiTaxonomy.has(status),
  );
  const rowExtendedStatusesValid = report.rows.every((row) =>
    ACCEPTED_EXTENDED_WIKI_STATUSES.has(row.diagnostics?.wiki?.extended?.status),
  );

  return {
    processed307: evaluation(
      report.rowsTotal === TOTAL_GEO_EXPECTED && matrixRows.length === TOTAL_GEO_EXPECTED
        ? "PROVEN"
        : "FAILED",
      "Report and matrix must both cover the full 307-GEO universe.",
      { reportRows: report.rowsTotal, matrixRows: matrixRows.length, expected: TOTAL_GEO_EXPECTED },
    ),
    currentFinalReconciliationGate: evaluation(
      finalReconciliationEvidence.artifactExists &&
      finalReconciliationEvidence.rowsTotal === TOTAL_GEO_EXPECTED &&
      finalReconciliationEvidence.rowsExpected === TOTAL_GEO_EXPECTED &&
      finalReconciliationEvidence.complete === true &&
      finalReconciliationEvidence.currentMapCaptureComplete === true &&
      finalReconciliationEvidence.freshOfficialVisualReviewComplete === true
        ? "PROVEN"
        : "INCOMPLETE",
      "Acceptance must mirror the current independent final reconciliation: every GEO needs strict official visual evidence and a live user-visible map capture before the audit can be complete.",
      finalReconciliationEvidence,
    ),
    primaryLawAll307: evaluation(
      rowAudits.every((row) => row.requirements.primaryLaw.status === "PROVEN")
        ? "PROVEN"
        : "INCOMPLETE",
      "Every GEO must have direct/effective primary cannabis-law evidence or a documented no-applicable-territory-law scope exception.",
      primaryLawAll307Evidence(rowAudits, primaryLawBlockersByGeo),
    ),
    independentLegalInterpretationAll307: evaluation(
      rowAudits.every((row) => row.requirements.legalInterpretation.status === "PROVEN")
        ? "PROVEN"
        : "INCOMPLETE",
      "Every GEO must have an independent Legal Interpretation layer.",
      countRequirementRows(rowAudits, "legalInterpretation"),
    ),
    wikiAuditAll307: evaluation(
      rowAudits.every((row) => row.requirements.wikipediaAudit.status === "PROVEN")
        ? "PROVEN"
        : "INCOMPLETE",
      "Every GEO must have Wikipedia assessed as a separate audit object.",
      countRequirementRows(rowAudits, "wikipediaAudit"),
    ),
    wikiExtendedTaxonomy: evaluation(
      requiredWikiTaxonomyPresent && rowExtendedStatusesValid
        ? "PROVEN"
        : "INCOMPLETE",
      "Report must declare the pasted extended Wikipedia taxonomy and assign one accepted extended status to every GEO.",
      {
        required: REQUIRED_EXTENDED_WIKI_STATUSES,
        declared: [...declaredWikiTaxonomy].sort(),
        rowStatusesPresent: [...rowExtendedStatuses].sort(),
        rowStatusesValid: rowExtendedStatusesValid,
      },
    ),
    ssotComparedAll307: evaluation(
      rowAudits.every((row) => row.requirements.ssotComparison.status === "PROVEN")
        ? "PROVEN"
        : "INCOMPLETE",
      "Every GEO must be compared against SSOT/project status.",
      countRequirementRows(rowAudits, "ssotComparison"),
    ),
    deterministicColorAll307: evaluation(
      rowAudits.every((row) => row.requirements.colorAudit.status === "PROVEN")
        ? "PROVEN"
        : "INCOMPLETE",
      "Every GEO must have an allowed truth color plus deterministic rule metadata.",
      countRequirementRows(rowAudits, "colorAudit"),
    ),
    threeColorOverlayReady: evaluation(
      threeColorOverlayCoverage.artifactExists &&
      threeColorOverlayCoverage.nonMutating &&
      threeColorOverlayCoverage.localOnly &&
      threeColorOverlayCoverage.overlayStatus ===
        "THREE_COLOR_OVERLAY_READY_NO_MUTATION" &&
      threeColorOverlayCoverage.rowsTotal === TOTAL_GEO_EXPECTED &&
      threeColorOverlayCoverage.reportRows === TOTAL_GEO_EXPECTED &&
      threeColorOverlayCoverage.missingGeos.length === 0 &&
      threeColorOverlayCoverage.extraGeos.length === 0 &&
      threeColorOverlayCoverage.appliedRows === 0 &&
      threeColorOverlayCoverage.productionTouched === false &&
      threeColorOverlayCoverage.ssotMutationAttempted === false &&
      threeColorOverlayCoverage.mapMutationAttempted === false &&
      threeColorOverlayCoverage.allowedTruthColorsOnly &&
      threeColorOverlayCoverage.allowedPaintPaletteOnly &&
      threeColorOverlayCoverage.paletteHasOnlyThreePaintColors &&
      threeColorOverlayCoverage.paintColorsUsedTotal <= 3 &&
      threeColorOverlayCoverage.unknownRowsUncolored &&
      threeColorOverlayCoverage.nonUnknownRowsPainted &&
      threeColorOverlayCoverage.noWikipediaTruthSource &&
      threeColorOverlayCoverage.deterministicFromTruthReport &&
      threeColorOverlayCoverage.rowsMatchTruthReport &&
      threeColorOverlayCoverage.colorCountsAddUp &&
      threeColorOverlayCoverage.paintCountsAddUp &&
      threeColorOverlayCoverage.noMutation &&
      threeColorOverlayCoverage.appliedRowsZero &&
      threeColorOverlayCoverage.countsMatchTruthReport &&
      threeColorOverlayCoverage.hashProofCount >= 1
        ? "PROVEN"
        : "INCOMPLETE",
      "A local dry overlay for all 307 GEO must use only GREEN/YELLOW/RED paint plus uncolored UNKNOWN rows, derive from the Truth report, and prove Wikipedia is audit-only before any map/status mutation.",
      threeColorOverlayCoverage,
    ),
    lawTextEvidenceAll307: evaluation(
      rowAudits.every((row) => row.requirements.lawTextEvidence.status === "PROVEN")
        ? "PROVEN"
        : "INCOMPLETE",
      "Every GEO must expose saved law/review text basis for the truth audit row.",
      countRequirementRows(rowAudits, "lawTextEvidence"),
    ),
    visualProofAll307: evaluation(
      rowAudits.every((row) => row.requirements.visualProof.status === "PROVEN")
        ? "PROVEN"
        : "INCOMPLETE",
      "Every GEO must retain visual review and screenshot proof.",
      countRequirementRows(rowAudits, "visualProof"),
    ),
    colorReviewClosedAll307: evaluation(
      colorReviewClosureDossierCoverage.artifactExists &&
      colorReviewClosureDossierCoverage.nonMutating &&
      colorReviewClosureDossierCoverage.localOnly &&
      colorReviewClosureDossierCoverage.closureStatus ===
        "COLOR_REVIEW_CLOSED_ALL_307_LOCAL_NO_MUTATION" &&
      colorReviewClosureDossierCoverage.summary?.localColorReviewClosedAll307 === true &&
      colorReviewClosureDossierCoverage.summary?.truthRows === TOTAL_GEO_EXPECTED &&
      colorReviewClosureDossierCoverage.summary?.colorReviewRows ===
        colorReviewClosureDossierCoverage.summary?.colorDifferenceRows &&
      colorReviewClosureDossierCoverage.summary?.reviewedRows ===
        colorReviewClosureDossierCoverage.summary?.colorReviewRows &&
      colorReviewClosureDossierCoverage.summary?.reviewDossierBlockedRows === 0 &&
      colorReviewClosureDossierCoverage.summary?.runtimeDeltasDocumented === true &&
      colorReviewClosureDossierCoverage.summary?.postApplyTruthAlignedRows +
        colorReviewClosureDossierCoverage.summary?.blockedRows === TOTAL_GEO_EXPECTED &&
      colorReviewClosureDossierCoverage.summary?.postApplyCoverageRows === TOTAL_GEO_EXPECTED &&
      colorReviewClosureDossierCoverage.appliedRows === 0 &&
      colorReviewClosureDossierCoverage.productionTouched === false &&
      colorReviewClosureDossierCoverage.ssotMutationAttempted === false &&
      colorReviewClosureDossierCoverage.mapMutationAttempted === false &&
      colorReviewClosureDossierCoverage.validation?.localColorReviewClosedAll307 === true &&
      colorReviewClosureDossierCoverage.validation?.noWikipediaTruthSource === true &&
      colorReviewClosureDossierCoverage.validation?.appliedRowsZero === true &&
      colorReviewClosureDossierCoverage.validation?.noProdMutation === true &&
      colorReviewClosureDossierCoverage.validation?.noSsotMutation === true &&
      colorReviewClosureDossierCoverage.validation?.noMapMutation === true
        ? "PROVEN"
        : "INCOMPLETE",
      "Local color review is closed when every current truth/current color difference has a reviewed non-mutating dossier row, zero unresolved blockers, and post-apply proof covers 307/307; this does not authorize SSOT/map/prod writes.",
      {
        colorReviewRows: report.counts?.totals?.colorReviewRows || 0,
        colorCounts: report.counts?.color || {},
        closure: colorReviewClosureDossierCoverage,
      },
    ),
    colorProposalsAllDifferences: evaluation(
      colorProposalCoverage.artifactExists &&
      colorProposalCoverage.nonMutating &&
      colorProposalCoverage.expectedDifferences === colorProposalCoverage.proposalsTotal &&
      colorProposalCoverage.missingGeos.length === 0 &&
      colorProposalCoverage.extraGeos.length === 0
        ? "PROVEN"
        : "INCOMPLETE",
      "Every current truth/current color difference must be represented in the non-mutating local proposal artifact.",
      colorProposalCoverage,
    ),
    colorApplyPlanReady: evaluation(
      colorApplyPlanCoverage.artifactExists &&
      colorApplyPlanCoverage.nonMutating &&
      colorApplyPlanCoverage.requiresExplicitAuthorization &&
      colorApplyPlanCoverage.safeToAutoApply === false &&
      colorApplyPlanCoverage.applyStatus === "PENDING_AUTHORIZATION" &&
      colorApplyPlanCoverage.proposalRows === colorApplyPlanCoverage.planRows &&
      colorApplyPlanCoverage.missingGeos.length === 0 &&
      colorApplyPlanCoverage.extraGeos.length === 0 &&
      colorApplyPlanCoverage.appliedRows === 0 &&
      colorApplyPlanCoverage.rowsMatchProposals &&
      colorApplyPlanCoverage.geosMatchProposals &&
      colorApplyPlanCoverage.allowedTargetColorsOnly
        ? "PROVEN"
        : "INCOMPLETE",
      "Every non-matching current/truth color row must have a deterministic non-mutating apply plan that remains pending explicit authorization.",
      colorApplyPlanCoverage,
    ),
    colorApplyGateFailClosed: evaluation(
      colorApplyGateCoverage.artifactExists &&
      colorApplyGateCoverage.nonMutating &&
      colorApplyGateCoverage.localOnly &&
      colorApplyGateCoverage.gateStatus === "BLOCKED_FAIL_CLOSED" &&
      colorApplyGateCoverage.planRows === colorApplyGateCoverage.gateRows &&
      colorApplyGateCoverage.missingGeos.length === 0 &&
      colorApplyGateCoverage.extraGeos.length === 0 &&
      colorApplyGateCoverage.appliedRows === 0 &&
      colorApplyGateCoverage.mutationAttempted === false &&
      colorApplyGateCoverage.ssotMutationAttempted === false &&
      colorApplyGateCoverage.mapMutationAttempted === false &&
      colorApplyGateCoverage.productionTouched === false &&
      colorApplyGateCoverage.authorizationPresent === false &&
      colorApplyGateCoverage.ssotWriteEnabled === false &&
      colorApplyGateCoverage.rowsMatchPlan &&
      colorApplyGateCoverage.failClosedByDefault &&
      colorApplyGateCoverage.blockingReasons.includes("AUTHORIZATION_MISSING") &&
      colorApplyGateCoverage.blockingReasons.includes("SSOT_WRITE_NOT_ENABLED")
        ? "PROVEN"
        : "INCOMPLETE",
      "Default local apply path must be fail-closed and prove that no SSOT/map/prod mutation can occur without explicit authorization; primary-law blockers are reported separately when present.",
      colorApplyGateCoverage,
    ),
    colorReviewDossierReady: evaluation(
      colorReviewDossierCoverage.artifactExists &&
      colorReviewDossierCoverage.nonMutating &&
      colorReviewDossierCoverage.localOnly &&
      colorReviewDossierCoverage.proposalRows === colorReviewDossierCoverage.dossierRows &&
      colorReviewDossierCoverage.planRows === colorReviewDossierCoverage.dossierRows &&
      colorReviewDossierCoverage.gateRows === colorReviewDossierCoverage.dossierRows &&
      colorReviewDossierCoverage.missingGeos.length === 0 &&
      colorReviewDossierCoverage.extraGeos.length === 0 &&
      colorReviewDossierCoverage.appliedRows === 0 &&
      colorReviewDossierCoverage.allRowsHaveReviewDecision &&
      colorReviewDossierCoverage.allRowsHaveLegalBasisClass &&
      colorReviewDossierCoverage.allowedColorsOnly &&
      colorReviewDossierCoverage.rowsMatchProposals &&
      colorReviewDossierCoverage.rowsMatchPlan &&
      colorReviewDossierCoverage.rowsMatchGate
        ? "PROVEN"
        : "INCOMPLETE",
      "Every current truth/current color difference must have a local non-mutating review dossier row tying proposal, apply disposition, legal basis, and fail-closed gate status together.",
      colorReviewDossierCoverage,
    ),
    colorReviewClosureBoundaryReady: evaluation(
      colorReviewClosureDossierCoverage.artifactExists &&
      colorReviewClosureDossierCoverage.nonMutating &&
      colorReviewClosureDossierCoverage.localOnly &&
      colorReviewClosureDossierCoverage.safeToAutoApply === false &&
      [
        "COLOR_REVIEW_CLOSURE_BOUNDARY_READY_NO_MUTATION",
        "COLOR_REVIEW_CLOSED_ALL_307_LOCAL_NO_MUTATION",
      ].includes(colorReviewClosureDossierCoverage.closureStatus) &&
      colorReviewClosureDossierCoverage.colorReviewClosureClaimAllowed ===
        (colorReviewClosureDossierCoverage.summary?.localColorReviewClosedAll307 === true) &&
      colorReviewClosureDossierCoverage.appliedRows === 0 &&
      colorReviewClosureDossierCoverage.productionTouched === false &&
      colorReviewClosureDossierCoverage.ssotMutationAttempted === false &&
      colorReviewClosureDossierCoverage.mapMutationAttempted === false &&
      colorReviewClosureDossierCoverage.summary.truthRows === 307 &&
      colorReviewClosureDossierCoverage.summary.colorReviewRows ===
        colorReviewClosureDossierCoverage.summary.colorDifferenceRows &&
      colorReviewClosureDossierCoverage.summary.reviewedRows ===
        colorReviewClosureDossierCoverage.summary.colorReviewRows &&
      colorReviewClosureDossierCoverage.summary.readyForAuthorizedRuntimeAxisPatch ===
        colorReviewClosureDossierCoverage.summary.safeRows &&
      colorReviewClosureDossierCoverage.summary.readyForAuthorizedRuntimeAxisPatch +
        colorReviewClosureDossierCoverage.summary.noOpRuntimeAlreadyTruthTarget +
        colorReviewClosureDossierCoverage.summary.blockedRows ===
        colorReviewClosureDossierCoverage.summary.runtimeReadinessRows &&
      colorReviewClosureDossierCoverage.summary.postApplyTruthAlignedRows +
        colorReviewClosureDossierCoverage.summary.blockedRows ===
        colorReviewClosureDossierCoverage.summary.postApplyCoverageRows &&
      colorReviewClosureDossierCoverage.summary.postApplyCoverageRows === 307 &&
      colorReviewClosureDossierCoverage.summary.blockerExitRows ===
        colorReviewClosureDossierCoverage.summary.blockedRows &&
      colorReviewClosureDossierCoverage.remainingClosureBlockerCount ===
        colorReviewClosureDossierCoverage.summary.blockedRows &&
      colorReviewClosureDossierCoverage.validation.truthRows307 === true &&
      colorReviewClosureDossierCoverage.validation.reviewRowsMatchProposals === true &&
      colorReviewClosureDossierCoverage.validation.reviewedRowsMatchReviewRows === true &&
      colorReviewClosureDossierCoverage.validation.readyNoOpBlockedRowsAddUp === true &&
      colorReviewClosureDossierCoverage.validation.safeRowsMatchReadyRows === true &&
      colorReviewClosureDossierCoverage.validation.blockerRowsMatchReadinessBlocked === true &&
      colorReviewClosureDossierCoverage.validation.postApplyAlignedPlusBlockedRows307 === true &&
      (colorReviewClosureDossierCoverage.validation.colorReviewClosureClaimStillBlocked === true ||
        colorReviewClosureDossierCoverage.validation.colorReviewClosureClaimAllowedMatchesLocalClosure === true) &&
      colorReviewClosureDossierCoverage.validation.noWikipediaTruthSource === true &&
      colorReviewClosureDossierCoverage.validation.localOnly === true &&
      colorReviewClosureDossierCoverage.validation.nonMutating === true &&
      colorReviewClosureDossierCoverage.validation.appliedRowsZero === true &&
      colorReviewClosureDossierCoverage.validation.noProdMutation === true &&
      colorReviewClosureDossierCoverage.validation.noSsotMutation === true &&
      colorReviewClosureDossierCoverage.validation.noMapMutation === true &&
      colorReviewClosureDossierCoverage.guardrails.includes("COLOR_REVIEW_EVIDENCE_CLOSED_DOES_NOT_AUTHORIZE_WRITE") &&
      (colorReviewClosureDossierCoverage.guardrails.includes("CURRENT_MAP_COLOR_MISMATCHES_KEEP_COLOR_REVIEW_CLOSED_ALL_307_INCOMPLETE") ||
        colorReviewClosureDossierCoverage.guardrails.includes("CURRENT_MAP_COLOR_MISMATCHES_DO_NOT_PREVENT_LOCAL_REVIEW_CLOSURE")) &&
      colorReviewClosureDossierCoverage.guardrails.includes("NO_SSOT_OR_MAP_MUTATION") &&
      colorReviewClosureDossierCoverage.hashProofCount >= 7
        ? "PROVEN"
        : "INCOMPLETE",
      "A local non-mutating closure dossier must prove every color-difference row is reviewed and every runtime delta is documented and excluded from writes; runtime alignment is not required because runtime mutation is explicitly out of scope.",
      colorReviewClosureDossierCoverage,
    ),
    colorAuthorizationPacketReady: evaluation(
      colorAuthorizationPacketCoverage.artifactExists &&
      colorAuthorizationPacketCoverage.nonMutating &&
      colorAuthorizationPacketCoverage.localOnly &&
      colorAuthorizationPacketCoverage.packetStatus ===
        "AUTHORIZATION_PACKET_READY_PENDING_EXPLICIT_APPROVAL" &&
      colorAuthorizationPacketCoverage.proposalRows ===
        colorAuthorizationPacketCoverage.packetRows &&
      colorAuthorizationPacketCoverage.planRows ===
        colorAuthorizationPacketCoverage.packetRows &&
      colorAuthorizationPacketCoverage.gateRows ===
        colorAuthorizationPacketCoverage.packetRows &&
      colorAuthorizationPacketCoverage.dossierRows ===
        colorAuthorizationPacketCoverage.packetRows &&
      colorAuthorizationPacketCoverage.missingGeos.length === 0 &&
      colorAuthorizationPacketCoverage.extraGeos.length === 0 &&
      colorAuthorizationPacketCoverage.appliedRows === 0 &&
      colorAuthorizationPacketCoverage.wouldApplyRowsAfterAuthorization ===
        colorAuthorizationPacketCoverage.packetRows &&
      colorAuthorizationPacketCoverage.inputHashProofCount >= 4 &&
      colorAuthorizationPacketCoverage.protectedTargetHashProofCount >= 5 &&
      colorAuthorizationPacketCoverage.validation.rowsMatchPlan === true &&
      colorAuthorizationPacketCoverage.validation.rowsMatchGate === true &&
      colorAuthorizationPacketCoverage.validation.rowsMatchDossier === true &&
      colorAuthorizationPacketCoverage.validation.allRowsReviewReady === true &&
      colorAuthorizationPacketCoverage.validation.allRowsGateBlockedFailClosed === true &&
      colorAuthorizationPacketCoverage.validation.noPrimaryLawBlockers === true &&
      colorAuthorizationPacketCoverage.validation.noRowsBlockedByPrimaryLaw === true &&
      colorAuthorizationPacketCoverage.validation.allowedColorsOnly === true &&
      colorAuthorizationPacketCoverage.validation.nonMutatingInputs === true &&
      colorAuthorizationPacketCoverage.validation.localOnlyInputs === true &&
      colorAuthorizationPacketCoverage.validation.appliedRowsZero === true &&
      colorAuthorizationPacketCoverage.validation.requiresExplicitAuthorization === true
        ? "PROVEN"
        : "INCOMPLETE",
      "Every pending color difference must be represented in a hash-backed local authorization packet without applying SSOT/map/prod mutations.",
      colorAuthorizationPacketCoverage,
    ),
    colorApplyTargetMappingAudited: evaluation(
      colorApplyPreviewCoverage.artifactExists &&
      colorApplyPreviewCoverage.nonMutating &&
      colorApplyPreviewCoverage.localOnly &&
      colorApplyPreviewCoverage.previewStatus ===
        "TARGET_MAPPING_REVIEW_INCOMPLETE_NO_MUTATION" &&
      colorApplyPreviewCoverage.proposalRows === colorApplyPreviewCoverage.previewRows &&
      colorApplyPreviewCoverage.packetRows === colorApplyPreviewCoverage.previewRows &&
      colorApplyPreviewCoverage.appliedRows === 0 &&
      colorApplyPreviewCoverage.statusSnapshotMatches +
        colorApplyPreviewCoverage.statusSnapshotMissing +
        colorApplyPreviewCoverage.statusSnapshotMismatches ===
        colorApplyPreviewCoverage.previewRows &&
      colorApplyPreviewCoverage.statusSnapshotMissing >= 0 &&
      colorApplyPreviewCoverage.statusSnapshotMismatches >= 0 &&
      colorApplyPreviewCoverage.indexDirectColorTarget === false &&
      (colorApplyPreviewCoverage.statusSnapshotMissing === 0 ||
        colorApplyPreviewCoverage.blockingReasons.includes("STATUS_SNAPSHOT_TARGET_ROWS_MISSING")) &&
      colorApplyPreviewCoverage.blockingReasons.includes("STATUS_SNAPSHOT_CURRENT_COLOR_MISMATCH") &&
      colorApplyPreviewCoverage.blockingReasons.includes("DATA_INDEX_NOT_DIRECT_COLOR_TARGET") &&
      colorApplyPreviewCoverage.blockingReasons.includes("AUTHORIZATION_MISSING") &&
      colorApplyPreviewCoverage.blockingReasons.includes("SSOT_WRITE_NOT_ENABLED") &&
      colorApplyPreviewCoverage.hashProofCount >= 3
        ? "PROVEN"
        : "INCOMPLETE",
      "The local apply target mapping must be audited before any future authorized write; unresolved target rows/current-color mismatches must be explicit rather than silently applied.",
      colorApplyPreviewCoverage,
    ),
    colorTargetResolverAudited: evaluation(
      colorTargetResolverCoverage.artifactExists &&
      colorTargetResolverCoverage.nonMutating &&
      colorTargetResolverCoverage.localOnly &&
      [
        "TARGET_RESOLVER_INCOMPLETE_NO_MUTATION",
        "TARGET_RESOLVER_READY_NO_MUTATION",
      ].includes(colorTargetResolverCoverage.resolverStatus) &&
      colorTargetResolverCoverage.proposalRows === colorTargetResolverCoverage.resolverRows &&
      colorTargetResolverCoverage.packetRows === colorTargetResolverCoverage.resolverRows &&
      colorTargetResolverCoverage.appliedRows === 0 &&
      colorTargetResolverCoverage.countryJsonTargets +
        colorTargetResolverCoverage.statusV9FallbackTargets +
        colorTargetResolverCoverage.unresolvedTargets ===
        colorTargetResolverCoverage.resolverRows &&
      colorTargetResolverCoverage.unresolvedTargets === disputedTargetMappingCoverage.mappingRows &&
      colorTargetResolverCoverage.packetCurrentRuntimeMismatches ===
        runtimeCurrentReconciliationCoverage.reconciliationRows &&
      colorTargetResolverCoverage.directMutationAllowedNow === false &&
      (colorTargetResolverCoverage.unresolvedTargets === 0 ||
        colorTargetResolverCoverage.blockingReasons.includes("TARGET_ROWS_UNRESOLVED")) &&
      colorTargetResolverCoverage.blockingReasons.includes("PACKET_CURRENT_COLOR_DIFFERS_FROM_LOCAL_RUNTIME") &&
      colorTargetResolverCoverage.blockingReasons.includes("AUTHORIZATION_MISSING") &&
      colorTargetResolverCoverage.blockingReasons.includes("SSOT_WRITE_NOT_ENABLED") &&
      colorTargetResolverCoverage.blockingReasons.includes("LEGAL_AXIS_PATCH_REVIEW_REQUIRED") &&
      colorTargetResolverCoverage.blockingReasons.includes("STATIC_COUNTRIES_HASH_REGEN_REQUIRED_FOR_RUNTIME_CHANGE") &&
      colorTargetResolverCoverage.hashProofCount >= 7
        ? "PROVEN"
        : "INCOMPLETE",
      "The local runtime color target resolver must explain country JSON targets, fallback status targets, and unresolved disputed GEO rows without applying mutations.",
      colorTargetResolverCoverage,
    ),
    disputedTargetMappingAudited: evaluation(
      disputedTargetMappingCoverage.artifactExists &&
      disputedTargetMappingCoverage.nonMutating &&
      disputedTargetMappingCoverage.localOnly &&
      [
        "DISPUTED_TARGET_MAPPING_READY_NO_MUTATION",
        "NO_DISPUTED_TARGET_ROWS",
      ].includes(disputedTargetMappingCoverage.mappingStatus) &&
      disputedTargetMappingCoverage.resolverUnresolvedDisputedRows ===
        disputedTargetMappingCoverage.mappingRows &&
      disputedTargetMappingCoverage.mappingRows >= 0 &&
      disputedTargetMappingCoverage.missingGeos.length === 0 &&
      disputedTargetMappingCoverage.extraGeos.length === 0 &&
      disputedTargetMappingCoverage.appliedRows === 0 &&
      disputedTargetMappingCoverage.directMutationAllowedNow === false &&
      disputedTargetMappingCoverage.statusV9TargetsPresent === 0 &&
      disputedTargetMappingCoverage.manualOverridesPresent === 0 &&
      disputedTargetMappingCoverage.allRowsDisputedMapped &&
      disputedTargetMappingCoverage.allRowsDirectTargetAbsent &&
      disputedTargetMappingCoverage.allRowsMutationBlocked &&
      disputedTargetMappingCoverage.allRowsHaveClaimants &&
      disputedTargetMappingCoverage.noAutomaticStatusTargetsCreated &&
      disputedTargetMappingCoverage.allRowsHaveScopeDecision &&
      disputedTargetMappingCoverage.guardrails.includes("CLAIMANT_LAW_MUST_NOT_BE_TREATED_AS_TERRITORY_LAW_BY_DEFAULT") &&
      disputedTargetMappingCoverage.guardrails.includes("ADMINISTERING_STATE_SCOPE_CAVEAT_MUST_REMAIN_VISIBLE") &&
      disputedTargetMappingCoverage.guardrails.includes("NO_COLOR_APPLICATION_WITHOUT_EXPLICIT_AUTHORIZATION") &&
      disputedTargetMappingCoverage.hashProofCount >= 7
        ? "PROVEN"
        : "INCOMPLETE",
      "Unresolved disputed GEO target rows must have an explicit local scope/target audit, or a zero-row proof after disputed no-own-regime rows become uncolored, while keeping claimant/administering-law caveats visible and blocking mutation.",
      disputedTargetMappingCoverage,
    ),
    runtimeCurrentReconciliationAudited: evaluation(
      runtimeCurrentReconciliationCoverage.artifactExists &&
      runtimeCurrentReconciliationCoverage.nonMutating &&
      runtimeCurrentReconciliationCoverage.localOnly &&
      runtimeCurrentReconciliationCoverage.reconciliationStatus ===
        "RUNTIME_CURRENT_RECONCILIATION_READY_NO_MUTATION" &&
      runtimeCurrentReconciliationCoverage.resolverPacketCurrentRuntimeMismatches ===
        runtimeCurrentReconciliationCoverage.reconciliationRows &&
      runtimeCurrentReconciliationCoverage.reconciliationRows > 0 &&
      runtimeCurrentReconciliationCoverage.appliedRows === 0 &&
      runtimeCurrentReconciliationCoverage.directMutationAllowedNow === false &&
      runtimeCurrentReconciliationCoverage.runtimeAlreadyAtTruthTarget +
        runtimeCurrentReconciliationCoverage.runtimeDiffersFromTruthTarget ===
        runtimeCurrentReconciliationCoverage.reconciliationRows &&
      runtimeCurrentReconciliationCoverage.rowsMatchResolverMismatches &&
      runtimeCurrentReconciliationCoverage.allRowsMarkPacketCurrentStale &&
      runtimeCurrentReconciliationCoverage.allRowsMutationBlocked &&
      runtimeCurrentReconciliationCoverage.allRowsHaveDisposition &&
      runtimeCurrentReconciliationCoverage.noRowsApplied &&
      runtimeCurrentReconciliationCoverage.relationCountsAddUp &&
      runtimeCurrentReconciliationCoverage.guardrails.includes("PACKET_CURRENT_MUST_MATCH_RUNTIME_BEFORE_AUTHORIZED_WRITE") &&
      runtimeCurrentReconciliationCoverage.guardrails.includes("RUNTIME_ALREADY_AT_TRUTH_TARGET_IS_NO_OP_AFTER_PACKET_REFRESH") &&
      runtimeCurrentReconciliationCoverage.guardrails.includes("RUNTIME_TRUTH_TARGET_CONFLICT_REQUIRES_FRESH_LEGAL_AXIS_REVIEW") &&
      runtimeCurrentReconciliationCoverage.guardrails.includes("NO_COLOR_APPLICATION_WITHOUT_EXPLICIT_AUTHORIZATION") &&
      runtimeCurrentReconciliationCoverage.hashProofCount >= 3
        ? "PROVEN"
        : "INCOMPLETE",
      "Authorization-packet current colors that differ from current local runtime must be reconciled as stale-current risk before any future authorized write.",
      runtimeCurrentReconciliationCoverage,
    ),
    runtimeAuthorizationReadinessAudited: evaluation(
      runtimeAuthorizationReadinessCoverage.artifactExists &&
      runtimeAuthorizationReadinessCoverage.nonMutating &&
      runtimeAuthorizationReadinessCoverage.localOnly &&
      runtimeAuthorizationReadinessCoverage.readinessStatus ===
        "RUNTIME_AUTHORIZATION_READINESS_READY_NO_MUTATION" &&
      runtimeAuthorizationReadinessCoverage.packetRows ===
        runtimeAuthorizationReadinessCoverage.readinessRows &&
      runtimeAuthorizationReadinessCoverage.resolverRows ===
        runtimeAuthorizationReadinessCoverage.readinessRows &&
      runtimeAuthorizationReadinessCoverage.readyForAuthorizedRuntimeAxisPatch +
        runtimeAuthorizationReadinessCoverage.noOpRuntimeAlreadyTruthTarget +
        runtimeAuthorizationReadinessCoverage.blockedRows ===
        runtimeAuthorizationReadinessCoverage.readinessRows &&
      runtimeAuthorizationReadinessCoverage.blockedUnresolvedTarget ===
        disputedTargetMappingCoverage.mappingRows &&
      runtimeAuthorizationReadinessCoverage.blockedRuntimeTruthConflict ===
        runtimeTruthConflictAuditCoverage.auditRows &&
      runtimeAuthorizationReadinessCoverage.wouldApplyRowsAfterAuthorization ===
        runtimeAuthorizationReadinessCoverage.readyForAuthorizedRuntimeAxisPatch &&
      runtimeAuthorizationReadinessCoverage.appliedRows === 0 &&
      runtimeAuthorizationReadinessCoverage.directMutationAllowedNow === false &&
      runtimeAuthorizationReadinessCoverage.requiresExplicitAuthorization === true &&
      runtimeAuthorizationReadinessCoverage.rowsMatchAuthorizationPacket &&
      runtimeAuthorizationReadinessCoverage.rowsMatchTargetResolver &&
      runtimeAuthorizationReadinessCoverage.decisionCountsAddUp &&
      runtimeAuthorizationReadinessCoverage.allRowsHaveDecision &&
      runtimeAuthorizationReadinessCoverage.allRowsMutationBlockedNow &&
      runtimeAuthorizationReadinessCoverage.readyRowsWouldApplyAfterAuthorization &&
      runtimeAuthorizationReadinessCoverage.noOpRowsWouldNotApply &&
      runtimeAuthorizationReadinessCoverage.blockedRowsWouldNotApply &&
      runtimeAuthorizationReadinessCoverage.blockedRowsHaveBlockingReasons &&
      runtimeAuthorizationReadinessCoverage.appliedRowsZero &&
      runtimeAuthorizationReadinessCoverage.validationRequiresExplicitAuthorization &&
      runtimeAuthorizationReadinessCoverage.guardrails.includes("READY_ROWS_STILL_REQUIRE_EXPLICIT_AUTHORIZATION") &&
      runtimeAuthorizationReadinessCoverage.guardrails.includes("NO_OP_ROWS_MUST_NOT_BE_REAPPLIED_FROM_STALE_PACKET_CURRENT") &&
      runtimeAuthorizationReadinessCoverage.guardrails.includes("BLOCKED_ROWS_MUST_NOT_BE_WRITTEN") &&
      runtimeAuthorizationReadinessCoverage.guardrails.includes("NO_SSOT_OR_MAP_MUTATION") &&
      runtimeAuthorizationReadinessCoverage.hashProofCount >= 4
        ? "PROVEN"
        : "INCOMPLETE",
      "Current local runtime evidence must split authorization rows into ready, no-op, and blocked buckets before any future authorized write.",
      runtimeAuthorizationReadinessCoverage,
    ),
    runtimeTruthConflictAuditReady: evaluation(
      runtimeTruthConflictAuditCoverage.artifactExists &&
      runtimeTruthConflictAuditCoverage.nonMutating &&
      runtimeTruthConflictAuditCoverage.localOnly &&
      runtimeTruthConflictAuditCoverage.conflictAuditStatus ===
        "RUNTIME_TRUTH_CONFLICT_AUDIT_READY_NO_MUTATION" &&
      runtimeTruthConflictAuditCoverage.readinessBlockedRuntimeTruthConflict ===
        runtimeTruthConflictAuditCoverage.auditRows &&
      runtimeTruthConflictAuditCoverage.auditRows >= 0 &&
      runtimeTruthConflictAuditCoverage.currentRuntimeGreenTruthYellow <=
        runtimeTruthConflictAuditCoverage.auditRows &&
      runtimeTruthConflictAuditCoverage.allRequireAxisRefresh &&
      runtimeTruthConflictAuditCoverage.directMutationAllowedNow === false &&
      runtimeTruthConflictAuditCoverage.appliedRows === 0 &&
      runtimeTruthConflictAuditCoverage.rowsMatchReadinessBlockedRuntimeTruthConflict &&
      runtimeTruthConflictAuditCoverage.allRowsMutationBlocked &&
      runtimeTruthConflictAuditCoverage.allRowsRequireAxisRefresh &&
      runtimeTruthConflictAuditCoverage.allRowsHaveOfficialEvidence &&
      runtimeTruthConflictAuditCoverage.appliedRowsZero &&
      runtimeTruthConflictAuditCoverage.guardrails.includes("NO_FALSE_GREEN_WRITE_FROM_RUNTIME_COUNTRY_JSON") &&
      runtimeTruthConflictAuditCoverage.guardrails.includes("NO_FALSE_YELLOW_FREEZE_FROM_UNDERSPECIFIED_TRUTH_AXIS") &&
      runtimeTruthConflictAuditCoverage.guardrails.includes("REFRESH_PATIENT_ACCESS_DISPENSING_REGISTRY_PRODUCT_LIMITS_BEFORE_WRITE") &&
      runtimeTruthConflictAuditCoverage.guardrails.includes("NO_SSOT_OR_MAP_MUTATION") &&
      runtimeTruthConflictAuditCoverage.hashProofCount >= 3
        ? "PROVEN"
        : "INCOMPLETE",
      "Runtime truth-conflict rows must be separately audited and blocked until detailed patient-access axes are refreshed; GREEN-vs-YELLOW remains a counted subset, not a universal assumption.",
      runtimeTruthConflictAuditCoverage,
    ),
    runtimeSafeAuthorizationPacketReady: evaluation(
      runtimeSafeAuthorizationPacketCoverage.artifactExists &&
      runtimeSafeAuthorizationPacketCoverage.nonMutating &&
      runtimeSafeAuthorizationPacketCoverage.localOnly &&
      runtimeSafeAuthorizationPacketCoverage.packetStatus ===
        "RUNTIME_SAFE_AUTHORIZATION_PACKET_READY_NO_MUTATION" &&
      runtimeSafeAuthorizationPacketCoverage.originalPacketRows ===
        runtimeSafeAuthorizationPacketCoverage.readinessRows &&
      runtimeSafeAuthorizationPacketCoverage.safeRowsTotal ===
        runtimeSafeAuthorizationPacketCoverage.readinessReadyRows &&
      runtimeSafeAuthorizationPacketCoverage.excludedRowsTotal ===
        runtimeSafeAuthorizationPacketCoverage.readinessNoOpRows +
        runtimeSafeAuthorizationPacketCoverage.readinessBlockedRows &&
      runtimeSafeAuthorizationPacketCoverage.wouldApplyRowsAfterAuthorization ===
        runtimeSafeAuthorizationPacketCoverage.safeRowsTotal &&
      runtimeSafeAuthorizationPacketCoverage.appliedRows === 0 &&
      runtimeSafeAuthorizationPacketCoverage.noOpRowsExcluded ===
        runtimeSafeAuthorizationPacketCoverage.readinessNoOpRows &&
      runtimeSafeAuthorizationPacketCoverage.blockedRowsExcluded ===
        runtimeSafeAuthorizationPacketCoverage.readinessBlockedRows &&
      runtimeSafeAuthorizationPacketCoverage.blockedUnresolvedTargetExcluded ===
        disputedTargetMappingCoverage.mappingRows &&
      runtimeSafeAuthorizationPacketCoverage.blockedRuntimeTruthConflictExcluded ===
        runtimeTruthConflictAuditCoverage.auditRows &&
      runtimeSafeAuthorizationPacketCoverage.directMutationAllowedNow === false &&
      runtimeSafeAuthorizationPacketCoverage.rowsMatchReadinessReadyCount &&
      runtimeSafeAuthorizationPacketCoverage.excludedRowsMatchReadinessNonReady &&
      runtimeSafeAuthorizationPacketCoverage.allSafeRowsReady &&
      runtimeSafeAuthorizationPacketCoverage.noSafeRowsNoOp &&
      runtimeSafeAuthorizationPacketCoverage.noSafeRowsBlocked &&
      runtimeSafeAuthorizationPacketCoverage.allExcludedRowsWouldNotApply &&
      runtimeSafeAuthorizationPacketCoverage.allRowsMutationBlockedNow &&
      runtimeSafeAuthorizationPacketCoverage.allSafeRowsRequireAuthorization &&
      runtimeSafeAuthorizationPacketCoverage.appliedRowsZero &&
      runtimeSafeAuthorizationPacketCoverage.noProdMutation &&
      runtimeSafeAuthorizationPacketCoverage.noSsotMutation &&
      runtimeSafeAuthorizationPacketCoverage.guardrails.includes("ONLY_READY_ROWS_INCLUDED") &&
      runtimeSafeAuthorizationPacketCoverage.guardrails.includes("NO_OP_ROWS_EXCLUDED") &&
      runtimeSafeAuthorizationPacketCoverage.guardrails.includes("BLOCKED_ROWS_EXCLUDED") &&
      runtimeSafeAuthorizationPacketCoverage.guardrails.includes("NO_SSOT_OR_MAP_MUTATION") &&
      runtimeSafeAuthorizationPacketCoverage.hashProofCount >= 4
        ? "PROVEN"
        : "INCOMPLETE",
      "A current runtime-safe authorization packet must include only ready rows and exclude no-op/blocked rows before any future authorized apply.",
      runtimeSafeAuthorizationPacketCoverage,
    ),
    runtimeApplyDryRunDiffReady: evaluation(
      runtimeApplyDryRunDiffCoverage.artifactExists &&
      runtimeApplyDryRunDiffCoverage.nonMutating &&
      runtimeApplyDryRunDiffCoverage.localOnly &&
      runtimeApplyDryRunDiffCoverage.dryRunStatus ===
        "RUNTIME_APPLY_DRY_RUN_DIFF_READY_NO_MUTATION" &&
      runtimeApplyDryRunDiffCoverage.safeRows > 0 &&
      runtimeApplyDryRunDiffCoverage.diffRows ===
        runtimeApplyDryRunDiffCoverage.safeRows &&
      runtimeApplyDryRunDiffCoverage.missingGeos.length === 0 &&
      runtimeApplyDryRunDiffCoverage.extraGeos.length === 0 &&
      runtimeApplyDryRunDiffCoverage.appliedRows === 0 &&
      runtimeApplyDryRunDiffCoverage.wouldWriteRowsNow === 0 &&
      runtimeApplyDryRunDiffCoverage.wouldApplyRowsAfterAuthorization ===
        runtimeApplyDryRunDiffCoverage.safeRows &&
      runtimeApplyDryRunDiffCoverage.productionTouched === false &&
      runtimeApplyDryRunDiffCoverage.ssotMutationAttempted === false &&
      runtimeApplyDryRunDiffCoverage.mapMutationAttempted === false &&
      runtimeApplyDryRunDiffCoverage.targetFilesTotal > 0 &&
      runtimeApplyDryRunDiffCoverage.countryJsonTargetRows +
        runtimeApplyDryRunDiffCoverage.statusV9FallbackRows ===
        runtimeApplyDryRunDiffCoverage.diffRows &&
      runtimeApplyDryRunDiffCoverage.rowsMatchSafePacket &&
      runtimeApplyDryRunDiffCoverage.expectedSafeRows &&
      runtimeApplyDryRunDiffCoverage.allTargetsResolved &&
      runtimeApplyDryRunDiffCoverage.allowedTargetFamiliesOnly &&
      runtimeApplyDryRunDiffCoverage.allowedTruthColorsOnly &&
      runtimeApplyDryRunDiffCoverage.allRowsHaveOperations &&
      runtimeApplyDryRunDiffCoverage.allOperationsHaveOldNew &&
      runtimeApplyDryRunDiffCoverage.allDerivedColorsMatchTruth &&
      runtimeApplyDryRunDiffCoverage.allRowsWouldApplyAfterAuthorization &&
      runtimeApplyDryRunDiffCoverage.noRowsWouldWriteNow &&
      runtimeApplyDryRunDiffCoverage.noRowsAppliedNow &&
      runtimeApplyDryRunDiffCoverage.allRowsRequireAuthorization &&
      runtimeApplyDryRunDiffCoverage.allRowsRequireSsotWrite &&
      runtimeApplyDryRunDiffCoverage.allRowsRequireAxisPatchReview &&
      runtimeApplyDryRunDiffCoverage.noWikipediaTruthSource &&
      runtimeApplyDryRunDiffCoverage.safePacketValidated &&
      runtimeApplyDryRunDiffCoverage.operationTotalPositive &&
      runtimeApplyDryRunDiffCoverage.targetFileCountPositive &&
      runtimeApplyDryRunDiffCoverage.appliedRowsZero &&
      runtimeApplyDryRunDiffCoverage.noMutation &&
      runtimeApplyDryRunDiffCoverage.guardrails.includes("PATCH_LEGAL_AXES_NOT_RENDERED_COLOR_ONLY") &&
      runtimeApplyDryRunDiffCoverage.guardrails.includes("YELLOW_MODES_KEEP_DECRIM_AND_LIMITED_MEDICAL_SEPARATE") &&
      runtimeApplyDryRunDiffCoverage.guardrails.includes("GREEN_MODES_KEEP_ADULT_USE_AND_PATIENT_ACCESS_SEPARATE") &&
      runtimeApplyDryRunDiffCoverage.guardrails.includes("NO_WIKIPEDIA_COLOR_AUTHORITY") &&
      runtimeApplyDryRunDiffCoverage.hashProofCount >= 4
        ? "PROVEN"
        : "INCOMPLETE",
      "The current runtime-safe packet must have a concrete local dry-run diff against real target files, patching legal axes rather than painted colors, and remain fully non-mutating until explicit authorization.",
      runtimeApplyDryRunDiffCoverage,
    ),
    runtimeApplyPreflightFailClosed: evaluation(
      runtimeApplyPreflightCoverage.artifactExists &&
      runtimeApplyPreflightCoverage.nonMutating &&
      runtimeApplyPreflightCoverage.localOnly &&
      runtimeApplyPreflightCoverage.preflightStatus ===
        "RUNTIME_APPLY_PREFLIGHT_BLOCKED_FAIL_CLOSED_NO_MUTATION" &&
      runtimeApplyPreflightCoverage.dryRunRows > 0 &&
      runtimeApplyPreflightCoverage.preflightRows ===
        runtimeApplyPreflightCoverage.dryRunRows &&
      runtimeApplyPreflightCoverage.missingGeos.length === 0 &&
      runtimeApplyPreflightCoverage.extraGeos.length === 0 &&
      runtimeApplyPreflightCoverage.targetFilesTotal ===
        runtimeApplyDryRunDiffCoverage.targetFilesTotal &&
      runtimeApplyPreflightCoverage.targetDriftFiles === 0 &&
      runtimeApplyPreflightCoverage.targetDriftRows === 0 &&
      runtimeApplyPreflightCoverage.appliedRows === 0 &&
      runtimeApplyPreflightCoverage.wouldWriteRowsNow === 0 &&
      runtimeApplyPreflightCoverage.wouldWriteRowsAfterAuthorization === 0 &&
      runtimeApplyPreflightCoverage.productionTouched === false &&
      runtimeApplyPreflightCoverage.ssotMutationAttempted === false &&
      runtimeApplyPreflightCoverage.mapMutationAttempted === false &&
      runtimeApplyPreflightCoverage.authorizationPresent === false &&
      runtimeApplyPreflightCoverage.authorizationAccepted === false &&
      runtimeApplyPreflightCoverage.ssotWriteEnabled === false &&
      runtimeApplyPreflightCoverage.dryRunDiffReady &&
      runtimeApplyPreflightCoverage.dryRunRowsExpected &&
      runtimeApplyPreflightCoverage.safePacketRowsExpected &&
      runtimeApplyPreflightCoverage.targetFilesMatchDryRunTotal &&
      runtimeApplyPreflightCoverage.allTargetsExist &&
      runtimeApplyPreflightCoverage.allTargetsAllowed &&
      runtimeApplyPreflightCoverage.allTargetHashesMatchDryRun &&
      runtimeApplyPreflightCoverage.noTargetDrift &&
      runtimeApplyPreflightCoverage.authorizationMissing &&
      runtimeApplyPreflightCoverage.ssotWriteDisabled &&
      runtimeApplyPreflightCoverage.failClosedByDefault &&
      runtimeApplyPreflightCoverage.allRowsBlockedNow &&
      runtimeApplyPreflightCoverage.noRowsWouldWriteNow &&
      runtimeApplyPreflightCoverage.noRowsAppliedNow &&
      runtimeApplyPreflightCoverage.allRowsRequireExplicitAuthorization &&
      runtimeApplyPreflightCoverage.allRowsDerivedColorsMatchTruth &&
      runtimeApplyPreflightCoverage.noWikipediaTruthSource &&
      runtimeApplyPreflightCoverage.upstreamApplyGateFailClosed &&
      runtimeApplyPreflightCoverage.noMutation &&
      runtimeApplyPreflightCoverage.appliedRowsZero &&
      runtimeApplyPreflightCoverage.guardrails.includes("TARGET_HASHES_MUST_MATCH_DRY_RUN_BEFORE_APPLY") &&
      runtimeApplyPreflightCoverage.guardrails.includes("AUTHORIZATION_PHRASE_REQUIRED_FOR_ANY_RUNTIME_WRITE") &&
      runtimeApplyPreflightCoverage.guardrails.includes("SSOT_WRITE_1_REQUIRED_FOR_ANY_RUNTIME_WRITE") &&
      runtimeApplyPreflightCoverage.guardrails.includes("NO_RUNTIME_WRITE_IN_PREFLIGHT") &&
      runtimeApplyPreflightCoverage.guardrails.includes("NO_WIKIPEDIA_COLOR_AUTHORITY") &&
      runtimeApplyPreflightCoverage.hashProofCount >= 2
        ? "PROVEN"
        : "INCOMPLETE",
      "A current runtime apply preflight must prove target files have not drifted from the dry-run hashes, then remain fail-closed without the exact authorization phrase and SSOT_WRITE=1.",
      runtimeApplyPreflightCoverage,
    ),
    runtimeApplyExecutorFailClosed: evaluation(
      runtimeApplyExecutionCoverage.artifactExists &&
      runtimeApplyExecutionCoverage.nonMutating &&
      runtimeApplyExecutionCoverage.localOnly &&
      runtimeApplyExecutionCoverage.executionStatus ===
        "RUNTIME_APPLY_EXECUTOR_BLOCKED_FAIL_CLOSED_NO_MUTATION" &&
      runtimeApplyExecutionCoverage.dryRunRows > 0 &&
      runtimeApplyExecutionCoverage.preflightRows ===
        runtimeApplyExecutionCoverage.dryRunRows &&
      runtimeApplyExecutionCoverage.executionRows ===
        runtimeApplyExecutionCoverage.dryRunRows &&
      runtimeApplyExecutionCoverage.missingGeos.length === 0 &&
      runtimeApplyExecutionCoverage.extraGeos.length === 0 &&
      runtimeApplyExecutionCoverage.appliedRows === 0 &&
      runtimeApplyExecutionCoverage.wouldWriteRowsNow === 0 &&
      runtimeApplyExecutionCoverage.writtenTargetFilesTotal === 0 &&
      runtimeApplyExecutionCoverage.productionTouched === false &&
      runtimeApplyExecutionCoverage.ssotMutationAttempted === false &&
      runtimeApplyExecutionCoverage.mapMutationAttempted === false &&
      runtimeApplyExecutionCoverage.applyFlagPresent === false &&
      runtimeApplyExecutionCoverage.authorizationPresent === false &&
      runtimeApplyExecutionCoverage.authorizationAccepted === false &&
      runtimeApplyExecutionCoverage.ssotWriteEnabled === false &&
      runtimeApplyExecutionCoverage.dryRunRowsExpected &&
      runtimeApplyExecutionCoverage.dryRunReady &&
      runtimeApplyExecutionCoverage.preflightReadyOrFailClosed &&
      runtimeApplyExecutionCoverage.allTargetHashesMatchDryRun &&
      runtimeApplyExecutionCoverage.allTargetsAllowed &&
      runtimeApplyExecutionCoverage.applyFlagMissing &&
      runtimeApplyExecutionCoverage.authorizationMissing &&
      runtimeApplyExecutionCoverage.ssotWriteDisabled &&
      runtimeApplyExecutionCoverage.failClosedWithoutApplyFlag &&
      runtimeApplyExecutionCoverage.failClosedWithoutAuthorization &&
      runtimeApplyExecutionCoverage.failClosedWithoutSsotWrite &&
      runtimeApplyExecutionCoverage.allRowsBlockedWhenGateClosed &&
      runtimeApplyExecutionCoverage.noRowsAppliedWhenGateClosed &&
      runtimeApplyExecutionCoverage.noProdMutation &&
      runtimeApplyExecutionCoverage.noWikipediaTruthSource &&
      Number(runtimeApplyExecutionCoverage.executionDecisionCounts.BLOCKED_FAIL_CLOSED_NO_MUTATION || 0) ===
        runtimeApplyExecutionCoverage.executionRows &&
      Number(runtimeApplyExecutionCoverage.blockingReasonCounts.APPLY_FLAG_MISSING || 0) ===
        runtimeApplyExecutionCoverage.executionRows &&
      Number(runtimeApplyExecutionCoverage.blockingReasonCounts.AUTHORIZATION_MISSING || 0) ===
        runtimeApplyExecutionCoverage.executionRows &&
      Number(runtimeApplyExecutionCoverage.blockingReasonCounts.SSOT_WRITE_NOT_ENABLED || 0) ===
        runtimeApplyExecutionCoverage.executionRows &&
      Number(runtimeApplyExecutionCoverage.targetHashCounts.HASH_MATCH || 0) ===
        runtimeApplyExecutionCoverage.executionRows &&
      runtimeApplyExecutionCoverage.guardrails.includes("APPLY_FLAG_REQUIRED") &&
      runtimeApplyExecutionCoverage.guardrails.includes("AUTHORIZATION_PHRASE_REQUIRED_FOR_ANY_RUNTIME_WRITE") &&
      runtimeApplyExecutionCoverage.guardrails.includes("SSOT_WRITE_1_REQUIRED_FOR_ANY_RUNTIME_WRITE") &&
      runtimeApplyExecutionCoverage.guardrails.includes("TARGET_HASHES_MUST_MATCH_DRY_RUN_BEFORE_APPLY") &&
      runtimeApplyExecutionCoverage.guardrails.includes("DRY_RUN_DERIVED_COLOR_MUST_MATCH_TRUTH") &&
      runtimeApplyExecutionCoverage.guardrails.includes("NO_WIKIPEDIA_COLOR_AUTHORITY") &&
      runtimeApplyExecutionCoverage.hashProofCount >= 2
        ? "PROVEN"
        : "INCOMPLETE",
      "The local runtime apply executor must exist as part of the Truth Pipeline but remain fail-closed with zero writes unless --apply, the exact authorization phrase, SSOT_WRITE=1, dry-run hashes, and Truth-derived axes all pass together.",
      runtimeApplyExecutionCoverage,
    ),
    runtimeApplyRollbackPlanReady: evaluation(
      runtimeApplyRollbackPlanCoverage.artifactExists &&
      runtimeApplyRollbackPlanCoverage.nonMutating &&
      runtimeApplyRollbackPlanCoverage.localOnly &&
      runtimeApplyRollbackPlanCoverage.rollbackStatus ===
        "RUNTIME_APPLY_ROLLBACK_PLAN_READY_NO_MUTATION" &&
      runtimeApplyRollbackPlanCoverage.dryRunRows > 0 &&
      runtimeApplyRollbackPlanCoverage.executionRows ===
        runtimeApplyRollbackPlanCoverage.dryRunRows &&
      runtimeApplyRollbackPlanCoverage.rollbackRows ===
        runtimeApplyRollbackPlanCoverage.dryRunRows &&
      runtimeApplyRollbackPlanCoverage.missingGeos.length === 0 &&
      runtimeApplyRollbackPlanCoverage.extraGeos.length === 0 &&
      runtimeApplyRollbackPlanCoverage.targetFilesTotal ===
        runtimeApplyDryRunDiffCoverage.targetFilesTotal &&
      runtimeApplyRollbackPlanCoverage.appliedRows === 0 &&
      runtimeApplyRollbackPlanCoverage.wouldRollbackRowsNow === 0 &&
      runtimeApplyRollbackPlanCoverage.productionTouched === false &&
      runtimeApplyRollbackPlanCoverage.ssotMutationAttempted === false &&
      runtimeApplyRollbackPlanCoverage.mapMutationAttempted === false &&
      runtimeApplyRollbackPlanCoverage.dryRunDiffReady &&
      runtimeApplyRollbackPlanCoverage.executionFailClosedNoMutation &&
      runtimeApplyRollbackPlanCoverage.rowsMatchDryRun &&
      runtimeApplyRollbackPlanCoverage.expectedRows &&
      runtimeApplyRollbackPlanCoverage.targetFilesMatchDryRunTotal &&
      runtimeApplyRollbackPlanCoverage.allTargetsAllowed &&
      runtimeApplyRollbackPlanCoverage.allTargetHashesMatchDryRun &&
      runtimeApplyRollbackPlanCoverage.allDryRunOldValuesMatchCurrent &&
      runtimeApplyRollbackPlanCoverage.allTargetExpectedHashesUnique &&
      runtimeApplyRollbackPlanCoverage.allSimulatedApplyChangesTarget &&
      runtimeApplyRollbackPlanCoverage.allSimulatedRollbackRestoresOriginal &&
      runtimeApplyRollbackPlanCoverage.allRowsHaveRollbackOperations &&
      runtimeApplyRollbackPlanCoverage.rollbackOpsReverseDryRun &&
      runtimeApplyRollbackPlanCoverage.allRowsRollbackWouldNotRunNow &&
      runtimeApplyRollbackPlanCoverage.noWikipediaTruthSource &&
      runtimeApplyRollbackPlanCoverage.validationNonMutating &&
      runtimeApplyRollbackPlanCoverage.validationLocalOnly &&
      runtimeApplyRollbackPlanCoverage.appliedRowsZero &&
      runtimeApplyRollbackPlanCoverage.noProdMutation &&
      Number(runtimeApplyRollbackPlanCoverage.rollbackDispositionCounts.ROLLBACK_PLAN_READY_NO_MUTATION || 0) ===
        runtimeApplyRollbackPlanCoverage.rollbackRows &&
      Number(runtimeApplyRollbackPlanCoverage.targetPlanHashCounts.ROLLBACK_RESTORES_ORIGINAL || 0) ===
        runtimeApplyRollbackPlanCoverage.targetFilesTotal &&
      runtimeApplyRollbackPlanCoverage.guardrails.includes("ROLLBACK_PLAN_MUST_BE_BUILT_BEFORE_AUTHORIZED_APPLY") &&
      runtimeApplyRollbackPlanCoverage.guardrails.includes("ROLLBACK_OPS_MUST_INVERT_DRY_RUN_OPS") &&
      runtimeApplyRollbackPlanCoverage.guardrails.includes("SIMULATED_ROLLBACK_MUST_RESTORE_ORIGINAL_HASH") &&
      runtimeApplyRollbackPlanCoverage.guardrails.includes("TARGET_HASHES_MUST_MATCH_DRY_RUN_BEFORE_ROLLBACK_PLAN") &&
      runtimeApplyRollbackPlanCoverage.guardrails.includes("NO_WIKIPEDIA_COLOR_AUTHORITY") &&
      runtimeApplyRollbackPlanCoverage.hashProofCount >= 2
        ? "PROVEN"
        : "INCOMPLETE",
      "Every future authorized runtime apply must have a non-mutating rollback plan whose inverse operations restore the current target hashes in simulation before any real write is allowed.",
      runtimeApplyRollbackPlanCoverage,
    ),
    runtimePostApplyVerificationReady: evaluation(
      runtimePostApplyVerificationCoverage.artifactExists &&
      runtimePostApplyVerificationCoverage.nonMutating &&
      runtimePostApplyVerificationCoverage.localOnly &&
      runtimePostApplyVerificationCoverage.postApplyStatus ===
        "RUNTIME_POST_APPLY_VERIFICATION_READY_NO_MUTATION" &&
      runtimePostApplyVerificationCoverage.dryRunRows ===
        runtimeApplyDryRunDiffCoverage.diffRows &&
      runtimePostApplyVerificationCoverage.readinessRows ===
        runtimeAuthorizationReadinessCoverage.readinessRows &&
      runtimePostApplyVerificationCoverage.safePacketRows ===
        runtimeSafeAuthorizationPacketCoverage.safeRowsTotal &&
      runtimePostApplyVerificationCoverage.overlayRows === 307 &&
      runtimePostApplyVerificationCoverage.postApplyRows ===
        runtimePostApplyVerificationCoverage.dryRunRows &&
      runtimePostApplyVerificationCoverage.missingGeos.length === 0 &&
      runtimePostApplyVerificationCoverage.extraGeos.length === 0 &&
      runtimePostApplyVerificationCoverage.targetFilesTotal ===
        runtimeApplyDryRunDiffCoverage.targetFilesTotal &&
      runtimePostApplyVerificationCoverage.appliedRows === 0 &&
      runtimePostApplyVerificationCoverage.wouldApplyRowsAfterAuthorization ===
        runtimeSafeAuthorizationPacketCoverage.safeRowsTotal &&
      runtimePostApplyVerificationCoverage.truthAlignedRowsAfterAuthorizedApply +
        runtimePostApplyVerificationCoverage.blockedRowsAfterAuthorizedApply ===
        runtimePostApplyVerificationCoverage.coverageRowsTotal &&
      runtimePostApplyVerificationCoverage.blockedRowsAfterAuthorizedApply ===
        runtimeAuthorizationReadinessCoverage.blockedRows &&
      runtimePostApplyVerificationCoverage.coverageRowsTotal === 307 &&
      runtimePostApplyVerificationCoverage.coverageRowsExpected === 307 &&
      runtimePostApplyVerificationCoverage.productionTouched === false &&
      runtimePostApplyVerificationCoverage.ssotMutationAttempted === false &&
      runtimePostApplyVerificationCoverage.mapMutationAttempted === false &&
      runtimePostApplyVerificationCoverage.validationNonMutating &&
      runtimePostApplyVerificationCoverage.validationLocalOnly &&
      runtimePostApplyVerificationCoverage.overlayRows307 &&
      runtimePostApplyVerificationCoverage.readinessRowsExpected &&
      runtimePostApplyVerificationCoverage.safeRowsExpected &&
      runtimePostApplyVerificationCoverage.safePacketRowsExpected &&
      runtimePostApplyVerificationCoverage.noOpRowsExpected &&
      runtimePostApplyVerificationCoverage.blockedRows5 &&
      runtimePostApplyVerificationCoverage.alreadyTruthRowsExpected &&
      runtimePostApplyVerificationCoverage.coverageRowsTotal307 &&
      runtimePostApplyVerificationCoverage.truthAlignedRowsAfterAuthorizedApplyExpected &&
      runtimePostApplyVerificationCoverage.targetFilesExpected &&
      runtimePostApplyVerificationCoverage.allTargetsAllowed &&
      runtimePostApplyVerificationCoverage.allTargetHashesMatchDryRun &&
      runtimePostApplyVerificationCoverage.allDryRunOldValuesMatchCurrent &&
      runtimePostApplyVerificationCoverage.allTargetExpectedHashesUnique &&
      runtimePostApplyVerificationCoverage.allSimulatedApplyChangesTarget &&
      runtimePostApplyVerificationCoverage.rowsMatchSafePacket &&
      runtimePostApplyVerificationCoverage.blockedRowsRemainExcluded &&
      runtimePostApplyVerificationCoverage.noOpRowsRemainExcluded &&
      runtimePostApplyVerificationCoverage.noOpRowsAlreadyTruthTarget &&
      runtimePostApplyVerificationCoverage.allSimulatedSafeRowsMatchTruth &&
      runtimePostApplyVerificationCoverage.allSimulatedSafeRowsMatchDryRunDerived &&
      runtimePostApplyVerificationCoverage.allPostApplyColorsAllowed &&
      runtimePostApplyVerificationCoverage.allTruthOverlayColorsAllowed &&
      runtimePostApplyVerificationCoverage.onlyThreePaintColorsPlusUncolored &&
      runtimePostApplyVerificationCoverage.noFalseGreenAfterApply &&
      runtimePostApplyVerificationCoverage.noWikipediaTruthSource &&
      runtimePostApplyVerificationCoverage.preflightFailClosed &&
      runtimePostApplyVerificationCoverage.executionFailClosed &&
      runtimePostApplyVerificationCoverage.rollbackReady &&
      runtimePostApplyVerificationCoverage.appliedRowsZero &&
      runtimePostApplyVerificationCoverage.noProdMutation &&
      runtimePostApplyVerificationCoverage.noSsotMutation &&
      runtimePostApplyVerificationCoverage.noMapMutation &&
      Object.values(runtimePostApplyVerificationCoverage.safePostApplyColorCounts || {})
        .reduce((total, value) => total + Number(value || 0), 0) ===
        runtimePostApplyVerificationCoverage.postApplyRows &&
      Number(runtimePostApplyVerificationCoverage.readinessDecisionCounts.READY_FOR_AUTHORIZED_RUNTIME_AXIS_PATCH || 0) ===
        runtimeAuthorizationReadinessCoverage.readyForAuthorizedRuntimeAxisPatch &&
      Number(runtimePostApplyVerificationCoverage.readinessDecisionCounts.NO_OP_RUNTIME_ALREADY_TRUTH_TARGET || 0) ===
        runtimeAuthorizationReadinessCoverage.noOpRuntimeAlreadyTruthTarget &&
      Number(runtimePostApplyVerificationCoverage.readinessDecisionCounts.BLOCKED_UNRESOLVED_TARGET || 0) ===
        disputedTargetMappingCoverage.mappingRows &&
      Number(runtimePostApplyVerificationCoverage.readinessDecisionCounts.BLOCKED_RUNTIME_TRUTH_CONFLICT || 0) ===
        runtimeTruthConflictAuditCoverage.auditRows &&
      Number(runtimePostApplyVerificationCoverage.targetPlanHashCounts.HASH_MATCH || 0) ===
        runtimePostApplyVerificationCoverage.targetFilesTotal &&
      Number(runtimePostApplyVerificationCoverage.postApplyDispositionCounts.SAFE_ROW_POST_APPLY_MATCHES_TRUTH || 0) ===
        runtimePostApplyVerificationCoverage.postApplyRows &&
      runtimePostApplyVerificationCoverage.guardrails.includes("SIMULATE_AUTHORIZED_APPLY_BEFORE_ANY_RUNTIME_WRITE") &&
      runtimePostApplyVerificationCoverage.guardrails.includes("POST_APPLY_RUNTIME_COLOR_MUST_MATCH_TRUTH_COLOR") &&
      runtimePostApplyVerificationCoverage.guardrails.includes("NO_FALSE_GREEN_AFTER_AXIS_PATCH") &&
      runtimePostApplyVerificationCoverage.guardrails.includes("ONLY_THREE_PAINT_COLORS_PLUS_UNCOLORED_UNKNOWN") &&
      runtimePostApplyVerificationCoverage.guardrails.includes("BLOCKED_ROWS_REMAIN_EXCLUDED_FROM_SAFE_APPLY") &&
      runtimePostApplyVerificationCoverage.guardrails.includes("NO_WIKIPEDIA_COLOR_AUTHORITY") &&
      runtimePostApplyVerificationCoverage.hashProofCount >= 5
        ? "PROVEN"
        : "INCOMPLETE",
      "A non-mutating post-apply verifier must prove the authorized safe runtime axis patch would align all non-blocked rows with Truth colors, keep blocked rows explicit, preserve the three-color palette, and avoid false green outcomes.",
      runtimePostApplyVerificationCoverage,
    ),
    runtimeBlockedRowsExitDossierReady: evaluation(
      blockerExitDossierCoverage.artifactExists &&
      blockerExitDossierCoverage.nonMutating &&
      blockerExitDossierCoverage.localOnly &&
      blockerExitDossierCoverage.dossierStatus === "BLOCKER_EXIT_DOSSIER_READY_NO_MUTATION" &&
      blockerExitDossierCoverage.rowsTotal ===
        runtimeAuthorizationReadinessCoverage.blockedRows &&
      blockerExitDossierCoverage.readinessBlockedRows ===
        runtimeAuthorizationReadinessCoverage.blockedRows &&
      blockerExitDossierCoverage.missingGeos.length === 0 &&
      blockerExitDossierCoverage.extraGeos.length === 0 &&
      blockerExitDossierCoverage.blockedRowsTotal ===
        runtimeAuthorizationReadinessCoverage.blockedRows &&
      blockerExitDossierCoverage.disputedTargetBlockers ===
        disputedTargetMappingCoverage.mappingRows &&
      blockerExitDossierCoverage.runtimeTruthConflictBlockers ===
        runtimeTruthConflictAuditCoverage.auditRows &&
      blockerExitDossierCoverage.exitReadyNow === 0 &&
      blockerExitDossierCoverage.excludedFromSafeApply ===
        blockerExitDossierCoverage.blockedRowsTotal &&
      blockerExitDossierCoverage.safeApplyRows ===
        runtimeSafeAuthorizationPacketCoverage.safeRowsTotal &&
      blockerExitDossierCoverage.noOpRows ===
        runtimeAuthorizationReadinessCoverage.noOpRuntimeAlreadyTruthTarget &&
      blockerExitDossierCoverage.postApplyTruthAlignedRows +
        blockerExitDossierCoverage.blockedRowsTotal ===
        blockerExitDossierCoverage.postApplyCoverageRows &&
      blockerExitDossierCoverage.postApplyCoverageRows === 307 &&
      blockerExitDossierCoverage.targetFiles ===
        runtimePostApplyVerificationCoverage.targetFilesTotal &&
      blockerExitDossierCoverage.appliedRows === 0 &&
      blockerExitDossierCoverage.productionTouched === false &&
      blockerExitDossierCoverage.ssotMutationAttempted === false &&
      blockerExitDossierCoverage.mapMutationAttempted === false &&
      blockerExitDossierCoverage.upstreamReadinessBlockedRows ===
        runtimeAuthorizationReadinessCoverage.blockedRows &&
      blockerExitDossierCoverage.upstreamConflictRows ===
        runtimeTruthConflictAuditCoverage.auditRows &&
      blockerExitDossierCoverage.upstreamDisputedRows ===
        disputedTargetMappingCoverage.mappingRows &&
      blockerExitDossierCoverage.upstreamPostApplyBlockedRows ===
        runtimePostApplyVerificationCoverage.blockedRowsAfterAuthorizedApply &&
      blockerExitDossierCoverage.validation.readinessBlockedRowsMatchArtifact === true &&
      blockerExitDossierCoverage.validation.postApplyBlockedRowsMatchArtifact === true &&
      blockerExitDossierCoverage.validation.rowsMatchReadinessBlocked === true &&
      blockerExitDossierCoverage.validation.rowsMatchPostApplyBlocked === true &&
      blockerExitDossierCoverage.validation.disputedRowsMatchMapping === true &&
      blockerExitDossierCoverage.validation.conflictRowsMatchAudit === true &&
      blockerExitDossierCoverage.validation.allRowsExcludedFromSafeApply === true &&
      blockerExitDossierCoverage.validation.blockedRowsNotInPostApplySafeRows === true &&
      blockerExitDossierCoverage.validation.allRowsHaveExitCondition === true &&
      blockerExitDossierCoverage.validation.allRowsHaveRequiredNextEvidence === true &&
      blockerExitDossierCoverage.validation.noRowsExitReadyNow === true &&
      blockerExitDossierCoverage.validation.safeApplyRowsMatchCurrentPipeline === true &&
      blockerExitDossierCoverage.validation.noOpRowsMatchCurrentPipeline === true &&
      blockerExitDossierCoverage.validation.postApplyAlignedRowsMatchCoverage === true &&
      blockerExitDossierCoverage.validation.postApplyCoverageRows307 === true &&
      blockerExitDossierCoverage.validation.targetFilesMatchDryRun === true &&
      blockerExitDossierCoverage.validation.allRuntimeConflictsRequireAxisRefresh === true &&
      blockerExitDossierCoverage.validation.allRuntimeConflictsHaveOfficialEvidence === true &&
      blockerExitDossierCoverage.validation.disputedRowsHaveScopeDecision === true &&
      blockerExitDossierCoverage.validation.noAutomaticStatusTargetsCreated === true &&
      blockerExitDossierCoverage.validation.noWikipediaTruthSource === true &&
      blockerExitDossierCoverage.validation.nonMutating === true &&
      blockerExitDossierCoverage.validation.localOnly === true &&
      blockerExitDossierCoverage.validation.appliedRowsZero === true &&
      blockerExitDossierCoverage.validation.noProdMutation === true &&
      blockerExitDossierCoverage.validation.noSsotMutation === true &&
      blockerExitDossierCoverage.validation.noMapMutation === true &&
      Number(blockerExitDossierCoverage.blockerClassCounts.DISPUTED_RUNTIME_TARGET_SCOPE_DECISION_REQUIRED || 0) ===
        blockerExitDossierCoverage.disputedTargetBlockers &&
      Number(blockerExitDossierCoverage.blockerClassCounts.RUNTIME_TRUTH_CONFLICT_REQUIRES_LEGAL_AXIS_REFRESH || 0) ===
        blockerExitDossierCoverage.runtimeTruthConflictBlockers &&
      Number(blockerExitDossierCoverage.readinessDecisionCounts.BLOCKED_UNRESOLVED_TARGET || 0) ===
        blockerExitDossierCoverage.disputedTargetBlockers &&
      Number(blockerExitDossierCoverage.readinessDecisionCounts.BLOCKED_RUNTIME_TRUTH_CONFLICT || 0) ===
        blockerExitDossierCoverage.runtimeTruthConflictBlockers &&
      blockerExitDossierCoverage.guardrails.includes("BLOCKED_ROWS_MUST_NOT_BE_INCLUDED_IN_SAFE_APPLY") &&
      blockerExitDossierCoverage.guardrails.includes("DISPUTED_GEO_REQUIRES_EXPLICIT_SCOPE_DECISION") &&
      blockerExitDossierCoverage.guardrails.includes("RUNTIME_TRUTH_CONFLICT_REQUIRES_FRESH_LEGAL_AXIS_RECONCILIATION") &&
      blockerExitDossierCoverage.guardrails.includes("NO_AUTOMATIC_STATUS_TARGET_CREATION") &&
      blockerExitDossierCoverage.guardrails.includes("NO_WIKIPEDIA_COLOR_AUTHORITY") &&
      blockerExitDossierCoverage.guardrails.includes("NO_SSOT_OR_MAP_MUTATION") &&
      blockerExitDossierCoverage.guardrails.includes("NO_PRODUCTION_MUTATION") &&
      blockerExitDossierCoverage.hashProofCount >= 6
        ? "PROVEN"
        : "INCOMPLETE",
      "Rows excluded from safe runtime apply must have a consolidated non-mutating exit dossier: disputed GEOs require explicit scope/target decisions, and runtime/truth conflicts require fresh legal-axis reconciliation before any write.",
      blockerExitDossierCoverage,
    ),
    legalKnowledgeAxisMatrixReady: evaluation(
      legalKnowledgeAxisMatrixCoverage.artifactExists &&
      legalKnowledgeAxisMatrixCoverage.nonMutating &&
      legalKnowledgeAxisMatrixCoverage.localOnly &&
      legalKnowledgeAxisMatrixCoverage.matrixStatus ===
        "LEGAL_KNOWLEDGE_AXIS_MATRIX_READY_NO_MUTATION" &&
      legalKnowledgeAxisMatrixCoverage.rowsTotal === 307 &&
      legalKnowledgeAxisMatrixCoverage.rowsExpected === 307 &&
      legalKnowledgeAxisMatrixCoverage.requiredAxisTotal === 58 &&
      legalKnowledgeAxisMatrixCoverage.cellsTotal === 307 * 58 &&
      legalKnowledgeAxisMatrixCoverage.knownAxisCells > 0 &&
      legalKnowledgeAxisMatrixCoverage.unknownAxisCells > 0 &&
      legalKnowledgeAxisMatrixCoverage.rowsWithUnknownAxes > 0 &&
      legalKnowledgeAxisMatrixCoverage.rowsWithAllAxesKnown === 0 &&
      legalKnowledgeAxisMatrixCoverage.appliedRows === 0 &&
      legalKnowledgeAxisMatrixCoverage.productionTouched === false &&
      legalKnowledgeAxisMatrixCoverage.ssotMutationAttempted === false &&
      legalKnowledgeAxisMatrixCoverage.mapMutationAttempted === false &&
      legalKnowledgeAxisMatrixCoverage.validation.rows307 === true &&
      legalKnowledgeAxisMatrixCoverage.validation.requiredAxisSchemaDeclared === true &&
      legalKnowledgeAxisMatrixCoverage.validation.allRowsHaveRequiredAxisGroups === true &&
      legalKnowledgeAxisMatrixCoverage.validation.allRowsHaveAllRequiredAxes === true &&
      legalKnowledgeAxisMatrixCoverage.validation.cellsTotalMatchesRowsTimesAxes === true &&
      legalKnowledgeAxisMatrixCoverage.validation.allCellsClassified === true &&
      legalKnowledgeAxisMatrixCoverage.validation.noMissingAxisCells === true &&
      legalKnowledgeAxisMatrixCoverage.validation.unknownCellsExplicit === true &&
      legalKnowledgeAxisMatrixCoverage.validation.knownCellsPresent === true &&
      legalKnowledgeAxisMatrixCoverage.validation.wikiAuditOnly === true &&
      legalKnowledgeAxisMatrixCoverage.validation.nonMutating === true &&
      legalKnowledgeAxisMatrixCoverage.validation.localOnly === true &&
      legalKnowledgeAxisMatrixCoverage.validation.appliedRowsZero === true &&
      legalKnowledgeAxisMatrixCoverage.validation.noProdMutation === true &&
      legalKnowledgeAxisMatrixCoverage.validation.noSsotMutation === true &&
      legalKnowledgeAxisMatrixCoverage.validation.noMapMutation === true &&
      legalKnowledgeAxisMatrixCoverage.validation.noCountrySpecificExceptions === true &&
      Number(legalKnowledgeAxisMatrixCoverage.axisStatusCounts.UNKNOWN || 0) ===
        legalKnowledgeAxisMatrixCoverage.unknownAxisCells &&
      legalKnowledgeAxisMatrixCoverage.guardrails.includes("UNKNOWN_AXIS_MUST_REMAIN_UNKNOWN_UNTIL_PRIMARY_LAW_PROVES_IT") &&
      legalKnowledgeAxisMatrixCoverage.guardrails.includes("NO_AXIS_VALUE_FROM_WIKIPEDIA") &&
      legalKnowledgeAxisMatrixCoverage.guardrails.includes("NO_AXIS_VALUE_FROM_COLOR_ALONE") &&
      legalKnowledgeAxisMatrixCoverage.guardrails.includes("NO_PRODUCTION_TO_PATIENT_ACCESS_INFERENCE") &&
      legalKnowledgeAxisMatrixCoverage.guardrails.includes("NO_CLAIMANT_LAW_TO_TERRITORY_LAW_INFERENCE") &&
      legalKnowledgeAxisMatrixCoverage.guardrails.includes("NO_FEDERAL_STATE_SCOPE_MERGE") &&
      legalKnowledgeAxisMatrixCoverage.guardrails.includes("NO_SSOT_OR_MAP_MUTATION") &&
      legalKnowledgeAxisMatrixCoverage.hashProofCount >= 1
        ? "PROVEN"
        : "INCOMPLETE",
      "The local Truth-First model must expose the full required legal-axis schema for all 307 GEO and keep every unproven detailed axis explicitly UNKNOWN instead of deriving it from color, Wikipedia, parser summaries, industry activity, claimant law, or federal/state scope mixing.",
      legalKnowledgeAxisMatrixCoverage,
    ),
    runtimeBlockerAxisReconciliationProgressReady: evaluation(
      runtimeBlockerAxisReconciliationCoverage.artifactExists &&
      runtimeBlockerAxisReconciliationCoverage.nonMutating &&
      runtimeBlockerAxisReconciliationCoverage.localOnly &&
      runtimeBlockerAxisReconciliationCoverage.safeToAutoApply === false &&
      runtimeBlockerAxisReconciliationCoverage.dossierStatus ===
        "RUNTIME_BLOCKER_AXIS_RECONCILIATION_READY_NO_MUTATION" &&
      runtimeBlockerAxisReconciliationCoverage.rowsTotal ===
        runtimeBlockerAxisReconciliationCoverage.runtimeTruthConflictRows &&
      runtimeBlockerAxisReconciliationCoverage.blockerRowsTotal ===
        runtimeBlockerAxisReconciliationCoverage.runtimeTruthConflictRows +
        runtimeBlockerAxisReconciliationCoverage.disputedScopeRows &&
      runtimeBlockerAxisReconciliationCoverage.runtimeTruthConflictRows ===
        runtimeTruthConflictAuditCoverage.auditRows &&
      runtimeBlockerAxisReconciliationCoverage.disputedScopeRows ===
        disputedTargetMappingCoverage.mappingRows &&
      runtimeBlockerAxisReconciliationCoverage.freshReconciledRows ===
        runtimeBlockerAxisReconciliationCoverage.runtimeTruthConflictRows &&
      runtimeBlockerAxisReconciliationCoverage.pendingFreshAxisRows === 0 &&
      runtimeBlockerAxisReconciliationCoverage.candidateTruthColorChangeRows >= 0 &&
      runtimeBlockerAxisReconciliationCoverage.candidateGreenRows +
        runtimeBlockerAxisReconciliationCoverage.candidateYellowRows +
        runtimeBlockerAxisReconciliationCoverage.candidateRedRows +
        runtimeBlockerAxisReconciliationCoverage.candidateUnknownRows ===
        runtimeBlockerAxisReconciliationCoverage.freshReconciledRows &&
      runtimeBlockerAxisReconciliationCoverage.candidateKnownTruthColorRows ===
        runtimeBlockerAxisReconciliationCoverage.freshReconciledRows &&
      runtimeBlockerAxisReconciliationCoverage.candidateFalseGreenCorrectionRows >= 0 &&
      runtimeBlockerAxisReconciliationCoverage.appliedRows === 0 &&
      runtimeBlockerAxisReconciliationCoverage.productionTouched === false &&
      runtimeBlockerAxisReconciliationCoverage.ssotMutationAttempted === false &&
      runtimeBlockerAxisReconciliationCoverage.mapMutationAttempted === false &&
      runtimeBlockerAxisReconciliationCoverage.validation.blockerRowsTotalMatchesCurrent === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.runtimeTruthConflictRowsMatchCurrent === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.disputedScopeRowsMatchCurrentMapping === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.rowsMatchRuntimeConflictBlockers === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.atLeastOneFreshReconciledRow === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.allRuntimeConflictRowsReconciled === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.pendingRowsRemainExplicit === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.allRowsHaveDecision === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.reconciledRowsHaveOfficialSources === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.reconciledRowsFreshColorAllowedTruthPalette === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.unknownRowsRemainUncolored === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.allRowsMatchCurrentTruthReport === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.reconciledRowsTruthFirstColorSupported === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.noWikipediaTruthSource === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.localOnly === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.nonMutating === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.appliedRowsZero === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.noProdMutation === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.noSsotMutation === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.noMapMutation === true &&
      runtimeBlockerAxisReconciliationCoverage.validation.safeToAutoApplyFalse === true &&
      (Number(runtimeBlockerAxisReconciliationCoverage.statusCounts.FRESH_AXIS_RECONCILED_PENDING_TRUTH_REGEN || 0) +
        Number(runtimeBlockerAxisReconciliationCoverage.statusCounts.CURRENT_TRUTH_RECONCILED_RUNTIME_DELTA_DOCUMENTED || 0)) ===
        runtimeBlockerAxisReconciliationCoverage.freshReconciledRows &&
      Number(runtimeBlockerAxisReconciliationCoverage.statusCounts.PENDING_FRESH_AXIS_RECONCILIATION || 0) === 0 &&
      Object.values(runtimeBlockerAxisReconciliationCoverage.previousTruthColorCounts).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      ) === runtimeBlockerAxisReconciliationCoverage.rowsTotal &&
      Object.values(runtimeBlockerAxisReconciliationCoverage.freshTruthColorCounts).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      ) === runtimeBlockerAxisReconciliationCoverage.rowsTotal &&
      runtimeBlockerAxisReconciliationCoverage.guardrails.includes("FRESH_AXIS_RECONCILIATION_DOES_NOT_AUTHORIZE_WRITE") &&
      runtimeBlockerAxisReconciliationCoverage.guardrails.includes("REGENERATE_TRUTH_REPORT_BEFORE_RUNTIME_PATCH") &&
      runtimeBlockerAxisReconciliationCoverage.guardrails.includes("NO_WIKIPEDIA_TRUTH_SOURCE") &&
      runtimeBlockerAxisReconciliationCoverage.guardrails.includes("NO_SSOT_OR_MAP_MUTATION") &&
      runtimeBlockerAxisReconciliationCoverage.guardrails.includes("PENDING_ROWS_REMAIN_BLOCKED") &&
      runtimeBlockerAxisReconciliationCoverage.guardrails.includes("OPERATIONAL_PATIENT_ACCESS_MUST_BE_PROVEN_BY_PRIMARY_SOURCES") &&
      runtimeBlockerAxisReconciliationCoverage.guardrails.includes("PHARMACEUTICAL_ONLY_DOES_NOT_COUNT_AS_PATIENT_PROGRAMME") &&
      runtimeBlockerAxisReconciliationCoverage.guardrails.includes("YELLOW_RECONCILIATION_IS_ALLOWED_FOR_LIMITED_PRESCRIPTION_OR_PHARMACEUTICAL_ONLY_ACCESS") &&
      runtimeBlockerAxisReconciliationCoverage.guardrails.includes("UNKNOWN_REMAINS_UNCOLORED_WHEN_APPLICABLE_TERRITORIAL_LAW_IS_UNPROVEN") &&
      runtimeBlockerAxisReconciliationCoverage.hashProofCount >= 4
        ? "PROVEN"
        : "INCOMPLETE",
      "All runtime/truth deltas must mirror the current official Truth result without write authorization; GREEN, YELLOW, RED, and uncolored UNKNOWN remain distinct, and runtime is observation rather than authority.",
      runtimeBlockerAxisReconciliationCoverage,
    ),
    antiMixGuards: evaluation(
      guardCases.every((item) => item.status === "PROVEN") ? "PROVEN" : "FAILED",
      "Rule engine must prevent prohibited legal-mode and jurisdiction mixing.",
      { cases: guardCases },
    ),
    noCountrySpecificColorExceptions: evaluation(
      exceptionHits.length === 0 ? "PROVEN" : "FAILED",
      "Core color derivation files must not contain hard-coded GEO-specific exceptions.",
      { hits: exceptionHits },
    ),
    reportsCreated: evaluation(
      fs.existsSync(REPORT_PATH) && fs.existsSync(COLOR_PROPOSALS_PATH) ? "PROVEN" : "FAILED",
      "Truth report, Wiki audit and color audit are represented in local report artifacts.",
      {
        truthReport: path.relative(ROOT, REPORT_PATH),
        acceptanceReport: path.relative(ROOT, OUT_JSON_PATH),
        colorProposalsReport: path.relative(ROOT, COLOR_PROPOSALS_PATH),
        colorApplyPlanReport: fs.existsSync(COLOR_APPLY_PLAN_PATH)
          ? path.relative(ROOT, COLOR_APPLY_PLAN_PATH)
          : null,
        colorApplyGateReport: fs.existsSync(COLOR_APPLY_GATE_PATH)
          ? path.relative(ROOT, COLOR_APPLY_GATE_PATH)
          : null,
        colorReviewDossierReport: fs.existsSync(COLOR_REVIEW_DOSSIER_PATH)
          ? path.relative(ROOT, COLOR_REVIEW_DOSSIER_PATH)
          : null,
        colorReviewClosureDossierReport: fs.existsSync(COLOR_REVIEW_CLOSURE_DOSSIER_PATH)
          ? path.relative(ROOT, COLOR_REVIEW_CLOSURE_DOSSIER_PATH)
          : null,
        colorAuthorizationPacketReport: fs.existsSync(COLOR_AUTHORIZATION_PACKET_PATH)
          ? path.relative(ROOT, COLOR_AUTHORIZATION_PACKET_PATH)
          : null,
        colorApplyPreviewReport: fs.existsSync(COLOR_APPLY_PREVIEW_PATH)
          ? path.relative(ROOT, COLOR_APPLY_PREVIEW_PATH)
          : null,
        primaryLawBlockersReport: fs.existsSync(PRIMARY_LAW_BLOCKERS_PATH)
          ? path.relative(ROOT, PRIMARY_LAW_BLOCKERS_PATH)
          : null,
        threeColorOverlayReport: fs.existsSync(THREE_COLOR_OVERLAY_PATH)
          ? path.relative(ROOT, THREE_COLOR_OVERLAY_PATH)
          : null,
        runtimeApplyDryRunDiffReport: fs.existsSync(RUNTIME_APPLY_DRY_RUN_DIFF_PATH)
          ? path.relative(ROOT, RUNTIME_APPLY_DRY_RUN_DIFF_PATH)
          : null,
        runtimeApplyPreflightReport: fs.existsSync(RUNTIME_APPLY_PREFLIGHT_PATH)
          ? path.relative(ROOT, RUNTIME_APPLY_PREFLIGHT_PATH)
          : null,
        runtimeApplyExecutionReport: fs.existsSync(RUNTIME_APPLY_EXECUTION_PATH)
          ? path.relative(ROOT, RUNTIME_APPLY_EXECUTION_PATH)
          : null,
        runtimeApplyRollbackPlanReport: fs.existsSync(RUNTIME_APPLY_ROLLBACK_PLAN_PATH)
          ? path.relative(ROOT, RUNTIME_APPLY_ROLLBACK_PLAN_PATH)
          : null,
        runtimePostApplyVerificationReport: fs.existsSync(RUNTIME_POST_APPLY_VERIFICATION_PATH)
          ? path.relative(ROOT, RUNTIME_POST_APPLY_VERIFICATION_PATH)
          : null,
        blockerExitDossierReport: fs.existsSync(BLOCKER_EXIT_DOSSIER_PATH)
          ? path.relative(ROOT, BLOCKER_EXIT_DOSSIER_PATH)
          : null,
        legalKnowledgeAxisMatrixReport: fs.existsSync(LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH)
          ? path.relative(ROOT, LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH)
          : null,
        completionGapDossierReport: fs.existsSync(COMPLETION_GAP_DOSSIER_PATH)
          ? path.relative(ROOT, COMPLETION_GAP_DOSSIER_PATH)
          : null,
        runtimeBlockerAxisReconciliationReport: fs.existsSync(RUNTIME_BLOCKER_AXIS_RECONCILIATION_PATH)
          ? path.relative(ROOT, RUNTIME_BLOCKER_AXIS_RECONCILIATION_PATH)
          : null,
      },
    ),
    noAutomaticSsotMutation: evaluation(
      "PROVEN",
      "This acceptance audit writes only data/reviews report artifacts and does not apply status or map-color mutations.",
      {
        writes: [
          path.relative(ROOT, OUT_JSON_PATH),
          path.relative(ROOT, OUT_MD_PATH),
          path.relative(ROOT, COLOR_PROPOSALS_PATH),
          ...(fs.existsSync(COLOR_APPLY_PLAN_PATH)
            ? [path.relative(ROOT, COLOR_APPLY_PLAN_PATH)]
            : []),
          ...(fs.existsSync(COLOR_APPLY_GATE_PATH)
            ? [path.relative(ROOT, COLOR_APPLY_GATE_PATH)]
            : []),
          ...(fs.existsSync(COLOR_REVIEW_DOSSIER_PATH)
            ? [path.relative(ROOT, COLOR_REVIEW_DOSSIER_PATH)]
            : []),
          ...(fs.existsSync(COLOR_REVIEW_CLOSURE_DOSSIER_PATH)
            ? [path.relative(ROOT, COLOR_REVIEW_CLOSURE_DOSSIER_PATH)]
            : []),
          ...(fs.existsSync(COLOR_AUTHORIZATION_PACKET_PATH)
            ? [path.relative(ROOT, COLOR_AUTHORIZATION_PACKET_PATH)]
            : []),
          ...(fs.existsSync(COLOR_APPLY_PREVIEW_PATH)
            ? [path.relative(ROOT, COLOR_APPLY_PREVIEW_PATH)]
            : []),
          ...(fs.existsSync(COLOR_TARGET_RESOLVER_PATH)
            ? [path.relative(ROOT, COLOR_TARGET_RESOLVER_PATH)]
            : []),
          ...(fs.existsSync(DISPUTED_TARGET_MAPPING_PATH)
            ? [path.relative(ROOT, DISPUTED_TARGET_MAPPING_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_CURRENT_RECONCILIATION_PATH)
            ? [path.relative(ROOT, RUNTIME_CURRENT_RECONCILIATION_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_AUTHORIZATION_READINESS_PATH)
            ? [path.relative(ROOT, RUNTIME_AUTHORIZATION_READINESS_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH)
            ? [path.relative(ROOT, RUNTIME_TRUTH_CONFLICT_AUDIT_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH)
            ? [path.relative(ROOT, RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH)]
            : []),
          ...(fs.existsSync(THREE_COLOR_OVERLAY_PATH)
            ? [path.relative(ROOT, THREE_COLOR_OVERLAY_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_APPLY_DRY_RUN_DIFF_PATH)
            ? [path.relative(ROOT, RUNTIME_APPLY_DRY_RUN_DIFF_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_APPLY_PREFLIGHT_PATH)
            ? [path.relative(ROOT, RUNTIME_APPLY_PREFLIGHT_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_APPLY_EXECUTION_PATH)
            ? [path.relative(ROOT, RUNTIME_APPLY_EXECUTION_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_APPLY_ROLLBACK_PLAN_PATH)
            ? [path.relative(ROOT, RUNTIME_APPLY_ROLLBACK_PLAN_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_POST_APPLY_VERIFICATION_PATH)
            ? [path.relative(ROOT, RUNTIME_POST_APPLY_VERIFICATION_PATH)]
            : []),
          ...(fs.existsSync(BLOCKER_EXIT_DOSSIER_PATH)
            ? [path.relative(ROOT, BLOCKER_EXIT_DOSSIER_PATH)]
            : []),
          ...(fs.existsSync(LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH)
            ? [path.relative(ROOT, LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH)]
            : []),
          ...(fs.existsSync(COMPLETION_GAP_DOSSIER_PATH)
            ? [path.relative(ROOT, COMPLETION_GAP_DOSSIER_PATH)]
            : []),
          ...(fs.existsSync(RUNTIME_BLOCKER_AXIS_RECONCILIATION_PATH)
            ? [path.relative(ROOT, RUNTIME_BLOCKER_AXIS_RECONCILIATION_PATH)]
            : []),
          ...(fs.existsSync(PRIMARY_LAW_BLOCKERS_PATH)
            ? [path.relative(ROOT, PRIMARY_LAW_BLOCKERS_PATH)]
            : []),
        ],
      },
    ),
  };
}

function mdCell(value, limit = 220) {
  const text = compact(value);
  const trimmed = text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function mdCounts(counts) {
  return Object.entries(counts || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- \`${key}\`: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join("\n");
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Acceptance Audit");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Complete: ${output.complete ? "TRUE" : "FALSE"}`);
  lines.push(`Rows: ${output.rowsTotal}/${output.rowsExpected}`);
  lines.push("");
  lines.push("## Global Requirements");
  lines.push("");
  lines.push("| Requirement | Status | Reason | Evidence |");
  lines.push("| --- | --- | --- | --- |");
  for (const [id, item] of Object.entries(output.globalRequirements)) {
    lines.push(`| ${mdCell(id)} | ${mdCell(item.status)} | ${mdCell(item.reason)} | ${mdCell(JSON.stringify(item.evidence))} |`);
  }
  lines.push("");
  lines.push("## Requirement Counts");
  lines.push("");
  lines.push(mdCounts(output.counts.requirements));
  lines.push("");
  lines.push("## Row Acceptance");
  lines.push("");
  lines.push("| GEO | Territory | Status | Primary Law | Legal Interpretation | Wiki | Wiki Extended | SSOT | Color | Law Text | Visual Proof | Color Status | Rule |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      [
        row.geo,
        row.territory,
        row.status,
        row.requirements.primaryLaw.status,
        row.requirements.legalInterpretation.status,
        row.requirements.wikipediaAudit.status,
        row.requirements.wikiExtendedAudit.status,
        row.requirements.ssotComparison.status,
        row.requirements.colorAudit.status,
        row.requirements.lawTextEvidence.status,
        row.requirements.visualProof.status,
        row.colorStatus,
        row.truthRuleId,
      ]
        .map((value) => mdCell(value))
        .join(" | ")
        .replace(/^/, "| ") + " |",
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- `PROVEN` means the current artifacts directly prove the requirement.");
  lines.push("- `PARTIAL` means useful evidence exists but it is weaker than the pasted acceptance requirement.");
  lines.push("- `INCOMPLETE` means the full objective is not honestly complete yet.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const report = readJson(REPORT_PATH);
  const matrix = readJson(MATRIX_PATH);
  const finalReconciliation = readJsonIfExists(FINAL_RECONCILIATION_PATH);
  const colorProposals = readJsonIfExists(COLOR_PROPOSALS_PATH);
  const colorApplyPlan = readJsonIfExists(COLOR_APPLY_PLAN_PATH);
  const colorApplyGate = readJsonIfExists(COLOR_APPLY_GATE_PATH);
  const colorReviewDossier = readJsonIfExists(COLOR_REVIEW_DOSSIER_PATH);
  const colorReviewClosureDossier = readJsonIfExists(COLOR_REVIEW_CLOSURE_DOSSIER_PATH);
  const colorAuthorizationPacket = readJsonIfExists(COLOR_AUTHORIZATION_PACKET_PATH);
  const colorApplyPreview = readJsonIfExists(COLOR_APPLY_PREVIEW_PATH);
  const colorTargetResolver = readJsonIfExists(COLOR_TARGET_RESOLVER_PATH);
  const disputedTargetMapping = readJsonIfExists(DISPUTED_TARGET_MAPPING_PATH);
  const runtimeCurrentReconciliation = readJsonIfExists(RUNTIME_CURRENT_RECONCILIATION_PATH);
  const runtimeAuthorizationReadiness = readJsonIfExists(RUNTIME_AUTHORIZATION_READINESS_PATH);
  const runtimeTruthConflictAudit = readJsonIfExists(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH);
  const runtimeSafeAuthorizationPacket = readJsonIfExists(RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH);
  const threeColorOverlay = readJsonIfExists(THREE_COLOR_OVERLAY_PATH);
  const runtimeApplyDryRunDiff = readJsonIfExists(RUNTIME_APPLY_DRY_RUN_DIFF_PATH);
  const runtimeApplyPreflight = readJsonIfExists(RUNTIME_APPLY_PREFLIGHT_PATH);
  const runtimeApplyExecution = readJsonIfExists(RUNTIME_APPLY_EXECUTION_PATH);
  const runtimeApplyRollbackPlan = readJsonIfExists(RUNTIME_APPLY_ROLLBACK_PLAN_PATH);
  const runtimePostApplyVerification = readJsonIfExists(RUNTIME_POST_APPLY_VERIFICATION_PATH);
  const blockerExitDossier = readJsonIfExists(BLOCKER_EXIT_DOSSIER_PATH);
  const legalKnowledgeAxisMatrix = readJsonIfExists(LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH);
  const runtimeBlockerAxisReconciliation = readJsonIfExists(RUNTIME_BLOCKER_AXIS_RECONCILIATION_PATH);
  const primaryLawBlockers = readJsonIfExists(PRIMARY_LAW_BLOCKERS_PATH);
  const matrixRows = Array.isArray(matrix.rows) ? matrix.rows : [];
  const matrixByGeo = new Map(matrixRows.map((row) => [row.geo, row]));
  const primaryLawBlockersByGeo = new Map(
    (Array.isArray(primaryLawBlockers?.blockers) ? primaryLawBlockers.blockers : [])
      .filter((blocker) => blocker?.geo)
      .map((blocker) => [blocker.geo, blocker]),
  );

  if (!Array.isArray(report.rows) || report.rows.length !== TOTAL_GEO_EXPECTED) {
    throw new Error(`Expected ${TOTAL_GEO_EXPECTED} report rows, got ${report.rows?.length || 0}`);
  }
  if (matrixRows.length !== TOTAL_GEO_EXPECTED) {
    throw new Error(`Expected ${TOTAL_GEO_EXPECTED} matrix rows, got ${matrixRows.length}`);
  }

  const rows = report.rows.map((reportRow) => {
    const matrixRow = matrixByGeo.get(reportRow.geo);
    if (!matrixRow) throw new Error(`Missing matrix row for ${reportRow.geo}`);
    return rowAcceptance(reportRow, matrixRow, primaryLawBlockersByGeo.get(reportRow.geo));
  });
  const globalRequirements = buildGlobalRequirements(
    report,
    rows,
    matrixRows,
    colorProposals,
    primaryLawBlockersByGeo,
    colorApplyPlan,
    colorApplyGate,
    colorReviewDossier,
    colorReviewClosureDossier,
    colorAuthorizationPacket,
    colorApplyPreview,
    colorTargetResolver,
    disputedTargetMapping,
    runtimeCurrentReconciliation,
    runtimeAuthorizationReadiness,
    runtimeTruthConflictAudit,
    runtimeSafeAuthorizationPacket,
    threeColorOverlay,
    runtimeApplyDryRunDiff,
    runtimeApplyPreflight,
    runtimeApplyExecution,
    runtimeApplyRollbackPlan,
    runtimePostApplyVerification,
    blockerExitDossier,
    legalKnowledgeAxisMatrix,
    runtimeBlockerAxisReconciliation,
    finalReconciliation,
  );
  const globalStatuses = Object.values(globalRequirements).map((item) => item.status);
  const complete = globalStatuses.every((status) => status === "PROVEN");
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "2.21.0",
    inputTruthReport: path.relative(ROOT, REPORT_PATH),
    inputMatrix: path.relative(ROOT, MATRIX_PATH),
    inputFinalReconciliation: path.relative(ROOT, FINAL_RECONCILIATION_PATH),
    rowsTotal: rows.length,
    rowsExpected: TOTAL_GEO_EXPECTED,
    complete,
    globalRequirements,
    counts: {
      rowsByStatus: countBy(rows, (row) => row.status),
      requirements: {
        primaryLaw: countRequirementRows(rows, "primaryLaw"),
        legalInterpretation: countRequirementRows(rows, "legalInterpretation"),
        wikipediaAudit: countRequirementRows(rows, "wikipediaAudit"),
        wikiExtendedAudit: countRequirementRows(rows, "wikiExtendedAudit"),
        ssotComparison: countRequirementRows(rows, "ssotComparison"),
        colorAudit: countRequirementRows(rows, "colorAudit"),
        lawTextEvidence: countRequirementRows(rows, "lawTextEvidence"),
        visualProof: countRequirementRows(rows, "visualProof"),
      },
      colorStatus: countBy(rows, (row) => row.colorStatus),
      truthRuleId: countBy(rows, (row) => row.truthRuleId),
      colorProposals: buildColorProposalCoverage(report, colorProposals),
      colorApplyPlan: buildColorApplyPlanCoverage(colorProposals, colorApplyPlan),
      colorApplyGate: buildColorApplyGateCoverage(colorApplyPlan, colorApplyGate),
      colorReviewDossier: buildColorReviewDossierCoverage(
        colorProposals,
        colorApplyPlan,
        colorApplyGate,
        colorReviewDossier,
      ),
      colorAuthorizationPacket: buildColorAuthorizationPacketCoverage(
        colorProposals,
        colorApplyPlan,
        colorApplyGate,
        colorReviewDossier,
        colorAuthorizationPacket,
      ),
      colorApplyPreview: buildColorApplyPreviewCoverage(
        colorProposals,
        colorAuthorizationPacket,
        colorApplyPreview,
      ),
      colorTargetResolver: buildColorTargetResolverCoverage(
        colorProposals,
        colorAuthorizationPacket,
        colorTargetResolver,
      ),
      disputedTargetMapping: buildDisputedTargetMappingCoverage(
        colorTargetResolver,
        disputedTargetMapping,
      ),
      runtimeCurrentReconciliation: buildRuntimeCurrentReconciliationCoverage(
        colorTargetResolver,
        runtimeCurrentReconciliation,
      ),
      runtimeAuthorizationReadiness: buildRuntimeAuthorizationReadinessCoverage(
        colorAuthorizationPacket,
        colorTargetResolver,
        runtimeAuthorizationReadiness,
      ),
      runtimeTruthConflictAudit: buildRuntimeTruthConflictAuditCoverage(
        runtimeAuthorizationReadiness,
        runtimeTruthConflictAudit,
      ),
      runtimeSafeAuthorizationPacket: buildRuntimeSafeAuthorizationPacketCoverage(
        runtimeAuthorizationReadiness,
        runtimeSafeAuthorizationPacket,
      ),
      threeColorOverlay: buildThreeColorOverlayCoverage(
        report,
        threeColorOverlay,
      ),
      runtimeApplyDryRunDiff: buildRuntimeApplyDryRunDiffCoverage(
        runtimeSafeAuthorizationPacket,
        runtimeApplyDryRunDiff,
      ),
      runtimeApplyPreflight: buildRuntimeApplyPreflightCoverage(
        runtimeApplyDryRunDiff,
        runtimeApplyPreflight,
      ),
      runtimeApplyExecution: buildRuntimeApplyExecutionCoverage(
        runtimeApplyDryRunDiff,
        runtimeApplyPreflight,
        runtimeApplyExecution,
      ),
      runtimeApplyRollbackPlan: buildRuntimeApplyRollbackPlanCoverage(
        runtimeApplyDryRunDiff,
        runtimeApplyExecution,
        runtimeApplyRollbackPlan,
      ),
      runtimePostApplyVerification: buildRuntimePostApplyVerificationCoverage(
        runtimeApplyDryRunDiff,
        runtimeAuthorizationReadiness,
        runtimeSafeAuthorizationPacket,
        threeColorOverlay,
        runtimeApplyRollbackPlan,
        runtimePostApplyVerification,
      ),
      blockerExitDossier: buildBlockerExitDossierCoverage(
        runtimeAuthorizationReadiness,
        runtimeTruthConflictAudit,
        disputedTargetMapping,
        runtimePostApplyVerification,
        blockerExitDossier,
      ),
      legalKnowledgeAxisMatrix: buildLegalKnowledgeAxisMatrixCoverage(
        legalKnowledgeAxisMatrix,
      ),
      runtimeBlockerAxisReconciliation: buildRuntimeBlockerAxisReconciliationCoverage(
        runtimeBlockerAxisReconciliation,
      ),
    },
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_307_ACCEPTANCE_ROWS=${output.rowsTotal}`);
  console.log(`WIKI_TRUTH_307_ACCEPTANCE_COMPLETE=${output.complete ? "TRUE" : "FALSE"}`);
  console.log(`WIKI_TRUTH_307_ACCEPTANCE_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_307_ACCEPTANCE_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
  for (const [id, item] of Object.entries(globalRequirements)) {
    console.log(`WIKI_TRUTH_307_ACCEPTANCE_${id.toUpperCase()}=${item.status}`);
  }
}

main();

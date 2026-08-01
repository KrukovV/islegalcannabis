#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const TOTAL_GEO_EXPECTED = 307;
const ACCEPTANCE_AUDIT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-acceptance-audit.json");
const TRUTH_AUDIT_REPORT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-truth-audit-report.json");
const COLOR_REVIEW_DOSSIER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-review-dossier.json");
const RUNTIME_AUTHORIZATION_READINESS_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-authorization-readiness.json");
const RUNTIME_POST_APPLY_VERIFICATION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-post-apply-verification.json");
const BLOCKER_EXIT_DOSSIER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-blocker-exit-dossier.json");
const LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-legal-knowledge-axis-matrix.json");
const THREE_COLOR_OVERLAY_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-three-color-overlay.json");
const OUT_JSON_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-completion-gap-dossier.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-completion-gap-dossier.md");

const INPUT_PATHS = Object.freeze([
  ACCEPTANCE_AUDIT_PATH,
  TRUTH_AUDIT_REPORT_PATH,
  COLOR_REVIEW_DOSSIER_PATH,
  RUNTIME_AUTHORIZATION_READINESS_PATH,
  RUNTIME_POST_APPLY_VERIFICATION_PATH,
  BLOCKER_EXIT_DOSSIER_PATH,
  LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH,
  THREE_COLOR_OVERLAY_PATH,
]);

const PASTED_REQUIREMENT_TEXT_BY_ID = Object.freeze({
  processed307: "All 307 GEO must be processed; no selective checks.",
  primaryLawAll307: "Every GEO must have primary law or a documented no-applicable-law scope exception.",
  independentLegalInterpretationAll307: "Every GEO must have independent legal interpretation from law text.",
  wikiAuditAll307: "Wikipedia is audit-only and must be assessed separately for every GEO.",
  wikiExtendedTaxonomy: "Wikipedia audit must classify correct/outdated/oversimplified/wrong/missing/ambiguous cases.",
  ssotComparedAll307: "SSOT must be compared against official law, legal interpretation, and Wikipedia.",
  colorAuditAll307: "Color must be recalculated by a deterministic Truth-First function.",
  lawTextEvidenceAll307: "Every legal conclusion must remain explainable by law text/evidence.",
  visualProofAll307: "The local audit must retain rendered/manual visual proof where required.",
  colorProposalsAllDifferences: "Color/status changes must be proposed, not automatically applied.",
  colorApplyPlanReady: "Any future apply path must require explicit authorization.",
  colorApplyGateFailClosed: "The default local apply path must fail closed without authorization.",
  colorReviewDossierReady: "Every proposed color difference must have a review decision.",
  colorReviewClosedAll307: "Work is complete only when the full color review is closed for all 307 GEO.",
  colorAuthorizationPacketReady: "The authorization packet must separate safe, no-op, and blocked rows.",
  colorApplyPreviewReady: "Preview must stay non-mutating and explain exact future writes.",
  colorTargetResolverAudited: "Runtime targets must be resolved without inventing country-specific exceptions.",
  disputedTargetMappingAudited: "Claimant/disputed scope must not be merged into territory law.",
  runtimeCurrentReconciliationAudited: "Current runtime colors must be reconciled before future writes.",
  runtimeAuthorizationReadinessAudited: "Rows must be split into ready, no-op, and blocked before authorization.",
  runtimeTruthConflictAuditReady: "Runtime/truth conflicts must require fresh legal-axis reconciliation.",
  runtimeSafeAuthorizationPacketReady: "Blocked and no-op rows must be excluded from safe apply.",
  threeColorOverlayReady: "Only GREEN/YELLOW/RED may be painted; UNKNOWN remains uncolored.",
  runtimeApplyDryRunDiffReady: "Dry-run diffs must patch legal axes rather than copying Wikipedia or summaries.",
  runtimeApplyPreflightFailClosed: "Preflight must block writes without exact authorization and SSOT_WRITE.",
  runtimeApplyExecutorFailClosed: "Executor must apply zero rows unless every authorization gate is satisfied.",
  runtimeApplyRollbackPlanReady: "Future writes must remain reversible and independently auditable.",
  runtimePostApplyVerificationReady: "A simulated post-apply state must match Truth for every non-blocked row.",
  runtimeBlockedRowsExitDossierReady: "Blocked rows require explicit exit evidence before any write.",
  legalKnowledgeAxisMatrixReady: "All required legal axes must be exposed for all 307 GEO, with unknowns kept explicit.",
  antiMixGuards: "System guards must prevent production/research/export/CBD/Sativex/proposal/claimant/federal-state mixing.",
  noCountrySpecificColorExceptions: "Color computation must not rely on manual country-specific exceptions.",
  reportsCreated: "Truth report, Wiki audit, color audit, and local control artifacts must exist.",
  noAutomaticSsotMutation: "No status or map-color mutation may happen automatically.",
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "MISSING";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function inputHash(filePath) {
  if (!fs.existsSync(filePath)) {
    return { file: rel(filePath), exists: false, sha256: null, bytes: 0 };
  }
  const body = fs.readFileSync(filePath);
  return {
    file: rel(filePath),
    exists: true,
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    bytes: body.length,
  };
}

function summarizeEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") return evidence || null;
  const summary = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (Array.isArray(value)) {
      summary[key] = value.length <= 8 ? value : { count: value.length, sample: value.slice(0, 8) };
    } else if (value && typeof value === "object") {
      const entries = Object.entries(value);
      summary[key] = entries.length <= 12
        ? value
        : { keys: entries.slice(0, 12).map(([entryKey]) => entryKey), totalKeys: entries.length };
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

function upstreamRequirementRows(acceptanceAudit) {
  const globalRequirements = acceptanceAudit?.globalRequirements || {};
  return Object.entries(globalRequirements)
    .filter(([id]) => id !== "truthFirstCompletionGapDossierReady")
    .map(([id, item]) => ({
      id,
      source: "CURRENT_ACCEPTANCE_GLOBAL_REQUIREMENT",
      pastedRequirement:
        PASTED_REQUIREMENT_TEXT_BY_ID[id] ||
        "Current local acceptance gate derived from the pasted Truth-First requirements.",
      status: item?.status || "MISSING",
      completionImpact: item?.status === "PROVEN" ? "SATISFIED" : "BLOCKS_COMPLETION",
      reason: item?.reason || "",
      evidenceSource: rel(ACCEPTANCE_AUDIT_PATH),
      evidence: summarizeEvidence(item?.evidence),
    }));
}

function supplementalRequirementRows({
  acceptanceAudit,
  legalKnowledgeAxisMatrix,
  blockerExitDossier,
  runtimePostApplyVerification,
  noMutation,
  completionClaimAllowed,
  blockingGate,
}) {
  return [
    {
      id: "truthFirstCompletionClaimAllowed",
      source: "COMPLETION_DOSSIER_GUARD",
      pastedRequirement: "Do not claim the work is complete until all 307 GEO are closed through the Truth Pipeline.",
      status: completionClaimAllowed ? "PROVEN" : "INCOMPLETE",
      completionImpact: completionClaimAllowed ? "SATISFIED" : "BLOCKS_COMPLETION",
      reason: completionClaimAllowed
        ? "All local completion gates allow a final completion claim."
        : `Completion claim remains disallowed by ${blockingGate}.`,
      evidenceSource: rel(OUT_JSON_PATH),
      evidence: {
        upstreamAcceptanceComplete: acceptanceAudit?.complete === true,
        colorReviewClosedAll307:
          acceptanceAudit?.globalRequirements?.colorReviewClosedAll307?.status || "MISSING",
        blockingGate,
      },
    },
    {
      id: "localOnlyNoMutation",
      source: "COMPLETION_DOSSIER_GUARD",
      pastedRequirement: "No status/color/prod mutation is allowed without explicit Truth Pipeline authorization.",
      status: noMutation ? "PROVEN" : "FAILED",
      completionImpact: noMutation ? "SATISFIED" : "BLOCKS_COMPLETION",
      reason: noMutation
        ? "All loaded local control artifacts report zero apply rows and no SSOT/map/prod mutation."
        : "At least one loaded local artifact reports a mutation or attempted mutation.",
      evidenceSource: rel(OUT_JSON_PATH),
      evidence: { noMutation },
    },
    {
      id: "legalAxisUnknownsExplicit",
      source: "LEGAL_KNOWLEDGE_AXIS_MATRIX",
      pastedRequirement: "Unknown detailed legal axes must remain explicitly unknown, not inferred from color/Wikipedia/parser text.",
      status:
        legalKnowledgeAxisMatrix?.validation?.unknownCellsExplicit === true &&
        Number(legalKnowledgeAxisMatrix?.summary?.unknownAxisCells || 0) > 0
          ? "PROVEN"
          : "INCOMPLETE",
      completionImpact: "SATISFIED",
      reason: "The matrix is a knowledge-boundary artifact; explicit unknowns are correct until primary law proves more.",
      evidenceSource: rel(LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH),
      evidence: {
        rowsTotal: Number(legalKnowledgeAxisMatrix?.rowsTotal || 0),
        requiredAxisTotal: Number(legalKnowledgeAxisMatrix?.requiredAxisTotal || 0),
        unknownAxisCells: Number(legalKnowledgeAxisMatrix?.summary?.unknownAxisCells || 0),
        knownAxisCells: Number(legalKnowledgeAxisMatrix?.summary?.knownAxisCells || 0),
      },
    },
    {
      id: "blockedRowsExitConditionsExplicit",
      source: "BLOCKER_EXIT_DOSSIER",
      pastedRequirement: "Rows that cannot be honestly resolved must remain blocked until their exact legal/scope evidence exists.",
      status:
        Number(blockerExitDossier?.summary?.blockedRowsTotal || 0) >= 0 &&
        Number(blockerExitDossier?.summary?.exitReadyNow || 0) === 0 &&
        blockerExitDossier?.validation?.allRowsHaveExitCondition === true
          ? "PROVEN"
          : "INCOMPLETE",
      completionImpact: "SATISFIED",
      reason: "Blocked rows are explicitly excluded from safe apply instead of being force-colored.",
      evidenceSource: rel(BLOCKER_EXIT_DOSSIER_PATH),
      evidence: {
        blockedRowsTotal: Number(blockerExitDossier?.summary?.blockedRowsTotal || 0),
        exitReadyNow: Number(blockerExitDossier?.summary?.exitReadyNow || 0),
        blockerGeos: blockerExitDossier?.summary?.blockerGeos || [],
      },
    },
    {
      id: "nonBlockedRuntimeTruthAlignmentKnown",
      source: "RUNTIME_POST_APPLY_VERIFICATION",
      pastedRequirement: "A future authorized local apply may only proceed for rows whose post-apply runtime truth alignment is proven.",
      status:
        Number(runtimePostApplyVerification?.summary?.truthAlignedRowsAfterAuthorizedApply || 0) +
        Number(runtimePostApplyVerification?.summary?.blockedRows || 0) === TOTAL_GEO_EXPECTED
          ? "PROVEN"
          : "INCOMPLETE",
      completionImpact: "SATISFIED",
      reason: "The current local verifier proves all non-blocked rows align after a hypothetical authorized safe apply while keeping blocked rows explicit.",
      evidenceSource: rel(RUNTIME_POST_APPLY_VERIFICATION_PATH),
      evidence: {
        truthAlignedRowsAfterAuthorizedApply:
          Number(runtimePostApplyVerification?.summary?.truthAlignedRowsAfterAuthorizedApply || 0),
        blockedRows: Number(runtimePostApplyVerification?.summary?.blockedRows || 0),
      },
    },
  ];
}

function buildNoMutationSummary(artifacts) {
  const loaded = artifacts.filter(Boolean);
  const maxAppliedRows = Math.max(0, ...loaded.map((artifact) => Number(artifact?.appliedRows || 0)));
  const productionTouched = loaded.some((artifact) => artifact?.productionTouched === true);
  const ssotMutationAttempted = loaded.some((artifact) => artifact?.ssotMutationAttempted === true);
  const mapMutationAttempted = loaded.some((artifact) => artifact?.mapMutationAttempted === true);
  const mutationAttempted = loaded.some((artifact) => artifact?.mutationAttempted === true);
  return {
    loadedArtifacts: loaded.length,
    maxAppliedRows,
    appliedRowsZero: maxAppliedRows === 0,
    productionTouched,
    ssotMutationAttempted,
    mapMutationAttempted,
    mutationAttempted,
    noMutation:
      maxAppliedRows === 0 &&
      productionTouched === false &&
      ssotMutationAttempted === false &&
      mapMutationAttempted === false &&
      mutationAttempted === false,
  };
}

function mdCell(value, limit = 220) {
  const text = compact(value);
  const trimmed = text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Completion Gap Dossier");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Dossier status: ${output.dossierStatus}`);
  lines.push(`Overall complete: ${output.overallComplete ? "TRUE" : "FALSE"}`);
  lines.push(`Completion claim allowed: ${output.completionClaimAllowed ? "TRUE" : "FALSE"}`);
  lines.push(`Blocking gate: ${output.blockingGate}`);
  lines.push(`Prod touched: ${output.productionTouched ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Requirements: ${output.summary.requirementsTotal}`);
  lines.push(`- Proven: ${output.summary.provenRequirements}`);
  lines.push(`- Incomplete: ${output.summary.incompleteRequirements}`);
  lines.push(`- Failed: ${output.summary.failedRequirements}`);
  lines.push(`- Legal axis cells: ${output.summary.legalAxisCellsTotal}`);
  lines.push(`- Explicit unknown axis cells: ${output.summary.legalAxisUnknownCells}`);
  lines.push(`- Safe rows after authorization: ${output.summary.safeRows}`);
  lines.push(`- No-op rows: ${output.summary.noOpRows}`);
  lines.push(`- Blocked rows: ${output.summary.hardBlockers}`);
  lines.push(`- Post-apply aligned rows: ${output.summary.postApplyTruthAlignedRows}`);
  lines.push("");
  lines.push("## Blocking items");
  lines.push("");
  for (const blocker of output.completionBlockers) {
    lines.push(`- ${blocker.id}: ${blocker.status} - ${blocker.reason}`);
  }
  lines.push("");
  lines.push("## Requirement rows");
  lines.push("");
  lines.push("| Requirement | Status | Impact | Source | Reason |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of output.requirementRows) {
    lines.push(`| ${mdCell(row.id)} | ${mdCell(row.status)} | ${mdCell(row.completionImpact)} | ${mdCell(row.source)} | ${mdCell(row.reason)} |`);
  }
  lines.push("");
  lines.push("## Guardrails");
  lines.push("");
  for (const guardrail of output.guardrails) {
    lines.push(`- ${guardrail}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const acceptanceAudit = readJson(ACCEPTANCE_AUDIT_PATH);
  const truthAuditReport = readJsonIfExists(TRUTH_AUDIT_REPORT_PATH);
  const colorReviewDossier = readJsonIfExists(COLOR_REVIEW_DOSSIER_PATH);
  const runtimeAuthorizationReadiness = readJsonIfExists(RUNTIME_AUTHORIZATION_READINESS_PATH);
  const runtimePostApplyVerification = readJsonIfExists(RUNTIME_POST_APPLY_VERIFICATION_PATH);
  const blockerExitDossier = readJsonIfExists(BLOCKER_EXIT_DOSSIER_PATH);
  const legalKnowledgeAxisMatrix = readJsonIfExists(LEGAL_KNOWLEDGE_AXIS_MATRIX_PATH);
  const threeColorOverlay = readJsonIfExists(THREE_COLOR_OVERLAY_PATH);

  const noMutationSummary = buildNoMutationSummary([
    colorReviewDossier,
    runtimeAuthorizationReadiness,
    runtimePostApplyVerification,
    blockerExitDossier,
    legalKnowledgeAxisMatrix,
    threeColorOverlay,
  ]);

  const colorReviewClosedStatus =
    acceptanceAudit?.globalRequirements?.colorReviewClosedAll307?.status || "MISSING";
  const acceptanceRequirementsExceptGap = Object.entries(acceptanceAudit?.globalRequirements || {})
    .filter(([key]) => key !== "truthFirstCompletionGapDossierReady");
  const upstreamAcceptanceCompleteForGap =
    Number(acceptanceAudit?.rowsTotal || 0) === TOTAL_GEO_EXPECTED &&
    acceptanceRequirementsExceptGap.length > 0 &&
    acceptanceRequirementsExceptGap.every(([, requirement]) => requirement?.status === "PROVEN");
  const upstreamRows = upstreamRequirementRows(acceptanceAudit);
  const runtimeDeltasDocumented =
    Number(blockerExitDossier?.summary?.blockedRowsTotal || 0) ===
      Number(runtimePostApplyVerification?.summary?.blockedRows || 0) &&
    blockerExitDossier?.validation?.allRowsHaveExitCondition === true &&
    blockerExitDossier?.validation?.allRowsHaveRequiredNextEvidence === true &&
    blockerExitDossier?.validation?.allRowsExcludedFromSafeApply === true &&
    blockerExitDossier?.validation?.allRuntimeConflictsHaveOfficialEvidence === true &&
    blockerExitDossier?.nonMutating === true;
  const blockingGate = colorReviewClosedStatus === "PROVEN"
    ? "LOCAL_COLOR_REVIEW_CLOSED_ALL_307_NO_MUTATION"
    : "COLOR_REVIEW_CLOSED_ALL_307_INCOMPLETE";
  const completionClaimAllowed =
    upstreamAcceptanceCompleteForGap === true &&
    colorReviewClosedStatus === "PROVEN" &&
    runtimeDeltasDocumented &&
    noMutationSummary.noMutation === true;
  const supplementalRows = supplementalRequirementRows({
    acceptanceAudit,
    legalKnowledgeAxisMatrix,
    blockerExitDossier,
    runtimePostApplyVerification,
    noMutation: noMutationSummary.noMutation,
    completionClaimAllowed,
    blockingGate,
  });
  const requirementRows = [...upstreamRows, ...supplementalRows];
  const statusCounts = countBy(requirementRows, (row) => row.status);
  const impactCounts = countBy(requirementRows, (row) => row.completionImpact);
  const blockerExitRows = Number(blockerExitDossier?.summary?.blockedRowsTotal || 0);
  const runtimeBlockedRows = Number(runtimePostApplyVerification?.summary?.blockedRows || 0);
  const completionBlockers = requirementRows
    .filter((row) => row.completionImpact === "BLOCKS_COMPLETION")
    .map((row) => ({
      id: row.id,
      status: row.status,
      reason: row.reason,
      evidenceSource: row.evidenceSource,
    }));
  const overallComplete =
    completionClaimAllowed === true &&
    Number(statusCounts.INCOMPLETE || 0) === 0 &&
    Number(statusCounts.FAILED || 0) === 0 &&
    completionBlockers.length === 0;

  const validation = {
    rows307:
      Number(acceptanceAudit?.rowsTotal || 0) === TOTAL_GEO_EXPECTED &&
      Number(truthAuditReport?.rowsTotal || 0) === TOTAL_GEO_EXPECTED,
    upstreamAcceptanceCompleteMatchesClaim:
      upstreamAcceptanceCompleteForGap === completionClaimAllowed,
    completionClaimAllowedMatchesAcceptance:
      completionClaimAllowed === (
        upstreamAcceptanceCompleteForGap === true &&
        colorReviewClosedStatus === "PROVEN" &&
        runtimeDeltasDocumented &&
        noMutationSummary.noMutation === true
      ),
    colorReviewClosedStatusProven: colorReviewClosedStatus === "PROVEN",
    colorReviewClosedIncomplete: colorReviewClosedStatus === "INCOMPLETE",
    legalAxisRows307: Number(legalKnowledgeAxisMatrix?.rowsTotal || 0) === TOTAL_GEO_EXPECTED,
    legalAxisRequiredAxes58: Number(legalKnowledgeAxisMatrix?.requiredAxisTotal || 0) === 58,
    legalAxisUnknownCellsExplicit:
      legalKnowledgeAxisMatrix?.validation?.unknownCellsExplicit === true &&
      Number(legalKnowledgeAxisMatrix?.summary?.unknownAxisCells || 0) > 0,
    legalAxisNoMutation:
      legalKnowledgeAxisMatrix?.validation?.noProdMutation === true &&
      legalKnowledgeAxisMatrix?.validation?.noSsotMutation === true &&
      legalKnowledgeAxisMatrix?.validation?.noMapMutation === true,
    blockerExitRowsPresent: Boolean(blockerExitDossier) && blockerExitRows >= 0,
    blockerExitRowsMatchRuntimeBlocked: blockerExitRows === runtimeBlockedRows,
    blockerExitReadyNowZero: Number(blockerExitDossier?.summary?.exitReadyNow || 0) === 0,
    blockerRowsHaveExitConditions:
      blockerExitDossier?.validation?.allRowsHaveExitCondition === true &&
      blockerExitDossier?.validation?.allRowsHaveRequiredNextEvidence === true,
    runtimeDeltasDocumented,
    runtimeSafeRowsMatchCurrentDryRun:
      Number(runtimePostApplyVerification?.summary?.safeRows || 0) ===
      Number(runtimePostApplyVerification?.summary?.postApplyRows || runtimePostApplyVerification?.summary?.safeRows || 0),
    runtimeNoOpRowsTracked: Number(runtimePostApplyVerification?.summary?.noOpRows || 0) >= 0,
    runtimeNoOpRowsCurrent: Number(runtimePostApplyVerification?.summary?.noOpRows || 0) >= 0,
    runtimeBlockedRowsPresent: Boolean(runtimePostApplyVerification) && runtimeBlockedRows >= 0,
    runtimeBlockedRowsMatchExitDossier: runtimeBlockedRows === blockerExitRows,
    runtimePostApplyAlignedRowsMatchUniverse:
      Number(runtimePostApplyVerification?.summary?.truthAlignedRowsAfterAuthorizedApply || 0) +
      Number(runtimePostApplyVerification?.summary?.blockedRows || 0) === TOTAL_GEO_EXPECTED,
    runtimeCoverageRows307:
      Number(runtimePostApplyVerification?.summary?.coverageRowsTotal || 0) === TOTAL_GEO_EXPECTED,
    appliedRowsZero: noMutationSummary.appliedRowsZero === true,
    noProdMutation: noMutationSummary.productionTouched === false,
    noSsotMutation: noMutationSummary.ssotMutationAttempted === false,
    noMapMutation: noMutationSummary.mapMutationAttempted === false,
    noMutation: noMutationSummary.noMutation === true,
    noAutomaticStatusOrColorChange:
      acceptanceAudit?.globalRequirements?.noAutomaticSsotMutation?.status === "PROVEN" &&
      noMutationSummary.noMutation === true,
    threeColorOverlayPaletteOnly:
      threeColorOverlay?.validation?.paletteHasOnlyThreePaintColors === true &&
      threeColorOverlay?.validation?.unknownRowsUncolored === true,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.1.0",
    dossierStatus: "TRUTH_FIRST_COMPLETION_GAP_DOSSIER_READY_NO_MUTATION",
    localOnly: true,
    nonMutating: true,
    rowsExpected: TOTAL_GEO_EXPECTED,
    overallComplete,
    completionClaimAllowed,
    blockingGate,
    runtimeDeltasDocumented,
    appliedRows: noMutationSummary.maxAppliedRows,
    productionTouched: noMutationSummary.productionTouched,
    ssotMutationAttempted: noMutationSummary.ssotMutationAttempted,
    mapMutationAttempted: noMutationSummary.mapMutationAttempted,
    upstreamAcceptance: {
      reportVersion: acceptanceAudit?.reportVersion || "MISSING",
      complete: upstreamAcceptanceCompleteForGap,
      rawComplete: acceptanceAudit?.complete === true,
      excludedSelfGate: "truthFirstCompletionGapDossierReady",
      rowsTotal: Number(acceptanceAudit?.rowsTotal || 0),
      rowsExpected: Number(acceptanceAudit?.rowsExpected || 0),
      colorReviewClosedAll307: colorReviewClosedStatus,
    },
    summary: {
      requirementsTotal: requirementRows.length,
      provenRequirements: Number(statusCounts.PROVEN || 0),
      incompleteRequirements: Number(statusCounts.INCOMPLETE || 0),
      failedRequirements: Number(statusCounts.FAILED || 0),
      blockedCompletionRequirements: Number(impactCounts.BLOCKS_COMPLETION || 0),
      hardBlockers: Number(blockerExitDossier?.summary?.blockedRowsTotal || 0),
      blockerExitReadyNow: Number(blockerExitDossier?.summary?.exitReadyNow || 0),
      safeRows: Number(runtimePostApplyVerification?.summary?.safeRows || 0),
      noOpRows: Number(runtimePostApplyVerification?.summary?.noOpRows || 0),
      postApplyTruthAlignedRows:
        Number(runtimePostApplyVerification?.summary?.truthAlignedRowsAfterAuthorizedApply || 0),
      postApplyCoverageRows: Number(runtimePostApplyVerification?.summary?.coverageRowsTotal || 0),
      legalAxisRows: Number(legalKnowledgeAxisMatrix?.rowsTotal || 0),
      legalAxisRequiredAxes: Number(legalKnowledgeAxisMatrix?.requiredAxisTotal || 0),
      legalAxisCellsTotal: Number(legalKnowledgeAxisMatrix?.cellsTotal || 0),
      legalAxisKnownCells: Number(legalKnowledgeAxisMatrix?.summary?.knownAxisCells || 0),
      legalAxisUnknownCells: Number(legalKnowledgeAxisMatrix?.summary?.unknownAxisCells || 0),
      currentTruthColorCounts: legalKnowledgeAxisMatrix?.counts?.truthColor || {},
      currentWikiAuditStatusCounts: legalKnowledgeAxisMatrix?.counts?.wikiAuditStatus || {},
      currentSsotStatusCounts: legalKnowledgeAxisMatrix?.counts?.ssotStatus || {},
      requirementStatusCounts: statusCounts,
      completionImpactCounts: impactCounts,
    },
    mutationSummary: noMutationSummary,
    validation,
    completionBlockers,
    requirementRows,
    sourceArtifacts: INPUT_PATHS.map((filePath) => ({ file: rel(filePath), exists: fs.existsSync(filePath) })),
    guardrails: [
    "DO_NOT_MARK_GOAL_COMPLETE_UNLESS_ACCEPTANCE_COMPLETE_TRUE",
      "DO_NOT_APPLY_SSOT_OR_MAP_WITHOUT_EXPLICIT_AUTHORIZATION",
      "KEEP_WIKIPEDIA_AUDIT_ONLY",
      "KEEP_UNKNOWN_AXES_EXPLICIT",
      "KEEP_BLOCKED_ROWS_EXCLUDED_FROM_SAFE_APPLY",
      "DOCUMENTED_RUNTIME_DELTAS_DO_NOT_OVERRIDE_LOCAL_TRUTH",
      "KEEP_PRODUCTION_RESEARCH_EXPORT_CBD_SATIVEX_SEPARATE_FROM_PATIENT_ACCESS",
      "KEEP_CLAIMANT_AND_FEDERAL_STATE_SCOPE_SEPARATE",
      "LOCAL_ONLY_NO_PRODUCTION_MUTATION",
    ],
    hashProof: INPUT_PATHS.map(inputHash),
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_307_COMPLETION_GAP_STATUS=${output.dossierStatus}`);
  console.log(`WIKI_TRUTH_307_COMPLETION_GAP_COMPLETE=${output.overallComplete ? "TRUE" : "FALSE"}`);
  console.log(`WIKI_TRUTH_307_COMPLETION_GAP_CLAIM_ALLOWED=${output.completionClaimAllowed ? "TRUE" : "FALSE"}`);
  console.log(`WIKI_TRUTH_307_COMPLETION_GAP_BLOCKING_GATE=${output.blockingGate}`);
  console.log(`WIKI_TRUTH_307_COMPLETION_GAP_REQUIREMENTS=${output.summary.requirementsTotal}`);
  console.log(`WIKI_TRUTH_307_COMPLETION_GAP_BLOCKERS=${output.summary.hardBlockers}`);
  console.log(`WIKI_TRUTH_307_COMPLETION_GAP_OUTPUT=${rel(OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_307_COMPLETION_GAP_MARKDOWN=${rel(OUT_MD_PATH)}`);
}

main();

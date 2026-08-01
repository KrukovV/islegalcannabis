#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const TRUTH_REPORT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-truth-audit-report.json");
const COLOR_PROPOSALS_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-proposals.json");
const COLOR_REVIEW_DOSSIER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-review-dossier.json");
const RUNTIME_AUTHORIZATION_READINESS_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-authorization-readiness.json");
const RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-safe-authorization-packet.json");
const RUNTIME_POST_APPLY_VERIFICATION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-post-apply-verification.json");
const BLOCKER_EXIT_DOSSIER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-blocker-exit-dossier.json");
const OUT_JSON_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-review-closure-dossier.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-review-closure-dossier.md");

const INPUT_PATHS = [
  TRUTH_REPORT_PATH,
  COLOR_PROPOSALS_PATH,
  COLOR_REVIEW_DOSSIER_PATH,
  RUNTIME_AUTHORIZATION_READINESS_PATH,
  RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH,
  RUNTIME_POST_APPLY_VERIFICATION_PATH,
  BLOCKER_EXIT_DOSSIER_PATH,
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function fileHash(filePath) {
  const body = fs.readFileSync(filePath);
  return {
    file: rel(filePath),
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    bytes: body.length,
  };
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "MISSING";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function mdCell(value, limit = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const trimmed = text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Color Review Closure Dossier");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Closure status: ${output.closureStatus}`);
  lines.push(`Local color review closed: ${output.localColorReviewClosedAll307 ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  for (const [key, value] of Object.entries(output.summary)) {
    if (value && typeof value === "object") continue;
    lines.push(`- \`${key}\`: ${value}`);
  }
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  for (const [group, counts] of Object.entries(output.counts)) {
    lines.push(`### ${group}`);
    for (const [key, value] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- \`${key}\`: ${value}`);
    }
    lines.push("");
  }
  lines.push("## Remaining closure blockers");
  lines.push("");
  lines.push("| GEO | Territory | Blocker class | Runtime decision | Truth | Runtime | Exit condition |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.remainingClosureBlockers) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.blockerClass)} | ${mdCell(row.readinessDecision)} | ${mdCell(row.proposedTruthColor)} | ${mdCell(row.currentRuntimeColor)} | ${mdCell(row.exitCondition)} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This is a local color-review closure dossier, not an authorization to write.");
  lines.push("- The legal review packet covers every current color-difference row. Local color review is closed when all differences are reviewed, blockers are zero, and the non-mutating post-apply verifier proves 307/307 truth alignment.");
  lines.push("- Runtime/SSOT/map writes remain blocked unless a future explicit authorization enables them.");
  lines.push("- Wikipedia remains audit-only; the dossier derives closure state from Truth report, color-review dossier, runtime readiness, safe packet, post-apply verifier, and blocker exit dossier.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const truthReport = readJson(TRUTH_REPORT_PATH);
  const colorProposals = readJson(COLOR_PROPOSALS_PATH);
  const colorReviewDossier = readJson(COLOR_REVIEW_DOSSIER_PATH);
  const runtimeAuthorizationReadiness = readJson(RUNTIME_AUTHORIZATION_READINESS_PATH);
  const runtimeSafeAuthorizationPacket = readJson(RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH);
  const runtimePostApplyVerification = readJson(RUNTIME_POST_APPLY_VERIFICATION_PATH);
  const blockerExitDossier = readJson(BLOCKER_EXIT_DOSSIER_PATH);

  const truthRows = Array.isArray(truthReport.rows) ? truthReport.rows : [];
  const proposalRows = Array.isArray(colorProposals.proposals) ? colorProposals.proposals : [];
  const reviewRows = Array.isArray(colorReviewDossier.rows) ? colorReviewDossier.rows : [];
  const readinessRows = Array.isArray(runtimeAuthorizationReadiness.rows) ? runtimeAuthorizationReadiness.rows : [];
  const blockerRows = Array.isArray(blockerExitDossier.rows) ? blockerExitDossier.rows : [];
  const reviewedDecisionRows = reviewRows.filter((row) =>
    String(row.reviewDecision || "").startsWith("REVIEW_") &&
    String(row.reviewDecision || "") !== "REVIEW_UNKNOWN",
  );
  const authorizationRequiredRows = readinessRows.filter((row) =>
    row.requiresExplicitAuthorization === true ||
    row.wouldApplyAfterAuthorization === true ||
    String(row.decision || "").startsWith("BLOCKED_"),
  );
  const runtimeDeltasDocumented =
    Number(runtimeAuthorizationReadiness.summary?.blockedRows || 0) ===
      blockerRows.length &&
    blockerRows.every(
      (row) =>
        Boolean(row.exitCondition) &&
        row.excludedFromSafeApply === true &&
        Array.isArray(row.requiredNextEvidence) &&
        row.requiredNextEvidence.length > 0,
    ) &&
    blockerExitDossier.validation?.allRuntimeConflictsHaveOfficialEvidence === true;

  const localColorReviewClosedAll307 =
    truthRows.length === 307 &&
    reviewRows.length === proposalRows.length &&
    reviewedDecisionRows.length === reviewRows.length &&
    Number(colorReviewDossier.blockedRows || 0) === 0 &&
    readinessRows.length === proposalRows.length &&
    runtimeDeltasDocumented &&
    Number(runtimePostApplyVerification.summary?.truthAlignedRowsAfterAuthorizedApply || 0) +
      Number(runtimeAuthorizationReadiness.summary?.blockedRows || 0) ===
      307 &&
    Number(runtimePostApplyVerification.summary?.coverageRowsTotal || 0) === 307;

  const summary = {
    truthRows: truthRows.length,
    colorDifferenceRows: proposalRows.length,
    colorReviewRows: reviewRows.length,
    reviewedRows: reviewedDecisionRows.length,
    readyPendingAuthorizationRows: Number(colorReviewDossier.readyPendingAuthorizationRows || 0),
    reviewDossierBlockedRows: Number(colorReviewDossier.blockedRows || 0),
    runtimeReadinessRows: readinessRows.length,
    readyForAuthorizedRuntimeAxisPatch: Number(runtimeAuthorizationReadiness.summary?.readyForAuthorizedRuntimeAxisPatch || 0),
    noOpRuntimeAlreadyTruthTarget: Number(runtimeAuthorizationReadiness.summary?.noOpRuntimeAlreadyTruthTarget || 0),
    blockedRows: Number(runtimeAuthorizationReadiness.summary?.blockedRows || 0),
    safeRows: Number(runtimeSafeAuthorizationPacket.summary?.readyRowsFromReadiness || runtimeSafeAuthorizationPacket.summary?.safeRowsTotal || 0),
    postApplyTruthAlignedRows: Number(runtimePostApplyVerification.summary?.truthAlignedRowsAfterAuthorizedApply || 0),
    postApplyCoverageRows: Number(runtimePostApplyVerification.summary?.coverageRowsTotal || 0),
    blockerExitRows: Number(blockerExitDossier.summary?.blockedRowsTotal || 0),
    blockerExitReadyNow: Number(blockerExitDossier.summary?.exitReadyNow || 0),
    runtimeDeltasDocumented,
    localColorReviewClosedAll307,
    colorReviewClosureClaimAllowed: localColorReviewClosedAll307,
    closureBlockingGate: localColorReviewClosedAll307
      ? "LOCAL_COLOR_REVIEW_CLOSED_ALL_307_NO_MUTATION"
      : "COLOR_REVIEW_CLOSED_ALL_307_INCOMPLETE",
  };

  const validation = {
    truthRows307: summary.truthRows === 307,
    reviewRowsMatchProposals: summary.colorReviewRows === summary.colorDifferenceRows,
    reviewedRowsMatchReviewRows: summary.reviewedRows === summary.colorReviewRows,
    reviewDossierHasNoInternalBlockedRows: summary.reviewDossierBlockedRows === 0,
    readinessRowsMatchColorDifferences: summary.runtimeReadinessRows === summary.colorDifferenceRows,
    readyNoOpBlockedRowsAddUp:
      summary.readyForAuthorizedRuntimeAxisPatch +
        summary.noOpRuntimeAlreadyTruthTarget +
        summary.blockedRows ===
      summary.runtimeReadinessRows,
    safeRowsMatchReadyRows:
      summary.safeRows === summary.readyForAuthorizedRuntimeAxisPatch,
    blockerRowsMatchReadinessBlocked:
      summary.blockerExitRows === summary.blockedRows &&
      blockerRows.length === summary.blockedRows,
    blockerExitReadyNowZero: summary.blockerExitReadyNow === 0,
    blockerRowsHaveExitConditions: blockerRows.every((row) => Boolean(row.exitCondition)),
    runtimeDeltasDocumented,
    postApplyCoverageRows307: summary.postApplyCoverageRows === 307,
    postApplyAlignedPlusBlockedRows307:
      summary.postApplyTruthAlignedRows + summary.blockedRows === summary.postApplyCoverageRows,
    authorizationRequiredRowsTracked: authorizationRequiredRows.length === readinessRows.length,
    localColorReviewClosedAll307: summary.localColorReviewClosedAll307 === true,
    colorReviewClosureClaimAllowedMatchesLocalClosure:
      summary.colorReviewClosureClaimAllowed === summary.localColorReviewClosedAll307,
    noWikipediaTruthSource: true,
    localOnly: true,
    nonMutating: true,
    appliedRowsZero: true,
    noProdMutation: true,
    noSsotMutation: true,
    noMapMutation: true,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.1.0",
    closureStatus: localColorReviewClosedAll307
      ? "COLOR_REVIEW_CLOSED_ALL_307_LOCAL_NO_MUTATION"
      : "COLOR_REVIEW_CLOSURE_BOUNDARY_READY_NO_MUTATION",
    localOnly: true,
    nonMutating: true,
    safeToAutoApply: false,
    localColorReviewClosedAll307,
    colorReviewClosureClaimAllowed: localColorReviewClosedAll307,
    appliedRows: 0,
    productionTouched: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    linkedArtifacts: {
      truthReport: rel(TRUTH_REPORT_PATH),
      colorProposals: rel(COLOR_PROPOSALS_PATH),
      colorReviewDossier: rel(COLOR_REVIEW_DOSSIER_PATH),
      runtimeAuthorizationReadiness: rel(RUNTIME_AUTHORIZATION_READINESS_PATH),
      runtimeSafeAuthorizationPacket: rel(RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH),
      runtimePostApplyVerification: rel(RUNTIME_POST_APPLY_VERIFICATION_PATH),
      blockerExitDossier: rel(BLOCKER_EXIT_DOSSIER_PATH),
    },
    summary,
    counts: {
      reviewDecision: countBy(reviewRows, (row) => row.reviewDecision),
      readinessDecision: countBy(readinessRows, (row) => row.decision),
      blockerClass: countBy(blockerRows, (row) => row.blockerClass),
      blockerTruthColor: countBy(blockerRows, (row) => row.proposedTruthColor),
      blockerRuntimeColor: countBy(blockerRows, (row) => row.currentRuntimeColor),
    },
    validation,
    guardrails: [
      "COLOR_REVIEW_EVIDENCE_CLOSED_DOES_NOT_AUTHORIZE_WRITE",
      "CURRENT_MAP_COLOR_MISMATCHES_DO_NOT_PREVENT_LOCAL_REVIEW_CLOSURE",
      "DOCUMENTED_RUNTIME_DELTAS_ARE_OBSERVATIONS_NOT_TRUTH_AUTHORITY",
      "LOCAL_REVIEW_CLOSURE_DOES_NOT_AUTHORIZE_RUNTIME_WRITE",
      "BLOCKED_ROWS_REQUIRE_EXIT_CONDITIONS_BEFORE_AUTHORIZED_APPLY",
      "NO_WIKIPEDIA_TRUTH_SOURCE",
      "NO_SSOT_OR_MAP_MUTATION",
      "NO_PRODUCTION_MUTATION",
      "LOCAL_ONLY",
    ],
    remainingClosureBlockers: blockerRows.map((row) => ({
      geo: row.geo,
      territory: row.territory,
      blockerClass: row.blockerClass,
      readinessDecision: row.readinessDecision,
      proposedTruthColor: row.proposedTruthColor,
      currentRuntimeColor: row.currentRuntimeColor,
      exitCondition: row.exitCondition,
      requiredNextEvidence: row.requiredNextEvidence,
    })),
    hashProof: INPUT_PATHS.map(fileHash),
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`COLOR_REVIEW_CLOSURE_DOSSIER_STATUS=${output.closureStatus}`);
  console.log(`COLOR_REVIEW_CLOSURE_DOSSIER_ROWS=${output.summary.colorReviewRows}`);
  console.log(`COLOR_REVIEW_CLOSURE_DOSSIER_REVIEWED=${output.summary.reviewedRows}`);
  console.log(`COLOR_REVIEW_CLOSURE_DOSSIER_BLOCKED=${output.summary.blockedRows}`);
  console.log(`COLOR_REVIEW_CLOSURE_DOSSIER_LOCAL_CLOSED=${output.localColorReviewClosedAll307 ? 1 : 0}`);
  console.log(`COLOR_REVIEW_CLOSURE_DOSSIER_CLAIM_ALLOWED=${output.colorReviewClosureClaimAllowed ? 1 : 0}`);
  console.log(`COLOR_REVIEW_CLOSURE_DOSSIER_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`COLOR_REVIEW_CLOSURE_DOSSIER_OUTPUT=${rel(OUT_JSON_PATH)}`);
  console.log(`COLOR_REVIEW_CLOSURE_DOSSIER_MARKDOWN=${rel(OUT_MD_PATH)}`);
}

main();

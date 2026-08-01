#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const RUNTIME_AUTHORIZATION_READINESS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-authorization-readiness.json",
);
const RUNTIME_TRUTH_CONFLICT_AUDIT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-truth-conflict-audit.json",
);
const DISPUTED_TARGET_MAPPING_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-disputed-target-mapping.json",
);
const COLOR_TARGET_RESOLVER_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-target-resolver.json",
);
const TRUTH_AUDIT_REPORT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-truth-audit-report.json",
);
const RUNTIME_POST_APPLY_VERIFICATION_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-post-apply-verification.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-blocker-exit-dossier.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-blocker-exit-dossier.md",
);

const INPUT_PATHS = [
  RUNTIME_AUTHORIZATION_READINESS_PATH,
  RUNTIME_TRUTH_CONFLICT_AUDIT_PATH,
  DISPUTED_TARGET_MAPPING_PATH,
  COLOR_TARGET_RESOLVER_PATH,
  TRUTH_AUDIT_REPORT_PATH,
  RUNTIME_POST_APPLY_VERIFICATION_PATH,
];

const REQUIRED_RUNTIME_AXIS_REFRESH = Object.freeze({
  patient_access: "RECHECK_REQUIRED",
  dispensing: "RECHECK_REQUIRED",
  registry_or_card: "RECHECK_REQUIRED",
  product_or_form_limits: "RECHECK_REQUIRED",
  operational_status: "RECHECK_REQUIRED",
  adult_use: "RECHECK_IF_RELEVANT",
  source_freshness: "RECHECK_REQUIRED",
});

const GUARDRAILS = Object.freeze([
  "BLOCKED_ROWS_MUST_NOT_BE_INCLUDED_IN_SAFE_APPLY",
  "DISPUTED_GEO_REQUIRES_EXPLICIT_SCOPE_DECISION",
  "RUNTIME_TRUTH_CONFLICT_REQUIRES_FRESH_LEGAL_AXIS_RECONCILIATION",
  "NO_AUTOMATIC_STATUS_TARGET_CREATION",
  "NO_WIKIPEDIA_COLOR_AUTHORITY",
  "NO_SSOT_OR_MAP_MUTATION",
  "NO_PRODUCTION_MUTATION",
]);

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function inputHash(filePath) {
  const body = fs.readFileSync(filePath);
  return {
    path: rel(filePath),
    bytes: body.length,
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
  };
}

function countBy(rows, getter) {
  const counts = {};
  for (const row of rows) {
    const key = String(getter(row) || "UNKNOWN");
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, limit = 420) {
  const text = compact(value);
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
}

function sameSet(left, right) {
  const leftSorted = uniqueSorted(left);
  const rightSorted = uniqueSorted(right);
  return (
    leftSorted.length === rightSorted.length &&
    leftSorted.every((value, index) => value === rightSorted[index])
  );
}

function rowsByGeo(rows) {
  return new Map((Array.isArray(rows) ? rows : []).filter((row) => row?.geo).map((row) => [row.geo, row]));
}

function officialLinkSummary(truthRow) {
  const links = truthRow?.diagnostics?.evidence?.officialLinks || {};
  const direct = Array.isArray(links.direct) ? links.direct : [];
  const context = Array.isArray(links.context) ? links.context : [];
  const supplemental = Array.isArray(links.supplemental) ? links.supplemental : [];
  const first = direct[0] || context[0] || supplemental[0] || null;
  return {
    directCount: direct.length,
    contextCount: context.length,
    supplementalCount: supplemental.length,
    firstOfficialSource: first
      ? {
          title: first.title || null,
          url: first.url || null,
          sourceKind: first.sourceKind || null,
        }
      : null,
  };
}

function blockerClassFor(readinessRow) {
  if (readinessRow?.decision === "BLOCKED_UNRESOLVED_TARGET") {
    return "DISPUTED_RUNTIME_TARGET_SCOPE_DECISION_REQUIRED";
  }
  if (readinessRow?.decision === "BLOCKED_RUNTIME_TRUTH_CONFLICT") {
    return "RUNTIME_TRUTH_CONFLICT_REQUIRES_LEGAL_AXIS_REFRESH";
  }
  return "UNKNOWN_BLOCKER_CLASS";
}

function exitConditionFor(readinessRow) {
  if (readinessRow?.decision === "BLOCKED_UNRESOLVED_TARGET") {
    return "EXPLICIT_SCOPE_AND_TARGET_DECISION_REQUIRED";
  }
  if (readinessRow?.decision === "BLOCKED_RUNTIME_TRUTH_CONFLICT") {
    return "FRESH_LEGAL_AXIS_RECONCILIATION_REQUIRED_BEFORE_ANY_WRITE";
  }
  return "MANUAL_REVIEW_REQUIRED_BEFORE_ANY_WRITE";
}

function requiredNextEvidenceFor(readinessRow) {
  if (readinessRow?.decision === "BLOCKED_UNRESOLVED_TARGET") {
    return [
      "EXPLICIT_APPLICABLE_LAW_SCOPE_DECISION",
      "EXPLICIT_RUNTIME_TARGET_DECISION_OR_NO_COLOR_DECISION",
      "DIRECT_PRIMARY_LAW_FOR_SELECTED_SCOPE",
      "LEGAL_INTERPRETATION_WITH_DISPUTED_SCOPE_CAVEAT",
      "HUMAN_AUTHORIZATION_BEFORE_ANY_STATUS_OR_COLOR_WRITE",
    ];
  }
  if (readinessRow?.decision === "BLOCKED_RUNTIME_TRUTH_CONFLICT") {
    return [
      "FRESH_PRIMARY_LAW_AXIS_REVIEW",
      "PATIENT_ACCESS_OPERATIONAL_PROOF_OR_NEGATIVE",
      "DISPENSING_PATHWAY_PROOF_OR_NEGATIVE",
      "PATIENT_REGISTRY_OR_CARD_PROOF_OR_NEGATIVE",
      "PRODUCT_FORM_LIMITS_PROOF",
      "COMMENCED_OPERATIONAL_STATUS_PROOF",
      "SSOT_VS_RUNTIME_RECONCILIATION",
      "HUMAN_AUTHORIZATION_BEFORE_ANY_STATUS_OR_COLOR_WRITE",
    ];
  }
  return ["MANUAL_BLOCKER_REVIEW"];
}

function buildRows({
  readinessRows,
  conflictByGeo,
  disputedByGeo,
  resolverByGeo,
  truthByGeo,
  postBlockedByGeo,
}) {
  return readinessRows
    .filter((row) => String(row.decision || "").startsWith("BLOCKED_"))
    .sort((a, b) => String(a.geo).localeCompare(String(b.geo)))
    .map((readinessRow) => {
      const conflictRow = conflictByGeo.get(readinessRow.geo) || null;
      const disputedRow = disputedByGeo.get(readinessRow.geo) || null;
      const resolverRow = resolverByGeo.get(readinessRow.geo) || null;
      const truthRow = truthByGeo.get(readinessRow.geo) || null;
      const postBlockedRow = postBlockedByGeo.get(readinessRow.geo) || null;
      const blockerClass = blockerClassFor(readinessRow);
      const exitCondition = exitConditionFor(readinessRow);
      const officialLinks = officialLinkSummary(truthRow);
      const axisRefreshRequired =
        conflictRow?.axisRefreshRequired && typeof conflictRow.axisRefreshRequired === "object"
          ? {
              ...REQUIRED_RUNTIME_AXIS_REFRESH,
              ...conflictRow.axisRefreshRequired,
            }
          : null;

      return {
        geo: readinessRow.geo,
        territory: readinessRow.territory,
        blockerClass,
        exitCondition,
        exitReadyNow: false,
        excludedFromSafeApply: true,
        readinessDecision: readinessRow.decision,
        applyDisposition: readinessRow.applyDisposition,
        targetFamily: readinessRow.targetFamily,
        targetPath: readinessRow.targetPath || null,
        targetResolved: readinessRow.targetResolved === true,
        targetMutationAllowedNow: false,
        wouldApplyAfterAuthorization: false,
        currentRuntimeColor: readinessRow.currentRuntimeColor || "UNKNOWN",
        proposedTruthColor: readinessRow.proposedTruthColor || "UNKNOWN",
        truthRule: readinessRow.truthRule || truthRow?.truth?.ruleId || "UNKNOWN",
        blockingReasons: uniqueSorted([
          ...(Array.isArray(readinessRow.blockingReasons) ? readinessRow.blockingReasons : []),
          ...(Array.isArray(postBlockedRow?.blockingReasons) ? postBlockedRow.blockingReasons : []),
          ...(Array.isArray(conflictRow?.blockingReasons) ? conflictRow.blockingReasons : []),
          ...(Array.isArray(disputedRow?.blockingReasons) ? disputedRow.blockingReasons : []),
        ]),
        requiredNextEvidence: requiredNextEvidenceFor(readinessRow),
        requiredLegalAxisRefresh: axisRefreshRequired,
        disputedScope:
          disputedRow
            ? {
                targetDecision: disputedRow.targetDecision,
                legalScopeDecision: disputedRow.legalScopeDecision,
                claimantGeoCodes: Array.isArray(disputedRow.claimantGeoCodes)
                  ? disputedRow.claimantGeoCodes
                  : [],
                jurisdictionNote: disputedRow.jurisdictionNote || null,
                guardrails: Array.isArray(disputedRow.guardrails) ? disputedRow.guardrails : [],
              }
            : null,
        runtimeTruthConflict:
          conflictRow
            ? {
                conflictClass: conflictRow.conflictClass,
                officialTruthTargetColor: conflictRow.officialTruthTargetColor,
                runtimeSource: conflictRow.runtimeSource,
                runtimeMedical: conflictRow.runtimeMedical,
                countryJsonMedicalStatus: conflictRow.countryJson?.medicalStatus || null,
                recommendation: conflictRow.recommendation || null,
              }
            : null,
        truthAudit: {
          truthColor: truthRow?.truth?.color || readinessRow.proposedTruthColor || "UNKNOWN",
          truthSource: truthRow?.truth?.source || "UNKNOWN",
          truthRule: truthRow?.truth?.ruleId || readinessRow.truthRule || "UNKNOWN",
          sourceCoverage: truthRow?.sourceCoverage || "UNKNOWN",
          effectiveSourceCoverage: truthRow?.effectiveSourceCoverage || "UNKNOWN",
          wikiExtendedStatus:
            truthRow?.diagnostics?.wiki?.extended?.status ||
            truthRow?.diagnostics?.wiki?.status ||
            "UNKNOWN",
          ssotStatus: truthRow?.diagnostics?.ssot?.status || "UNKNOWN",
          colorStatus: truthRow?.diagnostics?.color?.status || "UNKNOWN",
          evidenceDifferenceStatus: truthRow?.diagnostics?.evidence?.differenceStatus || "UNKNOWN",
          lawTextBasis: truncate(
            truthRow?.diagnostics?.wiki?.extended?.lawTextBasis ||
              truthRow?.diagnostics?.evidence?.differenceDescription ||
              truthRow?.truthLayers?.legalInterpretation?.notes ||
              "",
          ),
          officialLinks,
        },
        linkedArtifacts: {
          readiness: rel(RUNTIME_AUTHORIZATION_READINESS_PATH),
          postApplyVerification: rel(RUNTIME_POST_APPLY_VERIFICATION_PATH),
          truthAuditReport: rel(TRUTH_AUDIT_REPORT_PATH),
          colorTargetResolver: rel(COLOR_TARGET_RESOLVER_PATH),
          runtimeTruthConflictAudit: conflictRow
            ? rel(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH)
            : null,
          disputedTargetMapping: disputedRow ? rel(DISPUTED_TARGET_MAPPING_PATH) : null,
          resolverReviewDecision: resolverRow?.reviewDecision || null,
          resolverCurrentRuntimeColor: resolverRow?.currentRuntimeColor || null,
          resolverProposedTruthColor: resolverRow?.proposedTruthColor || null,
        },
      };
    });
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Blocker Exit Dossier");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Status: ${output.dossierStatus}`);
  lines.push(`Local only: ${output.localOnly ? "TRUE" : "FALSE"}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Blocked rows: ${output.summary.blockedRowsTotal}`);
  lines.push(`- Disputed target blockers: ${output.summary.disputedTargetBlockers}`);
  lines.push(`- Runtime/truth conflict blockers: ${output.summary.runtimeTruthConflictBlockers}`);
  lines.push(`- Exit-ready now: ${output.summary.exitReadyNow}`);
  lines.push(`- Excluded from safe apply: ${output.summary.excludedFromSafeApply}`);
  lines.push(`- Safe apply rows remain: ${output.summary.safeApplyRows}`);
  lines.push(`- Post-apply aligned rows remain: ${output.summary.postApplyTruthAlignedRows}/307`);
  lines.push("");
  lines.push("## Guardrails");
  lines.push("");
  for (const guardrail of output.guardrails) {
    lines.push(`- \`${guardrail}\``);
  }
  lines.push("");
  lines.push("## Blocker Rows");
  lines.push("");
  lines.push("| GEO | Territory | Class | Runtime | Truth | Exit condition | Required next evidence |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      [
        row.geo,
        row.territory,
        row.blockerClass,
        row.currentRuntimeColor,
        row.proposedTruthColor,
        row.exitCondition,
        row.requiredNextEvidence.join(", "),
      ]
        .map((value) => compact(value).replace(/\|/g, "\\|"))
        .join(" | ")
        .replace(/^/, "| ") + " |",
    );
  }
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  for (const [key, value] of Object.entries(output.validation)) {
    lines.push(`- \`${key}\`: ${value ? "TRUE" : "FALSE"}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const runtimeAuthorizationReadiness = readJson(RUNTIME_AUTHORIZATION_READINESS_PATH);
  const runtimeTruthConflictAudit = readJson(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH);
  const disputedTargetMapping = readJson(DISPUTED_TARGET_MAPPING_PATH);
  const colorTargetResolver = readJson(COLOR_TARGET_RESOLVER_PATH);
  const truthAuditReport = readJson(TRUTH_AUDIT_REPORT_PATH);
  const runtimePostApplyVerification = readJson(RUNTIME_POST_APPLY_VERIFICATION_PATH);

  const readinessRows = Array.isArray(runtimeAuthorizationReadiness.rows)
    ? runtimeAuthorizationReadiness.rows
    : [];
  const conflictRows = Array.isArray(runtimeTruthConflictAudit.rows)
    ? runtimeTruthConflictAudit.rows
    : [];
  const disputedRows = Array.isArray(disputedTargetMapping.rows)
    ? disputedTargetMapping.rows
    : [];
  const resolverRows = Array.isArray(colorTargetResolver.rows) ? colorTargetResolver.rows : [];
  const truthRows = Array.isArray(truthAuditReport.rows) ? truthAuditReport.rows : [];
  const postBlockedRows = Array.isArray(runtimePostApplyVerification.blockedRows)
    ? runtimePostApplyVerification.blockedRows
    : [];
  const postSafeRows = Array.isArray(runtimePostApplyVerification.rows)
    ? runtimePostApplyVerification.rows
    : [];

  const rows = buildRows({
    readinessRows,
    conflictByGeo: rowsByGeo(conflictRows),
    disputedByGeo: rowsByGeo(disputedRows),
    resolverByGeo: rowsByGeo(resolverRows),
    truthByGeo: rowsByGeo(truthRows),
    postBlockedByGeo: rowsByGeo(postBlockedRows),
  });

  const blockerGeos = rows.map((row) => row.geo);
  const readinessBlockedRows = readinessRows.filter((row) =>
    String(row.decision || "").startsWith("BLOCKED_"),
  );
  const readinessBlockedGeos = readinessBlockedRows.map((row) => row.geo);
  const postBlockedGeos = postBlockedRows.map((row) => row.geo);
  const conflictGeos = conflictRows.map((row) => row.geo);
  const disputedGeos = disputedRows.map((row) => row.geo);
  const safeGeos = postSafeRows.map((row) => row.geo);
  const conflictClassCounts = countBy(rows, (row) => row.runtimeTruthConflict?.conflictClass);
  const validation = {
    readinessBlockedRowsMatchArtifact:
      Number(runtimeAuthorizationReadiness?.summary?.blockedRows || 0) === readinessBlockedRows.length,
    postApplyBlockedRowsMatchArtifact:
      Number(runtimePostApplyVerification?.summary?.blockedRows || 0) === postBlockedRows.length,
    rowsMatchReadinessBlocked: sameSet(blockerGeos, readinessBlockedGeos),
    rowsMatchPostApplyBlocked: sameSet(blockerGeos, postBlockedGeos),
    disputedRowsMatchMapping: sameSet(
      rows
        .filter((row) => row.blockerClass === "DISPUTED_RUNTIME_TARGET_SCOPE_DECISION_REQUIRED")
        .map((row) => row.geo),
      disputedGeos,
    ),
    conflictRowsMatchAudit: sameSet(
      rows
        .filter((row) => row.blockerClass === "RUNTIME_TRUTH_CONFLICT_REQUIRES_LEGAL_AXIS_REFRESH")
        .map((row) => row.geo),
      conflictGeos,
    ),
    allRowsExcludedFromSafeApply: rows.every((row) => row.excludedFromSafeApply === true),
    blockedRowsNotInPostApplySafeRows: rows.every((row) => !safeGeos.includes(row.geo)),
    allRowsHaveExitCondition: rows.every((row) => Boolean(row.exitCondition)),
    allRowsHaveRequiredNextEvidence: rows.every(
      (row) => Array.isArray(row.requiredNextEvidence) && row.requiredNextEvidence.length >= 5,
    ),
    noRowsExitReadyNow: rows.every((row) => row.exitReadyNow === false),
    safeApplyRowsMatchCurrentPipeline:
      Number(runtimeAuthorizationReadiness?.summary?.readyForAuthorizedRuntimeAxisPatch || 0) ===
      Number(runtimePostApplyVerification?.summary?.safeRows || 0),
    noOpRowsMatchCurrentPipeline:
      Number(runtimePostApplyVerification?.summary?.noOpRows || 0) ===
      Number(runtimeAuthorizationReadiness?.summary?.noOpRuntimeAlreadyTruthTarget || 0),
    postApplyAlignedRowsMatchCoverage:
      Number(runtimePostApplyVerification?.truthAlignedRowsAfterAuthorizedApply || 0) +
      Number(runtimePostApplyVerification?.summary?.blockedRows || 0) ===
      Number(runtimePostApplyVerification?.coverageRowsTotal || 0),
    postApplyCoverageRows307:
      Number(runtimePostApplyVerification?.coverageRowsTotal || 0) === 307,
    targetFilesMatchDryRun:
      Number(runtimePostApplyVerification?.targetFilesTotal || 0) ===
      Number(runtimePostApplyVerification?.inputCounts?.dryRunTargetFiles || runtimePostApplyVerification?.targetFilesTotal || 0),
    allRuntimeConflictsRequireAxisRefresh:
      runtimeTruthConflictAudit?.validation?.allRowsRequireAxisRefresh === true &&
      rows
        .filter((row) => row.blockerClass === "RUNTIME_TRUTH_CONFLICT_REQUIRES_LEGAL_AXIS_REFRESH")
        .every((row) => row.requiredLegalAxisRefresh?.patient_access === "RECHECK_REQUIRED"),
    allRuntimeConflictsHaveOfficialEvidence:
      runtimeTruthConflictAudit?.validation?.allRowsHaveOfficialEvidence === true,
    disputedRowsHaveScopeDecision:
      disputedTargetMapping?.validation?.allRowsHaveScopeDecision === true &&
      rows
        .filter((row) => row.blockerClass === "DISPUTED_RUNTIME_TARGET_SCOPE_DECISION_REQUIRED")
        .every((row) => Boolean(row.disputedScope?.legalScopeDecision)),
    noAutomaticStatusTargetsCreated:
      disputedTargetMapping?.validation?.noAutomaticStatusTargetsCreated === true,
    noWikipediaTruthSource: true,
    nonMutating:
      runtimeAuthorizationReadiness?.nonMutating === true &&
      runtimeTruthConflictAudit?.nonMutating === true &&
      disputedTargetMapping?.nonMutating === true &&
      runtimePostApplyVerification?.nonMutating === true,
    localOnly:
      runtimeAuthorizationReadiness?.localOnly === true &&
      runtimeTruthConflictAudit?.localOnly === true &&
      disputedTargetMapping?.localOnly === true &&
      runtimePostApplyVerification?.localOnly === true,
    appliedRowsZero:
      Number(runtimeAuthorizationReadiness?.appliedRows || 0) === 0 &&
      Number(runtimeTruthConflictAudit?.appliedRows || 0) === 0 &&
      Number(disputedTargetMapping?.appliedRows || 0) === 0 &&
      Number(runtimePostApplyVerification?.appliedRows || 0) === 0,
    noProdMutation: runtimePostApplyVerification?.productionTouched === false,
    noSsotMutation: runtimePostApplyVerification?.ssotMutationAttempted === false,
    noMapMutation: runtimePostApplyVerification?.mapMutationAttempted === false,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    dossierStatus: "BLOCKER_EXIT_DOSSIER_READY_NO_MUTATION",
    nonMutating: true,
    localOnly: true,
    productionTouched: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    appliedRows: 0,
    filesWritten: [rel(OUT_JSON_PATH), rel(OUT_MD_PATH)],
    mutationPolicy:
      "This artifact writes only data/reviews outputs. It does not update SSOT, map colors, country JSON, status snapshots, static countries assets, authorization packet rows, or production.",
    inputs: {
      runtimeAuthorizationReadiness: rel(RUNTIME_AUTHORIZATION_READINESS_PATH),
      runtimeTruthConflictAudit: rel(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH),
      disputedTargetMapping: rel(DISPUTED_TARGET_MAPPING_PATH),
      colorTargetResolver: rel(COLOR_TARGET_RESOLVER_PATH),
      truthAuditReport: rel(TRUTH_AUDIT_REPORT_PATH),
      runtimePostApplyVerification: rel(RUNTIME_POST_APPLY_VERIFICATION_PATH),
    },
    sourcePolicy: {
      truthInputs: [
        "Primary Law",
        "Independent Legal Interpretation",
        "Truth Report",
        "Runtime Readiness",
        "Runtime Post-Apply Verification",
      ],
      auditOnlyInputs: ["Wikipedia"],
      ssotRole: "NO_MUTATION_TARGET_CONTEXT_ONLY_UNTIL_EXPLICIT_AUTHORIZATION",
    },
    summary: {
      blockedRowsTotal: rows.length,
      disputedTargetBlockers: rows.filter(
        (row) => row.blockerClass === "DISPUTED_RUNTIME_TARGET_SCOPE_DECISION_REQUIRED",
      ).length,
      runtimeTruthConflictBlockers: rows.filter(
        (row) => row.blockerClass === "RUNTIME_TRUTH_CONFLICT_REQUIRES_LEGAL_AXIS_REFRESH",
      ).length,
      exitReadyNow: rows.filter((row) => row.exitReadyNow === true).length,
      excludedFromSafeApply: rows.filter((row) => row.excludedFromSafeApply === true).length,
      safeApplyRows: Number(runtimePostApplyVerification?.summary?.safeRows || 0),
      noOpRows: Number(runtimePostApplyVerification?.summary?.noOpRows || 0),
      postApplyTruthAlignedRows: Number(
        runtimePostApplyVerification?.truthAlignedRowsAfterAuthorizedApply || 0,
      ),
      postApplyCoverageRows: Number(runtimePostApplyVerification?.coverageRowsTotal || 0),
      targetFiles: Number(runtimePostApplyVerification?.targetFilesTotal || 0),
      blockerGeos: uniqueSorted(blockerGeos),
    },
    counts: {
      blockerClass: countBy(rows, (row) => row.blockerClass),
      readinessDecision: countBy(rows, (row) => row.readinessDecision),
      proposedTruthColor: countBy(rows, (row) => row.proposedTruthColor),
      currentRuntimeColor: countBy(rows, (row) => row.currentRuntimeColor),
      targetFamily: countBy(rows, (row) => row.targetFamily),
      exitCondition: countBy(rows, (row) => row.exitCondition),
      runtimeConflictClass: conflictClassCounts,
    },
    guardrails: GUARDRAILS,
    validation,
    hashProof: INPUT_PATHS.map(inputHash),
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_BLOCKER_EXIT_DOSSIER_STATUS=${output.dossierStatus}`);
  console.log(`WIKI_TRUTH_BLOCKER_EXIT_DOSSIER_ROWS=${output.summary.blockedRowsTotal}`);
  console.log(`WIKI_TRUTH_BLOCKER_EXIT_DOSSIER_EXIT_READY=${output.summary.exitReadyNow}`);
  console.log(`WIKI_TRUTH_BLOCKER_EXIT_DOSSIER_SAFE_ROWS=${output.summary.safeApplyRows}`);
  console.log(`WIKI_TRUTH_BLOCKER_EXIT_DOSSIER_ALIGNED=${output.summary.postApplyTruthAlignedRows}/307`);
  console.log(`WIKI_TRUTH_BLOCKER_EXIT_DOSSIER_OUTPUT=${rel(OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_BLOCKER_EXIT_DOSSIER_MARKDOWN=${rel(OUT_MD_PATH)}`);
  for (const [key, value] of Object.entries(validation)) {
    console.log(`WIKI_TRUTH_BLOCKER_EXIT_DOSSIER_${key.toUpperCase()}=${value ? "TRUE" : "FALSE"}`);
  }
}

main();

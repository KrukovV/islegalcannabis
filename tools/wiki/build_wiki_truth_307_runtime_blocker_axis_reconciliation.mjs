#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const EVIDENCE_SEED_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-blocker-axis-evidence.seed.json",
);
const BLOCKER_EXIT_DOSSIER_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-blocker-exit-dossier.json",
);
const RUNTIME_TRUTH_CONFLICT_AUDIT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-truth-conflict-audit.json",
);
const RUNTIME_AUTHORIZATION_READINESS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-authorization-readiness.json",
);
const TRUTH_AUDIT_REPORT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-truth-audit-report.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-blocker-axis-reconciliation.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-blocker-axis-reconciliation.md",
);

const INPUT_PATHS = Object.freeze([
  EVIDENCE_SEED_PATH,
  BLOCKER_EXIT_DOSSIER_PATH,
  RUNTIME_TRUTH_CONFLICT_AUDIT_PATH,
  RUNTIME_AUTHORIZATION_READINESS_PATH,
  TRUTH_AUDIT_REPORT_PATH,
]);
const THREE_TRUTH_COLORS = new Set(["GREEN", "YELLOW", "RED"]);
const ALLOWED_TRUTH_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  const body = fs.readFileSync(filePath);
  return {
    file: rel(filePath),
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    bytes: body.length,
  };
}

function seedByGeo(seed) {
  return new Map(
    (Array.isArray(seed.rows) ? seed.rows : [])
      .filter((row) => row?.geo)
      .map((row) => [String(row.geo), row]),
  );
}

function sourceSummary(row) {
  return (Array.isArray(row?.officialSources) ? row.officialSources : []).map(
    (source) => ({
      title: source.title || "MISSING_TITLE",
      url: source.url || "MISSING_URL",
      sourceKind: source.sourceKind || "MISSING_SOURCE_KIND",
      evidenceRole: source.evidenceRole || "MISSING_EVIDENCE_ROLE",
      factCount: Array.isArray(source.observedOfficialFacts)
        ? source.observedOfficialFacts.length
        : 0,
    }),
  );
}

function hasAxisStatus(row, axis, pattern) {
  const status = String(row?.axisFindings?.[axis]?.status || "");
  return pattern.test(status);
}

function hasAnyAxisStatus(row, axes, pattern) {
  return axes.some((axis) => hasAxisStatus(row, axis, pattern));
}

function buildReconciledRow({ blocker, conflict, readiness, evidence }) {
  const officialSources = sourceSummary(evidence);
  const axisFindings = evidence.axisFindings || {};
  const colorConclusion = evidence.truthFirstColorConclusion || {};
  const freshTruthColor = colorConclusion.freshTruthColor || "UNKNOWN";
  const patientAccessOperational = hasAxisStatus(
    evidence,
    "patient_access",
    /OPERATIONAL_PATIENT_ACCESS/,
  );
  const patientAccessAxisResolved =
    patientAccessOperational ||
    hasAxisStatus(
      evidence,
      "patient_access",
      /NO_OPERATIONAL_PATIENT_ACCESS|NO_GENERAL_CANNABIS_PATIENT_PROGRAMME|LIMITED|PHARMACEUTICAL|CANNABINOID|PRESCRIPTION_MEDICINE|SPECIAL_PERMIT|CASE_BY_CASE|COMPASSIONATE|PROHIBITED/,
    );
  const limitedYellowBasis = hasAnyAxisStatus(
    evidence,
    ["patient_access", "physician_certification", "dispensing", "product_or_form_limits", "operational_status"],
    /LIMITED|PHARMACEUTICAL|CANNABINOID|PRESCRIPTION|SPECIAL_PERMIT|CASE_BY_CASE|COMPASSIONATE|REGISTERED_CONDITION|CONTROLLED_ACCESS|HSA_REVIEW|NOT_GENERAL_CANNABIS_PATIENT_PROGRAMME/,
  );
  const redNoAccessBasis = hasAxisStatus(
    evidence,
    "patient_access",
    /NO_OPERATIONAL_PATIENT_ACCESS|NO_PATIENT_ACCESS|ABSENT|PROHIBITED|ILLEGAL/,
  );
  const pharmaceuticalShortcutAxis = hasAnyAxisStatus(
    evidence,
    ["patient_access", "dispensing", "product_or_form_limits"],
    /PHARMACEUTICAL|CANNABINOID|CBD_ONLY|SATIVEX|EPIDIOLEX|RAW_CANNABIS.*PROHIBITED|NOT_GENERAL_CANNABIS_PATIENT_PROGRAMME/,
  );
  const notPharmaceuticalShortcutOnly = [
    colorConclusion.notCbdOnly,
    colorConclusion.notSativexOnly,
    colorConclusion.notPharmaceuticalOnly ?? true,
  ].every((value) => value === true);
  const greenColorSupported =
    freshTruthColor === "GREEN" &&
    patientAccessOperational &&
    notPharmaceuticalShortcutOnly;
  const yellowColorSupported =
    freshTruthColor === "YELLOW" &&
    limitedYellowBasis &&
    patientAccessOperational === false;
  const redColorSupported =
    freshTruthColor === "RED" &&
    redNoAccessBasis &&
    patientAccessOperational === false;
  return {
    geo: blocker.geo,
    territory: blocker.territory || evidence.territory || conflict?.territory || "",
    rowStatus: evidence.reconciliationStatus || "FRESH_AXIS_RECONCILED_PENDING_TRUTH_REGEN",
    blockerClass: blocker.blockerClass || "UNKNOWN_BLOCKER_CLASS",
    readinessDecision: blocker.readinessDecision || readiness?.readinessDecision || "UNKNOWN_DECISION",
    currentRuntimeColor: blocker.currentRuntimeColor || conflict?.currentRuntimeColor || "UNKNOWN",
    previousTruthColor: evidence.previousTruthColor || blocker.proposedTruthColor || conflict?.officialTruthTargetColor || "UNKNOWN",
    freshTruthColor,
    previousTruthRule: evidence.previousTruthRule || blocker.truthRule || conflict?.truthRule || "UNKNOWN",
    freshTruthRule: colorConclusion.freshTruthRule || "UNKNOWN",
    targetPath: blocker.targetPath || conflict?.targetPath || null,
    targetFamily: blocker.targetFamily || conflict?.targetFamily || "UNKNOWN_TARGET_FAMILY",
    officialSources,
    officialSourceCount: officialSources.length,
    officialFactCount: officialSources.reduce((total, source) => total + Number(source.factCount || 0), 0),
    axisFindings,
    colorConclusion,
    validation: {
      adultUseNegative: hasAxisStatus(evidence, "adult_use", /ILLEGAL|NEGATIVE/),
      patientAccessOperational,
      patientAccessAxisResolved,
      physicianCertificationProven: hasAxisStatus(evidence, "physician_certification", /PROVEN/),
      patientRegistryProven: hasAxisStatus(evidence, "patient_registry", /PROVEN/),
      dispensingProven: hasAxisStatus(evidence, "dispensing", /PROVEN/),
      productLimitsProven: hasAxisStatus(evidence, "product_or_form_limits", /PROVEN/),
      operationalStatusProven: hasAxisStatus(evidence, "operational_status", /PROVEN_OPERATIONAL/),
      operationalStatusResolved: hasAxisStatus(evidence, "operational_status", /PROVEN_OPERATIONAL|PROVEN_LIMITED|PROVEN_NO_OPERATIONAL|OPERATIONAL_STATUS_RESOLVED/),
      jurisdictionScopeBounded: hasAxisStatus(evidence, "jurisdiction_scope", /STATE_SCOPE/),
      freshColorGreen: freshTruthColor === "GREEN",
      freshColorYellow: freshTruthColor === "YELLOW",
      freshColorRed: freshTruthColor === "RED",
      freshColorKnownThreeColor: THREE_TRUTH_COLORS.has(freshTruthColor),
      freshColorAllowedTruthPalette: ALLOWED_TRUTH_COLORS.has(freshTruthColor),
      greenColorSupported,
      yellowColorSupported,
      redColorSupported,
      truthFirstColorSupported: greenColorSupported || yellowColorSupported || redColorSupported,
      previousTruthWasYellow: evidence.previousTruthColor === "YELLOW",
      notAdultUse: colorConclusion.notAdultUse === true,
      notLifecycleOnly: [
        colorConclusion.notProductionOnly,
        colorConclusion.notResearchOnly,
        colorConclusion.notExportOnly,
        colorConclusion.notBillOnly,
      ].every((value) => value === true),
      notPharmaceuticalShortcutOnly: [
        colorConclusion.notCbdOnly,
        colorConclusion.notSativexOnly,
        colorConclusion.notPharmaceuticalOnly ?? true,
      ].every((value) => value === true),
      pharmaceuticalShortcutNotGreen:
        pharmaceuticalShortcutAxis === false ||
        freshTruthColor !== "GREEN" ||
        notPharmaceuticalShortcutOnly,
    },
    mutation: {
      safeToAutoApply: false,
      appliedRows: 0,
      productionTouched: false,
      ssotMutationAttempted: false,
      mapMutationAttempted: false,
      reason: "Fresh axis reconciliation is evidence only. Truth artifacts and runtime targets must be regenerated and explicitly authorized before any write.",
    },
    remainingActions: Array.isArray(evidence.remainingActions)
      ? evidence.remainingActions
      : [],
  };
}

function buildPendingRow({ blocker, conflict, readiness }) {
  return {
    geo: blocker.geo,
    territory: blocker.territory || conflict?.territory || "",
    rowStatus: "PENDING_FRESH_AXIS_RECONCILIATION",
    blockerClass: blocker.blockerClass || "UNKNOWN_BLOCKER_CLASS",
    readinessDecision: blocker.readinessDecision || readiness?.readinessDecision || "UNKNOWN_DECISION",
    currentRuntimeColor: blocker.currentRuntimeColor || conflict?.currentRuntimeColor || "UNKNOWN",
    previousTruthColor: blocker.proposedTruthColor || conflict?.officialTruthTargetColor || "UNKNOWN",
    freshTruthColor: "UNKNOWN_PENDING_RECONCILIATION",
    previousTruthRule: blocker.truthRule || conflict?.truthRule || "UNKNOWN",
    freshTruthRule: "PENDING_FRESH_AXIS_RECONCILIATION",
    targetPath: blocker.targetPath || conflict?.targetPath || null,
    targetFamily: blocker.targetFamily || conflict?.targetFamily || "UNKNOWN_TARGET_FAMILY",
    officialSources: [],
    officialSourceCount: 0,
    officialFactCount: 0,
    axisFindings: {},
    colorConclusion: {},
    validation: {
      adultUseNegative: false,
      patientAccessOperational: false,
      physicianCertificationProven: false,
      patientRegistryProven: false,
      dispensingProven: false,
      productLimitsProven: false,
      operationalStatusProven: false,
      operationalStatusResolved: false,
      jurisdictionScopeBounded: false,
      freshColorGreen: false,
      freshColorYellow: false,
      freshColorRed: false,
      freshColorKnownThreeColor: false,
      greenColorSupported: false,
      yellowColorSupported: false,
      redColorSupported: false,
      truthFirstColorSupported: false,
      previousTruthWasYellow: blocker.proposedTruthColor === "YELLOW",
      notAdultUse: false,
      notLifecycleOnly: false,
      notPharmaceuticalShortcutOnly: false,
      pharmaceuticalShortcutNotGreen: false,
    },
    mutation: {
      safeToAutoApply: false,
      appliedRows: 0,
      productionTouched: false,
      ssotMutationAttempted: false,
      mapMutationAttempted: false,
      reason: "No fresh axis reconciliation evidence has been attached for this blocker row yet.",
    },
    remainingActions: Array.isArray(blocker.requiredNextEvidence)
      ? blocker.requiredNextEvidence
      : [],
  };
}

function buildCurrentTruthRow({ blocker, conflict, readiness, truth }) {
  const freshTruthColor =
    truth?.truth?.color || blocker.proposedTruthColor || "UNKNOWN";
  const officialSources = Array.isArray(conflict?.officialEvidence?.sources)
    ? conflict.officialEvidence.sources.map((source) => ({
        title: source.title || "MISSING_TITLE",
        url: source.url || "MISSING_URL",
        sourceKind: source.sourceKind || "MISSING_SOURCE_KIND",
        evidenceRole: source.evidenceClass || "OFFICIAL_EVIDENCE",
        factCount: 0,
      }))
    : [];
  const truthRule =
    truth?.truth?.ruleId || blocker.truthRule || conflict?.truthRule || "UNKNOWN";
  const unknownUncolored =
    freshTruthColor !== "UNKNOWN" ||
    /CONTEXT_ONLY|DISPUTED_GEO_NO_OWN_TERRITORY_REGIME/.test(truthRule);

  return {
    geo: blocker.geo,
    territory: blocker.territory || truth?.territory || conflict?.territory || "",
    rowStatus: "CURRENT_TRUTH_RECONCILED_RUNTIME_DELTA_DOCUMENTED",
    blockerClass:
      blocker.blockerClass || "RUNTIME_TRUTH_CONFLICT_REQUIRES_LEGAL_AXIS_REFRESH",
    readinessDecision:
      blocker.readinessDecision || readiness?.readinessDecision || "UNKNOWN_DECISION",
    currentRuntimeColor:
      blocker.currentRuntimeColor || conflict?.currentRuntimeColor || "UNKNOWN",
    previousTruthColor:
      blocker.proposedTruthColor ||
      conflict?.officialTruthTargetColor ||
      freshTruthColor,
    freshTruthColor,
    previousTruthRule: blocker.truthRule || conflict?.truthRule || truthRule,
    freshTruthRule: truthRule,
    targetPath: blocker.targetPath || conflict?.targetPath || null,
    targetFamily:
      blocker.targetFamily || conflict?.targetFamily || "UNKNOWN_TARGET_FAMILY",
    officialSources,
    officialSourceCount: officialSources.length,
    officialFactCount: 0,
    axisFindings: truth?.truth?.facts || {},
    colorConclusion: {
      freshTruthColor,
      freshTruthRule: truthRule,
      truthReason: truth?.truth?.reason || "",
      sourceCoverage: truth?.effectiveSourceCoverage || truth?.sourceCoverage || "UNKNOWN",
      unknownUncolored,
    },
    validation: {
      freshColorGreen: freshTruthColor === "GREEN",
      freshColorYellow: freshTruthColor === "YELLOW",
      freshColorRed: freshTruthColor === "RED",
      freshColorUnknown: freshTruthColor === "UNKNOWN",
      freshColorKnownThreeColor: THREE_TRUTH_COLORS.has(freshTruthColor),
      freshColorAllowedTruthPalette: ALLOWED_TRUTH_COLORS.has(freshTruthColor),
      truthFirstColorSupported:
        ALLOWED_TRUTH_COLORS.has(freshTruthColor) &&
        officialSources.length > 0 &&
        unknownUncolored,
      unknownRemainsUncolored: unknownUncolored,
    },
    mutation: {
      safeToAutoApply: false,
      appliedRows: 0,
      productionTouched: false,
      ssotMutationAttempted: false,
      mapMutationAttempted: false,
      reason:
        "Runtime color is an observed delta, not Truth authority. The current Truth result is documented without writing runtime, SSOT, map, or production.",
    },
    remainingActions: Array.isArray(blocker.requiredNextEvidence)
      ? blocker.requiredNextEvidence
      : [],
  };
}

function allReconciledValidationRows(rows, key) {
  return rows
    .filter((row) => row.rowStatus !== "PENDING_FRESH_AXIS_RECONCILIATION")
    .every((row) => row.validation?.[key] === true);
}

function mdCell(value, limit = 220) {
  const text = compact(value);
  const trimmed = text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Runtime Blocker Axis Reconciliation");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Status: ${output.dossierStatus}`);
  lines.push(`Runtime truth conflict rows: ${output.summary.runtimeTruthConflictRows}`);
  lines.push(`Fresh reconciled rows: ${output.summary.freshReconciledRows}`);
  lines.push(`Pending rows: ${output.summary.pendingFreshAxisRows}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push("");
  lines.push("| GEO | Territory | Row status | Previous truth | Fresh truth | Sources | Required next action |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.rowStatus)} | ${mdCell(row.previousTruthColor)} | ${mdCell(row.freshTruthColor)} | ${row.officialSourceCount} | ${mdCell(row.remainingActions?.[0] || "")} |`,
    );
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
  const seed = readJson(EVIDENCE_SEED_PATH);
  const blockerExitDossier = readJson(BLOCKER_EXIT_DOSSIER_PATH);
  const runtimeTruthConflictAudit = readJson(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH);
  const runtimeAuthorizationReadiness = readJson(RUNTIME_AUTHORIZATION_READINESS_PATH);
  const truthAuditReport = readJson(TRUTH_AUDIT_REPORT_PATH);
  const evidenceByGeo = seedByGeo(seed);
  const conflictByGeo = new Map(
    (Array.isArray(runtimeTruthConflictAudit.rows) ? runtimeTruthConflictAudit.rows : [])
      .filter((row) => row?.geo)
      .map((row) => [String(row.geo), row]),
  );
  const readinessByGeo = new Map(
    (Array.isArray(runtimeAuthorizationReadiness.rows) ? runtimeAuthorizationReadiness.rows : [])
      .filter((row) => row?.geo)
      .map((row) => [String(row.geo), row]),
  );
  const truthByGeo = new Map(
    (Array.isArray(truthAuditReport.rows) ? truthAuditReport.rows : [])
      .filter((row) => row?.geo)
      .map((row) => [String(row.geo), row]),
  );
  const blockerRows = Array.isArray(blockerExitDossier.rows)
    ? blockerExitDossier.rows
    : [];
  const runtimeConflictBlockers = blockerRows.filter(
    (row) => row.blockerClass === "RUNTIME_TRUTH_CONFLICT_REQUIRES_LEGAL_AXIS_REFRESH",
  );
  const rows = runtimeConflictBlockers.map((blocker) => {
    const evidence = evidenceByGeo.get(String(blocker.geo));
    const conflict = conflictByGeo.get(String(blocker.geo));
    const readiness = readinessByGeo.get(String(blocker.geo));
    const truth = truthByGeo.get(String(blocker.geo));
    return evidence
      ? buildReconciledRow({ blocker, conflict, readiness, evidence })
      : truth
        ? buildCurrentTruthRow({ blocker, conflict, readiness, truth })
        : buildPendingRow({ blocker, conflict, readiness });
  });
  const freshReconciledRows = rows.filter(
    (row) => row.rowStatus !== "PENDING_FRESH_AXIS_RECONCILIATION",
  );
  const pendingRows = rows.filter(
    (row) => row.rowStatus === "PENDING_FRESH_AXIS_RECONCILIATION",
  );
  const validation = {
    blockerRowsTotalMatchesCurrent:
      blockerRows.length === runtimeConflictBlockers.length + Number(blockerExitDossier.summary?.disputedTargetBlockers || 0),
    runtimeTruthConflictRowsMatchCurrent:
      runtimeConflictBlockers.length === Number(blockerExitDossier.summary?.runtimeTruthConflictBlockers || runtimeConflictBlockers.length),
    disputedScopeRowsMatchCurrentMapping:
      Number(blockerExitDossier.summary?.disputedTargetBlockers || 0) ===
      blockerRows.length - runtimeConflictBlockers.length,
    rowsMatchRuntimeConflictBlockers: rows.length === runtimeConflictBlockers.length,
    atLeastOneFreshReconciledRow: freshReconciledRows.length >= 1 || runtimeConflictBlockers.length === 0,
    allRuntimeConflictRowsReconciled: freshReconciledRows.length === runtimeConflictBlockers.length,
    pendingRowsRemainExplicit: pendingRows.every((row) => row.rowStatus === "PENDING_FRESH_AXIS_RECONCILIATION"),
    allRowsHaveDecision: rows.every((row) => row.rowStatus),
    reconciledRowsHaveOfficialSources: freshReconciledRows.every(
      (row) => row.officialSourceCount > 0,
    ),
    reconciledRowsFreshColorAllowedTruthPalette: freshReconciledRows.every(
      (row) => row.validation?.freshColorAllowedTruthPalette === true,
    ),
    unknownRowsRemainUncolored: freshReconciledRows.every(
      (row) => row.validation?.unknownRemainsUncolored !== false,
    ),
    allRowsMatchCurrentTruthReport: freshReconciledRows.every(
      (row) => row.freshTruthColor === truthByGeo.get(String(row.geo))?.truth?.color,
    ),
    reconciledRowsAdultUseNegative: allReconciledValidationRows(rows, "adultUseNegative"),
    reconciledRowsPatientAccessAxisResolved: allReconciledValidationRows(rows, "patientAccessAxisResolved"),
    reconciledRowsDispensingProven: allReconciledValidationRows(rows, "dispensingProven"),
    reconciledRowsRegistryProven: allReconciledValidationRows(rows, "patientRegistryProven"),
    reconciledRowsProductLimitsProven: allReconciledValidationRows(rows, "productLimitsProven"),
    reconciledRowsOperationalStatusResolved: allReconciledValidationRows(rows, "operationalStatusResolved"),
    reconciledRowsFreshColorKnownThreeColor: allReconciledValidationRows(rows, "freshColorKnownThreeColor"),
    reconciledRowsTruthFirstColorSupported: allReconciledValidationRows(rows, "truthFirstColorSupported"),
    greenRowsNotPharmaceuticalShortcutOnly: freshReconciledRows
      .filter((row) => row.freshTruthColor === "GREEN")
      .every((row) => row.validation?.notPharmaceuticalShortcutOnly === true),
    reconciledRowsPharmaceuticalShortcutNotGreen: allReconciledValidationRows(rows, "pharmaceuticalShortcutNotGreen"),
    reconciledRowsNotLifecycleOnly: allReconciledValidationRows(rows, "notLifecycleOnly"),
    noWikipediaTruthSource: true,
    localOnly: true,
    nonMutating: true,
    appliedRowsZero: true,
    noProdMutation: true,
    noSsotMutation: true,
    noMapMutation: true,
    safeToAutoApplyFalse: true,
  };
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.1.0",
    dossierStatus: "RUNTIME_BLOCKER_AXIS_RECONCILIATION_READY_NO_MUTATION",
    localOnly: true,
    nonMutating: true,
    safeToAutoApply: false,
    appliedRows: 0,
    productionTouched: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    sourceEvidenceSeed: rel(EVIDENCE_SEED_PATH),
    linkedArtifacts: {
      blockerExitDossier: rel(BLOCKER_EXIT_DOSSIER_PATH),
      runtimeTruthConflictAudit: rel(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH),
      runtimeAuthorizationReadiness: rel(RUNTIME_AUTHORIZATION_READINESS_PATH),
    },
    summary: {
      blockerRowsTotal: blockerRows.length,
      runtimeTruthConflictRows: runtimeConflictBlockers.length,
      disputedScopeRows: Number(blockerExitDossier.summary?.disputedTargetBlockers || 0),
      freshReconciledRows: freshReconciledRows.length,
      pendingFreshAxisRows: pendingRows.length,
      candidateTruthColorChangeRows: freshReconciledRows.filter(
        (row) => row.previousTruthColor !== row.freshTruthColor,
      ).length,
      candidateGreenRows: freshReconciledRows.filter(
        (row) => row.freshTruthColor === "GREEN",
      ).length,
      candidateYellowRows: freshReconciledRows.filter(
        (row) => row.freshTruthColor === "YELLOW",
      ).length,
      candidateRedRows: freshReconciledRows.filter(
        (row) => row.freshTruthColor === "RED",
      ).length,
      candidateUnknownRows: freshReconciledRows.filter(
        (row) => row.freshTruthColor === "UNKNOWN",
      ).length,
      candidateKnownThreeColorRows: freshReconciledRows.filter(
        (row) => THREE_TRUTH_COLORS.has(row.freshTruthColor),
      ).length,
      candidateKnownTruthColorRows: freshReconciledRows.filter(
        (row) => ALLOWED_TRUTH_COLORS.has(row.freshTruthColor),
      ).length,
      candidateFalseGreenCorrectionRows: freshReconciledRows.filter(
        (row) => row.previousTruthColor === "GREEN" && row.freshTruthColor !== "GREEN",
      ).length,
      rowsByStatus: countBy(rows, (row) => row.rowStatus),
      previousTruthColor: countBy(rows, (row) => row.previousTruthColor),
      freshTruthColor: countBy(rows, (row) => row.freshTruthColor),
    },
    validation,
    guardrails: [
      "FRESH_AXIS_RECONCILIATION_DOES_NOT_AUTHORIZE_WRITE",
      "REGENERATE_TRUTH_REPORT_BEFORE_RUNTIME_PATCH",
      "NO_WIKIPEDIA_TRUTH_SOURCE",
      "NO_SSOT_OR_MAP_MUTATION",
      "NO_PRODUCTION_MUTATION",
      "PENDING_ROWS_REMAIN_BLOCKED",
      "DISPUTED_SCOPE_ROWS_REMAIN_SEPARATE",
      "OPERATIONAL_PATIENT_ACCESS_MUST_BE_PROVEN_BY_PRIMARY_SOURCES",
      "PHARMACEUTICAL_ONLY_DOES_NOT_COUNT_AS_PATIENT_PROGRAMME",
      "YELLOW_RECONCILIATION_IS_ALLOWED_FOR_LIMITED_PRESCRIPTION_OR_PHARMACEUTICAL_ONLY_ACCESS",
      "UNKNOWN_REMAINS_UNCOLORED_WHEN_APPLICABLE_TERRITORIAL_LAW_IS_UNPROVEN",
      "RUNTIME_SNAPSHOT_IS_OBSERVATION_NOT_TRUTH_AUTHORITY",
    ],
    rows,
    hashProof: INPUT_PATHS.map(inputHash),
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_RUNTIME_BLOCKER_AXIS_RECONCILIATION_STATUS=${output.dossierStatus}`);
  console.log(`WIKI_TRUTH_RUNTIME_BLOCKER_AXIS_RECONCILIATION_ROWS=${rows.length}`);
  console.log(`WIKI_TRUTH_RUNTIME_BLOCKER_AXIS_RECONCILIATION_FRESH=${freshReconciledRows.length}`);
  console.log(`WIKI_TRUTH_RUNTIME_BLOCKER_AXIS_RECONCILIATION_PENDING=${pendingRows.length}`);
  console.log(`WIKI_TRUTH_RUNTIME_BLOCKER_AXIS_RECONCILIATION_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`WIKI_TRUTH_RUNTIME_BLOCKER_AXIS_RECONCILIATION_OUTPUT=${rel(OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_RUNTIME_BLOCKER_AXIS_RECONCILIATION_MARKDOWN=${rel(OUT_MD_PATH)}`);
}

main();

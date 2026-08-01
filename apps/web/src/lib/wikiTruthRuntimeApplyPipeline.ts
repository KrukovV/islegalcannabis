export type WikiTruthRuntimeApplyPipelineRow = {
  geo: string;
  territory: string;
  targetFamily: string;
  targetPath: string;
  proposedTruthColor: string;
  derivedColorAfterPatch: string;
  operationCount: number;
  executionDecision: string;
  blockingReasons: string[];
  targetHashMatchesDryRun: boolean;
};

export type WikiTruthRuntimePostApplyBlockedRow = {
  geo: string;
  territory: string;
  decision: string;
  targetFamily: string;
  currentRuntimeColor: string;
  proposedTruthColor: string;
  truthRule: string;
  blockingReasons: string[];
};

export type WikiTruthBlockerExitDossierRow = {
  geo: string;
  territory: string;
  blockerClass: string;
  exitCondition: string;
  exitReadyNow: boolean;
  excludedFromSafeApply: boolean;
  readinessDecision: string;
  targetFamily: string;
  currentRuntimeColor: string;
  proposedTruthColor: string;
  truthRule: string;
  requiredNextEvidence: string[];
  blockingReasons: string[];
};

export type WikiTruthRuntimeApplyPipelineView = {
  dryRun: {
    status: string;
    rowsTotal: number;
    targetFilesTotal: number;
    appliedRows: number;
    wouldWriteRowsNow: number;
    wouldApplyRowsAfterAuthorization: number;
    counts: Record<string, Record<string, number>>;
  };
  preflight: {
    status: string;
    rowsTotal: number;
    targetFilesTotal: number;
    targetDriftFiles: number;
    targetDriftRows: number;
    appliedRows: number;
    wouldWriteRowsNow: number;
    wouldWriteRowsAfterAuthorization: number;
    authorizationPresent: boolean;
    ssotWriteEnabled: boolean;
    counts: Record<string, Record<string, number>>;
  };
  execution: {
    status: string;
    nonMutating: boolean;
    localOnly: boolean;
    productionTouched: boolean;
    ssotMutationAttempted: boolean;
    mapMutationAttempted: boolean;
    appliedRows: number;
    wouldWriteRowsNow: number;
    writtenTargetFilesTotal: number;
    applyFlagPresent: boolean;
    authorizationPresent: boolean;
    authorizationAccepted: boolean;
    ssotWriteEnabled: boolean;
    counts: Record<string, Record<string, number>>;
    guardrails: string[];
    rows: WikiTruthRuntimeApplyPipelineRow[];
  };
  postApply: {
    status: string;
    nonMutating: boolean;
    localOnly: boolean;
    productionTouched: boolean;
    ssotMutationAttempted: boolean;
    mapMutationAttempted: boolean;
    appliedRows: number;
    wouldApplyRowsAfterAuthorization: number;
    safeRows: number;
    noOpRows: number;
    blockedRows: number;
    alreadyTruthRows: number;
    truthAlignedRowsAfterAuthorizedApply: number;
    coverageRowsTotal: number;
    coverageRowsExpected: number;
    targetFilesTotal: number;
    counts: Record<string, Record<string, number>>;
    guardrails: string[];
    blockedRowsList: WikiTruthRuntimePostApplyBlockedRow[];
  };
  blockerExitDossier: {
    status: string;
    nonMutating: boolean;
    localOnly: boolean;
    productionTouched: boolean;
    ssotMutationAttempted: boolean;
    mapMutationAttempted: boolean;
    appliedRows: number;
    blockedRowsTotal: number;
    disputedTargetBlockers: number;
    runtimeTruthConflictBlockers: number;
    exitReadyNow: number;
    excludedFromSafeApply: number;
    safeApplyRows: number;
    noOpRows: number;
    postApplyTruthAlignedRows: number;
    postApplyCoverageRows: number;
    targetFiles: number;
    counts: Record<string, Record<string, number>>;
    guardrails: string[];
    rows: WikiTruthBlockerExitDossierRow[];
  };
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readText(value: unknown) {
  return String(value || "").trim();
}

function readNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readText(item)).filter(Boolean)
    : [];
}

function readCountRecord(value: unknown): Record<string, number> {
  const record = readRecord(value);
  const out: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(record)) {
    const numberValue = Number(rawValue);
    if (!Number.isFinite(numberValue)) continue;
    out[key] = numberValue;
  }
  return out;
}

function readCounts(value: unknown): Record<string, Record<string, number>> {
  const record = readRecord(value);
  const out: Record<string, Record<string, number>> = {};
  for (const [key, rawValue] of Object.entries(record)) {
    out[key] = readCountRecord(rawValue);
  }
  return out;
}

function normalizeRow(value: unknown): WikiTruthRuntimeApplyPipelineRow {
  const row = readRecord(value);
  return {
    geo: readText(row.geo),
    territory: readText(row.territory),
    targetFamily: readText(row.targetFamily),
    targetPath: readText(row.targetPath),
    proposedTruthColor: readText(row.proposedTruthColor) || "UNKNOWN",
    derivedColorAfterPatch: readText(row.derivedColorAfterPatch) || "UNKNOWN",
    operationCount: readNumber(row.operationCount),
    executionDecision: readText(row.executionDecision) || "UNKNOWN",
    blockingReasons: readStringArray(row.blockingReasons),
    targetHashMatchesDryRun: row.targetHashMatchesDryRun === true,
  };
}

function normalizePostApplyBlockedRow(
  value: unknown,
): WikiTruthRuntimePostApplyBlockedRow {
  const row = readRecord(value);
  return {
    geo: readText(row.geo),
    territory: readText(row.territory),
    decision: readText(row.decision) || "UNKNOWN",
    targetFamily: readText(row.targetFamily) || "UNKNOWN",
    currentRuntimeColor: readText(row.currentRuntimeColor) || "UNKNOWN",
    proposedTruthColor: readText(row.proposedTruthColor) || "UNKNOWN",
    truthRule: readText(row.truthRule) || "UNKNOWN",
    blockingReasons: readStringArray(row.blockingReasons),
  };
}

function normalizeBlockerExitDossierRow(
  value: unknown,
): WikiTruthBlockerExitDossierRow {
  const row = readRecord(value);
  return {
    geo: readText(row.geo),
    territory: readText(row.territory),
    blockerClass: readText(row.blockerClass) || "UNKNOWN",
    exitCondition: readText(row.exitCondition) || "UNKNOWN",
    exitReadyNow: row.exitReadyNow === true,
    excludedFromSafeApply: row.excludedFromSafeApply === true,
    readinessDecision: readText(row.readinessDecision) || "UNKNOWN",
    targetFamily: readText(row.targetFamily) || "UNKNOWN",
    currentRuntimeColor: readText(row.currentRuntimeColor) || "UNKNOWN",
    proposedTruthColor: readText(row.proposedTruthColor) || "UNKNOWN",
    truthRule: readText(row.truthRule) || "UNKNOWN",
    requiredNextEvidence: readStringArray(row.requiredNextEvidence),
    blockingReasons: readStringArray(row.blockingReasons),
  };
}

export function normalizeWikiTruthRuntimeApplyPipeline(
  dryRunPayload: unknown,
  preflightPayload: unknown,
  executionPayload: unknown,
  postApplyPayload: unknown,
  blockerExitDossierPayload: unknown = null,
): WikiTruthRuntimeApplyPipelineView {
  const dryRun = readRecord(dryRunPayload);
  const preflight = readRecord(preflightPayload);
  const execution = readRecord(executionPayload);
  const postApply = readRecord(postApplyPayload);
  const blockerExitDossier = readRecord(blockerExitDossierPayload);
  const executionCli = readRecord(execution.cli);
  const executionAuthorization = readRecord(execution.authorization);
  const executionEnvironment = readRecord(execution.environment);
  const preflightAuthorization = readRecord(preflight.authorization);
  const preflightEnvironment = readRecord(preflight.environment);
  const postApplySummary = readRecord(postApply.summary);
  const blockerExitDossierSummary = readRecord(blockerExitDossier.summary);
  const dryRunRows = Array.isArray(dryRun.rows) ? dryRun.rows : [];
  const preflightRows = Array.isArray(preflight.rows) ? preflight.rows : [];
  const executionRows = Array.isArray(execution.rows)
    ? execution.rows.map(normalizeRow).filter((row) => row.geo)
    : [];
  const postApplyBlockedRows = Array.isArray(postApply.blockedRows)
    ? postApply.blockedRows
        .map(normalizePostApplyBlockedRow)
        .filter((row) => row.geo)
    : [];
  const blockerExitRows = Array.isArray(blockerExitDossier.rows)
    ? blockerExitDossier.rows
        .map(normalizeBlockerExitDossierRow)
        .filter((row) => row.geo)
    : [];

  return {
    dryRun: {
      status: readText(dryRun.dryRunStatus) || "UNKNOWN",
      rowsTotal: readNumber(dryRun.rowsTotal) || dryRunRows.length,
      targetFilesTotal: readNumber(dryRun.targetFilesTotal),
      appliedRows: readNumber(dryRun.appliedRows),
      wouldWriteRowsNow: readNumber(dryRun.wouldWriteRowsNow),
      wouldApplyRowsAfterAuthorization: readNumber(
        dryRun.wouldApplyRowsAfterAuthorization,
      ),
      counts: readCounts(dryRun.counts),
    },
    preflight: {
      status: readText(preflight.preflightStatus) || "UNKNOWN",
      rowsTotal: readNumber(preflight.rowsTotal) || preflightRows.length,
      targetFilesTotal: readNumber(preflight.targetFilesTotal),
      targetDriftFiles: readNumber(preflight.targetDriftFiles),
      targetDriftRows: readNumber(preflight.targetDriftRows),
      appliedRows: readNumber(preflight.appliedRows),
      wouldWriteRowsNow: readNumber(preflight.wouldWriteRowsNow),
      wouldWriteRowsAfterAuthorization: readNumber(
        preflight.wouldWriteRowsAfterAuthorization,
      ),
      authorizationPresent: preflightAuthorization.present === true,
      ssotWriteEnabled: preflightEnvironment.ssotWriteEnabled === true,
      counts: readCounts(preflight.counts),
    },
    execution: {
      status: readText(execution.executionStatus) || "UNKNOWN",
      nonMutating: execution.nonMutating === true,
      localOnly: execution.localOnly === true,
      productionTouched: execution.productionTouched === true,
      ssotMutationAttempted: execution.ssotMutationAttempted === true,
      mapMutationAttempted: execution.mapMutationAttempted === true,
      appliedRows: readNumber(execution.appliedRows),
      wouldWriteRowsNow: readNumber(execution.wouldWriteRowsNow),
      writtenTargetFilesTotal: readNumber(execution.writtenTargetFilesTotal),
      applyFlagPresent: executionCli.applyFlagPresent === true,
      authorizationPresent: executionAuthorization.present === true,
      authorizationAccepted: executionAuthorization.accepted === true,
      ssotWriteEnabled: executionEnvironment.ssotWriteEnabled === true,
      counts: readCounts(execution.counts),
      guardrails: readStringArray(execution.guardrails),
      rows: executionRows,
    },
    postApply: {
      status: readText(postApply.postApplyStatus) || "UNKNOWN",
      nonMutating: postApply.nonMutating === true,
      localOnly: postApply.localOnly === true,
      productionTouched: postApply.productionTouched === true,
      ssotMutationAttempted: postApply.ssotMutationAttempted === true,
      mapMutationAttempted: postApply.mapMutationAttempted === true,
      appliedRows: readNumber(postApply.appliedRows),
      wouldApplyRowsAfterAuthorization: readNumber(
        postApply.wouldApplyRowsAfterAuthorization,
      ),
      safeRows: readNumber(postApplySummary.safeRows),
      noOpRows: readNumber(postApplySummary.noOpRows),
      blockedRows: readNumber(postApplySummary.blockedRows),
      alreadyTruthRows: readNumber(postApplySummary.alreadyTruthRows),
      truthAlignedRowsAfterAuthorizedApply: readNumber(
        postApply.truthAlignedRowsAfterAuthorizedApply,
      ),
      coverageRowsTotal: readNumber(postApply.coverageRowsTotal),
      coverageRowsExpected: readNumber(postApply.coverageRowsExpected),
      targetFilesTotal: readNumber(postApply.targetFilesTotal),
      counts: readCounts(postApply.counts),
      guardrails: readStringArray(postApply.guardrails),
      blockedRowsList: postApplyBlockedRows,
    },
    blockerExitDossier: {
      status: readText(blockerExitDossier.dossierStatus) || "UNKNOWN",
      nonMutating: blockerExitDossier.nonMutating === true,
      localOnly: blockerExitDossier.localOnly === true,
      productionTouched: blockerExitDossier.productionTouched === true,
      ssotMutationAttempted: blockerExitDossier.ssotMutationAttempted === true,
      mapMutationAttempted: blockerExitDossier.mapMutationAttempted === true,
      appliedRows: readNumber(blockerExitDossier.appliedRows),
      blockedRowsTotal: readNumber(blockerExitDossierSummary.blockedRowsTotal),
      disputedTargetBlockers: readNumber(
        blockerExitDossierSummary.disputedTargetBlockers,
      ),
      runtimeTruthConflictBlockers: readNumber(
        blockerExitDossierSummary.runtimeTruthConflictBlockers,
      ),
      exitReadyNow: readNumber(blockerExitDossierSummary.exitReadyNow),
      excludedFromSafeApply: readNumber(
        blockerExitDossierSummary.excludedFromSafeApply,
      ),
      safeApplyRows: readNumber(blockerExitDossierSummary.safeApplyRows),
      noOpRows: readNumber(blockerExitDossierSummary.noOpRows),
      postApplyTruthAlignedRows: readNumber(
        blockerExitDossierSummary.postApplyTruthAlignedRows,
      ),
      postApplyCoverageRows: readNumber(
        blockerExitDossierSummary.postApplyCoverageRows,
      ),
      targetFiles: readNumber(blockerExitDossierSummary.targetFiles),
      counts: readCounts(blockerExitDossier.counts),
      guardrails: readStringArray(blockerExitDossier.guardrails),
      rows: blockerExitRows,
    },
  };
}

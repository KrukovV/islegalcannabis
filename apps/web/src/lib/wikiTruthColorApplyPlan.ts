export type WikiTruthColorApplyPlanRow = {
  planIndex: number;
  geo: string;
  territory: string;
  currentColor: string;
  proposedTruthColor: string;
  proposalAction: string;
  applyDisposition: string;
  blockedByPrimaryLaw: boolean;
  truthRule: string;
  truthReason: string;
  currentReason: string;
  sourceCoverage: string;
  effectiveSourceCoverage: string;
  safetyNotes: string[];
};

export type WikiTruthColorApplyPlanView = {
  generatedAt: string;
  reportVersion: string;
  inputColorProposals: string;
  inputPrimaryLawBlockers: string;
  nonMutating: boolean;
  applyStatus: string;
  requiresExplicitAuthorization: boolean;
  safeToAutoApply: boolean;
  mutationPolicy: string;
  rowsTotal: number;
  allowedTargetColors: string[];
  counts: {
    proposalAction: Record<string, number>;
    colorTransition: Record<string, number>;
    proposedTruthColor: Record<string, number>;
    applyDisposition: Record<string, number>;
    effectiveSourceCoverage: Record<string, number>;
  };
  validation: Record<string, unknown>;
  rows: WikiTruthColorApplyPlanRow[];
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readText(item)).filter(Boolean)
    : [];
}

function normalizeRow(value: unknown): WikiTruthColorApplyPlanRow {
  const row = readRecord(value);
  return {
    planIndex: readNumber(row.planIndex),
    geo: readText(row.geo),
    territory: readText(row.territory),
    currentColor: readText(row.currentColor) || "UNKNOWN",
    proposedTruthColor: readText(row.proposedTruthColor) || "UNKNOWN",
    proposalAction: readText(row.proposalAction) || "UNKNOWN",
    applyDisposition: readText(row.applyDisposition) || "UNKNOWN",
    blockedByPrimaryLaw: row.blockedByPrimaryLaw === true,
    truthRule: readText(row.truthRule) || "UNKNOWN",
    truthReason: readText(row.truthReason),
    currentReason: readText(row.currentReason),
    sourceCoverage: readText(row.sourceCoverage) || "UNKNOWN",
    effectiveSourceCoverage:
      readText(row.effectiveSourceCoverage) ||
      readText(row.sourceCoverage) ||
      "UNKNOWN",
    safetyNotes: readStringArray(row.safetyNotes),
  };
}

export function normalizeWikiTruthColorApplyPlan(
  payload: unknown,
): WikiTruthColorApplyPlanView {
  const record = readRecord(payload);
  const counts = readRecord(record.counts);
  const rows = Array.isArray(record.rows)
    ? record.rows.map(normalizeRow).filter((row) => row.geo)
    : [];
  return {
    generatedAt: readText(record.generatedAt) || "-",
    reportVersion: readText(record.reportVersion) || "UNKNOWN",
    inputColorProposals: readText(record.inputColorProposals),
    inputPrimaryLawBlockers: readText(record.inputPrimaryLawBlockers),
    nonMutating: record.nonMutating === true,
    applyStatus: readText(record.applyStatus) || "UNKNOWN",
    requiresExplicitAuthorization: record.requiresExplicitAuthorization === true,
    safeToAutoApply: record.safeToAutoApply === true,
    mutationPolicy: readText(record.mutationPolicy),
    rowsTotal: readNumber(record.rowsTotal) || rows.length,
    allowedTargetColors: readStringArray(record.allowedTargetColors),
    counts: {
      proposalAction: readCountRecord(counts.proposalAction),
      colorTransition: readCountRecord(counts.colorTransition),
      proposedTruthColor: readCountRecord(counts.proposedTruthColor),
      applyDisposition: readCountRecord(counts.applyDisposition),
      effectiveSourceCoverage: readCountRecord(counts.effectiveSourceCoverage),
    },
    validation: readRecord(record.validation),
    rows,
  };
}

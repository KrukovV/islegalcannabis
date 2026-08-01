export type WikiTruthColorReviewDossierRow = {
  reviewIndex: number;
  geo: string;
  territory: string;
  currentColor: string;
  proposedTruthColor: string;
  proposalAction: string;
  applyDisposition: string;
  gateDecision: string;
  gateReasons: string[];
  reviewDecision: string;
  legalBasisClass: string;
  evidenceCoverage: string;
  truthRule: string;
  truthReason: string;
  currentReason: string;
  blockedByPrimaryLaw: boolean;
  allowedColorOnly: boolean;
  nonApplyReason: string;
};

export type WikiTruthColorReviewDossierView = {
  generatedAt: string;
  reportVersion: string;
  inputColorProposals: string;
  inputColorApplyPlan: string;
  inputColorApplyGate: string;
  inputPrimaryLawBlockers: string;
  nonMutating: boolean;
  localOnly: boolean;
  reviewStatus: string;
  mutationPolicy: string;
  rowsTotal: number;
  appliedRows: number;
  readyPendingAuthorizationRows: number;
  blockedRows: number;
  primaryLawBlockerGeos: string[];
  counts: {
    reviewDecision: Record<string, number>;
    applyDisposition: Record<string, number>;
    proposalAction: Record<string, number>;
    legalBasisClass: Record<string, number>;
    colorTransition: Record<string, number>;
    gateDecision: Record<string, number>;
  };
  validation: Record<string, unknown>;
  rows: WikiTruthColorReviewDossierRow[];
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

function normalizeRow(value: unknown): WikiTruthColorReviewDossierRow {
  const row = readRecord(value);
  return {
    reviewIndex: readNumber(row.reviewIndex),
    geo: readText(row.geo),
    territory: readText(row.territory),
    currentColor: readText(row.currentColor) || "UNKNOWN",
    proposedTruthColor: readText(row.proposedTruthColor) || "UNKNOWN",
    proposalAction: readText(row.proposalAction) || "UNKNOWN",
    applyDisposition: readText(row.applyDisposition) || "UNKNOWN",
    gateDecision: readText(row.gateDecision) || "UNKNOWN",
    gateReasons: readStringArray(row.gateReasons),
    reviewDecision: readText(row.reviewDecision) || "UNKNOWN",
    legalBasisClass: readText(row.legalBasisClass) || "UNKNOWN",
    evidenceCoverage: readText(row.evidenceCoverage) || "UNKNOWN",
    truthRule: readText(row.truthRule) || "UNKNOWN",
    truthReason: readText(row.truthReason),
    currentReason: readText(row.currentReason),
    blockedByPrimaryLaw: row.blockedByPrimaryLaw === true,
    allowedColorOnly: row.allowedColorOnly === true,
    nonApplyReason: readText(row.nonApplyReason),
  };
}

export function normalizeWikiTruthColorReviewDossier(
  payload: unknown,
): WikiTruthColorReviewDossierView {
  const record = readRecord(payload);
  const counts = readRecord(record.counts);
  const rows = Array.isArray(record.rows)
    ? record.rows.map(normalizeRow).filter((row) => row.geo)
    : [];
  return {
    generatedAt: readText(record.generatedAt) || "-",
    reportVersion: readText(record.reportVersion) || "UNKNOWN",
    inputColorProposals: readText(record.inputColorProposals),
    inputColorApplyPlan: readText(record.inputColorApplyPlan),
    inputColorApplyGate: readText(record.inputColorApplyGate),
    inputPrimaryLawBlockers: readText(record.inputPrimaryLawBlockers),
    nonMutating: record.nonMutating === true,
    localOnly: record.localOnly === true,
    reviewStatus: readText(record.reviewStatus) || "UNKNOWN",
    mutationPolicy: readText(record.mutationPolicy),
    rowsTotal: readNumber(record.rowsTotal) || rows.length,
    appliedRows: readNumber(record.appliedRows),
    readyPendingAuthorizationRows: readNumber(
      record.readyPendingAuthorizationRows,
    ),
    blockedRows: readNumber(record.blockedRows),
    primaryLawBlockerGeos: readStringArray(record.primaryLawBlockerGeos),
    counts: {
      reviewDecision: readCountRecord(counts.reviewDecision),
      applyDisposition: readCountRecord(counts.applyDisposition),
      proposalAction: readCountRecord(counts.proposalAction),
      legalBasisClass: readCountRecord(counts.legalBasisClass),
      colorTransition: readCountRecord(counts.colorTransition),
      gateDecision: readCountRecord(counts.gateDecision),
    },
    validation: readRecord(record.validation),
    rows,
  };
}

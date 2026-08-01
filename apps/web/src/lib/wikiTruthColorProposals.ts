export type WikiTruthColorProposalRow = {
  geo: string;
  territory: string;
  currentColor: string;
  currentSource: string;
  currentReason: string;
  proposedTruthColor: string;
  proposalAction: string;
  proposalRationale: string;
  truthRule: string;
  truthReason: string;
  sourceCoverage: string;
  effectiveSourceCoverage: string;
};

export type WikiTruthColorProposalsView = {
  generatedAt: string;
  reportVersion: string;
  rowsTotal: number;
  proposalsTotal: number;
  nonMutating: boolean;
  mutationPolicy: string;
  acceptanceNote: string;
  counts: {
    currentColor: Record<string, number>;
    proposedTruthColor: Record<string, number>;
    proposalAction: Record<string, number>;
    colorStatus: Record<string, number>;
    truthRule: Record<string, number>;
    effectiveSourceCoverage: Record<string, number>;
  };
  proposals: WikiTruthColorProposalRow[];
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
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

function readText(value: unknown) {
  return String(value || "").trim();
}

function readNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeProposalRow(value: unknown): WikiTruthColorProposalRow {
  const row = readRecord(value);
  return {
    geo: readText(row.geo),
    territory: readText(row.territory),
    currentColor: readText(row.currentColor) || "UNKNOWN",
    currentSource: readText(row.currentSource) || "UNKNOWN",
    currentReason: readText(row.currentReason),
    proposedTruthColor: readText(row.proposedTruthColor) || "UNKNOWN",
    proposalAction: readText(row.proposalAction) || "UNKNOWN",
    proposalRationale: readText(row.proposalRationale),
    truthRule: readText(row.truthRule) || "UNKNOWN",
    truthReason: readText(row.truthReason),
    sourceCoverage: readText(row.sourceCoverage) || "UNKNOWN",
    effectiveSourceCoverage:
      readText(row.effectiveSourceCoverage) ||
      readText(row.sourceCoverage) ||
      "UNKNOWN",
  };
}

export function normalizeWikiTruthColorProposals(
  payload: unknown,
): WikiTruthColorProposalsView {
  const record = readRecord(payload);
  const counts = readRecord(record.counts);
  const proposals = Array.isArray(record.proposals)
    ? record.proposals.map(normalizeProposalRow).filter((row) => row.geo)
    : [];

  return {
    generatedAt: readText(record.generatedAt) || "-",
    reportVersion: readText(record.reportVersion) || "UNKNOWN",
    rowsTotal: readNumber(record.rowsTotal),
    proposalsTotal: readNumber(record.proposalsTotal) || proposals.length,
    nonMutating: record.nonMutating === true,
    mutationPolicy: readText(record.mutationPolicy),
    acceptanceNote: readText(record.acceptanceNote),
    counts: {
      currentColor: readCountRecord(counts.currentColor),
      proposedTruthColor: readCountRecord(counts.proposedTruthColor),
      proposalAction: readCountRecord(counts.proposalAction),
      colorStatus: readCountRecord(counts.colorStatus),
      truthRule: readCountRecord(counts.truthRule),
      effectiveSourceCoverage: readCountRecord(counts.effectiveSourceCoverage),
    },
    proposals,
  };
}

export type WikiTruthColorApplyGateRow = {
  planIndex: number;
  geo: string;
  territory: string;
  currentColor: string;
  proposedTruthColor: string;
  applyDisposition: string;
  gateDecision: string;
  gateReasons: string[];
};

export type WikiTruthColorApplyGateView = {
  generatedAt: string;
  reportVersion: string;
  inputColorApplyPlan: string;
  inputPrimaryLawBlockers: string;
  nonMutating: boolean;
  localOnly: boolean;
  gateStatus: string;
  mutationAttempted: boolean;
  ssotMutationAttempted: boolean;
  mapMutationAttempted: boolean;
  productionTouched: boolean;
  appliedRows: number;
  wouldApplyRows: number;
  blockedRows: number;
  blockingReasons: string[];
  requiredAuthorizationPhrase: string;
  authorization: {
    env: string;
    present: boolean;
    accepted: boolean;
  };
  environment: {
    ssotWriteEnabled: boolean;
    ssotWriteEnv: string;
    nodeEnv: string;
  };
  primaryLawBlockers: {
    total: number;
    geos: string[];
  };
  counts: {
    gateDecision: Record<string, number>;
    gateReasons: Record<string, number>;
    applyDisposition: Record<string, number>;
  };
  protectedHashProof: Array<{
    path: string;
    exists: boolean;
    sha256: string;
  }>;
  validation: Record<string, unknown>;
  rows: WikiTruthColorApplyGateRow[];
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

function normalizeRow(value: unknown): WikiTruthColorApplyGateRow {
  const row = readRecord(value);
  return {
    planIndex: readNumber(row.planIndex),
    geo: readText(row.geo),
    territory: readText(row.territory),
    currentColor: readText(row.currentColor) || "UNKNOWN",
    proposedTruthColor: readText(row.proposedTruthColor) || "UNKNOWN",
    applyDisposition: readText(row.applyDisposition) || "UNKNOWN",
    gateDecision: readText(row.gateDecision) || "UNKNOWN",
    gateReasons: readStringArray(row.gateReasons),
  };
}

export function normalizeWikiTruthColorApplyGate(
  payload: unknown,
): WikiTruthColorApplyGateView {
  const record = readRecord(payload);
  const authorization = readRecord(record.authorization);
  const environment = readRecord(record.environment);
  const primaryLawBlockers = readRecord(record.primaryLawBlockers);
  const counts = readRecord(record.counts);
  const rows = Array.isArray(record.rows)
    ? record.rows.map(normalizeRow).filter((row) => row.geo)
    : [];
  const protectedHashProof = Array.isArray(record.protectedHashProof)
    ? record.protectedHashProof.map((item) => {
        const row = readRecord(item);
        return {
          path: readText(row.path),
          exists: row.exists === true,
          sha256: readText(row.sha256),
        };
      })
    : [];
  return {
    generatedAt: readText(record.generatedAt) || "-",
    reportVersion: readText(record.reportVersion) || "UNKNOWN",
    inputColorApplyPlan: readText(record.inputColorApplyPlan),
    inputPrimaryLawBlockers: readText(record.inputPrimaryLawBlockers),
    nonMutating: record.nonMutating === true,
    localOnly: record.localOnly === true,
    gateStatus: readText(record.gateStatus) || "UNKNOWN",
    mutationAttempted: record.mutationAttempted === true,
    ssotMutationAttempted: record.ssotMutationAttempted === true,
    mapMutationAttempted: record.mapMutationAttempted === true,
    productionTouched: record.productionTouched === true,
    appliedRows: readNumber(record.appliedRows),
    wouldApplyRows: readNumber(record.wouldApplyRows),
    blockedRows: readNumber(record.blockedRows),
    blockingReasons: readStringArray(record.blockingReasons),
    requiredAuthorizationPhrase: readText(record.requiredAuthorizationPhrase),
    authorization: {
      env: readText(authorization.env),
      present: authorization.present === true,
      accepted: authorization.accepted === true,
    },
    environment: {
      ssotWriteEnabled: environment.ssotWriteEnabled === true,
      ssotWriteEnv: readText(environment.ssotWriteEnv),
      nodeEnv: readText(environment.nodeEnv),
    },
    primaryLawBlockers: {
      total: readNumber(primaryLawBlockers.total),
      geos: readStringArray(primaryLawBlockers.geos),
    },
    counts: {
      gateDecision: readCountRecord(counts.gateDecision),
      gateReasons: readCountRecord(counts.gateReasons),
      applyDisposition: readCountRecord(counts.applyDisposition),
    },
    protectedHashProof,
    validation: readRecord(record.validation),
    rowsTotal: rows.length,
    rows,
  } as WikiTruthColorApplyGateView;
}

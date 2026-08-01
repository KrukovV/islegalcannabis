export type WikiTruthAcceptanceRequirement = {
  key: string;
  status: string;
  reason: string;
  evidence: Record<string, unknown>;
};

export type WikiTruthAcceptanceRow = {
  geo: string;
  territory: string;
  status: string;
  colorStatus: string;
  truthRuleId: string;
  requirementStatuses: Record<string, string>;
};

export type WikiTruthAcceptanceAuditView = {
  generatedAt: string;
  reportVersion: string;
  inputTruthReport: string;
  inputMatrix: string;
  rowsTotal: number;
  rowsExpected: number;
  complete: boolean;
  counts: Record<string, unknown>;
  globalRequirements: WikiTruthAcceptanceRequirement[];
  incompleteRequirements: WikiTruthAcceptanceRequirement[];
  blockerGeos: string[];
  rows: WikiTruthAcceptanceRow[];
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

function normalizeRequirement(
  key: string,
  value: unknown,
): WikiTruthAcceptanceRequirement {
  const requirement = readRecord(value);
  return {
    key,
    status: readText(requirement.status) || "UNKNOWN",
    reason: readText(requirement.reason),
    evidence: readRecord(requirement.evidence),
  };
}

function normalizeRow(value: unknown): WikiTruthAcceptanceRow {
  const row = readRecord(value);
  const requirements = readRecord(row.requirements);
  const requirementStatuses: Record<string, string> = {};
  for (const [key, rawRequirement] of Object.entries(requirements)) {
    requirementStatuses[key] =
      readText(readRecord(rawRequirement).status) || "UNKNOWN";
  }
  return {
    geo: readText(row.geo),
    territory: readText(row.territory),
    status: readText(row.status) || "UNKNOWN",
    colorStatus: readText(row.colorStatus) || "UNKNOWN",
    truthRuleId: readText(row.truthRuleId) || "UNKNOWN",
    requirementStatuses,
  };
}

export function normalizeWikiTruthAcceptanceAudit(
  payload: unknown,
): WikiTruthAcceptanceAuditView {
  const record = readRecord(payload);
  const globalRequirements = Object.entries(
    readRecord(record.globalRequirements),
  ).map(([key, requirement]) => normalizeRequirement(key, requirement));
  const rows = Array.isArray(record.rows)
    ? record.rows.map(normalizeRow).filter((row) => row.geo)
    : [];
  const rowsTotal = readNumber(record.rowsTotal) || rows.length;
  const rowsExpected = readNumber(record.rowsExpected) || rowsTotal;
  const incompleteRequirements = globalRequirements.filter(
    (requirement) => requirement.status !== "PROVEN",
  );
  const blockerGeos = rows
    .filter((row) => row.status !== "PROVEN")
    .map((row) => row.geo)
    .filter(Boolean)
    .sort();

  return {
    generatedAt: readText(record.generatedAt) || "-",
    reportVersion: readText(record.reportVersion) || "UNKNOWN",
    inputTruthReport: readText(record.inputTruthReport),
    inputMatrix: readText(record.inputMatrix),
    rowsTotal,
    rowsExpected,
    complete: record.complete === true,
    counts: readRecord(record.counts),
    globalRequirements,
    incompleteRequirements,
    blockerGeos,
    rows,
  };
}

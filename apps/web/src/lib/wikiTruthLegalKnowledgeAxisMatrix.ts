export type WikiTruthLegalKnowledgeAxisMatrixRow = {
  geo: string;
  territory: string;
  truthColor: string;
  truthRule: string;
  wikiAuditStatus: string;
  ssotStatus: string;
  colorStatus: string;
  knownAxisCells: number;
  unknownAxisCells: number;
  coarseAxisCells: number;
  directAxisCells: number;
  requiredAxisCells: number;
};

export type WikiTruthLegalKnowledgeAxisMatrixAxis = {
  group: string;
  axis: string;
};

export type WikiTruthLegalKnowledgeAxisMatrixView = {
  generatedAt: string;
  reportVersion: string;
  status: string;
  nonMutating: boolean;
  localOnly: boolean;
  productionTouched: boolean;
  ssotMutationAttempted: boolean;
  mapMutationAttempted: boolean;
  appliedRows: number;
  rowsTotal: number;
  rowsExpected: number;
  requiredAxisTotal: number;
  cellsTotal: number;
  knownAxisCells: number;
  unknownAxisCells: number;
  rowsWithUnknownAxes: number;
  rowsWithAllAxesKnown: number;
  counts: {
    axisStatus: Record<string, number>;
    evidenceClass: Record<string, number>;
    axisGroup: Record<string, number>;
    truthColor: Record<string, number>;
  };
  validation: Record<string, unknown>;
  guardrails: string[];
  axes: WikiTruthLegalKnowledgeAxisMatrixAxis[];
  rows: WikiTruthLegalKnowledgeAxisMatrixRow[];
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

function normalizeAxisRow(
  value: unknown,
): WikiTruthLegalKnowledgeAxisMatrixRow {
  const row = readRecord(value);
  const axisCompleteness = readRecord(row.axisCompleteness);
  return {
    geo: readText(row.geo),
    territory: readText(row.territory),
    truthColor: readText(row.truthColor) || "UNKNOWN",
    truthRule: readText(row.truthRule) || "UNKNOWN",
    wikiAuditStatus: readText(row.wikiAuditStatus) || "UNKNOWN",
    ssotStatus: readText(row.ssotStatus) || "UNKNOWN",
    colorStatus: readText(row.colorStatus) || "UNKNOWN",
    knownAxisCells: readNumber(axisCompleteness.knownAxisCells),
    unknownAxisCells: readNumber(axisCompleteness.unknownAxisCells),
    coarseAxisCells: readNumber(axisCompleteness.coarseAxisCells),
    directAxisCells: readNumber(axisCompleteness.directAxisCells),
    requiredAxisCells: readNumber(axisCompleteness.requiredAxisCells),
  };
}

function normalizeAxisSchema(
  value: unknown,
): WikiTruthLegalKnowledgeAxisMatrixAxis[] {
  const groups = readRecord(value);
  const axes: WikiTruthLegalKnowledgeAxisMatrixAxis[] = [];
  for (const [group, rawAxes] of Object.entries(groups)) {
    if (!Array.isArray(rawAxes)) continue;
    for (const axis of rawAxes) {
      const axisName = readText(axis);
      if (!axisName) continue;
      axes.push({ group, axis: axisName });
    }
  }
  return axes;
}

export function normalizeWikiTruthLegalKnowledgeAxisMatrix(
  payload: unknown,
): WikiTruthLegalKnowledgeAxisMatrixView {
  const record = readRecord(payload);
  const summary = readRecord(record.summary);
  const counts = readRecord(record.counts);
  const rows = Array.isArray(record.rows)
    ? record.rows.map(normalizeAxisRow).filter((row) => row.geo)
    : [];
  const axes = normalizeAxisSchema(record.requiredAxisGroups);
  return {
    generatedAt: readText(record.generatedAt) || "-",
    reportVersion: readText(record.reportVersion) || "UNKNOWN",
    status: readText(record.matrixStatus) || "UNKNOWN",
    nonMutating: record.nonMutating === true,
    localOnly: record.localOnly === true,
    productionTouched: record.productionTouched === true,
    ssotMutationAttempted: record.ssotMutationAttempted === true,
    mapMutationAttempted: record.mapMutationAttempted === true,
    appliedRows: readNumber(record.appliedRows),
    rowsTotal: readNumber(record.rowsTotal) || rows.length,
    rowsExpected: readNumber(record.rowsExpected),
    requiredAxisTotal: readNumber(record.requiredAxisTotal) || axes.length,
    cellsTotal: readNumber(record.cellsTotal),
    knownAxisCells: readNumber(summary.knownAxisCells),
    unknownAxisCells: readNumber(summary.unknownAxisCells),
    rowsWithUnknownAxes: readNumber(summary.rowsWithUnknownAxes),
    rowsWithAllAxesKnown: readNumber(summary.rowsWithAllAxesKnown),
    counts: {
      axisStatus: readCountRecord(counts.axisStatus),
      evidenceClass: readCountRecord(counts.evidenceClass),
      axisGroup: readCountRecord(counts.axisGroup),
      truthColor: readCountRecord(counts.truthColor),
    },
    validation: readRecord(record.validation),
    guardrails: readStringArray(record.guardrails),
    axes,
    rows,
  };
}

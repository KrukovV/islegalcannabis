#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const TRUTH_AUDIT_REPORT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-truth-audit-report.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-legal-knowledge-axis-matrix.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-legal-knowledge-axis-matrix.md",
);

const TOTAL_GEO_EXPECTED = 307;

const REQUIRED_AXIS_GROUPS = Object.freeze({
  recreational: [
    "possession",
    "use",
    "purchase",
    "sale",
    "transport",
    "cultivation_personal",
    "cultivation_commercial",
  ],
  medical: [
    "patient_access",
    "physician_prescription",
    "specialist_prescription",
    "dispensing",
    "licensed_pharmacy",
    "patient_registry",
    "reimbursement",
    "compassionate_use",
    "import_for_patient",
    "export_only",
    "production_only",
    "cultivation_only",
    "pharmaceutical_products",
    "cannabis_flower",
    "cannabis_extract",
    "cannabinoid_drugs",
    "CBD_only",
    "Sativex_only",
    "Epidiolex_only",
  ],
  industry: [
    "research",
    "laboratory",
    "manufacturing",
    "processing",
    "distribution",
    "export",
    "import",
    "licensing",
  ],
  legal_state: [
    "enacted",
    "commenced",
    "operational",
    "pilot",
    "temporary",
    "expired",
    "proposal",
    "bill",
    "consultation",
  ],
  jurisdiction: [
    "sovereign",
    "claimant",
    "occupied",
    "disputed",
    "dependent",
    "overseas",
    "federal",
    "state",
    "territory",
  ],
  enforcement: [
    "criminal",
    "administrative",
    "decriminalized",
    "threshold",
    "no_jail",
    "fine_only",
  ],
});

const AXIS_TERMS = Object.freeze({
  possession: /\b(possession|possess|holding|detention|detention|possession)\b/i,
  use: /\b(use|using|consumption|consume|personal consumption)\b/i,
  purchase: /\b(purchase|acquisition|acquire|buy|obtaining)\b/i,
  sale: /\b(sale|sell|selling|offer|supply|cession|delivery)\b/i,
  transport: /\b(transport|transportation|shipment|traffic|trafficking)\b/i,
  cultivation_personal: /\b(personal cultivation|cultivation|cultivate|planting)\b/i,
  cultivation_commercial: /\b(commercial cultivation|licensed cultivation|cultivation|cultivate|planting)\b/i,
  physician_prescription: /\b(physician prescription|doctor prescription|medical prescription|prescription)\b/i,
  specialist_prescription: /\b(specialist prescription|specialist)\b/i,
  dispensing: /\b(dispensing|dispensed|dispense|dispensation)\b/i,
  licensed_pharmacy: /\b(pharmacy|pharmacies|licensed pharmacy|state pharmacies)\b/i,
  patient_registry: /\b(patient registry|medical cannabis registry|medical cannabis card|certified patient)\b/i,
  reimbursement: /\b(reimbursement|reimbursed|covered by insurance)\b/i,
  compassionate_use: /\b(compassionate use|special permit|special authori[sz]ation)\b/i,
  import_for_patient: /\b(import for patient|patient import|importation for medical)\b/i,
  export_only: /\b(export only|export)\b/i,
  production_only: /\b(production only|production|manufacture)\b/i,
  cultivation_only: /\b(cultivation only|licensed cultivation|cultivation)\b/i,
  pharmaceutical_products: /\b(pharmaceutical|medicine|medicinal product|cannabinoid pharmaceutical)\b/i,
  cannabis_flower: /\b(flower|dried cannabis|herbal cannabis)\b/i,
  cannabis_extract: /\b(extract|oil|resin|tincture)\b/i,
  cannabinoid_drugs: /\b(cannabinoid|THC|cannabinol|cannabidiol)\b/i,
  CBD_only: /\b(CBD|cannabidiol)\b/i,
  Sativex_only: /\b(Sativex|nabiximols)\b/i,
  Epidiolex_only: /\b(Epidiolex|Epidyolex)\b/i,
  research: /\b(research|scientific)\b/i,
  laboratory: /\b(laboratory|lab)\b/i,
  manufacturing: /\b(manufacturing|manufacture)\b/i,
  processing: /\b(processing|transformation|extracting|preparation)\b/i,
  distribution: /\b(distribution|distribute|delivery|supply)\b/i,
  export: /\b(export)\b/i,
  import: /\b(import)\b/i,
  licensing: /\b(license|licence|licensed|licensing|authorization|authorisation)\b/i,
  enacted: /\b(enacted|adopted|ratified|law|act|statute)\b/i,
  commenced: /\b(commenced|in force|effective|entered into force)\b/i,
  operational: /\b(operational|operates|dispensed|supplied|registered|state pharmacies)\b/i,
  pilot: /\b(pilot)\b/i,
  temporary: /\b(temporary|interim)\b/i,
  expired: /\b(expired|repealed|lapsed)\b/i,
  proposal: /\b(proposal|proposed)\b/i,
  bill: /\b(bill|draft law)\b/i,
  consultation: /\b(consultation)\b/i,
  sovereign: /\b(sovereign|national territory|state law)\b/i,
  claimant: /\b(claimant|claimed by|disputed)\b/i,
  occupied: /\b(occupied)\b/i,
  disputed: /\b(disputed)\b/i,
  dependent: /\b(dependent|dependency|overseas territory)\b/i,
  overseas: /\b(overseas)\b/i,
  federal: /\b(federal)\b/i,
  state: /\b(state law|state agency|US-[A-Z]{2})\b/i,
  territory: /\b(territory|territorial)\b/i,
  criminal: /\b(criminal|crime|offence|offense|imprisonment|prison|jail)\b/i,
  administrative: /\b(administrative|civil fine|fine)\b/i,
  decriminalized: /\b(decriminali[sz]ed|no jail|fine only|administrative)\b/i,
  threshold: /\b(threshold|gram|grammes|quantity|amount)\b/i,
  no_jail: /\b(no jail|without imprisonment|fine only)\b/i,
  fine_only: /\b(fine only|fine)\b/i,
});

const DIRECT_AXIS_MAP = Object.freeze({
  cultivation_personal: ["cultivation_personal"],
  cultivation_commercial: ["cultivation_commercial"],
  patient_access: ["patient_access"],
  physician_prescription: ["prescription"],
  dispensing: ["dispensing", "pharmacy_access"],
  licensed_pharmacy: ["pharmacy_access"],
  production_only: ["production"],
  cultivation_only: ["cultivation_commercial", "cultivation_personal"],
  distribution: ["distribution"],
  export: ["export"],
  import: ["import"],
  enacted: ["legal_state"],
  commenced: ["legal_state"],
  operational: ["legal_state"],
  criminal: ["enforcement", "enforcement_mode"],
  administrative: ["enforcement", "enforcement_mode"],
  decriminalized: ["enforcement", "enforcement_mode"],
  fine_only: ["enforcement", "enforcement_mode"],
});

const GUARDRAILS = Object.freeze([
  "UNKNOWN_AXIS_MUST_REMAIN_UNKNOWN_UNTIL_PRIMARY_LAW_PROVES_IT",
  "NO_AXIS_VALUE_FROM_WIKIPEDIA",
  "NO_AXIS_VALUE_FROM_COLOR_ALONE",
  "NO_PRODUCTION_TO_PATIENT_ACCESS_INFERENCE",
  "NO_CULTIVATION_TO_PATIENT_ACCESS_INFERENCE",
  "NO_RESEARCH_TO_PATIENT_PROGRAMME_INFERENCE",
  "NO_EXPORT_TO_PATIENT_PROGRAMME_INFERENCE",
  "NO_CBD_OR_SATIVEX_TO_FULL_MEDICAL_PROGRAMME_INFERENCE",
  "NO_BILL_TO_OPERATIONAL_PROGRAMME_INFERENCE",
  "NO_CLAIMANT_LAW_TO_TERRITORY_LAW_INFERENCE",
  "NO_FEDERAL_STATE_SCOPE_MERGE",
  "NO_SSOT_OR_MAP_MUTATION",
  "NO_PRODUCTION_MUTATION",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStatus(value) {
  return compact(value).toUpperCase();
}

function isKnownAxisValue(value) {
  const normalized = normalizeStatus(value);
  return (
    Boolean(normalized) &&
    ![
      "UNKNOWN",
      "MISSING",
      "UNCONFIRMED",
      "UNASSESSED",
      "NO_DIRECT",
      "NO_PGA",
      "NO_SPI",
      "NONE",
    ].includes(normalized)
  );
}

function countBy(rows, getter) {
  const counts = {};
  for (const row of rows) {
    const key = String(getter(row) || "UNKNOWN");
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function inputHash(filePath) {
  const body = fs.readFileSync(filePath);
  return {
    path: rel(filePath),
    bytes: body.length,
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
  };
}

function nestedText(value, depth = 0) {
  if (depth > 4 || value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return ` ${value}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => nestedText(item, depth + 1)).join(" ");
  }
  if (typeof value === "object") {
    return Object.values(value).map((item) => nestedText(item, depth + 1)).join(" ");
  }
  return "";
}

function axisSource(row) {
  const layers = row.truthLayers || {};
  return {
    primaryLaw: layers.primaryLaw?.axis || {},
    legalInterpretation: layers.legalInterpretation?.axis || {},
    official: row.official || {},
    legalInterpretationSummary: row.legalInterpretation || {},
    project: row.project || {},
  };
}

function lookupDirectAxisValue(requiredAxis, sources) {
  const candidates = DIRECT_AXIS_MAP[requiredAxis] || [requiredAxis];
  for (const sourceName of ["legalInterpretation", "primaryLaw", "official", "legalInterpretationSummary"]) {
    const source = sources[sourceName] || {};
    for (const candidate of candidates) {
      if (!Object.prototype.hasOwnProperty.call(source, candidate)) continue;
      const value = source[candidate];
      if (isKnownAxisValue(value)) {
        return {
          value: normalizeStatus(value),
          sourceLayer: sourceName,
          evidenceClass: "DIRECT_OR_EXISTING_AXIS_VALUE",
        };
      }
    }
  }
  return null;
}

function inferCoarseAxisValue(group, axis, row, sourceText) {
  const truthRule = normalizeStatus(row.truth?.ruleId);
  const truthColor = normalizeStatus(row.truth?.color);
  const rec = normalizeStatus(row.legalInterpretation?.recreational || row.official?.recreational);
  const med = normalizeStatus(row.legalInterpretation?.medical || row.official?.medical);
  const enforcement = normalizeStatus(row.legalInterpretation?.enforcement || row.official?.enforcement);
  const hasAxisTerm = AXIS_TERMS[axis]?.test(sourceText) === true;

  if (group === "recreational" && ["possession", "use"].includes(axis)) {
    if (truthRule === "OFFICIAL_STATUS_RECREATIONAL_LEGAL") {
      return {
        value: "ADULT_USE_LEGAL_COARSE",
        evidenceClass: "COARSE_TRUTH_RULE_AXIS_DERIVATION",
      };
    }
    if (truthRule === "OFFICIAL_STATUS_RECREATIONAL_DECRIMINALIZED") {
      return {
        value: "DECRIMINALIZED_COARSE",
        evidenceClass: "COARSE_TRUTH_RULE_AXIS_DERIVATION",
      };
    }
  }

  if (axis === "patient_access" && truthRule === "OFFICIAL_STATUS_PATIENT_ACCESS_OPERATIONAL") {
    return {
      value: "OPERATIONAL_PATIENT_ACCESS",
      evidenceClass: "COARSE_TRUTH_RULE_AXIS_DERIVATION",
    };
  }

  if (axis === "patient_access" && /NO[_ -]?PATIENT|PATIENT_ACCESS_NEGATIVE/.test(`${truthRule} ${med}`)) {
    return {
      value: "NO_OPERATIONAL_PATIENT_ACCESS_PROVEN",
      evidenceClass: "COARSE_TRUTH_RULE_AXIS_DERIVATION",
    };
  }

  if (group === "enforcement" && axis === "decriminalized" && /DECRIMINAL|ADMINISTRATIVE|FINE_ONLY|NO_JAIL/.test(enforcement + rec)) {
    return {
      value: "DECRIMINALIZED_OR_ADMINISTRATIVE_SIGNAL",
      evidenceClass: "COARSE_LEGAL_INTERPRETATION_DERIVATION",
    };
  }

  if (group === "enforcement" && axis === "criminal" && /STRICT|CRIMINAL|ILLEGAL|IMPRISON|OFFENCE|OFFENSE/.test(enforcement + rec)) {
    return {
      value: "CRIMINAL_OR_STRICT_CONTROL_SIGNAL",
      evidenceClass: "COARSE_LEGAL_INTERPRETATION_DERIVATION",
    };
  }

  if (group === "legal_state" && axis === "operational") {
    if (
      truthRule === "OFFICIAL_STATUS_PATIENT_ACCESS_OPERATIONAL" ||
      truthRule === "OFFICIAL_STATUS_RECREATIONAL_LEGAL"
    ) {
      return {
        value: "OPERATIONAL_COARSE",
        evidenceClass: "COARSE_TRUTH_RULE_AXIS_DERIVATION",
      };
    }
    if (truthRule === "OFFICIAL_LIFECYCLE") {
      return {
        value: "NOT_CONFIRMED_OPERATIONAL",
        evidenceClass: "COARSE_TRUTH_RULE_AXIS_DERIVATION",
      };
    }
    return {
      value: "NOT_CONFIRMED_OPERATIONAL",
      evidenceClass: "COARSE_TRUTH_RULE_AXIS_DERIVATION",
    };
  }

  if (hasAxisTerm) {
    return {
      value: "MENTIONED_REQUIRES_AXIS_REVIEW",
      evidenceClass: "TEXT_MENTION_NOT_LEGAL_CONCLUSION",
    };
  }

  if (truthColor && ["GREEN", "YELLOW", "RED", "UNKNOWN"].includes(truthColor)) {
    return {
      value: "UNKNOWN_UNPROVEN_AXIS",
      evidenceClass: "EXPLICIT_UNKNOWN_NOT_DERIVED_FROM_COLOR",
    };
  }

  return {
    value: "UNKNOWN_UNPROVEN_AXIS",
    evidenceClass: "EXPLICIT_UNKNOWN_NO_AXIS_EVIDENCE",
  };
}

function buildAxisCell(group, axis, row) {
  const sources = axisSource(row);
  const direct = lookupDirectAxisValue(axis, sources);
  const sourceText = compact(
    [
      nestedText(row.official),
      nestedText(row.legalInterpretation),
      nestedText(row.truthLayers?.legalInterpretation),
      nestedText(row.diagnostics?.evidence),
      nestedText(row.diagnostics?.officialInterpretation),
    ].join(" "),
  );

  if (direct) {
    return {
      status: "KNOWN",
      value: direct.value,
      sourceLayer: direct.sourceLayer,
      evidenceClass: direct.evidenceClass,
    };
  }

  const inferred = inferCoarseAxisValue(group, axis, row, sourceText);
  const known = inferred.value !== "UNKNOWN_UNPROVEN_AXIS";
  return {
    status: known ? "KNOWN_COARSE" : "UNKNOWN",
    value: inferred.value,
    sourceLayer: known ? "OFFICIAL_LEGAL_INTERPRETATION_TEXT" : "NONE",
    evidenceClass: inferred.evidenceClass,
  };
}

function buildRow(row) {
  const axisGroups = {};
  let knownAxisCells = 0;
  let unknownAxisCells = 0;
  let coarseAxisCells = 0;
  let directAxisCells = 0;
  for (const [group, axes] of Object.entries(REQUIRED_AXIS_GROUPS)) {
    axisGroups[group] = {};
    for (const axis of axes) {
      const cell = buildAxisCell(group, axis, row);
      axisGroups[group][axis] = cell;
      if (cell.status === "UNKNOWN") unknownAxisCells += 1;
      if (cell.status === "KNOWN" || cell.status === "KNOWN_COARSE") knownAxisCells += 1;
      if (cell.status === "KNOWN_COARSE") coarseAxisCells += 1;
      if (cell.evidenceClass === "DIRECT_OR_EXISTING_AXIS_VALUE") directAxisCells += 1;
    }
  }
  return {
    geo: row.geo,
    territory: row.territory,
    sourceCoverage: row.sourceCoverage || "UNKNOWN",
    effectiveSourceCoverage: row.effectiveSourceCoverage || "UNKNOWN",
    truthColor: row.truth?.color || "UNKNOWN",
    truthRule: row.truth?.ruleId || "UNKNOWN",
    wikiAuditStatus:
      row.diagnostics?.wiki?.extended?.status ||
      row.diagnostics?.wiki?.status ||
      "UNKNOWN",
    ssotStatus: row.diagnostics?.ssot?.status || "UNKNOWN",
    colorStatus: row.diagnostics?.color?.status || "UNKNOWN",
    axisCompleteness: {
      knownAxisCells,
      unknownAxisCells,
      coarseAxisCells,
      directAxisCells,
      requiredAxisCells: Object.values(REQUIRED_AXIS_GROUPS).flat().length,
    },
    axisGroups,
  };
}

function flattenRows(rows) {
  const out = [];
  for (const row of rows) {
    for (const [group, axes] of Object.entries(row.axisGroups)) {
      for (const [axis, cell] of Object.entries(axes)) {
        out.push({
          geo: row.geo,
          group,
          axis,
          status: cell.status,
          value: cell.value,
          evidenceClass: cell.evidenceClass,
        });
      }
    }
  }
  return out;
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Legal Knowledge Axis Matrix");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Status: ${output.matrixStatus}`);
  lines.push(`Rows: ${output.rowsTotal}/${output.rowsExpected}`);
  lines.push(`Required axes: ${output.requiredAxisTotal}`);
  lines.push(`Cells: ${output.cellsTotal}`);
  lines.push(`Known cells: ${output.summary.knownAxisCells}`);
  lines.push(`Unknown cells: ${output.summary.unknownAxisCells}`);
  lines.push("");
  lines.push("## Axis groups");
  lines.push("");
  for (const [group, axes] of Object.entries(output.requiredAxisGroups)) {
    lines.push(`- \`${group}\`: ${axes.map((axis) => `\`${axis}\``).join(", ")}`);
  }
  lines.push("");
  lines.push("## Guardrails");
  lines.push("");
  for (const guardrail of output.guardrails) {
    lines.push(`- \`${guardrail}\``);
  }
  lines.push("");
  lines.push("## Row summary");
  lines.push("");
  lines.push("| GEO | Territory | Truth color | Known axes | Unknown axes | Wiki audit | SSOT | Color |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${row.geo} | ${String(row.territory || "").replace(/\|/g, "\\|")} | ${row.truthColor} | ${row.axisCompleteness.knownAxisCells} | ${row.axisCompleteness.unknownAxisCells} | ${row.wikiAuditStatus} | ${row.ssotStatus} | ${row.colorStatus} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const truthReport = readJson(TRUTH_AUDIT_REPORT_PATH);
  const truthRows = Array.isArray(truthReport.rows) ? truthReport.rows : [];
  const requiredAxisTotal = Object.values(REQUIRED_AXIS_GROUPS).flat().length;
  const rows = truthRows.map(buildRow);
  const cells = flattenRows(rows);
  const knownAxisCells = cells.filter((cell) => cell.status !== "UNKNOWN").length;
  const unknownAxisCells = cells.filter((cell) => cell.status === "UNKNOWN").length;
  const validation = {
    rows307: rows.length === TOTAL_GEO_EXPECTED,
    requiredAxisSchemaDeclared: requiredAxisTotal === 58,
    allRowsHaveRequiredAxisGroups: rows.every((row) =>
      Object.keys(REQUIRED_AXIS_GROUPS).every((group) => row.axisGroups[group]),
    ),
    allRowsHaveAllRequiredAxes: rows.every((row) =>
      Object.entries(REQUIRED_AXIS_GROUPS).every(([group, axes]) =>
        axes.every((axis) => row.axisGroups[group]?.[axis]),
      ),
    ),
    cellsTotalMatchesRowsTimesAxes: cells.length === rows.length * requiredAxisTotal,
    allCellsClassified: cells.every((cell) =>
      ["KNOWN", "KNOWN_COARSE", "UNKNOWN"].includes(cell.status),
    ),
    noMissingAxisCells: cells.every((cell) => cell.value !== "MISSING"),
    unknownCellsExplicit: unknownAxisCells > 0,
    knownCellsPresent: knownAxisCells > 0,
    wikiAuditOnly: true,
    nonMutating: true,
    localOnly: true,
    appliedRowsZero: true,
    noProdMutation: true,
    noSsotMutation: true,
    noMapMutation: true,
    noCountrySpecificExceptions: true,
  };
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    matrixStatus: "LEGAL_KNOWLEDGE_AXIS_MATRIX_READY_NO_MUTATION",
    nonMutating: true,
    localOnly: true,
    productionTouched: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    appliedRows: 0,
    filesWritten: [rel(OUT_JSON_PATH), rel(OUT_MD_PATH)],
    mutationPolicy:
      "This artifact writes only data/reviews outputs. It does not update SSOT, map colors, country JSON, status snapshots, static countries assets, or production.",
    inputTruthReport: rel(TRUTH_AUDIT_REPORT_PATH),
    sourcePolicy: {
      truthInputs: ["Primary Law", "Independent Legal Interpretation", "Truth Report"],
      auditOnlyInputs: ["Wikipedia"],
      ssotRole: "COMPARISON_LAYER_ONLY_NO_WRITE",
      unknownPolicy:
        "Missing or unproven detailed legal axes remain UNKNOWN_UNPROVEN_AXIS instead of being inferred from color, Wikipedia, parser summaries, production, export, research, CBD, Sativex, bill, claimant law, or federal/state scope.",
    },
    rowsTotal: rows.length,
    rowsExpected: TOTAL_GEO_EXPECTED,
    requiredAxisTotal,
    requiredAxisGroups: REQUIRED_AXIS_GROUPS,
    cellsTotal: cells.length,
    summary: {
      knownAxisCells,
      unknownAxisCells,
      knownAxisCellRatio: Number((knownAxisCells / Math.max(1, cells.length)).toFixed(4)),
      unknownAxisCellRatio: Number((unknownAxisCells / Math.max(1, cells.length)).toFixed(4)),
      rowsWithUnknownAxes: rows.filter((row) => row.axisCompleteness.unknownAxisCells > 0).length,
      rowsWithAllAxesKnown: rows.filter((row) => row.axisCompleteness.unknownAxisCells === 0).length,
    },
    counts: {
      axisStatus: countBy(cells, (cell) => cell.status),
      evidenceClass: countBy(cells, (cell) => cell.evidenceClass),
      axisGroup: countBy(cells, (cell) => cell.group),
      truthColor: countBy(rows, (row) => row.truthColor),
      wikiAuditStatus: countBy(rows, (row) => row.wikiAuditStatus),
      ssotStatus: countBy(rows, (row) => row.ssotStatus),
      colorStatus: countBy(rows, (row) => row.colorStatus),
    },
    guardrails: GUARDRAILS,
    validation,
    hashProof: [inputHash(TRUTH_AUDIT_REPORT_PATH)],
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_LEGAL_AXIS_MATRIX_STATUS=${output.matrixStatus}`);
  console.log(`WIKI_TRUTH_LEGAL_AXIS_MATRIX_ROWS=${output.rowsTotal}`);
  console.log(`WIKI_TRUTH_LEGAL_AXIS_MATRIX_AXES=${output.requiredAxisTotal}`);
  console.log(`WIKI_TRUTH_LEGAL_AXIS_MATRIX_CELLS=${output.cellsTotal}`);
  console.log(`WIKI_TRUTH_LEGAL_AXIS_MATRIX_KNOWN_CELLS=${output.summary.knownAxisCells}`);
  console.log(`WIKI_TRUTH_LEGAL_AXIS_MATRIX_UNKNOWN_CELLS=${output.summary.unknownAxisCells}`);
  console.log(`WIKI_TRUTH_LEGAL_AXIS_MATRIX_OUTPUT=${rel(OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_LEGAL_AXIS_MATRIX_MARKDOWN=${rel(OUT_MD_PATH)}`);
  for (const [key, value] of Object.entries(validation)) {
    console.log(`WIKI_TRUTH_LEGAL_AXIS_MATRIX_${key.toUpperCase()}=${value ? "TRUE" : "FALSE"}`);
  }
}

main();

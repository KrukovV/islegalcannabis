#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const TOTAL_GEO_EXPECTED = 307;
const TRUTH_REPORT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-truth-audit-report.json");
const OUT_JSON_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-three-color-overlay.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-three-color-overlay.md");

const ALLOWED_TRUTH_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
const PALETTE = Object.freeze({
  GREEN: "#2fb344",
  YELLOW: "#f5c542",
  RED: "#e5484d",
  UNKNOWN: null,
});
const PAINT_TOKENS = Object.freeze({
  GREEN: "GREEN",
  YELLOW: "YELLOW",
  RED: "RED",
  UNKNOWN: "UNCOLORED",
});
const THREE_PAINT_COLORS = new Set([PALETTE.GREEN, PALETTE.YELLOW, PALETTE.RED]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeColor(value) {
  return String(value || "UNKNOWN").trim().toUpperCase();
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "MISSING";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function truthField(reportRow) {
  return reportRow?.truth || reportRow?.diagnostics?.color?.truth || {};
}

function rawTruthColor(reportRow) {
  const truth = truthField(reportRow);
  return normalizeColor(
    truth.color ||
      reportRow?.truthColor ||
      reportRow?.officialTruthColor ||
      reportRow?.proposedTruthColor ||
      "UNKNOWN",
  );
}

function truthRuleId(reportRow) {
  const truth = truthField(reportRow);
  return truth.ruleId || reportRow?.truthRuleId || reportRow?.diagnostics?.color?.truthRuleId || "MISSING";
}

function truthReason(reportRow) {
  const truth = truthField(reportRow);
  return compact(
    truth.reason ||
      reportRow?.diagnostics?.color?.truthReason ||
      reportRow?.differenceDescription ||
      reportRow?.reviewNotes ||
      "Truth report did not expose a separate reason string.",
  );
}

function legalBasisClass(truthColor, ruleId) {
  const rule = String(ruleId || "").toUpperCase();
  if (truthColor === "GREEN" && /RECREATIONAL|ADULT/.test(rule)) return "ADULT_USE";
  if (truthColor === "GREEN" && /PATIENT|MEDICAL/.test(rule)) return "OPERATIONAL_PATIENT_ACCESS";
  if (truthColor === "GREEN") return "GREEN_TRUTH_RULE";
  if (truthColor === "YELLOW" && /DECRIM/.test(rule)) return "DECRIMINALIZATION_ONLY";
  if (truthColor === "YELLOW" && /LIFECYCLE|BILL|PROPOSAL|NOT_COMMENCED|ENACTED/.test(rule)) return "ENACTED_OR_PROPOSED_NOT_OPERATIONAL";
  if (truthColor === "YELLOW" && /PARTIAL|LIMITED|PHARMA|CBD|SATIVEX|RESEARCH|PRODUCTION|EXPORT|CULTIVATION|PERMIT|COMPASSIONATE/.test(rule)) return "LIMITED_NON_PATIENT_ACCESS_OR_SPECIAL_MODE";
  if (truthColor === "YELLOW") return "YELLOW_LIMITED_TRUTH_RULE";
  if (truthColor === "RED") return "NO_ADULT_USE_OR_PATIENT_ACCESS";
  if (truthColor === "UNKNOWN") return "UNCOLORED_SCOPE_OR_APPLICABLE_LAW_UNDETERMINED";
  return "INVALID_TRUTH_COLOR";
}

function overlayRow(reportRow, index) {
  const truthColor = rawTruthColor(reportRow);
  const allowedTruthColor = ALLOWED_TRUTH_COLORS.has(truthColor);
  const paletteColor = allowedTruthColor ? PALETTE[truthColor] : null;
  const paintToken = allowedTruthColor ? PAINT_TOKENS[truthColor] : "UNCOLORED_INVALID_TRUTH_COLOR";
  const ruleId = truthRuleId(reportRow);
  return {
    index: index + 1,
    geo: reportRow.geo,
    territory: reportRow.territory,
    truthColor,
    paintToken,
    paintColor: paletteColor,
    colorMode: truthColor === "UNKNOWN" || !allowedTruthColor ? "UNCOLORED" : "PAINTED",
    legalBasisClass: legalBasisClass(truthColor, ruleId),
    truthRuleId: ruleId,
    truthReason: truthReason(reportRow),
    truthSourceLayer: "PRIMARY_LAW_LEGAL_INTERPRETATION_TRUTH_REPORT",
    wikipediaRole: "AUDIT_ONLY_NOT_COLOR_INPUT",
    ssotRole: "COMPARISON_TARGET_NOT_COLOR_AUTHORITY",
    deterministicFunction: "truthFirstThreeColorOverlay",
    mutationDisposition: "NO_MUTATION_DRY_OVERLAY_ONLY",
  };
}

function buildValidation(report, rows) {
  const truthColorCounts = countBy(rows, (row) => row.truthColor);
  const paintTokenCounts = countBy(rows, (row) => row.paintToken);
  const colorCountTotal = Object.values(truthColorCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  const paintCountTotal = Object.values(paintTokenCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  const paintColorsUsed = [...new Set(rows.map((row) => row.paintColor).filter(Boolean))].sort();
  const reportColors = Array.isArray(report.rows) ? report.rows.map(rawTruthColor) : [];

  return {
    rowsTotal307: rows.length === TOTAL_GEO_EXPECTED,
    reportRowsTotal307: Number(report.rowsTotal || report.rows?.length || 0) === TOTAL_GEO_EXPECTED,
    rowsMatchTruthReport: rows.every((row, index) => row.geo === report.rows[index]?.geo && row.truthColor === reportColors[index]),
    allowedTruthColorsOnly: rows.every((row) => ALLOWED_TRUTH_COLORS.has(row.truthColor)),
    allowedPaintPaletteOnly: rows.every((row) => row.paintColor === null || THREE_PAINT_COLORS.has(row.paintColor)),
    paletteHasOnlyThreePaintColors: paintColorsUsed.length <= 3 && paintColorsUsed.every((color) => THREE_PAINT_COLORS.has(color)),
    unknownRowsUncolored: rows.every((row) => row.truthColor !== "UNKNOWN" || (row.paintColor === null && row.paintToken === "UNCOLORED" && row.colorMode === "UNCOLORED")),
    nonUnknownRowsPainted: rows.every((row) => row.truthColor === "UNKNOWN" || !ALLOWED_TRUTH_COLORS.has(row.truthColor) || (row.paintColor !== null && row.colorMode === "PAINTED")),
    noWikipediaTruthSource: rows.every((row) => row.wikipediaRole === "AUDIT_ONLY_NOT_COLOR_INPUT" && !/WIKIPEDIA/.test(row.truthSourceLayer)),
    deterministicFromTruthReport: rows.every((row) => row.deterministicFunction === "truthFirstThreeColorOverlay"),
    noMutation: rows.every((row) => row.mutationDisposition === "NO_MUTATION_DRY_OVERLAY_ONLY"),
    colorCountsAddUp: colorCountTotal === rows.length,
    paintCountsAddUp: paintCountTotal === rows.length,
    appliedRowsZero: true,
  };
}

function mdCell(value, limit = 180) {
  const text = compact(value);
  const trimmed = text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function mdCounts(counts) {
  return Object.entries(counts || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- \`${key}\`: ${value}`)
    .join("\n");
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Three-Color Overlay");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Overlay status: ${output.overlayStatus}`);
  lines.push(`Rows: ${output.rowsTotal}/${output.rowsExpected}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Color Counts");
  lines.push("");
  lines.push(mdCounts(output.counts.truthColor));
  lines.push("");
  lines.push("## Paint Tokens");
  lines.push("");
  lines.push(mdCounts(output.counts.paintToken));
  lines.push("");
  lines.push("## Palette");
  lines.push("");
  lines.push("- `GREEN`: `#2fb344`");
  lines.push("- `YELLOW`: `#f5c542`");
  lines.push("- `RED`: `#e5484d`");
  lines.push("- `UNKNOWN`: uncolored / no paint");
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  lines.push(mdCounts(output.validation));
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| GEO | Territory | Truth color | Paint token | Paint color | Basis | Rule | Mode |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      [
        row.geo,
        row.territory,
        row.truthColor,
        row.paintToken,
        row.paintColor || "UNCOLORED",
        row.legalBasisClass,
        row.truthRuleId,
        row.colorMode,
      ]
        .map((value) => mdCell(value))
        .join(" | ")
        .replace(/^/, "| ") + " |",
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const report = readJson(TRUTH_REPORT_PATH);
  if (!Array.isArray(report.rows)) {
    throw new Error("Truth report rows are missing.");
  }
  if (report.rows.length !== TOTAL_GEO_EXPECTED) {
    throw new Error(`Expected ${TOTAL_GEO_EXPECTED} truth report rows, got ${report.rows.length}`);
  }

  const rows = report.rows.map(overlayRow);
  const validation = buildValidation(report, rows);
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    overlayStatus: "THREE_COLOR_OVERLAY_READY_NO_MUTATION",
    nonMutating: true,
    localOnly: true,
    productionTouched: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    appliedRows: 0,
    rowsTotal: rows.length,
    rowsExpected: TOTAL_GEO_EXPECTED,
    inputTruthReport: path.relative(ROOT, TRUTH_REPORT_PATH),
    sourcePolicy: {
      truthInputs: ["Primary Law", "Independent Legal Interpretation"],
      comparisonInputs: ["SSOT"],
      auditOnlyInputs: ["Wikipedia"],
      wikipediaAffectsColor: false,
      colorAuthority: "Truth-first deterministic legal model",
    },
    palette: PALETTE,
    allowedTruthColors: [...ALLOWED_TRUTH_COLORS],
    allowedPaintColors: [...THREE_PAINT_COLORS],
    counts: {
      truthColor: countBy(rows, (row) => row.truthColor),
      paintToken: countBy(rows, (row) => row.paintToken),
      colorMode: countBy(rows, (row) => row.colorMode),
      legalBasisClass: countBy(rows, (row) => row.legalBasisClass),
    },
    validation,
    hashProof: [
      {
        artifact: path.relative(ROOT, TRUTH_REPORT_PATH),
        sha256: fileSha256(TRUTH_REPORT_PATH),
        role: "truth-report-input",
      },
    ],
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_307_THREE_COLOR_OVERLAY_ROWS=${output.rowsTotal}`);
  console.log(`WIKI_TRUTH_307_THREE_COLOR_OVERLAY_STATUS=${output.overlayStatus}`);
  console.log(`WIKI_TRUTH_307_THREE_COLOR_OVERLAY_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`WIKI_TRUTH_307_THREE_COLOR_OVERLAY_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_307_THREE_COLOR_OVERLAY_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
  console.log(`WIKI_TRUTH_307_THREE_COLOR_OVERLAY_COUNTS=${JSON.stringify(output.counts.truthColor)}`);
}

main();

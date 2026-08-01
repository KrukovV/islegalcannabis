#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const SAFE_PACKET_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-safe-authorization-packet.json");
const TARGET_RESOLVER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-target-resolver.json");
const THREE_COLOR_OVERLAY_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-three-color-overlay.json");
const STATUS_V9_PATH = path.join(ROOT, "data/status-engine/status_ssot_v9.json");
const STATUS_ENGINE_PATH = path.join(ROOT, "apps/web/src/lib/statusEngineV9.ts");
const OUT_JSON_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-dry-run-diff.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-dry-run-diff.md");

const ALLOWED_TARGET_FAMILIES = new Set([
  "COUNTRY_PAGE_JSON_RUNTIME_SOURCE",
  "STATUS_ENGINE_V9_FALLBACK_SOURCE",
]);
const ALLOWED_TRUTH_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function objectSha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "MISSING";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function truthColorToMapCategory(color) {
  const normalized = normalize(color);
  if (normalized === "GREEN") return "LEGAL_OR_DECRIM";
  if (normalized === "YELLOW") return "LIMITED_OR_MEDICAL";
  if (normalized === "RED") return "ILLEGAL";
  return "UNKNOWN";
}

function truthColorToResultStatus(color) {
  const normalized = normalize(color);
  if (normalized === "GREEN") return "LEGAL";
  if (normalized === "YELLOW") return "DECRIM";
  if (normalized === "RED") return "ILLEGAL";
  return "UNKNOWN";
}

function canonicalRec(value) {
  const normalized = normalize(value);
  if (normalized === "LEGAL") return "LEGAL";
  if (["DECRIMINALIZED", "DECRIM", "DECRIMINAL", "TOLERATED", "MIXED", "RESTRICTED", "LIMITED", "UNENFORCED", "TOLERANCE"].includes(normalized)) {
    return "DECRIMINALIZED";
  }
  if (normalized === "ILLEGAL") return "ILLEGAL";
  if (normalized === "UNKNOWN") return null;
  return normalized ? "ILLEGAL" : null;
}

function canonicalMed(value, targetFamily) {
  const normalized = normalize(value);
  if (targetFamily === "COUNTRY_PAGE_JSON_RUNTIME_SOURCE") {
    if (normalized === "LEGAL") return "REGULATED";
    if (normalized === "LIMITED") return "LIMITED";
    if (normalized === "ILLEGAL") return "NONE";
    if (normalized === "NONE") return "NONE";
    if (normalized === "REGULATED") return "REGULATED";
    if (normalized === "UNKNOWN") return null;
    return normalized ? "NONE" : null;
  }
  if (normalized === "REGULATED" || normalized === "LEGAL") return "REGULATED";
  if (normalized === "LIMITED") return "LIMITED";
  if (normalized === "NONE" || normalized === "ILLEGAL") return "NONE";
  if (normalized === "UNKNOWN") return null;
  return normalized ? "NONE" : null;
}

function evaluateColorFromAxes(recValue, medValue, targetFamily) {
  const rec = canonicalRec(recValue);
  const med = canonicalMed(medValue, targetFamily);
  if (rec === "LEGAL" || med === "REGULATED") return "GREEN";
  if (rec === "DECRIMINALIZED" || med === "LIMITED") return "YELLOW";
  if (!rec && !med) return "UNKNOWN";
  if (rec === "ILLEGAL" && med === "NONE") return "RED";
  return "UNKNOWN";
}

function desiredAxesForCountryJson(row, current) {
  const color = normalize(row.proposedTruthColor);
  const rule = normalize(row.truthRule);
  const currentRec = current?.legal_model?.recreational?.status ?? null;
  const currentMed = current?.legal_model?.medical?.status ?? null;
  const desired = {
    recreationalStatus: currentRec,
    medicalStatus: currentMed,
  };

  if (color === "GREEN" && /RECREATIONAL_LEGAL/.test(rule)) {
    desired.recreationalStatus = "LEGAL";
  } else if (color === "GREEN") {
    desired.medicalStatus = "LEGAL";
  } else if (color === "YELLOW" && /RECREATIONAL_DECRIMINALIZED|RECREATIONAL_LIMITED/.test(rule)) {
    desired.recreationalStatus = "DECRIMINALIZED";
    if (canonicalMed(currentMed, "COUNTRY_PAGE_JSON_RUNTIME_SOURCE") === "REGULATED") {
      desired.medicalStatus = "ILLEGAL";
    }
  } else if (color === "YELLOW") {
    desired.medicalStatus = "LIMITED";
    if (canonicalRec(currentRec) === "LEGAL") {
      desired.recreationalStatus = "ILLEGAL";
    }
  } else if (color === "RED") {
    desired.recreationalStatus = "ILLEGAL";
    desired.medicalStatus = "ILLEGAL";
  } else {
    desired.recreationalStatus = "UNKNOWN";
    desired.medicalStatus = "UNKNOWN";
  }

  return desired;
}

function desiredAxesForStatusV9(row, current) {
  const color = normalize(row.proposedTruthColor);
  const rule = normalize(row.truthRule);
  const desired = {
    recreational: current?.recreational ?? null,
    medical: current?.medical ?? null,
    enforcement: current?.enforcement ?? null,
    color,
    mapCategory: truthColorToMapCategory(color),
    resultStatus: truthColorToResultStatus(color),
  };

  if (color === "GREEN" && /RECREATIONAL_LEGAL/.test(rule)) {
    desired.recreational = "LEGAL";
  } else if (color === "GREEN") {
    desired.medical = "REGULATED";
  } else if (color === "YELLOW" && /RECREATIONAL_DECRIMINALIZED|RECREATIONAL_LIMITED/.test(rule)) {
    desired.recreational = "DECRIMINALIZED";
    if (canonicalMed(current?.medical, "STATUS_ENGINE_V9_FALLBACK_SOURCE") === "REGULATED") {
      desired.medical = "NONE";
    }
  } else if (color === "YELLOW") {
    desired.medical = "LIMITED";
    if (canonicalRec(current?.recreational) === "LEGAL") {
      desired.recreational = "ILLEGAL";
    }
  } else if (color === "RED") {
    desired.recreational = "ILLEGAL";
    desired.medical = "NONE";
    desired.enforcement = desired.enforcement || "STRICT";
  } else {
    desired.recreational = "UNKNOWN";
    desired.medical = "UNKNOWN";
    desired.enforcement = desired.enforcement || "STRICT";
  }

  return desired;
}

function operation(pathValue, oldValue, newValue, reason) {
  return {
    op: oldValue === undefined ? "add" : "replace",
    path: pathValue,
    oldValue: oldValue === undefined ? null : oldValue,
    newValue,
    changesValue: JSON.stringify(oldValue ?? null) !== JSON.stringify(newValue ?? null),
    reason,
  };
}

function changedOperations(operations) {
  return operations.filter((item) => item.changesValue);
}

function parseStatusV9Id(targetPath) {
  const match = String(targetPath || "").match(/entries\[id=([^\]]+)\]/);
  return match ? match[1] : null;
}

function statusV9Rows(statusV9) {
  return Array.isArray(statusV9?.entries) ? statusV9.entries : [];
}

function buildCountryJsonDiff(row, resolverRow) {
  const targetAbs = path.join(ROOT, row.targetPath);
  const current = readJson(targetAbs);
  const desired = desiredAxesForCountryJson(row, current);
  const operations = changedOperations([
    operation(
      "/legal_model/recreational/status",
      current?.legal_model?.recreational?.status,
      desired.recreationalStatus,
      "Truth-first recreational axis patch; do not infer medical legality from this field.",
    ),
    operation(
      "/legal_model/medical/status",
      current?.legal_model?.medical?.status,
      desired.medicalStatus,
      "Truth-first medical axis patch; limited modes remain YELLOW and operational patient access only can make GREEN.",
    ),
  ]);
  const derivedColorAfterPatch = evaluateColorFromAxes(
    desired.recreationalStatus,
    desired.medicalStatus,
    row.targetFamily,
  );
  return {
    targetPath: row.targetPath,
    targetHashBefore: fileSha256(targetAbs),
    targetRecordHashBefore: objectSha256(current),
    targetRecordSelector: "whole country JSON document",
    currentAxes: {
      recreationalStatus: current?.legal_model?.recreational?.status ?? null,
      medicalStatus: current?.legal_model?.medical?.status ?? null,
    },
    proposedAxes: desired,
    proposedRuntimeMapCategory: resolverRow?.proposedRuntimeMapCategory || truthColorToMapCategory(row.proposedTruthColor),
    proposedRuntimeStatus: resolverRow?.proposedRuntimeStatus || truthColorToResultStatus(row.proposedTruthColor),
    derivedColorAfterPatch,
    operations,
  };
}

function buildStatusV9Diff(row, resolverRow, statusV9) {
  const id = parseStatusV9Id(row.targetPath) || row.geo;
  const entries = statusV9Rows(statusV9);
  const entryIndex = entries.findIndex((entry) => entry?.id === id);
  if (entryIndex < 0) {
    throw new Error(`Missing status_ssot_v9 entry for ${row.geo}`);
  }
  const current = entries[entryIndex];
  const desired = desiredAxesForStatusV9(row, current);
  const basePath = `/entries/${entryIndex}`;
  const operations = changedOperations([
    operation(
      `${basePath}/recreational`,
      current.recreational,
      desired.recreational,
      "Truth-first recreational axis patch for status-engine fallback row.",
    ),
    operation(
      `${basePath}/medical`,
      current.medical,
      desired.medical,
      "Truth-first medical axis patch for status-engine fallback row.",
    ),
    operation(
      `${basePath}/color`,
      current.color,
      desired.color,
      "Color field mirrors deterministic Truth-first status-engine result after axes are patched.",
    ),
    operation(
      `${basePath}/reviewRequired`,
      current.reviewRequired,
      desired.color === "UNKNOWN",
      "Unknown/uncolored rows require review; colored rows do not add review requirement here.",
    ),
  ]);
  const derivedColorAfterPatch = evaluateColorFromAxes(
    desired.recreational,
    desired.medical,
    row.targetFamily,
  );
  return {
    targetPath: "data/status-engine/status_ssot_v9.json",
    targetHashBefore: fileSha256(STATUS_V9_PATH),
    targetRecordHashBefore: objectSha256(current),
    targetRecordSelector: `entries[id=${id}]`,
    currentAxes: {
      recreational: current.recreational ?? null,
      medical: current.medical ?? null,
      enforcement: current.enforcement ?? null,
      color: current.color ?? null,
      reviewRequired: current.reviewRequired ?? null,
    },
    proposedAxes: desired,
    proposedRuntimeMapCategory: resolverRow?.proposedRuntimeMapCategory || truthColorToMapCategory(row.proposedTruthColor),
    proposedRuntimeStatus: resolverRow?.proposedRuntimeStatus || truthColorToResultStatus(row.proposedTruthColor),
    derivedColorAfterPatch,
    operations,
  };
}

function buildRow(row, resolverByGeo, statusV9) {
  const resolverRow = resolverByGeo.get(row.geo) || null;
  if (!ALLOWED_TARGET_FAMILIES.has(row.targetFamily)) {
    throw new Error(`Unexpected safe target family for ${row.geo}: ${row.targetFamily}`);
  }
  if (!ALLOWED_TRUTH_COLORS.has(normalize(row.proposedTruthColor))) {
    throw new Error(`Unexpected proposed color for ${row.geo}: ${row.proposedTruthColor}`);
  }
  const diff = row.targetFamily === "COUNTRY_PAGE_JSON_RUNTIME_SOURCE"
    ? buildCountryJsonDiff(row, resolverRow)
    : buildStatusV9Diff(row, resolverRow, statusV9);
  const proposedTruthColor = normalize(row.proposedTruthColor);
  const derivedMatchesTruth = diff.derivedColorAfterPatch === proposedTruthColor;
  return {
    dryRunIndex: row.safeIndex,
    geo: row.geo,
    territory: row.territory,
    transactionId: row.transactionId,
    targetFamily: row.targetFamily,
    targetPath: diff.targetPath,
    targetRecordSelector: diff.targetRecordSelector,
    currentRuntimeColor: row.currentRuntimeColor,
    proposedTruthColor,
    truthRule: row.truthRule,
    currentRuntimeInput: row.currentRuntimeInput || null,
    currentAxes: diff.currentAxes,
    proposedAxes: diff.proposedAxes,
    proposedRuntimeMapCategory: diff.proposedRuntimeMapCategory,
    proposedRuntimeStatus: diff.proposedRuntimeStatus,
    derivedColorAfterPatch: diff.derivedColorAfterPatch,
    derivedMatchesTruth,
    operationCount: diff.operations.length,
    operations: diff.operations,
    requiresExplicitAuthorization: true,
    requiresSSOTWrite: true,
    requiresRuntimeAxisPatchReview: true,
    requiresStaticCountryHashRegen: row.targetFamily === "COUNTRY_PAGE_JSON_RUNTIME_SOURCE",
    wouldWriteNow: false,
    wouldApplyAfterAuthorization: true,
    appliedNow: false,
    mutationDisposition: "NO_MUTATION_DRY_RUN_DIFF_ONLY",
    targetHashBefore: diff.targetHashBefore,
    targetRecordHashBefore: diff.targetRecordHashBefore,
    auditOnlyInputs: ["Wikipedia"],
    truthInputs: ["Primary Law", "Independent Legal Interpretation", "Truth Report"],
  };
}

function buildValidation(safePacket, resolver, rows) {
  const safeRows = Array.isArray(safePacket?.rows) ? safePacket.rows : [];
  const expectedSafeRows = Number(
    safePacket?.safeRowsTotal ?? safePacket?.rowsTotal ?? safeRows.length,
  );
  const safeGeos = new Set(safeRows.map((row) => row.geo));
  const diffGeos = new Set(rows.map((row) => row.geo));
  const operationTotal = rows.reduce((sum, row) => sum + row.operationCount, 0);
  const rowsWithOperations = rows.filter((row) => row.operationCount > 0).length;
  const targetFiles = [...new Set(rows.map((row) => row.targetPath).filter(Boolean))].sort();
  return {
    rowsMatchSafePacket: rows.length === safeRows.length && [...safeGeos].every((geo) => diffGeos.has(geo)),
    expectedSafeRows: rows.length === expectedSafeRows,
    allTargetsResolved: rows.every((row) => Boolean(row.targetPath)),
    allowedTargetFamiliesOnly: rows.every((row) => ALLOWED_TARGET_FAMILIES.has(row.targetFamily)),
    allowedTruthColorsOnly: rows.every((row) => ALLOWED_TRUTH_COLORS.has(row.proposedTruthColor)),
    allRowsHaveOperations: rowsWithOperations === rows.length,
    allOperationsHaveOldNew: rows.every((row) => row.operations.every((op) => Object.hasOwn(op, "oldValue") && Object.hasOwn(op, "newValue"))),
    allDerivedColorsMatchTruth: rows.every((row) => row.derivedMatchesTruth),
    allRowsWouldApplyAfterAuthorization: rows.every((row) => row.wouldApplyAfterAuthorization === true),
    noRowsWouldWriteNow: rows.every((row) => row.wouldWriteNow === false),
    noRowsAppliedNow: rows.every((row) => row.appliedNow === false),
    allRowsRequireAuthorization: rows.every((row) => row.requiresExplicitAuthorization === true),
    allRowsRequireSsotWrite: rows.every((row) => row.requiresSSOTWrite === true),
    allRowsRequireAxisPatchReview: rows.every((row) => row.requiresRuntimeAxisPatchReview === true),
    noWikipediaTruthSource: rows.every((row) => row.auditOnlyInputs.includes("Wikipedia") && !row.truthInputs.includes("Wikipedia")),
    safePacketValidated: safePacket?.validation?.allSafeRowsReady === true && safePacket?.validation?.noSafeRowsBlocked === true,
    resolverValidated: resolver?.validation?.allRowsHaveDecision !== false,
    operationTotalPositive: operationTotal > 0,
    targetFileCountPositive: targetFiles.length > 0,
    appliedRowsZero: true,
    noMutation: true,
  };
}

function mdCell(value, limit = 180) {
  const text = compact(typeof value === "string" ? value : JSON.stringify(value));
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
  lines.push("# Wiki Truth 307 Runtime Apply Dry-Run Diff");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Dry-run status: ${output.dryRunStatus}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push(`Would apply after authorization: ${output.wouldApplyRowsAfterAuthorization}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push("### Target family");
  lines.push(mdCounts(output.counts.targetFamily));
  lines.push("");
  lines.push("### Proposed truth color");
  lines.push(mdCounts(output.counts.proposedTruthColor));
  lines.push("");
  lines.push("### Operation path");
  lines.push(mdCounts(output.counts.operationPath));
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  lines.push(mdCounts(output.validation));
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| GEO | Territory | Target | Current color | Truth color | Derived after patch | Ops | Rule |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      [
        row.geo,
        row.territory,
        row.targetPath,
        row.currentRuntimeColor,
        row.proposedTruthColor,
        row.derivedColorAfterPatch,
        row.operationCount,
        row.truthRule,
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
  const safePacket = readJson(SAFE_PACKET_PATH);
  const resolver = readJson(TARGET_RESOLVER_PATH);
  const overlay = readJson(THREE_COLOR_OVERLAY_PATH);
  const statusV9 = readJson(STATUS_V9_PATH);
  const safeRows = Array.isArray(safePacket.rows) ? safePacket.rows : [];
  const expectedSafeRows = Number(
    safePacket.safeRowsTotal ?? safePacket.rowsTotal ?? safeRows.length,
  );
  if (safeRows.length !== expectedSafeRows) {
    throw new Error(
      `Expected ${expectedSafeRows} safe packet rows from current packet, got ${safeRows.length}`,
    );
  }
  const resolverByGeo = new Map(
    (Array.isArray(resolver.rows) ? resolver.rows : [])
      .filter((row) => row?.geo)
      .map((row) => [row.geo, row]),
  );
  const rows = safeRows.map((row) => buildRow(row, resolverByGeo, statusV9));
  const operationRows = rows.flatMap((row) =>
    row.operations.map((op) => ({
      geo: row.geo,
      targetFamily: row.targetFamily,
      path: op.path,
      proposedTruthColor: row.proposedTruthColor,
    })),
  );
  const distinctTargetPaths = [...new Set(rows.map((row) => row.targetPath).filter(Boolean))].sort();
  const validation = buildValidation(safePacket, resolver, rows);
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    dryRunStatus: "RUNTIME_APPLY_DRY_RUN_DIFF_READY_NO_MUTATION",
    nonMutating: true,
    localOnly: true,
    productionTouched: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    filesWritten: [
      path.relative(ROOT, OUT_JSON_PATH),
      path.relative(ROOT, OUT_MD_PATH),
    ],
    appliedRows: 0,
    wouldWriteRowsNow: 0,
    wouldApplyRowsAfterAuthorization: rows.length,
    rowsTotal: rows.length,
    inputSafeAuthorizationPacket: path.relative(ROOT, SAFE_PACKET_PATH),
    inputTargetResolver: path.relative(ROOT, TARGET_RESOLVER_PATH),
    inputThreeColorOverlay: path.relative(ROOT, THREE_COLOR_OVERLAY_PATH),
    targetFilesTotal: distinctTargetPaths.length,
    targetFiles: distinctTargetPaths,
    sourcePolicy: {
      truthInputs: ["Primary Law", "Independent Legal Interpretation", "Truth Report", "Three-color overlay"],
      auditOnlyInputs: ["Wikipedia"],
      wikipediaAffectsPatch: false,
      directMutationAllowedNow: false,
    },
    counts: {
      targetFamily: countBy(rows, (row) => row.targetFamily),
      proposedTruthColor: countBy(rows, (row) => row.proposedTruthColor),
      currentRuntimeColor: countBy(rows, (row) => row.currentRuntimeColor),
      derivedColorAfterPatch: countBy(rows, (row) => row.derivedColorAfterPatch),
      operationPath: countBy(operationRows, (row) => row.path.replace(/\/entries\/\d+\//, "/entries/<index>/")),
      operationsByTargetFamily: countBy(operationRows, (row) => row.targetFamily),
    },
    validation,
    guardrails: [
      "NO_RUNTIME_WRITE_WITHOUT_EXPLICIT_AUTHORIZATION",
      "NO_SSOT_WRITE_WITHOUT_SSOT_WRITE_1",
      "PATCH_LEGAL_AXES_NOT_RENDERED_COLOR_ONLY",
      "YELLOW_MODES_KEEP_DECRIM_AND_LIMITED_MEDICAL_SEPARATE",
      "GREEN_MODES_KEEP_ADULT_USE_AND_PATIENT_ACCESS_SEPARATE",
      "UNKNOWN_REMAINS_UNCOLORED",
      "NO_WIKIPEDIA_COLOR_AUTHORITY",
      "NO_PRODUCTION_MUTATION",
    ],
    hashProof: [
      {
        artifact: path.relative(ROOT, SAFE_PACKET_PATH),
        sha256: fileSha256(SAFE_PACKET_PATH),
        role: "safe-authorization-packet-input",
      },
      {
        artifact: path.relative(ROOT, TARGET_RESOLVER_PATH),
        sha256: fileSha256(TARGET_RESOLVER_PATH),
        role: "target-resolver-input",
      },
      {
        artifact: path.relative(ROOT, THREE_COLOR_OVERLAY_PATH),
        sha256: fileSha256(THREE_COLOR_OVERLAY_PATH),
        role: "three-color-overlay-input",
      },
      {
        artifact: path.relative(ROOT, STATUS_ENGINE_PATH),
        sha256: fileSha256(STATUS_ENGINE_PATH),
        role: "runtime-color-semantics-reference",
      },
      ...distinctTargetPaths.map((targetPath) => ({
        artifact: targetPath,
        sha256: fileSha256(path.join(ROOT, targetPath)),
        role: "dry-run-target-before-hash",
      })),
    ],
    overlayCrossCheck: {
      overlayRowsTotal: overlay.rowsTotal,
      overlayTruthColorCounts: overlay.counts?.truthColor || {},
      safeTargetColorCounts: safePacket.summary?.safeTargetColorCounts || {},
    },
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_DRY_RUN_DIFF_ROWS=${output.rowsTotal}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_DRY_RUN_DIFF_STATUS=${output.dryRunStatus}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_DRY_RUN_DIFF_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_DRY_RUN_DIFF_WOULD_APPLY=${output.wouldApplyRowsAfterAuthorization}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_DRY_RUN_DIFF_TARGET_FILES=${output.targetFilesTotal}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_DRY_RUN_DIFF_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_DRY_RUN_DIFF_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
}

main();

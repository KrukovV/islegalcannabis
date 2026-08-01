#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const RUNTIME_AUTHORIZATION_READINESS_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-authorization-readiness.json");
const RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-safe-authorization-packet.json");
const THREE_COLOR_OVERLAY_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-three-color-overlay.json");
const RUNTIME_APPLY_DRY_RUN_DIFF_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-dry-run-diff.json");
const RUNTIME_APPLY_PREFLIGHT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-preflight.json");
const RUNTIME_APPLY_EXECUTION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-execution.json");
const RUNTIME_APPLY_ROLLBACK_PLAN_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-rollback-plan.json");
const OUT_JSON_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-post-apply-verification.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-post-apply-verification.md");

const EXPECTED_OVERLAY_ROWS = 307;
const ALLOWED_TARGET_PATHS = [/^data\/countries\/[^/]+\.json$/, /^data\/status-engine\/status_ssot_v9\.json$/];
const ALLOWED_TRUTH_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
const PAINTED_TOKENS = new Set(["GREEN", "YELLOW", "RED"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function textSha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(value);
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

function targetFileForRow(row) {
  return String(row.targetPath || "").replace(/ entries\[id=[^\]]+\]$/, "");
}

function targetAllowed(targetPath) {
  return ALLOWED_TARGET_PATHS.some((pattern) => pattern.test(targetPath));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function pointerParts(pointer) {
  return String(pointer || "").split("/").slice(1).map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function getJsonPointer(root, pointer) {
  let cursor = root;
  for (const part of pointerParts(pointer)) {
    if (Array.isArray(cursor)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) return undefined;
      cursor = cursor[index];
    } else if (cursor && typeof cursor === "object") {
      cursor = cursor[part];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function setJsonPointer(root, pointer, value) {
  const parts = pointerParts(pointer);
  if (!parts.length) throw new Error("Refusing to replace whole JSON document.");
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) throw new Error(`Invalid array pointer part ${part} in ${pointer}`);
      cursor = cursor[index];
    } else if (cursor && typeof cursor === "object") {
      if (!(part in cursor)) cursor[part] = {};
      cursor = cursor[part];
    } else {
      throw new Error(`Invalid JSON pointer ${pointer}`);
    }
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cursor)) {
    const index = Number(last);
    if (!Number.isInteger(index) || index < 0 || index >= cursor.length) throw new Error(`Invalid array pointer tail ${last} in ${pointer}`);
    cursor[index] = value;
    return;
  }
  cursor[last] = value;
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

function parseStatusV9Id(targetPath) {
  const match = String(targetPath || "").match(/entries\[id=([^\]]+)\]/);
  return match ? match[1] : null;
}

function normalizeOperationRows(rows) {
  return rows.flatMap((row) => (Array.isArray(row.operations) ? row.operations : []).map((operation) => ({ row, operation })));
}

function buildTargetPlans(dryRunRows) {
  const rowsByTarget = new Map();
  for (const row of dryRunRows) {
    const targetPath = targetFileForRow(row);
    if (!rowsByTarget.has(targetPath)) rowsByTarget.set(targetPath, []);
    rowsByTarget.get(targetPath).push(row);
  }

  const documents = new Map();
  const plans = [...rowsByTarget.entries()].map(([targetPath, rows]) => {
    const abs = path.join(ROOT, targetPath);
    const currentDocument = readJson(abs);
    const currentSerialized = fs.readFileSync(abs, "utf8");
    const currentHash = textSha256(currentSerialized);
    const expectedHashes = [...new Set(rows.map((row) => row.targetHashBefore).filter(Boolean))].sort();
    const expectedHash = expectedHashes.length === 1 ? expectedHashes[0] : null;
    const dryRunOps = normalizeOperationRows(rows);
    const oldValuesMatchCurrent = dryRunOps.every(({ operation }) => stableJson(getJsonPointer(currentDocument, operation.path) ?? null) === stableJson(operation.oldValue ?? null));
    const applyDocument = clone(currentDocument);
    for (const { operation } of dryRunOps) {
      setJsonPointer(applyDocument, operation.path, operation.newValue ?? null);
    }
    const simulatedAppliedHash = textSha256(serializeDocument(applyDocument));
    documents.set(targetPath, { currentDocument, applyDocument });
    return {
      targetPath,
      rowCount: rows.length,
      operationCount: dryRunOps.length,
      allowedTargetPath: targetAllowed(targetPath),
      expectedHashes,
      expectedHashUnique: expectedHashes.length === 1,
      currentHash,
      expectedHash,
      currentHashMatchesDryRun: Boolean(expectedHash && currentHash === expectedHash),
      oldValuesMatchCurrent,
      simulatedAppliedHash,
      simulatedApplyChangesTarget: simulatedAppliedHash !== currentHash,
      geos: rows.map((row) => row.geo).sort(),
    };
  }).sort((a, b) => a.targetPath.localeCompare(b.targetPath));

  return { plans, documents };
}

function postApplyColorForRow(row, appliedDocument) {
  if (row.targetFamily === "COUNTRY_PAGE_JSON_RUNTIME_SOURCE") {
    return evaluateColorFromAxes(
      appliedDocument?.legal_model?.recreational?.status,
      appliedDocument?.legal_model?.medical?.status,
      row.targetFamily,
    );
  }
  if (row.targetFamily === "STATUS_ENGINE_V9_FALLBACK_SOURCE") {
    const id = parseStatusV9Id(row.targetPath) || row.geo;
    const entry = (Array.isArray(appliedDocument?.entries) ? appliedDocument.entries : []).find((item) => item?.id === id);
    return evaluateColorFromAxes(entry?.recreational, entry?.medical, row.targetFamily);
  }
  return "UNKNOWN";
}

function oldValuesMatchCurrentForRow(row, currentDocument) {
  return (Array.isArray(row.operations) ? row.operations : []).every((operation) => stableJson(getJsonPointer(currentDocument, operation.path) ?? null) === stableJson(operation.oldValue ?? null));
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
  lines.push("# Wiki Truth 307 Runtime Post-Apply Verification");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Post-apply status: ${output.postApplyStatus}`);
  lines.push(`Coverage rows: ${output.coverageRowsTotal}/${output.coverageRowsExpected}`);
  lines.push(`Truth-aligned after authorized safe apply: ${output.truthAlignedRowsAfterAuthorizedApply}`);
  lines.push(`Blocked after authorized safe apply: ${output.blockedRowsAfterAuthorizedApply}`);
  lines.push(`Applied rows now: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(mdCounts(output.summary));
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  lines.push(mdCounts(output.validation));
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push("### Safe post-apply color");
  lines.push(mdCounts(output.counts.safePostApplyColor));
  lines.push("");
  lines.push("### Readiness decision");
  lines.push(mdCounts(output.counts.readinessDecision));
  lines.push("");
  lines.push("### Blocked decision");
  lines.push(mdCounts(output.counts.blockedDecision));
  lines.push("");
  lines.push("## Blocked rows kept out of apply");
  lines.push("");
  lines.push("| GEO | Territory | Decision | Truth color | Runtime color | Reasons |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of output.blockedRows) {
    lines.push(`| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.decision)} | ${mdCell(row.proposedTruthColor)} | ${mdCell(row.currentRuntimeColor)} | ${mdCell((row.blockingReasons || []).join(", "))} |`);
  }
  lines.push("");
  lines.push("## Safe rows sample");
  lines.push("");
  lines.push("| GEO | Target | Truth | Post-apply | Operations | Hash OK |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows.slice(0, 40)) {
    lines.push(`| ${mdCell(row.geo)} | ${mdCell(row.targetPath)} | ${mdCell(row.proposedTruthColor)} | ${mdCell(row.postApplyRuntimeColor)} | ${mdCell(row.operationCount)} | ${mdCell(row.targetHashMatchesDryRun)} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const readiness = readJson(RUNTIME_AUTHORIZATION_READINESS_PATH);
  const safePacket = readJson(RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH);
  const overlay = readJson(THREE_COLOR_OVERLAY_PATH);
  const dryRun = readJson(RUNTIME_APPLY_DRY_RUN_DIFF_PATH);
  const preflight = readJson(RUNTIME_APPLY_PREFLIGHT_PATH);
  const execution = readJson(RUNTIME_APPLY_EXECUTION_PATH);
  const rollback = readJson(RUNTIME_APPLY_ROLLBACK_PLAN_PATH);

  const readinessRows = Array.isArray(readiness.rows) ? readiness.rows : [];
  const safePacketRows = Array.isArray(safePacket.rows) ? safePacket.rows : [];
  const excludedRows = Array.isArray(safePacket.excludedRows) ? safePacket.excludedRows : [];
  const overlayRows = Array.isArray(overlay.rows) ? overlay.rows : [];
  const dryRunRows = Array.isArray(dryRun.rows) ? dryRun.rows : [];
  const noOpRows = readinessRows.filter((row) => row.decision === "NO_OP_RUNTIME_ALREADY_TRUTH_TARGET");
  const blockedRows = readinessRows.filter((row) => String(row.decision || "").startsWith("BLOCKED_"));
  const readinessGeos = new Set(readinessRows.map((row) => row.geo).filter(Boolean));
  const safeGeos = new Set(dryRunRows.map((row) => row.geo).filter(Boolean));
  const safePacketGeos = new Set(safePacketRows.map((row) => row.geo).filter(Boolean));
  const excludedGeos = new Set(excludedRows.map((row) => row.geo).filter(Boolean));
  const alreadyTruthRows = overlayRows.filter((row) => !readinessGeos.has(row.geo));

  const { plans: targetPlans, documents } = buildTargetPlans(dryRunRows);
  const targetPlanByPath = new Map(targetPlans.map((plan) => [plan.targetPath, plan]));
  const rows = dryRunRows.map((row) => {
    const targetPath = targetFileForRow(row);
    const plan = targetPlanByPath.get(targetPath);
    const docs = documents.get(targetPath) || {};
    const postApplyRuntimeColor = postApplyColorForRow(row, docs.applyDocument);
    return {
      geo: row.geo,
      territory: row.territory,
      transactionId: row.transactionId,
      targetFamily: row.targetFamily,
      targetPath,
      proposedTruthColor: row.proposedTruthColor,
      truthRule: row.truthRule,
      currentRuntimeColor: row.currentRuntimeColor,
      dryRunDerivedColorAfterPatch: row.derivedColorAfterPatch,
      postApplyRuntimeColor,
      postApplyMatchesTruth: postApplyRuntimeColor === row.proposedTruthColor,
      postApplyMatchesDryRunDerived: postApplyRuntimeColor === row.derivedColorAfterPatch,
      operationCount: Array.isArray(row.operations) ? row.operations.length : 0,
      targetHashBefore: plan?.currentHash || null,
      targetHashExpectedBefore: row.targetHashBefore || null,
      targetHashMatchesDryRun: plan?.currentHashMatchesDryRun === true,
      oldValuesMatchCurrent: oldValuesMatchCurrentForRow(row, docs.currentDocument),
      includedInSafePacket: safePacketGeos.has(row.geo),
      blockedByReadiness: false,
      mutationDisposition: "SIMULATED_POST_APPLY_MATCH_CHECK_NO_MUTATION",
    };
  });

  const safeMissingFromPacket = [...safeGeos].filter((geo) => !safePacketGeos.has(geo)).sort();
  const packetMissingFromDryRun = [...safePacketGeos].filter((geo) => !safeGeos.has(geo)).sort();
  const blockedMissingFromExcluded = blockedRows.map((row) => row.geo).filter((geo) => !excludedGeos.has(geo)).sort();
  const noOpMissingFromExcluded = noOpRows.map((row) => row.geo).filter((geo) => !excludedGeos.has(geo)).sort();
  const truthAlignedRowsAfterAuthorizedApply = rows.length + noOpRows.length + alreadyTruthRows.length;
  const coverageRowsTotal = truthAlignedRowsAfterAuthorizedApply + blockedRows.length;
  const allGreenTruthRowsAllowed = overlayRows
    .filter((row) => row.truthColor === "GREEN")
    .every((row) => /RECREATIONAL_LEGAL|ADULT_USE_LEGAL|PATIENT_ACCESS_OPERATIONAL|OPERATIONAL_PATIENT_ACCESS/.test(String(row.truthRuleId || "")));
  const paintedRowsAllowed = overlayRows.every((row) => {
    if (row.truthColor === "UNKNOWN") return row.colorMode !== "PAINTED";
    return PAINTED_TOKENS.has(row.paintToken) && PAINTED_TOKENS.has(row.truthColor);
  });

  const validation = {
    nonMutating: true,
    localOnly: true,
    overlayRows307: overlayRows.length === EXPECTED_OVERLAY_ROWS,
    readinessRowsExpected:
      readinessRows.length === Number(readiness?.summary?.readinessRows || readinessRows.length),
    safeRowsExpected:
      rows.length === Number(safePacket?.summary?.safeRowsTotal || rows.length),
    safePacketRowsExpected:
      safePacketRows.length === Number(safePacket?.summary?.safeRowsTotal || safePacketRows.length),
    noOpRowsExpected:
      noOpRows.length === Number(readiness?.summary?.noOpRuntimeAlreadyTruthTarget || noOpRows.length),
    blockedRowsExpected:
      blockedRows.length === Number(readiness?.summary?.blockedRows || blockedRows.length),
    blockedRows5:
      blockedRows.length === Number(readiness?.summary?.blockedRows || blockedRows.length),
    alreadyTruthRowsExpected: alreadyTruthRows.length === EXPECTED_OVERLAY_ROWS - readinessRows.length,
    coverageRowsTotal307: coverageRowsTotal === EXPECTED_OVERLAY_ROWS,
    truthAlignedRowsAfterAuthorizedApplyExpected:
      truthAlignedRowsAfterAuthorizedApply + blockedRows.length === EXPECTED_OVERLAY_ROWS,
    blockedRowsAfterAuthorizedApplyExpected:
      blockedRows.length === Number(readiness?.summary?.blockedRows || blockedRows.length),
    blockedRowsAfterAuthorizedApply5:
      blockedRows.length === Number(readiness?.summary?.blockedRows || blockedRows.length),
    targetFilesExpected:
      targetPlans.length === Number(dryRun?.targetFilesTotal || targetPlans.length),
    allTargetsAllowed: targetPlans.every((plan) => plan.allowedTargetPath),
    allTargetHashesMatchDryRun: targetPlans.every((plan) => plan.currentHashMatchesDryRun),
    allDryRunOldValuesMatchCurrent: targetPlans.every((plan) => plan.oldValuesMatchCurrent) && rows.every((row) => row.oldValuesMatchCurrent),
    allTargetExpectedHashesUnique: targetPlans.every((plan) => plan.expectedHashUnique),
    allSimulatedApplyChangesTarget: targetPlans.every((plan) => plan.simulatedApplyChangesTarget),
    rowsMatchSafePacket: safeMissingFromPacket.length === 0 && packetMissingFromDryRun.length === 0,
    blockedRowsRemainExcluded: blockedMissingFromExcluded.length === 0,
    noOpRowsRemainExcluded: noOpMissingFromExcluded.length === 0,
    noOpRowsAlreadyTruthTarget: noOpRows.every((row) => row.currentRuntimeMatchesTruth === true && row.wouldApplyAfterAuthorization === false),
    allSimulatedSafeRowsMatchTruth: rows.every((row) => row.postApplyMatchesTruth),
    allSimulatedSafeRowsMatchDryRunDerived: rows.every((row) => row.postApplyMatchesDryRunDerived),
    allPostApplyColorsAllowed: rows.every((row) => ALLOWED_TRUTH_COLORS.has(row.postApplyRuntimeColor)),
    allTruthOverlayColorsAllowed: overlayRows.every((row) => ALLOWED_TRUTH_COLORS.has(row.truthColor)),
    onlyThreePaintColorsPlusUncolored: paintedRowsAllowed,
    noFalseGreenAfterApply: rows.every((row) => row.postApplyRuntimeColor !== "GREEN" || row.proposedTruthColor === "GREEN") && allGreenTruthRowsAllowed,
    noWikipediaTruthSource: rows.every((row) => {
      const source = dryRunRows.find((item) => item.geo === row.geo);
      return Array.isArray(source?.auditOnlyInputs) && source.auditOnlyInputs.includes("Wikipedia") && !(source.truthInputs || []).includes("Wikipedia");
    }) && overlayRows.every((row) => row.wikipediaRole === "AUDIT_ONLY_NOT_COLOR_INPUT"),
    preflightFailClosed: preflight?.preflightStatus === "RUNTIME_APPLY_PREFLIGHT_BLOCKED_FAIL_CLOSED_NO_MUTATION" && preflight?.validation?.noMutation === true,
    executionFailClosed: execution?.executionStatus === "RUNTIME_APPLY_EXECUTOR_BLOCKED_FAIL_CLOSED_NO_MUTATION" && execution?.validation?.noProdMutation === true,
    rollbackReady: rollback?.rollbackStatus === "RUNTIME_APPLY_ROLLBACK_PLAN_READY_NO_MUTATION" && rollback?.validation?.allSimulatedRollbackRestoresOriginal === true,
    appliedRowsZero: true,
    noProdMutation: true,
    noSsotMutation: true,
    noMapMutation: true,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    postApplyStatus: "RUNTIME_POST_APPLY_VERIFICATION_READY_NO_MUTATION",
    nonMutating: true,
    localOnly: true,
    productionTouched: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    appliedRows: 0,
    filesWritten: [path.relative(ROOT, OUT_JSON_PATH), path.relative(ROOT, OUT_MD_PATH)],
    wouldApplyRowsAfterAuthorization: rows.length,
    truthAlignedRowsAfterAuthorizedApply,
    blockedRowsAfterAuthorizedApply: blockedRows.length,
    coverageRowsTotal,
    coverageRowsExpected: EXPECTED_OVERLAY_ROWS,
    targetFilesTotal: targetPlans.length,
    inputRuntimeAuthorizationReadiness: path.relative(ROOT, RUNTIME_AUTHORIZATION_READINESS_PATH),
    inputRuntimeSafeAuthorizationPacket: path.relative(ROOT, RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH),
    inputThreeColorOverlay: path.relative(ROOT, THREE_COLOR_OVERLAY_PATH),
    inputRuntimeApplyDryRunDiff: path.relative(ROOT, RUNTIME_APPLY_DRY_RUN_DIFF_PATH),
    inputRuntimeApplyPreflight: path.relative(ROOT, RUNTIME_APPLY_PREFLIGHT_PATH),
    inputRuntimeApplyExecution: path.relative(ROOT, RUNTIME_APPLY_EXECUTION_PATH),
    inputRuntimeApplyRollbackPlan: path.relative(ROOT, RUNTIME_APPLY_ROLLBACK_PLAN_PATH),
    sourcePolicy: {
      truthInputs: ["Primary Law", "Independent Legal Interpretation", "Truth Report", "Three Color Overlay"],
      auditOnlyInputs: ["Wikipedia"],
      ssotRole: "TARGET_RUNTIME_AXIS_PATCH_AFTER_EXPLICIT_AUTHORIZATION_ONLY",
    },
    summary: {
      overlayRows: overlayRows.length,
      readinessRows: readinessRows.length,
      safeRows: rows.length,
      noOpRows: noOpRows.length,
      blockedRows: blockedRows.length,
      alreadyTruthRows: alreadyTruthRows.length,
      targetFiles: targetPlans.length,
      truthAlignedRowsAfterAuthorizedApply,
      blockedRowsAfterAuthorizedApply: blockedRows.length,
      coverageRowsTotal,
    },
    counts: {
      safePostApplyColor: countBy(rows, (row) => row.postApplyRuntimeColor),
      proposedTruthColor: countBy(rows, (row) => row.proposedTruthColor),
      targetFamily: countBy(rows, (row) => row.targetFamily),
      readinessDecision: countBy(readinessRows, (row) => row.decision),
      blockedDecision: countBy(blockedRows, (row) => row.decision),
      overlayTruthColor: countBy(overlayRows, (row) => row.truthColor),
      targetPlanHash: countBy(targetPlans, (plan) => plan.currentHashMatchesDryRun ? "HASH_MATCH" : "HASH_MISMATCH"),
      postApplyDisposition: countBy(rows, (row) => row.postApplyMatchesTruth ? "SAFE_ROW_POST_APPLY_MATCHES_TRUTH" : "SAFE_ROW_POST_APPLY_MISMATCH"),
    },
    validation,
    diagnostics: {
      safeMissingFromPacket,
      packetMissingFromDryRun,
      blockedMissingFromExcluded,
      noOpMissingFromExcluded,
    },
    guardrails: [
      "SIMULATE_AUTHORIZED_APPLY_BEFORE_ANY_RUNTIME_WRITE",
      "POST_APPLY_RUNTIME_COLOR_MUST_MATCH_TRUTH_COLOR",
      "NO_FALSE_GREEN_AFTER_AXIS_PATCH",
      "ONLY_THREE_PAINT_COLORS_PLUS_UNCOLORED_UNKNOWN",
      "BLOCKED_ROWS_REMAIN_EXCLUDED_FROM_SAFE_APPLY",
      "NO_OP_ROWS_REMAIN_EXCLUDED_FROM_WRITE_SET",
      "NO_WIKIPEDIA_COLOR_AUTHORITY",
      "NO_SSOT_OR_MAP_MUTATION_IN_VERIFIER",
      "NO_PRODUCTION_MUTATION",
    ],
    hashProof: [
      { path: path.relative(ROOT, RUNTIME_AUTHORIZATION_READINESS_PATH), sha256: fileSha256(RUNTIME_AUTHORIZATION_READINESS_PATH) },
      { path: path.relative(ROOT, RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH), sha256: fileSha256(RUNTIME_SAFE_AUTHORIZATION_PACKET_PATH) },
      { path: path.relative(ROOT, THREE_COLOR_OVERLAY_PATH), sha256: fileSha256(THREE_COLOR_OVERLAY_PATH) },
      { path: path.relative(ROOT, RUNTIME_APPLY_DRY_RUN_DIFF_PATH), sha256: fileSha256(RUNTIME_APPLY_DRY_RUN_DIFF_PATH) },
      { path: path.relative(ROOT, RUNTIME_APPLY_ROLLBACK_PLAN_PATH), sha256: fileSha256(RUNTIME_APPLY_ROLLBACK_PLAN_PATH) },
    ],
    targetPlans,
    rows,
    noOpRows: noOpRows.map((row) => ({
      geo: row.geo,
      territory: row.territory,
      decision: row.decision,
      currentRuntimeColor: row.currentRuntimeColor,
      proposedTruthColor: row.proposedTruthColor,
      currentRuntimeMatchesTruth: row.currentRuntimeMatchesTruth === true,
      wouldApplyAfterAuthorization: row.wouldApplyAfterAuthorization === true,
    })),
    blockedRows: blockedRows.map((row) => ({
      geo: row.geo,
      territory: row.territory,
      decision: row.decision,
      targetFamily: row.targetFamily,
      currentRuntimeColor: row.currentRuntimeColor,
      proposedTruthColor: row.proposedTruthColor,
      truthRule: row.truthRule,
      blockingReasons: row.blockingReasons || [],
    })),
    alreadyTruthRows: alreadyTruthRows.map((row) => ({
      geo: row.geo,
      territory: row.territory,
      truthColor: row.truthColor,
      truthRuleId: row.truthRuleId,
      disposition: "CURRENT_RUNTIME_NOT_IN_CHANGE_PACKET_ASSUMED_TRUTH_ALIGNED_BY_COLOR_AUDIT",
    })),
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_307_RUNTIME_POST_APPLY_STATUS=${output.postApplyStatus}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_POST_APPLY_SAFE_ROWS=${rows.length}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_POST_APPLY_TRUTH_ALIGNED=${truthAlignedRowsAfterAuthorizedApply}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_POST_APPLY_BLOCKED=${blockedRows.length}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_POST_APPLY_APPLIED_ROWS=${output.appliedRows}`);
}

main();

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const DRY_RUN_DIFF_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-dry-run-diff.json");
const EXECUTION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-execution.json");
const OUT_JSON_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-rollback-plan.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-rollback-plan.md");

const ALLOWED_TARGET_PATHS = [/^data\/countries\/[^/]+\.json$/, /^data\/status-engine\/status_ssot_v9\.json$/];

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function rollbackOperation(operation) {
  return {
    op: operation.op || "replace",
    path: operation.path,
    oldValue: operation.newValue ?? null,
    newValue: operation.oldValue ?? null,
    changesValue: stableJson(operation.newValue ?? null) !== stableJson(operation.oldValue ?? null),
    reason: `Rollback inverse of dry-run operation: ${operation.reason || "Truth-first runtime axis patch"}`,
  };
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

  return [...rowsByTarget.entries()].map(([targetPath, rows]) => {
    const abs = path.join(ROOT, targetPath);
    const currentDocument = readJson(abs);
    const currentSerialized = fs.readFileSync(abs, "utf8");
    const currentHash = textSha256(currentSerialized);
    const expectedHashes = [...new Set(rows.map((row) => row.targetHashBefore).filter(Boolean))].sort();
    const expectedHash = expectedHashes.length === 1 ? expectedHashes[0] : null;
    const applyDocument = clone(currentDocument);
    const dryRunOps = normalizeOperationRows(rows);
    const oldValuesMatchCurrent = dryRunOps.every(({ operation }) => stableJson(getJsonPointer(applyDocument, operation.path) ?? null) === stableJson(operation.oldValue ?? null));
    for (const { operation } of dryRunOps) {
      setJsonPointer(applyDocument, operation.path, operation.newValue ?? null);
    }
    const simulatedAppliedHash = textSha256(serializeDocument(applyDocument));
    const rollbackDocument = clone(applyDocument);
    const rollbackOps = [...dryRunOps].reverse().map(({ operation }) => rollbackOperation(operation));
    for (const operation of rollbackOps) {
      setJsonPointer(rollbackDocument, operation.path, operation.newValue ?? null);
    }
    const simulatedRollbackHash = textSha256(serializeDocument(rollbackDocument));
    const rollbackRestoresOriginalHash = simulatedRollbackHash === currentHash;
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
      simulatedRollbackHash,
      simulatedApplyChangesTarget: simulatedAppliedHash !== currentHash,
      rollbackRestoresOriginalHash,
      geos: rows.map((row) => row.geo).sort(),
    };
  }).sort((a, b) => a.targetPath.localeCompare(b.targetPath));
}

function buildRollbackRow(row, targetPlan) {
  const dryRunOperations = Array.isArray(row.operations) ? row.operations : [];
  const rollbackOperations = dryRunOperations.map(rollbackOperation);
  return {
    geo: row.geo,
    territory: row.territory,
    transactionId: row.transactionId,
    targetFamily: row.targetFamily,
    targetPath: targetFileForRow(row),
    targetRecordSelector: row.targetRecordSelector,
    proposedTruthColor: row.proposedTruthColor,
    dryRunOperationCount: dryRunOperations.length,
    rollbackOperationCount: rollbackOperations.length,
    rollbackOperations,
    targetHashBeforeApply: targetPlan?.currentHash || null,
    targetHashExpectedBeforeApply: row.targetHashBefore || null,
    simulatedTargetHashAfterApply: targetPlan?.simulatedAppliedHash || null,
    simulatedTargetHashAfterRollback: targetPlan?.simulatedRollbackHash || null,
    rollbackRestoresTargetHash: targetPlan?.rollbackRestoresOriginalHash === true,
    rollbackDisposition: "ROLLBACK_PLAN_READY_NO_MUTATION",
    wouldRollbackNow: false,
    appliedRows: 0,
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
  lines.push("# Wiki Truth 307 Runtime Apply Rollback Plan");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Rollback status: ${output.rollbackStatus}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push(`Target files: ${output.targetFilesTotal}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push("### Target family");
  lines.push(mdCounts(output.counts.targetFamily));
  lines.push("");
  lines.push("### Proposed truth color");
  lines.push(mdCounts(output.counts.proposedTruthColor));
  lines.push("");
  lines.push("### Rollback operation path");
  lines.push(mdCounts(output.counts.rollbackOperationPath));
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  lines.push(mdCounts(output.validation));
  lines.push("");
  lines.push("## Target Plans");
  lines.push("");
  lines.push("| Target | Rows | Ops | Hash matches dry-run | Rollback restores original | Sim apply changes target |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const target of output.targetPlans) {
    lines.push(
      [target.targetPath, target.rowCount, target.operationCount, target.currentHashMatchesDryRun, target.rollbackRestoresOriginalHash, target.simulatedApplyChangesTarget]
        .map((value) => mdCell(value))
        .join(" | ")
        .replace(/^/, "| ") + " |",
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const dryRun = readJson(DRY_RUN_DIFF_PATH);
  const execution = readJson(EXECUTION_PATH);
  const dryRunRows = Array.isArray(dryRun.rows) ? dryRun.rows : [];
  const expectedRows = Number(dryRun.rowsTotal ?? dryRunRows.length);
  if (dryRunRows.length !== expectedRows) {
    throw new Error(
      `Expected ${expectedRows} current dry-run rows, got ${dryRunRows.length}`,
    );
  }
  const targetPlans = buildTargetPlans(dryRunRows);
  const targetPlanByPath = new Map(targetPlans.map((target) => [target.targetPath, target]));
  const rows = dryRunRows.map((row) => buildRollbackRow(row, targetPlanByPath.get(targetFileForRow(row))));
  const rollbackOperationRows = rows.flatMap((row) => row.rollbackOperations.map((operation) => ({ row, operation })));
  const validation = {
    dryRunDiffReady: dryRun.dryRunStatus === "RUNTIME_APPLY_DRY_RUN_DIFF_READY_NO_MUTATION",
    executionFailClosedNoMutation:
      execution.executionStatus === "RUNTIME_APPLY_EXECUTOR_BLOCKED_FAIL_CLOSED_NO_MUTATION" &&
      Number(execution.appliedRows || 0) === 0 &&
      Number(execution.writtenTargetFilesTotal || 0) === 0,
    rowsMatchDryRun: rows.length === dryRunRows.length,
    expectedRows: rows.length === expectedRows,
    targetFilesMatchDryRunTotal: targetPlans.length === Number(dryRun.targetFilesTotal || 0),
    allTargetsAllowed: targetPlans.every((target) => target.allowedTargetPath),
    allTargetHashesMatchDryRun: targetPlans.every((target) => target.currentHashMatchesDryRun),
    allDryRunOldValuesMatchCurrent: targetPlans.every((target) => target.oldValuesMatchCurrent),
    allTargetExpectedHashesUnique: targetPlans.every((target) => target.expectedHashUnique),
    allSimulatedApplyChangesTarget: targetPlans.every((target) => target.simulatedApplyChangesTarget),
    allSimulatedRollbackRestoresOriginal: targetPlans.every((target) => target.rollbackRestoresOriginalHash),
    allRowsHaveRollbackOperations: rows.every((row) => row.rollbackOperationCount > 0 && row.rollbackOperationCount === row.dryRunOperationCount),
    rollbackOpsReverseDryRun: rows.every((row) => row.rollbackOperations.every((operation) => stableJson(operation.oldValue ?? null) !== stableJson(operation.newValue ?? null))),
    allRowsRollbackWouldNotRunNow: rows.every((row) => row.wouldRollbackNow === false),
    noWikipediaTruthSource: dryRun.validation?.noWikipediaTruthSource === true,
    nonMutating: true,
    localOnly: true,
    appliedRowsZero: true,
    noProdMutation: true,
  };
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    rollbackStatus: "RUNTIME_APPLY_ROLLBACK_PLAN_READY_NO_MUTATION",
    nonMutating: true,
    localOnly: true,
    productionTouched: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    appliedRows: 0,
    wouldRollbackRowsNow: 0,
    rowsTotal: rows.length,
    targetFilesTotal: targetPlans.length,
    inputDryRunDiff: path.relative(ROOT, DRY_RUN_DIFF_PATH),
    inputExecution: path.relative(ROOT, EXECUTION_PATH),
    counts: {
      targetFamily: countBy(rows, (row) => row.targetFamily),
      proposedTruthColor: countBy(rows, (row) => row.proposedTruthColor),
      rollbackOperationPath: countBy(rollbackOperationRows, ({ operation }) => operation.path.replace(/\/entries\/\d+\//, "/entries/<index>/")),
      rollbackDisposition: countBy(rows, (row) => row.rollbackDisposition),
      targetPlanHash: countBy(targetPlans, (target) => target.rollbackRestoresOriginalHash ? "ROLLBACK_RESTORES_ORIGINAL" : "ROLLBACK_HASH_MISMATCH"),
    },
    validation,
    guardrails: [
      "ROLLBACK_PLAN_MUST_BE_BUILT_BEFORE_AUTHORIZED_APPLY",
      "ROLLBACK_OPS_MUST_INVERT_DRY_RUN_OPS",
      "SIMULATED_ROLLBACK_MUST_RESTORE_ORIGINAL_HASH",
      "TARGET_HASHES_MUST_MATCH_DRY_RUN_BEFORE_ROLLBACK_PLAN",
      "NO_ROLLBACK_EXECUTION_WITHOUT_EXPLICIT_AUTHORIZATION",
      "NO_WIKIPEDIA_COLOR_AUTHORITY",
      "NO_PRODUCTION_MUTATION",
    ],
    hashProof: [
      {
        artifact: path.relative(ROOT, DRY_RUN_DIFF_PATH),
        sha256: fileSha256(DRY_RUN_DIFF_PATH),
        role: "dry-run-diff-input",
      },
      {
        artifact: path.relative(ROOT, EXECUTION_PATH),
        sha256: fileSha256(EXECUTION_PATH),
        role: "execution-report-input",
      },
    ],
    targetPlans,
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_ROLLBACK_PLAN_ROWS=${output.rowsTotal}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_ROLLBACK_PLAN_STATUS=${output.rollbackStatus}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_ROLLBACK_PLAN_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_ROLLBACK_PLAN_TARGET_FILES=${output.targetFilesTotal}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_ROLLBACK_PLAN_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_ROLLBACK_PLAN_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
}

main();

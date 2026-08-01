#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const DRY_RUN_DIFF_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-dry-run-diff.json");
const PREFLIGHT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-preflight.json");
const OUT_JSON_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-execution.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-execution.md");

const APPLY_FLAG = "--apply";

function requiredAuthorizationPhrase(rowCount) {
  return `I_AUTHORIZE_TRUTH_FIRST_RUNTIME_APPLY_${rowCount}_SAFE_ROWS`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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

function targetIsAllowed(targetPath) {
  return /^data\/countries\/[^/]+\.json$/.test(targetPath) || targetPath === "data/status-engine/status_ssot_v9.json";
}

function currentTargetHash(targetPath) {
  const abs = path.join(ROOT, targetPath);
  return fs.existsSync(abs) ? fileSha256(abs) : null;
}

function rowTargetOk(row) {
  const targetPath = targetFileForRow(row);
  const currentSha = targetPath ? currentTargetHash(targetPath) : null;
  return {
    targetPath,
    allowedTargetPath: targetIsAllowed(targetPath),
    currentSha256: currentSha,
    expectedSha256: row.targetHashBefore || null,
    hashMatchesDryRun: Boolean(currentSha && row.targetHashBefore && currentSha === row.targetHashBefore),
  };
}

function setJsonPointer(root, pointer, value) {
  const parts = String(pointer || "").split("/").slice(1).map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (parts.length === 0) throw new Error("Refusing to replace whole JSON document.");
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

function applyRows(rows) {
  const rowsByTarget = new Map();
  for (const row of rows) {
    const targetPath = targetFileForRow(row);
    if (!rowsByTarget.has(targetPath)) rowsByTarget.set(targetPath, []);
    rowsByTarget.get(targetPath).push(row);
  }
  const writtenTargets = [];
  for (const [targetPath, targetRows] of rowsByTarget.entries()) {
    const abs = path.join(ROOT, targetPath);
    const document = readJson(abs);
    for (const row of targetRows) {
      for (const op of row.operations || []) {
        setJsonPointer(document, op.path, op.newValue);
      }
    }
    fs.writeFileSync(abs, `${JSON.stringify(document, null, 2)}\n`);
    writtenTargets.push({ targetPath, rowCount: targetRows.length, sha256After: fileSha256(abs) });
  }
  return writtenTargets.sort((a, b) => a.targetPath.localeCompare(b.targetPath));
}

function rowBlockingReasons(row, targetState, applyFlagPresent, authorizationPresent, ssotWriteEnabled) {
  const reasons = [];
  if (!applyFlagPresent) reasons.push("APPLY_FLAG_MISSING");
  if (!authorizationPresent) reasons.push("AUTHORIZATION_MISSING");
  if (!ssotWriteEnabled) reasons.push("SSOT_WRITE_NOT_ENABLED");
  if (!targetState.allowedTargetPath) reasons.push("TARGET_PATH_OUTSIDE_ALLOWED_RUNTIME_SCOPE");
  if (!targetState.hashMatchesDryRun) reasons.push("TARGET_HASH_DRIFT_FROM_DRY_RUN");
  if (row.derivedMatchesTruth !== true) reasons.push("DRY_RUN_DERIVED_COLOR_MISMATCH");
  if (row.wouldApplyAfterAuthorization !== true) reasons.push("DRY_RUN_ROW_NOT_MARKED_APPLYABLE");
  return reasons;
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
  lines.push("# Wiki Truth 307 Runtime Apply Execution");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Execution status: ${output.executionStatus}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push(`Written target files: ${output.writtenTargetFilesTotal}`);
  lines.push("");
  lines.push("## Gate Inputs");
  lines.push("");
  lines.push(`- Apply flag present: ${output.cli.applyFlagPresent ? "TRUE" : "FALSE"}`);
  lines.push(`- Authorization present: ${output.authorization.present ? "TRUE" : "FALSE"}`);
  lines.push(`- SSOT_WRITE enabled: ${output.environment.ssotWriteEnabled ? "TRUE" : "FALSE"}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push("### Execution decision");
  lines.push(mdCounts(output.counts.executionDecision));
  lines.push("");
  lines.push("### Blocking reasons");
  lines.push(mdCounts(output.counts.blockingReason));
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  lines.push(mdCounts(output.validation));
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| GEO | Target | Truth color | Decision | Blocking reasons |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      [row.geo, row.targetPath, row.proposedTruthColor, row.executionDecision, row.blockingReasons.join(", ")]
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
  const preflight = readJson(PREFLIGHT_PATH);
  const dryRunRows = Array.isArray(dryRun.rows) ? dryRun.rows : [];
  const expectedRows = Number(dryRun.rowsTotal ?? dryRunRows.length);
  if (dryRunRows.length !== expectedRows) {
    throw new Error(
      `Expected ${expectedRows} current dry-run rows, got ${dryRunRows.length}`,
    );
  }

  const requiredAuthorization = requiredAuthorizationPhrase(expectedRows);
  const applyFlagPresent = process.argv.includes(APPLY_FLAG);
  const authorizationValue = String(process.env.TRUTH_FIRST_COLOR_APPLY_AUTHORIZATION || "");
  const authorizationPresent = authorizationValue === requiredAuthorization;
  const ssotWriteEnabled = process.env.SSOT_WRITE === "1";
  const targetStates = dryRunRows.map((row) => rowTargetOk(row));
  const allTargetHashesMatchDryRun = targetStates.every((target) => target.hashMatchesDryRun);
  const allTargetsAllowed = targetStates.every((target) => target.allowedTargetPath);
  const dryRunReady = dryRun.dryRunStatus === "RUNTIME_APPLY_DRY_RUN_DIFF_READY_NO_MUTATION" && dryRun.validation?.allDerivedColorsMatchTruth === true;
  const preflightReadyOrFailClosed = [
    "RUNTIME_APPLY_PREFLIGHT_READY_FOR_AUTHORIZED_WRITE_NO_MUTATION",
    "RUNTIME_APPLY_PREFLIGHT_BLOCKED_FAIL_CLOSED_NO_MUTATION",
  ].includes(preflight.preflightStatus);
  const globalGateOpen =
    applyFlagPresent &&
    authorizationPresent &&
    ssotWriteEnabled &&
    allTargetHashesMatchDryRun &&
    allTargetsAllowed &&
    dryRunReady &&
    preflightReadyOrFailClosed;

  const rows = dryRunRows.map((row, index) => {
    const targetState = targetStates[index];
    const blockingReasons = rowBlockingReasons(row, targetState, applyFlagPresent, authorizationPresent, ssotWriteEnabled);
    const executionDecision = globalGateOpen && blockingReasons.length === 0
      ? "APPLY_LOCAL_RUNTIME_AXIS_PATCH"
      : "BLOCKED_FAIL_CLOSED_NO_MUTATION";
    return {
      geo: row.geo,
      territory: row.territory,
      transactionId: row.transactionId,
      targetFamily: row.targetFamily,
      targetPath: targetState.targetPath,
      targetRecordSelector: row.targetRecordSelector,
      proposedTruthColor: row.proposedTruthColor,
      derivedColorAfterPatch: row.derivedColorAfterPatch,
      operationCount: row.operationCount,
      executionDecision,
      blockingReasons,
      wouldWriteNow: executionDecision === "APPLY_LOCAL_RUNTIME_AXIS_PATCH",
      appliedNow: false,
      targetHashExpected: targetState.expectedSha256,
      targetHashCurrent: targetState.currentSha256,
      targetHashMatchesDryRun: targetState.hashMatchesDryRun,
    };
  });

  const rowsToApply = rows.filter((row) => row.executionDecision === "APPLY_LOCAL_RUNTIME_AXIS_PATCH");
  const writtenTargets = globalGateOpen ? applyRows(dryRunRows) : [];
  const appliedRows = globalGateOpen ? rowsToApply.length : 0;
  for (const row of rows) {
    row.appliedNow = globalGateOpen && row.executionDecision === "APPLY_LOCAL_RUNTIME_AXIS_PATCH";
  }

  const blockingReasonRows = rows.flatMap((row) => row.blockingReasons.map((reason) => ({ reason })));
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    executionStatus: globalGateOpen
      ? "RUNTIME_APPLY_EXECUTOR_APPLIED_LOCAL_RUNTIME_AXES"
      : "RUNTIME_APPLY_EXECUTOR_BLOCKED_FAIL_CLOSED_NO_MUTATION",
    nonMutating: !globalGateOpen,
    localOnly: true,
    productionTouched: false,
    ssotMutationAttempted: globalGateOpen,
    mapMutationAttempted: globalGateOpen,
    appliedRows,
    wouldWriteRowsNow: rows.filter((row) => row.wouldWriteNow).length,
    rowsTotal: rows.length,
    writtenTargetFilesTotal: writtenTargets.length,
    writtenTargets,
    requiredAuthorizationPhrase: requiredAuthorization,
    cli: {
      applyFlag: APPLY_FLAG,
      applyFlagPresent,
    },
    authorization: {
      env: "TRUTH_FIRST_COLOR_APPLY_AUTHORIZATION",
      present: authorizationPresent,
      accepted: authorizationPresent,
    },
    environment: {
      ssotWriteEnv: "SSOT_WRITE",
      ssotWriteRequiredValue: "1",
      ssotWriteEnabled,
    },
    inputs: {
      dryRunDiff: path.relative(ROOT, DRY_RUN_DIFF_PATH),
      preflight: path.relative(ROOT, PREFLIGHT_PATH),
    },
    validation: {
      dryRunRowsExpected: dryRunRows.length === expectedRows,
      dryRunReady,
      preflightReadyOrFailClosed,
      allTargetHashesMatchDryRun,
      allTargetsAllowed,
      applyFlagMissing: !applyFlagPresent,
      authorizationMissing: !authorizationPresent,
      ssotWriteDisabled: !ssotWriteEnabled,
      failClosedWithoutApplyFlag: !applyFlagPresent && !globalGateOpen,
      failClosedWithoutAuthorization: !authorizationPresent && !globalGateOpen,
      failClosedWithoutSsotWrite: !ssotWriteEnabled && !globalGateOpen,
      allRowsBlockedWhenGateClosed: !globalGateOpen && rows.every((row) => row.executionDecision === "BLOCKED_FAIL_CLOSED_NO_MUTATION"),
      noRowsAppliedWhenGateClosed: !globalGateOpen && appliedRows === 0,
      noProdMutation: true,
      noWikipediaTruthSource: dryRun.validation?.noWikipediaTruthSource === true,
    },
    counts: {
      executionDecision: countBy(rows, (row) => row.executionDecision),
      targetFamily: countBy(rows, (row) => row.targetFamily),
      proposedTruthColor: countBy(rows, (row) => row.proposedTruthColor),
      blockingReason: countBy(blockingReasonRows, (row) => row.reason),
      targetHash: countBy(rows, (row) => row.targetHashMatchesDryRun ? "HASH_MATCH" : "HASH_DRIFT"),
    },
    guardrails: [
      "APPLY_FLAG_REQUIRED",
      "AUTHORIZATION_PHRASE_REQUIRED_FOR_ANY_RUNTIME_WRITE",
      "SSOT_WRITE_1_REQUIRED_FOR_ANY_RUNTIME_WRITE",
      "TARGET_HASHES_MUST_MATCH_DRY_RUN_BEFORE_APPLY",
      "DRY_RUN_DERIVED_COLOR_MUST_MATCH_TRUTH",
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
        artifact: path.relative(ROOT, PREFLIGHT_PATH),
        sha256: fileSha256(PREFLIGHT_PATH),
        role: "preflight-input",
      },
    ],
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_EXECUTION_STATUS=${output.executionStatus}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_EXECUTION_ROWS=${output.rowsTotal}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_EXECUTION_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_EXECUTION_WRITTEN_TARGETS=${output.writtenTargetFilesTotal}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_EXECUTION_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_EXECUTION_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
}

main();

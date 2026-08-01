#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const DRY_RUN_DIFF_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-dry-run-diff.json");
const SAFE_PACKET_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-safe-authorization-packet.json");
const COLOR_APPLY_GATE_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-color-apply-gate.json");
const OUT_JSON_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-preflight.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-runtime-apply-preflight.md");

function requiredAuthorizationPhrase(rowCount) {
  return `I_AUTHORIZE_TRUTH_FIRST_RUNTIME_APPLY_${rowCount}_SAFE_ROWS`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
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

function buildTargetState(rows) {
  const byTarget = new Map();
  for (const row of rows) {
    const targetPath = targetFileForRow(row);
    if (!targetPath) continue;
    const existing = byTarget.get(targetPath);
    if (existing) {
      existing.geos.push(row.geo);
      existing.expectedHashes.add(row.targetHashBefore);
      continue;
    }
    const absolutePath = path.join(ROOT, targetPath);
    const exists = fs.existsSync(absolutePath);
    const currentSha256 = exists ? fileSha256(absolutePath) : null;
    byTarget.set(targetPath, {
      targetPath,
      exists,
      allowedTargetPath: targetIsAllowed(targetPath),
      currentSha256,
      expectedSha256: row.targetHashBefore || null,
      expectedHashes: new Set([row.targetHashBefore || null]),
      geos: [row.geo],
    });
  }
  return [...byTarget.values()].map((target) => {
    const expectedHashes = [...target.expectedHashes].filter(Boolean).sort();
    const singleExpectedHash = expectedHashes.length === 1;
    return {
      targetPath: target.targetPath,
      exists: target.exists,
      allowedTargetPath: target.allowedTargetPath,
      currentSha256: target.currentSha256,
      expectedSha256: target.expectedSha256,
      expectedHashes,
      singleExpectedHash,
      hashMatchesDryRun: target.exists && singleExpectedHash && target.currentSha256 === target.expectedSha256,
      geos: target.geos.sort(),
      geoCount: target.geos.length,
    };
  }).sort((a, b) => a.targetPath.localeCompare(b.targetPath));
}

function rowBlockingReasons(row, targetState, authorizationPresent, ssotWriteEnabled) {
  const reasons = [];
  if (!authorizationPresent) reasons.push("AUTHORIZATION_MISSING");
  if (!ssotWriteEnabled) reasons.push("SSOT_WRITE_NOT_ENABLED");
  if (!targetState?.exists) reasons.push("TARGET_FILE_MISSING");
  if (targetState && !targetState.allowedTargetPath) reasons.push("TARGET_PATH_OUTSIDE_ALLOWED_RUNTIME_SCOPE");
  if (targetState && !targetState.singleExpectedHash) reasons.push("TARGET_HASH_EXPECTATION_NOT_UNIQUE");
  if (targetState && !targetState.hashMatchesDryRun) reasons.push("TARGET_HASH_DRIFT_FROM_DRY_RUN");
  if (row.derivedMatchesTruth !== true) reasons.push("DRY_RUN_DERIVED_COLOR_MISMATCH");
  if (row.wouldApplyAfterAuthorization !== true) reasons.push("DRY_RUN_ROW_NOT_MARKED_APPLYABLE");
  return reasons;
}

function buildRows(dryRunRows, targetStatesByPath, authorizationPresent, ssotWriteEnabled, globalTargetStateOk) {
  return dryRunRows.map((row) => {
    const targetPath = targetFileForRow(row);
    const targetState = targetStatesByPath.get(targetPath) || null;
    const blockingReasons = rowBlockingReasons(row, targetState, authorizationPresent, ssotWriteEnabled);
    const wouldWriteAfterAuthorization =
      authorizationPresent &&
      ssotWriteEnabled &&
      globalTargetStateOk &&
      row.derivedMatchesTruth === true &&
      row.wouldApplyAfterAuthorization === true;
    return {
      geo: row.geo,
      territory: row.territory,
      transactionId: row.transactionId,
      targetFamily: row.targetFamily,
      targetPath,
      targetRecordSelector: row.targetRecordSelector,
      proposedTruthColor: row.proposedTruthColor,
      derivedColorAfterPatch: row.derivedColorAfterPatch,
      operationCount: row.operationCount,
      targetHashExpected: row.targetHashBefore,
      targetHashCurrent: targetState?.currentSha256 || null,
      targetHashMatchesDryRun: targetState?.hashMatchesDryRun === true,
      wouldWriteNow: false,
      wouldWriteAfterAuthorization,
      appliedNow: false,
      gateDecision: wouldWriteAfterAuthorization ? "WOULD_WRITE_AFTER_AUTHORIZATION" : "BLOCKED_PREFLIGHT_FAIL_CLOSED",
      blockingReasons,
    };
  });
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
  lines.push("# Wiki Truth 307 Runtime Apply Preflight");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Preflight status: ${output.preflightStatus}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push(`Target files: ${output.targetFilesTotal}`);
  lines.push(`Target drift files: ${output.targetDriftFiles}`);
  lines.push(`Would write now: ${output.wouldWriteRowsNow}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Authorization");
  lines.push("");
  lines.push(`- Authorization env: \`${output.authorization.env}\``);
  lines.push(`- Authorization present: ${output.authorization.present ? "TRUE" : "FALSE"}`);
  lines.push(`- SSOT_WRITE enabled: ${output.environment.ssotWriteEnabled ? "TRUE" : "FALSE"}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push("### Gate decisions");
  lines.push(mdCounts(output.counts.gateDecision));
  lines.push("");
  lines.push("### Blocking reasons");
  lines.push(mdCounts(output.counts.blockingReason));
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  lines.push(mdCounts(output.validation));
  lines.push("");
  lines.push("## Target Files");
  lines.push("");
  lines.push("| Target | GEO count | Hash matches dry-run | Allowed | Exists |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const target of output.targetFiles) {
    lines.push(
      [target.targetPath, target.geoCount, target.hashMatchesDryRun, target.allowedTargetPath, target.exists]
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
  const safePacket = readJson(SAFE_PACKET_PATH);
  const colorApplyGate = readJsonIfExists(COLOR_APPLY_GATE_PATH);
  const dryRunRows = Array.isArray(dryRun.rows) ? dryRun.rows : [];
  const expectedRows = Number(
    dryRun.rowsTotal ?? safePacket.safeRowsTotal ?? safePacket.rowsTotal,
  );
  if (dryRunRows.length !== expectedRows) {
    throw new Error(
      `Expected ${expectedRows} current dry-run rows, got ${dryRunRows.length}`,
    );
  }

  const targetFiles = buildTargetState(dryRunRows);
  const targetStatesByPath = new Map(targetFiles.map((target) => [target.targetPath, target]));
  const targetDriftFiles = targetFiles.filter((target) => !target.hashMatchesDryRun).length;
  const targetDriftRows = dryRunRows.filter((row) => {
    const state = targetStatesByPath.get(targetFileForRow(row));
    return state?.hashMatchesDryRun !== true;
  }).length;
  const allTargetsAllowed = targetFiles.every((target) => target.allowedTargetPath);
  const allTargetsExist = targetFiles.every((target) => target.exists);
  const allTargetHashesMatchDryRun = targetFiles.every((target) => target.hashMatchesDryRun);
  const requiredAuthorization = requiredAuthorizationPhrase(expectedRows);
  const authorizationValue = String(process.env.TRUTH_FIRST_COLOR_APPLY_AUTHORIZATION || "");
  const authorizationPresent = authorizationValue === requiredAuthorization;
  const ssotWriteEnabled = process.env.SSOT_WRITE === "1";
  const globalTargetStateOk = allTargetsAllowed && allTargetsExist && allTargetHashesMatchDryRun;
  const rows = buildRows(dryRunRows, targetStatesByPath, authorizationPresent, ssotWriteEnabled, globalTargetStateOk);
  const blockingReasonRows = rows.flatMap((row) => row.blockingReasons.map((reason) => ({ reason })));
  const globalGateOpen = authorizationPresent && ssotWriteEnabled && globalTargetStateOk && rows.every((row) => row.wouldWriteAfterAuthorization);
  const validation = {
    dryRunDiffReady: dryRun.dryRunStatus === "RUNTIME_APPLY_DRY_RUN_DIFF_READY_NO_MUTATION",
    dryRunRowsExpected: dryRunRows.length === expectedRows,
    safePacketRowsExpected:
      Array.isArray(safePacket.rows) &&
      safePacket.rows.length === expectedRows,
    targetFilesMatchDryRunTotal: targetFiles.length === Number(dryRun.targetFilesTotal || 0),
    allTargetsExist,
    allTargetsAllowed,
    allTargetHashesMatchDryRun,
    noTargetDrift: targetDriftFiles === 0 && targetDriftRows === 0,
    authorizationMissing: !authorizationPresent,
    ssotWriteDisabled: !ssotWriteEnabled,
    failClosedByDefault: !authorizationPresent && !ssotWriteEnabled,
    allRowsBlockedNow: rows.every((row) => row.gateDecision === "BLOCKED_PREFLIGHT_FAIL_CLOSED"),
    noRowsWouldWriteNow: rows.every((row) => row.wouldWriteNow === false),
    noRowsAppliedNow: rows.every((row) => row.appliedNow === false),
    allRowsRequireExplicitAuthorization: dryRun.validation?.allRowsRequireAuthorization === true,
    allRowsDerivedColorsMatchTruth: dryRun.validation?.allDerivedColorsMatchTruth === true,
    noWikipediaTruthSource: dryRun.validation?.noWikipediaTruthSource === true,
    noMutation: true,
    appliedRowsZero: true,
    upstreamApplyGateFailClosed: colorApplyGate?.gateStatus === "BLOCKED_FAIL_CLOSED",
  };
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    preflightStatus: globalGateOpen
      ? "RUNTIME_APPLY_PREFLIGHT_READY_FOR_AUTHORIZED_WRITE_NO_MUTATION"
      : "RUNTIME_APPLY_PREFLIGHT_BLOCKED_FAIL_CLOSED_NO_MUTATION",
    nonMutating: true,
    localOnly: true,
    productionTouched: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    appliedRows: 0,
    wouldWriteRowsNow: rows.filter((row) => row.wouldWriteNow).length,
    wouldWriteRowsAfterAuthorization: rows.filter((row) => row.wouldWriteAfterAuthorization).length,
    rowsTotal: rows.length,
    targetFilesTotal: targetFiles.length,
    targetDriftFiles,
    targetDriftRows,
    requiredAuthorizationPhrase: requiredAuthorization,
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
    inputDryRunDiff: path.relative(ROOT, DRY_RUN_DIFF_PATH),
    inputSafeAuthorizationPacket: path.relative(ROOT, SAFE_PACKET_PATH),
    inputColorApplyGate: colorApplyGate ? path.relative(ROOT, COLOR_APPLY_GATE_PATH) : null,
    validation,
    counts: {
      gateDecision: countBy(rows, (row) => row.gateDecision),
      targetFamily: countBy(rows, (row) => row.targetFamily),
      proposedTruthColor: countBy(rows, (row) => row.proposedTruthColor),
      blockingReason: countBy(blockingReasonRows, (row) => row.reason),
      targetFileHash: countBy(targetFiles, (target) => target.hashMatchesDryRun ? "HASH_MATCH" : "HASH_DRIFT"),
    },
    guardrails: [
      "TARGET_HASHES_MUST_MATCH_DRY_RUN_BEFORE_APPLY",
      "AUTHORIZATION_PHRASE_REQUIRED_FOR_ANY_RUNTIME_WRITE",
      "SSOT_WRITE_1_REQUIRED_FOR_ANY_RUNTIME_WRITE",
      "NO_RUNTIME_WRITE_IN_PREFLIGHT",
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
        artifact: path.relative(ROOT, SAFE_PACKET_PATH),
        sha256: fileSha256(SAFE_PACKET_PATH),
        role: "safe-authorization-packet-input",
      },
      ...(colorApplyGate
        ? [{
            artifact: path.relative(ROOT, COLOR_APPLY_GATE_PATH),
            sha256: fileSha256(COLOR_APPLY_GATE_PATH),
            role: "fail-closed-apply-gate-input",
          }]
        : []),
    ],
    targetFiles,
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_PREFLIGHT_ROWS=${output.rowsTotal}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_PREFLIGHT_STATUS=${output.preflightStatus}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_PREFLIGHT_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_PREFLIGHT_WOULD_WRITE_NOW=${output.wouldWriteRowsNow}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_PREFLIGHT_TARGET_DRIFT_FILES=${output.targetDriftFiles}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_PREFLIGHT_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`WIKI_TRUTH_307_RUNTIME_APPLY_PREFLIGHT_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
}

main();

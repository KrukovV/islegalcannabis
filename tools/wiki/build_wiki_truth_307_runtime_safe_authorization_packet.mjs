#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const AUTHORIZATION_PACKET_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-authorization-packet.json",
);
const RUNTIME_AUTHORIZATION_READINESS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-authorization-readiness.json",
);
const RUNTIME_TRUTH_CONFLICT_AUDIT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-truth-conflict-audit.json",
);
const DISPUTED_TARGET_MAPPING_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-disputed-target-mapping.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-safe-authorization-packet.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-safe-authorization-packet.md",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function relative(filePath) {
  return path.relative(ROOT, filePath);
}

function fileProof(filePath) {
  const exists = fs.existsSync(filePath);
  return {
    path: relative(filePath),
    exists,
    sha256: exists ? sha256File(filePath) : null,
  };
}

function normalizeGeo(value) {
  return String(value || "").trim().toUpperCase();
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mdCell(value, limit = 240) {
  const text = compact(value);
  const trimmed = text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  return (trimmed || "-").replace(/\|/g, "\\|");
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "UNKNOWN";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function rowsByGeo(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const geo = normalizeGeo(row?.geo || row?.id);
    if (geo) map.set(geo, row);
  }
  return map;
}

function buildSafeRow(readinessRow, packetRow, safeIndex) {
  return {
    safeIndex,
    geo: readinessRow.geo,
    territory: readinessRow.territory,
    transactionId: packetRow?.transactionId || null,
    originalPacketIndex: packetRow?.packetIndex ?? null,
    targetPath: readinessRow.targetPath,
    targetFamily: readinessRow.targetFamily,
    currentRuntimeColor: readinessRow.currentRuntimeColor,
    proposedTruthColor: readinessRow.proposedTruthColor,
    truthRule: readinessRow.truthRule,
    currentRuntimeInput: readinessRow.currentRuntimeInput || null,
    runtimeDecision: readinessRow.decision,
    applyDisposition: "PENDING_EXPLICIT_AUTHORIZATION_AND_AXIS_PATCH",
    targetMutationClass: "AUTHORIZED_RUNTIME_AXIS_PATCH_AFTER_EXPLICIT_APPROVAL",
    requiresExplicitAuthorization: true,
    requiresSSOTWrite: true,
    targetMutationAllowedNow: false,
    blockedByReadiness: false,
    noOp: false,
    blockingReasons: [
      "AUTHORIZATION_MISSING",
      "SSOT_WRITE_NOT_ENABLED",
      "NO_RUNTIME_MUTATION_IN_DRY_PACKET",
    ],
  };
}

function buildExcludedRow(readinessRow, packetRow) {
  return {
    geo: readinessRow.geo,
    territory: readinessRow.territory,
    transactionId: packetRow?.transactionId || null,
    originalPacketIndex: packetRow?.packetIndex ?? null,
    targetPath: readinessRow.targetPath || null,
    targetFamily: readinessRow.targetFamily,
    currentRuntimeColor: readinessRow.currentRuntimeColor,
    proposedTruthColor: readinessRow.proposedTruthColor,
    truthRule: readinessRow.truthRule,
    runtimeDecision: readinessRow.decision,
    excludedReason:
      readinessRow.decision === "NO_OP_RUNTIME_ALREADY_TRUTH_TARGET"
        ? "RUNTIME_ALREADY_AT_TRUTH_TARGET"
        : readinessRow.decision,
    targetMutationAllowedNow: false,
    wouldApplyAfterAuthorization: false,
    blockingReasons: readinessRow.blockingReasons || [],
  };
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Runtime-Safe Authorization Packet");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Packet status: ${output.packetStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Local only: ${output.localOnly ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- original packet rows: ${output.originalPacketRows}`);
  lines.push(`- readiness rows: ${output.readinessRows}`);
  lines.push(`- safe rows: ${output.safeRowsTotal}`);
  lines.push(`- excluded rows: ${output.excludedRowsTotal}`);
  lines.push(`- no-op rows excluded: ${output.summary.noOpRowsExcluded}`);
  lines.push(`- blocked rows excluded: ${output.summary.blockedRowsExcluded}`);
  lines.push(`- would apply after authorization: ${output.wouldApplyRowsAfterAuthorization}`);
  lines.push(`- applied now: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Safe rows");
  lines.push("");
  lines.push("| GEO | Territory | Runtime current | Truth target | Target | Rule |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.currentRuntimeColor)} | ${mdCell(row.proposedTruthColor)} | ${mdCell(row.targetPath)} | ${mdCell(row.truthRule)} |`,
    );
  }
  lines.push("");
  lines.push("## Excluded rows");
  lines.push("");
  lines.push("| GEO | Territory | Decision | Reason | Runtime current | Truth target |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of output.excludedRows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.runtimeDecision)} | ${mdCell(row.excludedReason)} | ${mdCell(row.currentRuntimeColor)} | ${mdCell(row.proposedTruthColor)} |`,
    );
  }
  lines.push("");
  lines.push("## Guardrails");
  lines.push("");
  for (const guardrail of output.guardrails) {
    lines.push(`- \`${guardrail}\``);
  }
  lines.push("");
  lines.push("## Hash proof");
  lines.push("");
  lines.push("| File | Exists | SHA-256 |");
  lines.push("| --- | --- | --- |");
  for (const item of output.hashProof) {
    lines.push(`| ${mdCell(item.path)} | ${item.exists ? "TRUE" : "FALSE"} | ${mdCell(item.sha256)} |`);
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This is the current local runtime-safe authorization packet, not an apply operation.");
  lines.push("- It excludes no-op and blocked rows from the future apply set.");
  lines.push("- Safe rows still require explicit authorization and `SSOT_WRITE=1`; no files outside `data/reviews` are changed.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const packet = readJson(AUTHORIZATION_PACKET_PATH);
  const readiness = readJson(RUNTIME_AUTHORIZATION_READINESS_PATH);
  const conflictAudit = readJson(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH);
  const disputedMapping = readJson(DISPUTED_TARGET_MAPPING_PATH);
  const packetRows = Array.isArray(packet.rows) ? packet.rows : [];
  const readinessRows = Array.isArray(readiness.rows) ? readiness.rows : [];
  const packetByGeo = rowsByGeo(packetRows);
  const safeSourceRows = readinessRows.filter((row) =>
    row.decision === "READY_FOR_AUTHORIZED_RUNTIME_AXIS_PATCH"
  );
  const excludedSourceRows = readinessRows.filter((row) =>
    row.decision !== "READY_FOR_AUTHORIZED_RUNTIME_AXIS_PATCH"
  );
  const rows = safeSourceRows.map((row, index) =>
    buildSafeRow(row, packetByGeo.get(normalizeGeo(row.geo)), index + 1)
  );
  const excludedRows = excludedSourceRows.map((row) =>
    buildExcludedRow(row, packetByGeo.get(normalizeGeo(row.geo)))
  );
  const noOpRowsExcluded = excludedRows.filter((row) =>
    row.runtimeDecision === "NO_OP_RUNTIME_ALREADY_TRUTH_TARGET"
  ).length;
  const blockedRowsExcluded = excludedRows.filter((row) =>
    String(row.runtimeDecision || "").startsWith("BLOCKED_")
  ).length;
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    nonMutating: true,
    localOnly: true,
    packetStatus: "RUNTIME_SAFE_AUTHORIZATION_PACKET_READY_NO_MUTATION",
    mutationPolicy:
      "This packet writes only data/reviews outputs. It does not update SSOT, map colors, country JSON, status snapshots, static countries assets, authorization packet inputs, or production.",
    requiredAuthorizationPhrase: packet.requiredAuthorizationPhrase || "EXPLICIT_AUTHORIZATION_REQUIRED",
    requiredEnvironment: {
      SSOT_WRITE: "1",
      productionAllowed: false,
      localOnly: true,
    },
    originalPacketRows: packetRows.length,
    readinessRows: readinessRows.length,
    safeRowsTotal: rows.length,
    excludedRowsTotal: excludedRows.length,
    appliedRows: 0,
    wouldApplyRowsAfterAuthorization: rows.length,
    summary: {
      readyRowsFromReadiness: Number(readiness.summary?.readyForAuthorizedRuntimeAxisPatch || 0),
      noOpRowsExcluded,
      blockedRowsExcluded,
      blockedUnresolvedTargetExcluded: excludedRows.filter((row) =>
        row.runtimeDecision === "BLOCKED_UNRESOLVED_TARGET"
      ).length,
      blockedRuntimeTruthConflictExcluded: excludedRows.filter((row) =>
        row.runtimeDecision === "BLOCKED_RUNTIME_TRUTH_CONFLICT"
      ).length,
      decisionCounts: countBy(readinessRows, (row) => row.decision),
      safeTargetFamilyCounts: countBy(rows, (row) => row.targetFamily),
      safeTargetColorCounts: countBy(rows, (row) => row.proposedTruthColor),
      excludedDecisionCounts: countBy(excludedRows, (row) => row.runtimeDecision),
      directMutationAllowedNow: false,
    },
    linkedAudits: {
      runtimeAuthorizationReadiness: {
        path: relative(RUNTIME_AUTHORIZATION_READINESS_PATH),
        status: readiness.readinessStatus,
      },
      runtimeTruthConflictAudit: {
        path: relative(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH),
        status: conflictAudit.conflictAuditStatus,
        rows: conflictAudit.rowsTotal,
      },
      disputedTargetMapping: {
        path: relative(DISPUTED_TARGET_MAPPING_PATH),
        status: disputedMapping.mappingStatus,
        rows: disputedMapping.rowsTotal,
      },
    },
    guardrails: [
      "ONLY_READY_ROWS_INCLUDED",
      "NO_OP_ROWS_EXCLUDED",
      "BLOCKED_ROWS_EXCLUDED",
      "READY_ROWS_STILL_REQUIRE_EXPLICIT_AUTHORIZATION",
      "NO_RUNTIME_MUTATION_IN_DRY_PACKET",
      "NO_SSOT_OR_MAP_MUTATION",
    ],
    validation: {
      rowsMatchReadinessReadyCount:
        rows.length === Number(readiness.summary?.readyForAuthorizedRuntimeAxisPatch || 0),
      excludedRowsMatchReadinessNonReady:
        excludedRows.length === readinessRows.length - rows.length,
      allSafeRowsReady: rows.every((row) =>
        row.runtimeDecision === "READY_FOR_AUTHORIZED_RUNTIME_AXIS_PATCH"
      ),
      noSafeRowsNoOp: rows.every((row) => row.noOp === false),
      noSafeRowsBlocked: rows.every((row) => row.blockedByReadiness === false),
      allExcludedRowsWouldNotApply: excludedRows.every((row) =>
        row.wouldApplyAfterAuthorization === false
      ),
      allRowsMutationBlockedNow: rows.every((row) => row.targetMutationAllowedNow === false) &&
        excludedRows.every((row) => row.targetMutationAllowedNow === false),
      allSafeRowsRequireAuthorization: rows.every((row) =>
        row.requiresExplicitAuthorization === true
      ),
      appliedRowsZero: true,
      noProdMutation: true,
      noSsotMutation: true,
    },
    hashProof: [
      fileProof(AUTHORIZATION_PACKET_PATH),
      fileProof(RUNTIME_AUTHORIZATION_READINESS_PATH),
      fileProof(RUNTIME_TRUTH_CONFLICT_AUDIT_PATH),
      fileProof(DISPUTED_TARGET_MAPPING_PATH),
    ],
    rows,
    excludedRows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`RUNTIME_SAFE_AUTHORIZATION_PACKET_STATUS=${output.packetStatus}`);
  console.log(`RUNTIME_SAFE_AUTHORIZATION_PACKET_ORIGINAL_ROWS=${output.originalPacketRows}`);
  console.log(`RUNTIME_SAFE_AUTHORIZATION_PACKET_SAFE_ROWS=${output.safeRowsTotal}`);
  console.log(`RUNTIME_SAFE_AUTHORIZATION_PACKET_EXCLUDED_ROWS=${output.excludedRowsTotal}`);
  console.log(`RUNTIME_SAFE_AUTHORIZATION_PACKET_WOULD_APPLY_AFTER_AUTH=${output.wouldApplyRowsAfterAuthorization}`);
  console.log(`RUNTIME_SAFE_AUTHORIZATION_PACKET_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`RUNTIME_SAFE_AUTHORIZATION_PACKET_OUTPUT=${relative(OUT_JSON_PATH)}`);
  console.log(`RUNTIME_SAFE_AUTHORIZATION_PACKET_MARKDOWN=${relative(OUT_MD_PATH)}`);
}

main();

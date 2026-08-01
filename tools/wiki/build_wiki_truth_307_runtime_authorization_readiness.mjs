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
const TARGET_RESOLVER_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-target-resolver.json",
);
const DISPUTED_TARGET_MAPPING_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-disputed-target-mapping.json",
);
const RUNTIME_CURRENT_RECONCILIATION_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-current-reconciliation.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-authorization-readiness.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-authorization-readiness.md",
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

function classifyReadiness(resolverRow) {
  const runtimeMatchesTruth =
    resolverRow.currentRuntimeColor === resolverRow.proposedTruthColor;
  if (!resolverRow.targetResolved) {
    return {
      decision: "BLOCKED_UNRESOLVED_TARGET",
      wouldApplyAfterAuthorization: false,
      requiresFreshLegalAxisReview: true,
      blockingReasons: [
        "TARGET_NOT_RESOLVED",
        "EXPLICIT_TARGET_SELECTION_REQUIRED",
      ],
    };
  }
  if (runtimeMatchesTruth) {
    return {
      decision: "NO_OP_RUNTIME_ALREADY_TRUTH_TARGET",
      wouldApplyAfterAuthorization: false,
      requiresFreshLegalAxisReview: false,
      blockingReasons: [
        "AUTHORIZATION_PACKET_CURRENT_STALE",
        "REFRESH_AUTHORIZATION_PACKET_BEFORE_APPLY",
      ],
    };
  }
  if (resolverRow.packetCurrentMatchesRuntime === false) {
    return {
      decision: "BLOCKED_RUNTIME_TRUTH_CONFLICT",
      wouldApplyAfterAuthorization: false,
      requiresFreshLegalAxisReview: true,
      blockingReasons: [
        "PACKET_CURRENT_COLOR_DIFFERS_FROM_LOCAL_RUNTIME",
        "RUNTIME_TRUTH_TARGET_CONFLICT",
        "FRESH_LEGAL_AXIS_RECONCILIATION_REQUIRED",
      ],
    };
  }
  return {
    decision: "READY_FOR_AUTHORIZED_RUNTIME_AXIS_PATCH",
    wouldApplyAfterAuthorization: true,
    requiresFreshLegalAxisReview: false,
    blockingReasons: [
      "AUTHORIZATION_MISSING",
      "SSOT_WRITE_NOT_ENABLED",
    ],
  };
}

function buildRow(resolverRow, packetByGeo, disputedByGeo, reconciliationByGeo) {
  const geo = normalizeGeo(resolverRow.geo);
  const packetRow = packetByGeo.get(geo) || {};
  const disputedRow = disputedByGeo.get(geo) || null;
  const reconciliationRow = reconciliationByGeo.get(geo) || null;
  const readiness = classifyReadiness(resolverRow);
  return {
    geo,
    territory: resolverRow.territory || packetRow.territory || geo,
    decision: readiness.decision,
    targetFamily: resolverRow.targetFamily,
    targetPath: resolverRow.targetPath || null,
    targetResolved: resolverRow.targetResolved === true,
    packetCurrentColor: resolverRow.packetCurrentColor || packetRow.currentColor || "UNKNOWN",
    currentRuntimeColor: resolverRow.currentRuntimeColor || "UNKNOWN",
    proposedTruthColor: resolverRow.proposedTruthColor || packetRow.proposedTruthColor || "UNKNOWN",
    packetCurrentMatchesRuntime: resolverRow.packetCurrentMatchesRuntime === true,
    currentRuntimeMatchesTruth:
      resolverRow.currentRuntimeColor === resolverRow.proposedTruthColor,
    wouldApplyAfterAuthorization: readiness.wouldApplyAfterAuthorization,
    targetMutationAllowedNow: false,
    requiresExplicitAuthorization: true,
    requiresFreshLegalAxisReview: readiness.requiresFreshLegalAxisReview,
    applyDisposition:
      readiness.decision === "READY_FOR_AUTHORIZED_RUNTIME_AXIS_PATCH"
        ? "PENDING_EXPLICIT_AUTHORIZATION_AND_AXIS_PATCH"
        : readiness.decision,
    truthRule: resolverRow.truthRule || packetRow.truthRule || "UNKNOWN",
    currentRuntimeInput: resolverRow.currentRuntimeInput || null,
    linkedAuditRows: {
      packetIndex: packetRow.packetIndex ?? null,
      transactionId: packetRow.transactionId || null,
      disputedTargetMapping: disputedRow ? disputedRow.targetDecision : null,
      runtimeCurrentReconciliation: reconciliationRow
        ? reconciliationRow.relation
        : null,
    },
    blockingReasons: [
      ...readiness.blockingReasons,
      ...(readiness.wouldApplyAfterAuthorization
        ? []
        : ["NO_RUNTIME_MUTATION_ALLOWED_BY_READINESS_AUDIT"]),
    ],
  };
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Runtime Authorization Readiness");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Readiness status: ${output.readinessStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Local only: ${output.localOnly ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- ready for authorized runtime axis patch: ${output.summary.readyForAuthorizedRuntimeAxisPatch}`);
  lines.push(`- no-op runtime already truth: ${output.summary.noOpRuntimeAlreadyTruthTarget}`);
  lines.push(`- blocked unresolved target: ${output.summary.blockedUnresolvedTarget}`);
  lines.push(`- blocked runtime/truth conflict: ${output.summary.blockedRuntimeTruthConflict}`);
  lines.push(`- would apply after authorization: ${output.summary.wouldApplyRowsAfterAuthorization}`);
  lines.push(`- applied rows now: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| GEO | Territory | Decision | Target | Runtime current | Truth target | Would apply after auth |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.decision)} | ${mdCell(row.targetPath || row.targetFamily)} | ${mdCell(row.currentRuntimeColor)} | ${mdCell(row.proposedTruthColor)} | ${row.wouldApplyAfterAuthorization ? "TRUE" : "FALSE"} |`,
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
  lines.push("- This artifact refreshes authorization readiness against current local runtime evidence.");
  lines.push("- Ready rows still require explicit authorization and `SSOT_WRITE=1`; this artifact never applies them.");
  lines.push("- No-op rows already match the Truth target at runtime and should not be re-applied from stale packet current values.");
  lines.push("- Blocked rows require target selection or fresh legal-axis reconciliation before any future write.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const packet = readJson(AUTHORIZATION_PACKET_PATH);
  const resolver = readJson(TARGET_RESOLVER_PATH);
  const disputed = readJson(DISPUTED_TARGET_MAPPING_PATH);
  const reconciliation = readJson(RUNTIME_CURRENT_RECONCILIATION_PATH);
  const packetRows = Array.isArray(packet.rows) ? packet.rows : [];
  const resolverRows = Array.isArray(resolver.rows) ? resolver.rows : [];
  const packetByGeo = rowsByGeo(packetRows);
  const disputedByGeo = rowsByGeo(disputed.rows || []);
  const reconciliationByGeo = rowsByGeo(reconciliation.rows || []);
  const rows = resolverRows.map((row) =>
    buildRow(row, packetByGeo, disputedByGeo, reconciliationByGeo),
  );
  const decisionCounts = countBy(rows, (row) => row.decision);
  const readyRows = rows.filter((row) => row.decision === "READY_FOR_AUTHORIZED_RUNTIME_AXIS_PATCH");
  const noOpRows = rows.filter((row) => row.decision === "NO_OP_RUNTIME_ALREADY_TRUTH_TARGET");
  const blockedRows = rows.filter((row) => row.decision.startsWith("BLOCKED_"));
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    nonMutating: true,
    localOnly: true,
    readinessStatus: "RUNTIME_AUTHORIZATION_READINESS_READY_NO_MUTATION",
    mutationPolicy:
      "This artifact writes only data/reviews outputs. It does not update SSOT, map colors, country JSON, status snapshots, static countries assets, authorization packet rows, or production.",
    rowsTotal: rows.length,
    authorizationPacketRows: packetRows.length,
    resolverRows: resolverRows.length,
    appliedRows: 0,
    summary: {
      readyForAuthorizedRuntimeAxisPatch: readyRows.length,
      noOpRuntimeAlreadyTruthTarget: noOpRows.length,
      blockedRows: blockedRows.length,
      blockedUnresolvedTarget: Number(decisionCounts.BLOCKED_UNRESOLVED_TARGET || 0),
      blockedRuntimeTruthConflict: Number(decisionCounts.BLOCKED_RUNTIME_TRUTH_CONFLICT || 0),
      wouldApplyRowsAfterAuthorization: readyRows.length,
      directMutationAllowedNow: false,
      requiresExplicitAuthorization: true,
      decisionCounts,
      targetFamilyCounts: countBy(rows, (row) => row.targetFamily),
      proposedTruthColorCounts: countBy(rows, (row) => row.proposedTruthColor),
    },
    guardrails: [
      "READY_ROWS_STILL_REQUIRE_EXPLICIT_AUTHORIZATION",
      "SSOT_WRITE_MUST_BE_ENABLED_FOR_ANY_FUTURE_WRITE",
      "NO_OP_ROWS_MUST_NOT_BE_REAPPLIED_FROM_STALE_PACKET_CURRENT",
      "BLOCKED_ROWS_MUST_NOT_BE_WRITTEN",
      "NO_SSOT_OR_MAP_MUTATION",
    ],
    validation: {
      rowsMatchAuthorizationPacket: rows.length === packetRows.length,
      rowsMatchTargetResolver: rows.length === resolverRows.length,
      decisionCountsAddUp:
        readyRows.length + noOpRows.length + blockedRows.length === rows.length,
      allRowsHaveDecision: rows.every((row) => Boolean(row.decision)),
      allRowsMutationBlockedNow: rows.every((row) => row.targetMutationAllowedNow === false),
      readyRowsWouldApplyAfterAuthorization: readyRows.every((row) => row.wouldApplyAfterAuthorization === true),
      noOpRowsWouldNotApply: noOpRows.every((row) => row.wouldApplyAfterAuthorization === false),
      blockedRowsWouldNotApply: blockedRows.every((row) => row.wouldApplyAfterAuthorization === false),
      blockedRowsHaveBlockingReasons: blockedRows.every((row) => row.blockingReasons.length > 0),
      appliedRowsZero: true,
      requiresExplicitAuthorization: true,
    },
    hashProof: [
      fileProof(AUTHORIZATION_PACKET_PATH),
      fileProof(TARGET_RESOLVER_PATH),
      fileProof(DISPUTED_TARGET_MAPPING_PATH),
      fileProof(RUNTIME_CURRENT_RECONCILIATION_PATH),
    ],
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`RUNTIME_AUTHORIZATION_READINESS_STATUS=${output.readinessStatus}`);
  console.log(`RUNTIME_AUTHORIZATION_READINESS_ROWS=${output.rowsTotal}`);
  console.log(`RUNTIME_AUTHORIZATION_READINESS_READY=${output.summary.readyForAuthorizedRuntimeAxisPatch}`);
  console.log(`RUNTIME_AUTHORIZATION_READINESS_NO_OP=${output.summary.noOpRuntimeAlreadyTruthTarget}`);
  console.log(`RUNTIME_AUTHORIZATION_READINESS_BLOCKED=${output.summary.blockedRows}`);
  console.log(`RUNTIME_AUTHORIZATION_READINESS_WOULD_APPLY_AFTER_AUTH=${output.summary.wouldApplyRowsAfterAuthorization}`);
  console.log(`RUNTIME_AUTHORIZATION_READINESS_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`RUNTIME_AUTHORIZATION_READINESS_OUTPUT=${relative(OUT_JSON_PATH)}`);
  console.log(`RUNTIME_AUTHORIZATION_READINESS_MARKDOWN=${relative(OUT_MD_PATH)}`);
}

main();

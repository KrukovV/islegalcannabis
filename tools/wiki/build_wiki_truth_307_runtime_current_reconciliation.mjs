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
const TRUTH_REPORT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-truth-audit-report.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-current-reconciliation.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-current-reconciliation.md",
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

function classifyReconciliation(row) {
  if (row.currentRuntimeColor === row.proposedTruthColor) {
    return {
      relation: "RUNTIME_ALREADY_AT_TRUTH_TARGET",
      applyDisposition: "NO_OP_AFTER_AUTHORIZATION_PACKET_REFRESH",
      requiresFreshLegalAxisReview: false,
      extraBlockingReasons: ["AUTHORIZATION_PACKET_CURRENT_STALE"],
    };
  }
  return {
    relation: "RUNTIME_DIFFERS_FROM_TRUTH_TARGET",
    applyDisposition: "REQUIRES_FRESH_LEGAL_AXIS_RECONCILIATION_BEFORE_APPLY",
    requiresFreshLegalAxisReview: true,
    extraBlockingReasons: [
      "AUTHORIZATION_PACKET_CURRENT_STALE",
      "RUNTIME_TRUTH_TARGET_CONFLICT",
    ],
  };
}

function buildRow(resolverRow, packetByGeo, truthByGeo) {
  const geo = normalizeGeo(resolverRow.geo);
  const packetRow = packetByGeo.get(geo) || {};
  const truthRow = truthByGeo.get(geo) || {};
  const classification = classifyReconciliation(resolverRow);
  return {
    geo,
    territory: resolverRow.territory || packetRow.territory || truthRow.territory || geo,
    targetFamily: resolverRow.targetFamily,
    targetPath: resolverRow.targetPath || null,
    packetCurrentColor: resolverRow.packetCurrentColor || packetRow.currentColor || "UNKNOWN",
    currentRuntimeColor: resolverRow.currentRuntimeColor || "UNKNOWN",
    proposedTruthColor: resolverRow.proposedTruthColor || packetRow.proposedTruthColor || "UNKNOWN",
    truthRule: resolverRow.truthRule || packetRow.truthRule || truthRow.truthRuleId || "UNKNOWN",
    currentRuntimeInput: resolverRow.currentRuntimeInput || null,
    transition: `${resolverRow.packetCurrentColor || "UNKNOWN"}->${resolverRow.currentRuntimeColor || "UNKNOWN"}`,
    truthTransitionFromRuntime: `${resolverRow.currentRuntimeColor || "UNKNOWN"}->${resolverRow.proposedTruthColor || "UNKNOWN"}`,
    relation: classification.relation,
    applyDisposition: classification.applyDisposition,
    requiresFreshLegalAxisReview: classification.requiresFreshLegalAxisReview,
    targetMutationAllowedNow: false,
    stalePacketCurrent: true,
    packetCurrentMatchesRuntime: false,
    currentRuntimeMatchesTruth: resolverRow.currentRuntimeColor === resolverRow.proposedTruthColor,
    evidencePointers: {
      resolverTargetPath: resolverRow.targetPath || null,
      resolverTargetFamily: resolverRow.targetFamily,
      packetIndex: packetRow.packetIndex ?? null,
      transactionId: packetRow.transactionId || null,
      truthColorStatus: truthRow?.diagnostics?.color?.status || null,
      truthReason: truthRow?.diagnostics?.color?.truth?.reason || null,
    },
    blockingReasons: [
      ...classification.extraBlockingReasons,
      "AUTHORIZATION_MISSING",
      "SSOT_WRITE_NOT_ENABLED",
    ],
  };
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Runtime Current Reconciliation");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Reconciliation status: ${output.reconciliationStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Local only: ${output.localOnly ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- resolver packet-current/runtime mismatches: ${output.summary.resolverPacketCurrentRuntimeMismatches}`);
  lines.push(`- runtime already at truth target: ${output.summary.runtimeAlreadyAtTruthTarget}`);
  lines.push(`- runtime differs from truth target: ${output.summary.runtimeDiffersFromTruthTarget}`);
  lines.push(`- direct mutation allowed now: ${output.summary.directMutationAllowedNow ? "TRUE" : "FALSE"}`);
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| GEO | Territory | Target | Packet current | Runtime current | Truth target | Relation | Disposition |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.targetPath || row.targetFamily)} | ${mdCell(row.packetCurrentColor)} | ${mdCell(row.currentRuntimeColor)} | ${mdCell(row.proposedTruthColor)} | ${mdCell(row.relation)} | ${mdCell(row.applyDisposition)} |`,
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
  lines.push("- This artifact reconciles stale authorization-packet current colors against the current local runtime target resolver.");
  lines.push("- Rows already at the truth target should become no-op after a fresh authorization packet refresh, not be applied blindly.");
  lines.push("- Rows where runtime differs from truth target require a fresh legal-axis review before any authorized write.");
  lines.push("- No SSOT, map, country JSON, status snapshot, static asset, or production file is changed.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const packet = readJson(AUTHORIZATION_PACKET_PATH);
  const resolver = readJson(TARGET_RESOLVER_PATH);
  const truthReport = readJson(TRUTH_REPORT_PATH);
  const resolverMismatches = (resolver.rows || [])
    .filter((row) => row.packetCurrentMatchesRuntime === false)
    .sort((left, right) => normalizeGeo(left.geo).localeCompare(normalizeGeo(right.geo)));
  const packetByGeo = rowsByGeo(packet.rows || []);
  const truthByGeo = rowsByGeo(truthReport.rows || []);
  const rows = resolverMismatches.map((row) => buildRow(row, packetByGeo, truthByGeo));
  const runtimeAlreadyAtTruthTarget = rows.filter((row) => row.currentRuntimeMatchesTruth).length;
  const runtimeDiffersFromTruthTarget = rows.length - runtimeAlreadyAtTruthTarget;
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    nonMutating: true,
    localOnly: true,
    reconciliationStatus: rows.length
      ? "RUNTIME_CURRENT_RECONCILIATION_READY_NO_MUTATION"
      : "RUNTIME_CURRENT_RECONCILIATION_NO_MISMATCHES",
    mutationPolicy:
      "This artifact writes only data/reviews outputs. It does not update SSOT, map colors, country JSON, status snapshots, static countries assets, authorization packet rows, or production.",
    inputTargetResolver: relative(TARGET_RESOLVER_PATH),
    rowsTotal: rows.length,
    appliedRows: 0,
    summary: {
      resolverPacketCurrentRuntimeMismatches: Number(
        resolver?.summary?.packetCurrentRuntimeMismatches || 0,
      ),
      runtimeAlreadyAtTruthTarget,
      runtimeDiffersFromTruthTarget,
      directMutationAllowedNow: false,
      transitionCounts: countBy(rows, (row) => row.transition),
      truthTransitionFromRuntimeCounts: countBy(rows, (row) => row.truthTransitionFromRuntime),
      relationCounts: countBy(rows, (row) => row.relation),
      dispositionCounts: countBy(rows, (row) => row.applyDisposition),
      targetFamilyCounts: countBy(rows, (row) => row.targetFamily),
      proposedTruthColorCounts: countBy(rows, (row) => row.proposedTruthColor),
      geos: rows.map((row) => row.geo),
    },
    guardrails: [
      "PACKET_CURRENT_MUST_MATCH_RUNTIME_BEFORE_AUTHORIZED_WRITE",
      "RUNTIME_ALREADY_AT_TRUTH_TARGET_IS_NO_OP_AFTER_PACKET_REFRESH",
      "RUNTIME_TRUTH_TARGET_CONFLICT_REQUIRES_FRESH_LEGAL_AXIS_REVIEW",
      "NO_COLOR_APPLICATION_WITHOUT_EXPLICIT_AUTHORIZATION",
      "NO_SSOT_OR_MAP_MUTATION",
    ],
    validation: {
      rowsMatchResolverMismatches:
        rows.length === Number(resolver?.summary?.packetCurrentRuntimeMismatches || 0),
      allRowsMarkPacketCurrentStale: rows.every((row) => row.stalePacketCurrent === true),
      allRowsMutationBlocked: rows.every((row) => row.targetMutationAllowedNow === false),
      allRowsHaveDisposition: rows.every((row) => Boolean(row.applyDisposition)),
      noRowsApplied: rows.every((row) => row.targetMutationAllowedNow === false),
      relationCountsAddUp:
        runtimeAlreadyAtTruthTarget + runtimeDiffersFromTruthTarget === rows.length,
    },
    hashProof: [
      fileProof(AUTHORIZATION_PACKET_PATH),
      fileProof(TARGET_RESOLVER_PATH),
      fileProof(TRUTH_REPORT_PATH),
    ],
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`RUNTIME_CURRENT_RECONCILIATION_STATUS=${output.reconciliationStatus}`);
  console.log(`RUNTIME_CURRENT_RECONCILIATION_ROWS=${output.rowsTotal}`);
  console.log(`RUNTIME_CURRENT_RECONCILIATION_RUNTIME_ALREADY_TRUTH=${output.summary.runtimeAlreadyAtTruthTarget}`);
  console.log(`RUNTIME_CURRENT_RECONCILIATION_RUNTIME_DIFFERS_FROM_TRUTH=${output.summary.runtimeDiffersFromTruthTarget}`);
  console.log(`RUNTIME_CURRENT_RECONCILIATION_MUTATION_ALLOWED=${output.summary.directMutationAllowedNow ? "TRUE" : "FALSE"}`);
  console.log(`RUNTIME_CURRENT_RECONCILIATION_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`RUNTIME_CURRENT_RECONCILIATION_OUTPUT=${relative(OUT_JSON_PATH)}`);
  console.log(`RUNTIME_CURRENT_RECONCILIATION_MARKDOWN=${relative(OUT_MD_PATH)}`);
}

main();

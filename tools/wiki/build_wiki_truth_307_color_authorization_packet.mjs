#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const COLOR_APPLY_PLAN_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-plan.json",
);
const COLOR_APPLY_GATE_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-gate.json",
);
const COLOR_REVIEW_DOSSIER_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-review-dossier.json",
);
const PRIMARY_LAW_BLOCKERS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-primary-law-blockers.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-authorization-packet.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-authorization-packet.md",
);

const ALLOWED_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
const AUTHORIZATION_PHRASE_PREFIX = "I_AUTHORIZE_TRUTH_FIRST_COLOR_APPLY";
const PROTECTED_TARGET_PATHS = [
  "data/status-engine/status_snapshot_after.json",
  "data/index.json",
  "data/ssot_diffs.json",
  "cache/ssot_diff_pending.json",
  "cache/ssot_diff_cache.json",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
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

function protectedTargetHashProof() {
  return PROTECTED_TARGET_PATHS.map((relativePath) => {
    const filePath = path.join(ROOT, relativePath);
    const exists = fs.existsSync(filePath);
    return {
      path: relativePath,
      exists,
      sha256: exists ? sha256File(filePath) : null,
    };
  });
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "UNKNOWN";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function mdCell(value, limit = 260) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const trimmed = text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function transactionId(row) {
  return sha256Text(
    [
      row.geo,
      row.currentColor,
      row.proposedTruthColor,
      row.applyDisposition,
      row.truthRule,
      row.legalBasisClass,
    ].join("|"),
  ).slice(0, 16);
}

function targetMutationClass(row) {
  if (row.proposedTruthColor === "UNKNOWN") {
    return "AUTHORIZED_UNCOLOR_SCOPE_EXCEPTION";
  }
  return "AUTHORIZED_SSOT_MAP_COLOR_UPDATE";
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Color Authorization Packet");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Packet status: ${output.packetStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Local only: ${output.localOnly ? "TRUE" : "FALSE"}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push(`Required authorization phrase: \`${output.requiredAuthorizationPhrase}\``);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- color transitions: \`${JSON.stringify(output.counts.colorTransition)}\``);
  lines.push(`- target colors: \`${JSON.stringify(output.counts.targetColor)}\``);
  lines.push(`- legal basis: \`${JSON.stringify(output.counts.legalBasisClass)}\``);
  lines.push(`- transaction class: \`${JSON.stringify(output.counts.targetMutationClass)}\``);
  lines.push("");
  lines.push("## Input artifact hashes");
  lines.push("");
  lines.push("| Artifact | Exists | SHA-256 |");
  lines.push("| --- | --- | --- |");
  for (const item of output.inputHashProof) {
    lines.push(`| ${mdCell(item.path)} | ${item.exists ? "TRUE" : "FALSE"} | ${mdCell(item.sha256 || "-")} |`);
  }
  lines.push("");
  lines.push("## Protected target hash proof");
  lines.push("");
  lines.push("| Target | Exists | SHA-256 before authorization |");
  lines.push("| --- | --- | --- |");
  for (const item of output.protectedTargetHashProof) {
    lines.push(`| ${mdCell(item.path)} | ${item.exists ? "TRUE" : "FALSE"} | ${mdCell(item.sha256 || "-")} |`);
  }
  lines.push("");
  lines.push("## Transactions");
  lines.push("");
  lines.push("| # | GEO | Territory | Current | Truth target | Class | Legal basis | Rule |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${row.packetIndex} | ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.currentColor)} | ${mdCell(row.proposedTruthColor)} | ${mdCell(row.targetMutationClass)} | ${mdCell(row.legalBasisClass)} | ${mdCell(row.truthRule)} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This packet is authorization-ready, not applied.");
  lines.push("- It writes only `data/reviews/` artifacts and hashes protected targets before any authorized apply path.");
  lines.push("- It must not be used as automatic permission. A future apply step still requires explicit authorization and `SSOT_WRITE=1`.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const applyPlan = readJson(COLOR_APPLY_PLAN_PATH);
  const applyGate = readJson(COLOR_APPLY_GATE_PATH);
  const reviewDossier = readJson(COLOR_REVIEW_DOSSIER_PATH);
  const primaryLawBlockers = readJson(PRIMARY_LAW_BLOCKERS_PATH);
  const planRows = Array.isArray(applyPlan.rows) ? applyPlan.rows : [];
  const gateRows = Array.isArray(applyGate.rows) ? applyGate.rows : [];
  const dossierRows = Array.isArray(reviewDossier.rows) ? reviewDossier.rows : [];
  const blockerRows = Array.isArray(primaryLawBlockers.blockers)
    ? primaryLawBlockers.blockers
    : [];
  const gateByGeo = new Map(gateRows.map((row) => [row.geo, row]));
  const planByGeo = new Map(planRows.map((row) => [row.geo, row]));
  const transactions = dossierRows.map((row, index) => {
    const gateRow = gateByGeo.get(row.geo) || {};
    const planRow = planByGeo.get(row.geo) || {};
    const targetClass = targetMutationClass(row);
    return {
      packetIndex: index + 1,
      transactionId: transactionId(row),
      geo: String(row.geo || ""),
      territory: String(row.territory || ""),
      currentColor: String(row.currentColor || "UNKNOWN"),
      proposedTruthColor: String(row.proposedTruthColor || "UNKNOWN"),
      proposalAction: String(row.proposalAction || "UNKNOWN"),
      applyDisposition: String(row.applyDisposition || "UNKNOWN"),
      targetMutationClass: targetClass,
      legalBasisClass: String(row.legalBasisClass || "UNKNOWN"),
      evidenceCoverage: String(row.evidenceCoverage || "UNKNOWN"),
      truthRule: String(row.truthRule || "UNKNOWN"),
      truthReason: String(row.truthReason || ""),
      currentReason: String(row.currentReason || ""),
      reviewDecision: String(row.reviewDecision || "UNKNOWN"),
      gateDecision: String(gateRow.gateDecision || row.gateDecision || "UNKNOWN"),
      gateReasons: Array.isArray(gateRow.gateReasons)
        ? gateRow.gateReasons.map(String)
        : [],
      blockedByPrimaryLaw: row.blockedByPrimaryLaw === true,
      planIndex: Number(planRow.planIndex || row.reviewIndex || 0),
    };
  });

  const validation = {
    rowsMatchPlan: transactions.length === planRows.length,
    rowsMatchGate: transactions.length === gateRows.length,
    rowsMatchDossier: transactions.length === dossierRows.length,
    geosMatchPlan:
      JSON.stringify(transactions.map((row) => row.geo).sort()) ===
      JSON.stringify(planRows.map((row) => row.geo).sort()),
    geosMatchGate:
      JSON.stringify(transactions.map((row) => row.geo).sort()) ===
      JSON.stringify(gateRows.map((row) => row.geo).sort()),
    allRowsReviewReady: transactions.every((row) =>
      row.reviewDecision === "REVIEW_READY_PENDING_AUTHORIZATION" ||
      row.reviewDecision === "REVIEW_SCOPE_EXCEPTION_PROVEN_PENDING_AUTHORIZATION",
    ),
    allRowsGateBlockedFailClosed: transactions.every((row) =>
      row.gateDecision === "BLOCKED" &&
      row.gateReasons.includes("AUTHORIZATION_MISSING") &&
      row.gateReasons.includes("SSOT_WRITE_NOT_ENABLED"),
    ),
    noPrimaryLawBlockers: blockerRows.length === 0,
    noRowsBlockedByPrimaryLaw: transactions.every((row) => row.blockedByPrimaryLaw === false),
    allowedColorsOnly: transactions.every((row) =>
      ALLOWED_COLORS.has(row.currentColor) && ALLOWED_COLORS.has(row.proposedTruthColor),
    ),
    nonMutatingInputs:
      applyPlan.nonMutating === true &&
      applyGate.nonMutating === true &&
      reviewDossier.nonMutating === true &&
      primaryLawBlockers.nonMutating === true,
    localOnlyInputs:
      applyGate.localOnly === true &&
      reviewDossier.localOnly === true,
    appliedRowsZero:
      Number(applyPlan.appliedRows || 0) === 0 &&
      Number(applyGate.appliedRows || 0) === 0 &&
      Number(reviewDossier.appliedRows || 0) === 0,
    requiresExplicitAuthorization:
      applyPlan.requiresExplicitAuthorization === true &&
      applyPlan.safeToAutoApply === false &&
      applyGate.authorization?.present === false &&
      applyGate.environment?.ssotWriteEnabled === false,
  };
  const packetReady = Object.values(validation).every(Boolean);
  const inputHashProof = [
    fileProof(COLOR_APPLY_PLAN_PATH),
    fileProof(COLOR_APPLY_GATE_PATH),
    fileProof(COLOR_REVIEW_DOSSIER_PATH),
    fileProof(PRIMARY_LAW_BLOCKERS_PATH),
  ];
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    nonMutating: true,
    localOnly: true,
    packetStatus: packetReady
      ? "AUTHORIZATION_PACKET_READY_PENDING_EXPLICIT_APPROVAL"
      : "AUTHORIZATION_PACKET_INCOMPLETE",
    mutationPolicy:
      "This packet is a non-mutating local authorization artifact. It does not update SSOT, map, production, status, color, source, or cache files.",
    requiredAuthorizationPhrase:
      `${AUTHORIZATION_PHRASE_PREFIX}_${transactions.length}_ROWS`,
    requiredEnvironment: {
      ssotWriteEnv: "SSOT_WRITE",
      ssotWriteRequiredValue: "1",
      authorizationEnv: "TRUTH_FIRST_COLOR_APPLY_AUTHORIZATION",
      productionTouched: false,
    },
    inputs: {
      colorApplyPlan: relative(COLOR_APPLY_PLAN_PATH),
      colorApplyGate: relative(COLOR_APPLY_GATE_PATH),
      colorReviewDossier: relative(COLOR_REVIEW_DOSSIER_PATH),
      primaryLawBlockers: relative(PRIMARY_LAW_BLOCKERS_PATH),
    },
    inputHashProof,
    protectedTargetHashProof: protectedTargetHashProof(),
    rowsTotal: transactions.length,
    appliedRows: 0,
    wouldApplyRowsAfterAuthorization: transactions.length,
    counts: {
      colorTransition: countBy(
        transactions,
        (row) => `${row.currentColor}->${row.proposedTruthColor}`,
      ),
      targetColor: countBy(transactions, (row) => row.proposedTruthColor),
      proposalAction: countBy(transactions, (row) => row.proposalAction),
      legalBasisClass: countBy(transactions, (row) => row.legalBasisClass),
      targetMutationClass: countBy(transactions, (row) => row.targetMutationClass),
      reviewDecision: countBy(transactions, (row) => row.reviewDecision),
    },
    validation,
    rows: transactions,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`COLOR_AUTHORIZATION_PACKET_STATUS=${output.packetStatus}`);
  console.log(`COLOR_AUTHORIZATION_PACKET_ROWS=${output.rowsTotal}`);
  console.log(`COLOR_AUTHORIZATION_PACKET_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`COLOR_AUTHORIZATION_PACKET_COMPLETE=${packetReady ? "TRUE" : "FALSE"}`);
  console.log(`COLOR_AUTHORIZATION_PACKET_OUTPUT=${relative(OUT_JSON_PATH)}`);
  console.log(`COLOR_AUTHORIZATION_PACKET_MARKDOWN=${relative(OUT_MD_PATH)}`);
}

main();

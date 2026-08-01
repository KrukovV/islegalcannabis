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
const PRIMARY_LAW_BLOCKERS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-primary-law-blockers.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-gate.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-gate.md",
);
const AUTHORIZATION_PHRASE_PREFIX = "I_AUTHORIZE_TRUTH_FIRST_COLOR_APPLY";

const PROTECTED_PATHS = [
  "data/status-engine/status_snapshot_after.json",
  "data/index.json",
  "data/ssot_diffs.json",
  "cache/ssot_diff_pending.json",
  "cache/ssot_diff_cache.json",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function protectedHashProof() {
  return PROTECTED_PATHS.map((relativePath) => {
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

function mdCell(value, limit = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const trimmed = text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Color Apply Gate");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Gate status: ${output.gateStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Local only: ${output.localOnly ? "TRUE" : "FALSE"}`);
  lines.push(`Authorization present: ${output.authorization.present ? "TRUE" : "FALSE"}`);
  lines.push(`SSOT_WRITE enabled: ${output.environment.ssotWriteEnabled ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push("");
  lines.push("## Blocking reasons");
  lines.push("");
  for (const reason of output.blockingReasons) {
    lines.push(`- \`${reason}\``);
  }
  lines.push("");
  lines.push("## Protected path hash proof");
  lines.push("");
  lines.push("| Path | Exists | SHA-256 |");
  lines.push("| --- | --- | --- |");
  for (const item of output.protectedHashProof) {
    lines.push(`| ${mdCell(item.path)} | ${item.exists ? "TRUE" : "FALSE"} | ${mdCell(item.sha256 || "-")} |`);
  }
  lines.push("");
  lines.push("## Gate rows");
  lines.push("");
  lines.push("| GEO | Territory | Disposition | Gate decision | Gate reasons |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.applyDisposition)} | ${mdCell(row.gateDecision)} | ${mdCell(row.gateReasons.join(", "))} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This is a fail-closed local gate. It proves the current default path cannot apply SSOT/map/prod changes.");
  lines.push("- Even explicit authorization is insufficient while primary-law blockers remain.");
  lines.push("- This artifact only hashes protected targets and writes review output under `data/reviews/`.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const applyPlan = readJson(COLOR_APPLY_PLAN_PATH);
  const primaryLawBlockers = readJsonIfExists(PRIMARY_LAW_BLOCKERS_PATH);
  const planRows = Array.isArray(applyPlan.rows) ? applyPlan.rows : [];
  const AUTHORIZATION_PHRASE = `${AUTHORIZATION_PHRASE_PREFIX}_${planRows.length}_ROWS`;
  const blockerGeos = new Set(
    (Array.isArray(primaryLawBlockers?.blockers) ? primaryLawBlockers.blockers : [])
      .map((blocker) => String(blocker.geo || ""))
      .filter(Boolean),
  );
  const ssotWriteEnabled = process.env.SSOT_WRITE === "1";
  const authorizationValue = String(
    process.env.TRUTH_FIRST_COLOR_APPLY_AUTHORIZATION || "",
  );
  const authorizationPresent = authorizationValue === AUTHORIZATION_PHRASE;
  const blockingReasons = [];
  if (!authorizationPresent) blockingReasons.push("AUTHORIZATION_MISSING");
  if (!ssotWriteEnabled) blockingReasons.push("SSOT_WRITE_NOT_ENABLED");
  if (blockerGeos.size) blockingReasons.push("PRIMARY_LAW_BLOCKERS_PRESENT");
  if (applyPlan.applyStatus !== "PENDING_AUTHORIZATION") {
    blockingReasons.push("APPLY_PLAN_NOT_PENDING_AUTHORIZATION");
  }
  if (applyPlan.nonMutating !== true) {
    blockingReasons.push("APPLY_PLAN_NOT_NON_MUTATING");
  }
  if (applyPlan.safeToAutoApply !== false) {
    blockingReasons.push("APPLY_PLAN_SAFE_TO_AUTO_APPLY_NOT_FALSE");
  }

  const globalGateOpen =
    authorizationPresent &&
    ssotWriteEnabled &&
    blockerGeos.size === 0 &&
    applyPlan.applyStatus === "PENDING_AUTHORIZATION" &&
    applyPlan.nonMutating === true &&
    applyPlan.safeToAutoApply === false;
  const rows = planRows.map((row) => {
    const gateReasons = [];
    if (!authorizationPresent) gateReasons.push("AUTHORIZATION_MISSING");
    if (!ssotWriteEnabled) gateReasons.push("SSOT_WRITE_NOT_ENABLED");
    if (blockerGeos.has(row.geo)) gateReasons.push("PRIMARY_LAW_BLOCKER");
    if (row.applyDisposition === "PENDING_UNCOLOR_SCOPE_REVIEW") {
      gateReasons.push("UNCOLOR_SCOPE_REVIEW_REQUIRED");
    }
    if (row.applyDisposition === "BLOCKED_PRIMARY_LAW_PROOF") {
      gateReasons.push("PRIMARY_LAW_PROOF_REQUIRED");
    }
    return {
      planIndex: Number(row.planIndex || 0),
      geo: String(row.geo || ""),
      territory: String(row.territory || ""),
      currentColor: String(row.currentColor || "UNKNOWN"),
      proposedTruthColor: String(row.proposedTruthColor || "UNKNOWN"),
      applyDisposition: String(row.applyDisposition || "UNKNOWN"),
      gateDecision: globalGateOpen && gateReasons.length === 0 ? "WOULD_APPLY_AFTER_AUTHORIZATION" : "BLOCKED",
      gateReasons,
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.2.0",
    inputColorApplyPlan: path.relative(ROOT, COLOR_APPLY_PLAN_PATH),
    inputPrimaryLawBlockers: primaryLawBlockers
      ? path.relative(ROOT, PRIMARY_LAW_BLOCKERS_PATH)
      : null,
    nonMutating: true,
    localOnly: true,
    gateStatus: globalGateOpen ? "READY_FOR_AUTHORIZED_LOCAL_APPLY" : "BLOCKED_FAIL_CLOSED",
    mutationAttempted: false,
    ssotMutationAttempted: false,
    mapMutationAttempted: false,
    productionTouched: false,
    appliedRows: 0,
    wouldApplyRows: globalGateOpen
      ? rows.filter((row) => row.gateDecision === "WOULD_APPLY_AFTER_AUTHORIZATION").length
      : 0,
    blockedRows: rows.filter((row) => row.gateDecision === "BLOCKED").length,
    blockingReasons,
    requiredAuthorizationPhrase: AUTHORIZATION_PHRASE,
    authorization: {
      env: "TRUTH_FIRST_COLOR_APPLY_AUTHORIZATION",
      present: authorizationPresent,
      accepted: authorizationPresent,
    },
    environment: {
      ssotWriteEnabled,
      ssotWriteEnv: "SSOT_WRITE",
      nodeEnv: process.env.NODE_ENV || "",
    },
    primaryLawBlockers: {
      total: blockerGeos.size,
      geos: [...blockerGeos].sort(),
    },
    counts: {
      gateDecision: countBy(rows, (row) => row.gateDecision),
      gateReasons: countBy(
        rows.flatMap((row) => row.gateReasons.map((reason) => ({ reason }))),
        (row) => row.reason,
      ),
      applyDisposition: countBy(rows, (row) => row.applyDisposition),
    },
    protectedHashProof: protectedHashProof(),
    validation: {
      planRows: planRows.length,
      gateRows: rows.length,
      rowsMatchPlan: rows.length === planRows.length,
      appliedRowsZero: true,
      mutationAttemptedFalse: true,
      productionTouchedFalse: true,
      failClosedByDefault: !authorizationPresent && !ssotWriteEnabled,
      primaryLawBlocksReflected: blockerGeos.size > 0,
    },
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`COLOR_APPLY_GATE_STATUS=${output.gateStatus}`);
  console.log(`COLOR_APPLY_GATE_ROWS=${output.rows.length}`);
  console.log(`COLOR_APPLY_GATE_NON_MUTATING=${output.nonMutating ? 1 : 0}`);
  console.log(`COLOR_APPLY_GATE_AUTHORIZATION=${output.authorization.present ? 1 : 0}`);
  console.log(`COLOR_APPLY_GATE_SSOT_WRITE=${output.environment.ssotWriteEnabled ? 1 : 0}`);
  console.log(`COLOR_APPLY_GATE_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`COLOR_APPLY_GATE_PRIMARY_LAW_BLOCKERS=${output.primaryLawBlockers.geos.join(",")}`);
  console.log(`COLOR_APPLY_GATE_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`COLOR_APPLY_GATE_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
}

main();

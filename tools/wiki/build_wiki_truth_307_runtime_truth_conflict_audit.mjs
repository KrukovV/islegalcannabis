#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const RUNTIME_AUTHORIZATION_READINESS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-authorization-readiness.json",
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
  "data/reviews/wiki-truth-307-runtime-truth-conflict-audit.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-truth-conflict-audit.md",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath, fallback = null) {
  return fs.existsSync(filePath) ? readJson(filePath) : fallback;
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

function loadCountryJson(targetPath) {
  const filePath = path.join(ROOT, targetPath || "");
  if (!targetPath || !fs.existsSync(filePath)) return null;
  return readJsonIfExists(filePath);
}

function countryJsonSummary(countryJson) {
  if (!countryJson) return null;
  return {
    code: countryJson.code || null,
    geoCode: countryJson.geo_code || null,
    sourceLegal: countryJson.sources?.legal || null,
    recreationalStatus: countryJson.legal_model?.recreational?.status || null,
    medicalStatus: countryJson.legal_model?.medical?.status || null,
    medicalScope: countryJson.legal_model?.medical?.scope || null,
    distributionStatus: countryJson.legal_model?.distribution?.status || null,
    notes: countryJson.notes_normalized || null,
  };
}

function buildRow(readinessRow, resolverByGeo, truthByGeo) {
  const geo = normalizeGeo(readinessRow.geo);
  const resolverRow = resolverByGeo.get(geo) || {};
  const truthRow = truthByGeo.get(geo) || {};
  const targetPath = readinessRow.targetPath || resolverRow.targetPath || null;
  const countryJson = loadCountryJson(targetPath);
  const officialStatus = truthRow?.diagnostics?.officialInterpretation?.official || {};
  const legalInterpretation = truthRow?.diagnostics?.officialInterpretation?.legalInterpretation || {};
  const evidence = truthRow?.diagnostics?.evidence || {};
  const currentRuntimeInput = readinessRow.currentRuntimeInput || resolverRow.currentRuntimeInput || {};
  const runtimeSource = currentRuntimeInput.source || "UNKNOWN";
  const runtimeMedical = currentRuntimeInput.medical || null;
  const officialTruthColor = readinessRow.proposedTruthColor || resolverRow.proposedTruthColor || "UNKNOWN";
  const currentRuntimeColor = readinessRow.currentRuntimeColor || resolverRow.currentRuntimeColor || "UNKNOWN";
  const conflictClass =
    currentRuntimeColor === "GREEN" && officialTruthColor === "YELLOW"
      ? "POTENTIAL_FALSE_GREEN_OR_FALSE_YELLOW_REQUIRES_AXIS_REFRESH"
      : "RUNTIME_TRUTH_COLOR_CONFLICT_REQUIRES_AXIS_REFRESH";
  const officialSources = Object.entries(evidence.officialLinks || {})
    .flatMap(([evidenceClass, items]) =>
      (Array.isArray(items) ? items : []).map((item) => ({
        title: item.title,
        url: item.url,
        sourceKind: item.sourceKind,
        evidenceClass: String(evidenceClass).toUpperCase(),
      })),
    )
    .filter((item) => item.url);
  return {
    geo,
    territory: readinessRow.territory || resolverRow.territory || truthRow.territory || geo,
    conflictClass,
    currentRuntimeColor,
    officialTruthTargetColor: officialTruthColor,
    targetPath,
    targetFamily: readinessRow.targetFamily || resolverRow.targetFamily || "UNKNOWN",
    runtimeSource,
    runtimeMedical,
    truthRule: readinessRow.truthRule || resolverRow.truthRule || truthRow?.diagnostics?.color?.truth?.ruleId || "UNKNOWN",
    officialStatus: {
      recreational: officialStatus.recreational || null,
      medical: officialStatus.medical || null,
      enforcement: officialStatus.enforcement || null,
    },
    legalInterpretation: {
      recreational: legalInterpretation.recreational || null,
      medical: legalInterpretation.medical || null,
      enforcement: legalInterpretation.enforcement || null,
    },
    countryJson: countryJsonSummary(countryJson),
    officialEvidence: {
      differenceStatus: evidence.differenceStatus || null,
      differenceDescription: evidence.differenceDescription || null,
      sources: officialSources.slice(0, 12),
      directSources: officialSources
        .filter((item) => item.evidenceClass === "DIRECT")
        .slice(0, 5),
      sourceCount: officialSources.length,
      evidenceClassCounts: countBy(officialSources, (item) => item.evidenceClass),
    },
    axisRefreshRequired: {
      patient_access: "RECHECK_REQUIRED",
      dispensing: "RECHECK_REQUIRED",
      registry: "RECHECK_REQUIRED",
      product_limits: "RECHECK_REQUIRED",
      operational_status: "RECHECK_REQUIRED",
    },
    recommendation:
      "Do not write color from either side yet. Refresh detailed legal axes from official evidence, then rerun truth color derivation before any authorized runtime patch.",
    targetMutationAllowedNow: false,
    blockingReasons: [
      "RUNTIME_TRUTH_TARGET_CONFLICT",
      "POTENTIAL_FALSE_GREEN_RISK",
      "POTENTIAL_FALSE_YELLOW_RISK",
      "FRESH_LEGAL_AXIS_RECONCILIATION_REQUIRED",
      "NO_RUNTIME_MUTATION_ALLOWED_BY_CONFLICT_AUDIT",
    ],
  };
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Runtime Truth Conflict Audit");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Conflict audit status: ${output.conflictAuditStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Local only: ${output.localOnly ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- runtime/truth conflict rows: ${output.summary.runtimeTruthConflictRows}`);
  lines.push(`- current runtime GREEN vs truth YELLOW: ${output.summary.currentRuntimeGreenTruthYellow}`);
  lines.push(`- target mutation allowed now: ${output.summary.directMutationAllowedNow ? "TRUE" : "FALSE"}`);
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| GEO | Territory | Runtime | Truth target | Target | Conflict class | Recommendation |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.currentRuntimeColor)} | ${mdCell(row.officialTruthTargetColor)} | ${mdCell(row.targetPath)} | ${mdCell(row.conflictClass)} | ${mdCell(row.recommendation)} |`,
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
  lines.push("- This artifact does not decide whether runtime GREEN or Truth YELLOW is correct.");
  lines.push("- It proves those rows are not safe to write until patient-access, dispensing, registry, product-limit, and operational-status axes are refreshed from official evidence.");
  lines.push("- This keeps the no-false-green rule honest without accidentally freezing a false-yellow result.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const readiness = readJson(RUNTIME_AUTHORIZATION_READINESS_PATH);
  const resolver = readJson(TARGET_RESOLVER_PATH);
  const truthReport = readJson(TRUTH_REPORT_PATH);
  const readinessRows = Array.isArray(readiness.rows) ? readiness.rows : [];
  const conflictRows = readinessRows
    .filter((row) => row.decision === "BLOCKED_RUNTIME_TRUTH_CONFLICT")
    .sort((left, right) => normalizeGeo(left.geo).localeCompare(normalizeGeo(right.geo)));
  const rows = conflictRows.map((row) =>
    buildRow(row, rowsByGeo(resolver.rows || []), rowsByGeo(truthReport.rows || [])),
  );
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    nonMutating: true,
    localOnly: true,
    conflictAuditStatus: "RUNTIME_TRUTH_CONFLICT_AUDIT_READY_NO_MUTATION",
    mutationPolicy:
      "This artifact writes only data/reviews outputs. It does not update SSOT, map colors, country JSON, status snapshots, static countries assets, authorization packet rows, or production.",
    rowsTotal: rows.length,
    appliedRows: 0,
    summary: {
      runtimeTruthConflictRows: rows.length,
      currentRuntimeGreenTruthYellow: rows.filter((row) =>
        row.currentRuntimeColor === "GREEN" &&
        row.officialTruthTargetColor === "YELLOW"
      ).length,
      allRequireAxisRefresh: rows.every((row) =>
        Object.values(row.axisRefreshRequired).every((value) => value === "RECHECK_REQUIRED")
      ),
      directMutationAllowedNow: false,
      conflictClassCounts: countBy(rows, (row) => row.conflictClass),
      runtimeSourceCounts: countBy(rows, (row) => row.runtimeSource),
      targetFamilyCounts: countBy(rows, (row) => row.targetFamily),
      geos: rows.map((row) => row.geo),
    },
    guardrails: [
      "NO_FALSE_GREEN_WRITE_FROM_RUNTIME_COUNTRY_JSON",
      "NO_FALSE_YELLOW_FREEZE_FROM_UNDERSPECIFIED_TRUTH_AXIS",
      "REFRESH_PATIENT_ACCESS_DISPENSING_REGISTRY_PRODUCT_LIMITS_BEFORE_WRITE",
      "BLOCKED_ROWS_MUST_NOT_BE_WRITTEN",
      "NO_SSOT_OR_MAP_MUTATION",
    ],
    validation: {
      rowsMatchReadinessBlockedRuntimeTruthConflict:
        rows.length === Number(readiness.summary?.blockedRuntimeTruthConflict || 0),
      allRowsRuntimeGreenTruthYellow: rows.every((row) =>
        row.currentRuntimeColor === "GREEN" &&
        row.officialTruthTargetColor === "YELLOW"
      ),
      allRowsMutationBlocked: rows.every((row) => row.targetMutationAllowedNow === false),
      allRowsRequireAxisRefresh: rows.every((row) =>
        Object.values(row.axisRefreshRequired).every((value) => value === "RECHECK_REQUIRED")
      ),
      allRowsHaveOfficialEvidence: rows.every(
        (row) => row.officialEvidence.sourceCount > 0,
      ),
      appliedRowsZero: true,
    },
    hashProof: [
      fileProof(RUNTIME_AUTHORIZATION_READINESS_PATH),
      fileProof(TARGET_RESOLVER_PATH),
      fileProof(TRUTH_REPORT_PATH),
      ...rows.map((row) => fileProof(path.join(ROOT, row.targetPath || ""))),
    ],
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`RUNTIME_TRUTH_CONFLICT_AUDIT_STATUS=${output.conflictAuditStatus}`);
  console.log(`RUNTIME_TRUTH_CONFLICT_AUDIT_ROWS=${output.rowsTotal}`);
  console.log(`RUNTIME_TRUTH_CONFLICT_AUDIT_GREEN_VS_YELLOW=${output.summary.currentRuntimeGreenTruthYellow}`);
  console.log(`RUNTIME_TRUTH_CONFLICT_AUDIT_MUTATION_ALLOWED=${output.summary.directMutationAllowedNow ? "TRUE" : "FALSE"}`);
  console.log(`RUNTIME_TRUTH_CONFLICT_AUDIT_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`RUNTIME_TRUTH_CONFLICT_AUDIT_OUTPUT=${relative(OUT_JSON_PATH)}`);
  console.log(`RUNTIME_TRUTH_CONFLICT_AUDIT_MARKDOWN=${relative(OUT_MD_PATH)}`);
}

main();

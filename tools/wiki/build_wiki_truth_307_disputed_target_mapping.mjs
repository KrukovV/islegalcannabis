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
const MATRIX_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-cannabis-law-matrix-307.json",
);
const DISPUTED_GEO_SOURCES_PATH = path.join(
  ROOT,
  "apps/web/src/lib/disputedGeoSources.ts",
);
const STATUS_V9_PATH = path.join(ROOT, "data/status-engine/status_ssot_v9.json");
const MANUAL_OVERRIDES_PATH = path.join(
  ROOT,
  "data/status-engine/manual_review_overrides.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-disputed-target-mapping.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-disputed-target-mapping.md",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath, fallback) {
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

function parseDisputedMappings() {
  const source = fs.readFileSync(DISPUTED_GEO_SOURCES_PATH, "utf8");
  const entries = {};
  const entryPattern = /^\s*([A-Z0-9-]{2,8}):\s*\{([\s\S]*?)^\s*\},?/gm;
  for (const match of source.matchAll(entryPattern)) {
    const geo = normalizeGeo(match[1]);
    const body = match[2] || "";
    const claimantMatch = body.match(/claimantGeoCodes:\s*\[([^\]]*)\]/m);
    const claimantGeoCodes = claimantMatch
      ? [...claimantMatch[1].matchAll(/"([^"]+)"/g)].map((item) => normalizeGeo(item[1]))
      : [];
    const wikiMatch = body.match(/territoryWikiUrl:\s*"([^"]+)"/m);
    const displayMatch = body.match(/displayName:\s*"([^"]+)"/m);
    const noteMatch = body.match(/jurisdictionNote:\s*"([^"]+)"/m);
    entries[geo] = {
      geo,
      displayName: displayMatch?.[1] || null,
      territoryWikiUrl: wikiMatch?.[1] || null,
      claimantGeoCodes,
      jurisdictionNote: noteMatch?.[1] || null,
    };
  }
  return entries;
}

function rowsByGeo(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const geo = normalizeGeo(row?.geo || row?.id);
    if (geo) map.set(geo, row);
  }
  return map;
}

function statusV9ByGeo(statusV9) {
  const rows = Array.isArray(statusV9?.entries)
    ? statusV9.entries
    : Object.values(statusV9?.entries || {});
  return rowsByGeo(rows);
}

function getNestedText(row) {
  return compact([
    row?.diagnostics?.evidence?.differenceDescription,
    row?.diagnostics?.evidence?.differenceStatus,
    row?.diagnostics?.officialInterpretation?.reason,
    row?.diagnostics?.wiki?.extended?.lawTextBasis,
    row?.diagnostics?.coverage?.truthLayers?.legalInterpretation?.notes,
  ].filter(Boolean).join(" "));
}

function buildRow(resolverRow, context) {
  const geo = normalizeGeo(resolverRow.geo);
  const packetRow = context.packetByGeo.get(geo) || {};
  const truthRow = context.truthByGeo.get(geo) || {};
  const matrixRow = context.matrixByGeo.get(geo) || {};
  const disputedMapping = context.disputedMappings[geo] || null;
  const statusV9Target = context.statusV9ByGeo.get(geo) || null;
  const manualOverride = context.manualOverrides[geo] || null;
  const legalText = getNestedText(truthRow);
  const officialStatus = matrixRow.officialStatus || {};
  const hasAdministeringStateJurisdictionEvidence =
    /administer|jurisdiction|jurisdicci|sovereign|soberan|national territory|territorio nacional|colombia/i.test(legalText);
  const hasClaimantScopeCaveat =
    /claimant|disputed|scope caveat|international claim|territory scope|not territory-issued|sporn|спорн/i.test(legalText) ||
    Boolean(disputedMapping?.claimantGeoCodes?.length);
  const targetDecision =
    disputedMapping && !statusV9Target && !manualOverride
      ? "NO_DIRECT_RUNTIME_TARGET_DISPUTED_GEO"
      : "TARGET_DECISION_REQUIRES_RECHECK";
  const legalScopeDecision =
    hasAdministeringStateJurisdictionEvidence
      ? "ADMINISTERING_STATE_LAW_WITH_DISPUTED_SCOPE_CAVEAT"
      : "CLAIMANT_CONTEXT_ONLY_NOT_TERRITORY_LAW";
  return {
    geo,
    territory: packetRow.territory || truthRow.territory || matrixRow.territory || geo,
    targetDecision,
    legalScopeDecision,
    disputedMappingPresent: Boolean(disputedMapping),
    claimantGeoCodes: disputedMapping?.claimantGeoCodes || [],
    jurisdictionNote: disputedMapping?.jurisdictionNote || null,
    territoryWikiUrl: disputedMapping?.territoryWikiUrl || null,
    directCountryJsonTarget: resolverRow.targetFamily === "COUNTRY_PAGE_JSON_RUNTIME_SOURCE",
    directRuntimeTargetPath: resolverRow.targetPath || null,
    statusV9TargetPresent: Boolean(statusV9Target),
    manualOverridePresent: Boolean(manualOverride),
    packetCurrentColor: packetRow.currentColor || resolverRow.packetCurrentColor || "UNKNOWN",
    proposedTruthColor: packetRow.proposedTruthColor || resolverRow.proposedTruthColor || "UNKNOWN",
    truthRule: packetRow.truthRule || resolverRow.truthRule || truthRow.truthRuleId || "UNKNOWN",
    officialStatus: {
      recreational: officialStatus.recreational || null,
      medical: officialStatus.medical || null,
      enforcement: officialStatus.enforcement || null,
    },
    evidencePointers: {
      resolverTargetFamily: resolverRow.targetFamily,
      resolverBlockingReasons: resolverRow.blockingReasons || [],
      differenceStatus: truthRow?.diagnostics?.evidence?.differenceStatus || null,
      primaryOfficialLinks: (truthRow?.diagnostics?.evidence?.officialLinks?.direct || [])
        .slice(0, 5)
        .map((item) => ({
          title: item.title,
          url: item.url,
          sourceKind: item.sourceKind,
        })),
    },
    targetMutationAllowedNow: false,
    applyDisposition: "BLOCKED_DISPUTED_GEO_TARGET_MAPPING_REQUIRES_EXPLICIT_SCOPE_DECISION",
    guardrails: [
      "CLAIMANT_LAW_MUST_NOT_BE_TREATED_AS_TERRITORY_LAW_BY_DEFAULT",
      "ADMINISTERING_STATE_SCOPE_CAVEAT_MUST_REMAIN_VISIBLE",
      "NO_COUNTRY_JSON_OR_STATUS_V9_ROW_CREATED_AUTOMATICALLY",
      "NO_COLOR_APPLICATION_WITHOUT_EXPLICIT_AUTHORIZATION",
      "NO_SSOT_OR_MAP_MUTATION",
    ],
    blockingReasons: [
      "DISPUTED_GEO_NO_DIRECT_RUNTIME_TARGET",
      "EXPLICIT_SCOPE_DECISION_REQUIRED",
      "AUTHORIZATION_MISSING",
      "SSOT_WRITE_NOT_ENABLED",
    ],
  };
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Disputed Target Mapping");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Mapping status: ${output.mappingStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Local only: ${output.localOnly ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- unresolved disputed targets: ${output.summary.unresolvedDisputedTargets}`);
  lines.push(`- direct mutation allowed now: ${output.summary.directMutationAllowedNow ? "TRUE" : "FALSE"}`);
  lines.push(`- status v9 targets present: ${output.summary.statusV9TargetsPresent}`);
  lines.push(`- manual overrides present: ${output.summary.manualOverridesPresent}`);
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| GEO | Territory | Target decision | Legal scope decision | Claimants | Truth target | Mutation |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.targetDecision)} | ${mdCell(row.legalScopeDecision)} | ${mdCell(row.claimantGeoCodes.join(", "))} | ${mdCell(row.proposedTruthColor)} | ${row.targetMutationAllowedNow ? "ALLOWED" : "BLOCKED"} |`,
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
  lines.push("- This artifact closes the target-mapping explanation for unresolved disputed GEO rows only; it does not apply colors.");
  lines.push("- BJN/SER have Colombian administering-jurisdiction evidence in the truth audit, but they still lack direct runtime target rows.");
  lines.push("- A future write must make an explicit scope decision and create or select an authoritative local target before any SSOT/map color mutation.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const packet = readJson(AUTHORIZATION_PACKET_PATH);
  const resolver = readJson(TARGET_RESOLVER_PATH);
  const truthReport = readJson(TRUTH_REPORT_PATH);
  const matrix = readJson(MATRIX_PATH);
  const statusV9 = readJsonIfExists(STATUS_V9_PATH, { entries: {} });
  const manualOverrides = readJsonIfExists(MANUAL_OVERRIDES_PATH, { entries: {} }).entries || {};
  const disputedMappings = parseDisputedMappings();
  const unresolvedDisputedRows = (resolver.rows || [])
    .filter((row) => row.targetFamily === "DISPUTED_GEO_NO_DIRECT_STATUS_TARGET")
    .sort((left, right) => normalizeGeo(left.geo).localeCompare(normalizeGeo(right.geo)));
  const context = {
    packetByGeo: rowsByGeo(packet.rows || []),
    truthByGeo: rowsByGeo(truthReport.rows || []),
    matrixByGeo: rowsByGeo(matrix.rows || matrix.items || []),
    statusV9ByGeo: statusV9ByGeo(statusV9),
    manualOverrides,
    disputedMappings,
  };
  const rows = unresolvedDisputedRows.map((row) => buildRow(row, context));
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    nonMutating: true,
    localOnly: true,
    mappingStatus: rows.length
      ? "DISPUTED_TARGET_MAPPING_READY_NO_MUTATION"
      : "NO_DISPUTED_TARGET_ROWS",
    mutationPolicy:
      "This artifact writes only data/reviews outputs. It does not update SSOT, map colors, country JSON, status snapshots, manual overrides, static countries assets, or production.",
    inputTargetResolver: relative(TARGET_RESOLVER_PATH),
    rowsTotal: rows.length,
    appliedRows: 0,
    summary: {
      unresolvedDisputedTargets: rows.length,
      directMutationAllowedNow: rows.some((row) => row.targetMutationAllowedNow),
      statusV9TargetsPresent: rows.filter((row) => row.statusV9TargetPresent).length,
      manualOverridesPresent: rows.filter((row) => row.manualOverridePresent).length,
      legalScopeDecisionCounts: countBy(rows, (row) => row.legalScopeDecision),
      targetDecisionCounts: countBy(rows, (row) => row.targetDecision),
      geos: rows.map((row) => row.geo),
    },
    guardrails: [
      "CLAIMANT_LAW_MUST_NOT_BE_TREATED_AS_TERRITORY_LAW_BY_DEFAULT",
      "ADMINISTERING_STATE_SCOPE_CAVEAT_MUST_REMAIN_VISIBLE",
      "NO_COUNTRY_JSON_OR_STATUS_V9_ROW_CREATED_AUTOMATICALLY",
      "NO_COLOR_APPLICATION_WITHOUT_EXPLICIT_AUTHORIZATION",
      "NO_SSOT_OR_MAP_MUTATION",
    ],
    validation: {
      allRowsDisputedMapped: rows.every((row) => row.disputedMappingPresent),
      allRowsDirectTargetAbsent: rows.every((row) => !row.directCountryJsonTarget && !row.directRuntimeTargetPath),
      allRowsMutationBlocked: rows.every((row) => row.targetMutationAllowedNow === false),
      allRowsHaveClaimants: rows.every((row) => row.claimantGeoCodes.length > 0),
      noAutomaticStatusTargetsCreated: rows.every((row) => !row.statusV9TargetPresent && !row.manualOverridePresent),
      allRowsHaveScopeDecision: rows.every((row) => row.legalScopeDecision !== "UNKNOWN"),
    },
    hashProof: [
      fileProof(AUTHORIZATION_PACKET_PATH),
      fileProof(TARGET_RESOLVER_PATH),
      fileProof(TRUTH_REPORT_PATH),
      fileProof(MATRIX_PATH),
      fileProof(DISPUTED_GEO_SOURCES_PATH),
      fileProof(STATUS_V9_PATH),
      fileProof(MANUAL_OVERRIDES_PATH),
    ],
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`DISPUTED_TARGET_MAPPING_STATUS=${output.mappingStatus}`);
  console.log(`DISPUTED_TARGET_MAPPING_ROWS=${output.rowsTotal}`);
  console.log(`DISPUTED_TARGET_MAPPING_MUTATION_ALLOWED=${output.summary.directMutationAllowedNow ? "TRUE" : "FALSE"}`);
  console.log(`DISPUTED_TARGET_MAPPING_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`DISPUTED_TARGET_MAPPING_OUTPUT=${relative(OUT_JSON_PATH)}`);
  console.log(`DISPUTED_TARGET_MAPPING_MARKDOWN=${relative(OUT_MD_PATH)}`);
}

main();

#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const INPUT_REPORT = "data/reviews/wiki-truth-307-truth-audit-report.json";
const OUTPUT_JSON = "data/reviews/wiki-truth-307-color-proposals.json";
const OUTPUT_MD = "data/reviews/wiki-truth-307-color-proposals.md";

const report = JSON.parse(readFileSync(INPUT_REPORT, "utf8"));
const rows = Array.isArray(report.rows) ? report.rows : [];

function countBy(values, pick) {
  return values.reduce((acc, value) => {
    const key = pick(value) || "UNKNOWN";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function currentColor(row) {
  return row?.diagnostics?.color?.current?.color || "UNKNOWN";
}

function currentSource(row) {
  return row?.diagnostics?.color?.current?.source || "UNKNOWN";
}

function currentReason(row) {
  return row?.diagnostics?.color?.current?.reason || "UNKNOWN";
}

function colorStatus(row) {
  return row?.diagnostics?.color?.status || "UNKNOWN";
}

function truthColor(row) {
  return row?.truth?.color || "UNKNOWN";
}

function truthRule(row) {
  return row?.truth?.ruleId || row?.truth?.source || "UNKNOWN";
}

function truthReason(row) {
  return row?.truth?.reason || "UNKNOWN";
}

function proposalAction(row) {
  const status = colorStatus(row);
  const truth = truthColor(row);
  const current = currentColor(row);
  if (status === "COLOR_MATCH") return "KEEP_CURRENT_COLOR";
  if (truth === "UNKNOWN") {
    return current === "UNKNOWN"
      ? "KEEP_UNCOLORED"
      : "REMOVE_COLOR_PENDING_APPLICABLE_LAW_PROOF";
  }
  if (current === "UNKNOWN") return `SET_${truth}`;
  return `CHANGE_${current}_TO_${truth}`;
}

function proposalRationale(row) {
  const action = proposalAction(row);
  if (action === "KEEP_CURRENT_COLOR" || action === "KEEP_UNCOLORED") {
    return "Truth engine and current map category are aligned for this row.";
  }
  if (action === "REMOVE_COLOR_PENDING_APPLICABLE_LAW_PROOF") {
    return "Truth engine has no proven applicable law color; under Truth-First rules the territory should remain uncolored until primary/applicable law is proven.";
  }
  return truthReason(row);
}

const proposals = rows
  .filter((row) => colorStatus(row) !== "COLOR_MATCH")
  .map((row) => ({
    geo: row.geo,
    territory: row.territory,
    currentColor: currentColor(row),
    currentSource: currentSource(row),
    currentReason: currentReason(row),
    proposedTruthColor: truthColor(row),
    proposalAction: proposalAction(row),
    proposalRationale: proposalRationale(row),
    truthRule: truthRule(row),
    truthReason: truthReason(row),
    sourceCoverage: row.sourceCoverage || "UNKNOWN",
    effectiveSourceCoverage: row.effectiveSourceCoverage || row.sourceCoverage || "UNKNOWN",
    official: row.official || null,
    wiki: row.wikipedia || null,
    ssot: row.ssot || null,
    diagnostics: row.diagnostics || null,
  }));

const output = {
  generatedAt: new Date().toISOString(),
  reportVersion: report.reportVersion || "UNKNOWN",
  inputTruthReport: INPUT_REPORT,
  rowsTotal: rows.length,
  proposalsTotal: proposals.length,
  nonMutating: true,
  mutationPolicy: "This artifact does not update SSOT, map colors, production, or source evidence. It records reviewable local Truth-First color proposals only.",
  acceptanceNote: "A proposal is not an applied status/color change. Truth-First acceptance still requires authorized downstream application or an explicit decision to leave a row uncolored.",
  counts: {
    currentColor: countBy(proposals, (row) => row.currentColor),
    proposedTruthColor: countBy(proposals, (row) => row.proposedTruthColor),
    proposalAction: countBy(proposals, (row) => row.proposalAction),
    colorStatus: countBy(proposals, (row) => colorStatus(row)),
    truthRule: countBy(proposals, (row) => row.truthRule),
    effectiveSourceCoverage: countBy(proposals, (row) => row.effectiveSourceCoverage),
  },
  proposals,
};

function markdownTable(rowsForTable) {
  const lines = [
    "| GEO | Territory | Current | Proposal | Truth rule | Rationale |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rowsForTable) {
    lines.push([
      row.geo,
      row.territory,
      row.currentColor,
      row.proposalAction,
      row.truthRule,
      row.proposalRationale,
    ].map((value) => String(value || "").replace(/\|/g, "\\|")).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  return lines.join("\n");
}

const md = [
  "# Wiki Truth 307 Color Proposals",
  "",
  `Generated: ${output.generatedAt}`,
  `Report version: ${output.reportVersion}`,
  "",
  "This is a non-mutating local artifact. It records what the Truth-First engine proposes, but it does not change SSOT, map colors, or production.",
  "",
  "## Counts",
  "",
  "```json",
  JSON.stringify(output.counts, null, 2),
  "```",
  "",
  "## Proposals",
  "",
  markdownTable(proposals),
  "",
].join("\n");

writeFileSync(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(OUTPUT_MD, md);

console.log(`WIKI_TRUTH_307_COLOR_PROPOSALS_ROWS=${rows.length}`);
console.log(`WIKI_TRUTH_307_COLOR_PROPOSALS_TOTAL=${proposals.length}`);
console.log(`WIKI_TRUTH_307_COLOR_PROPOSALS_JSON=${OUTPUT_JSON}`);
console.log(`WIKI_TRUTH_307_COLOR_PROPOSALS_MARKDOWN=${OUTPUT_MD}`);

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const COLOR_PROPOSALS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-proposals.json",
);
const PRIMARY_LAW_BLOCKERS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-primary-law-blockers.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-plan.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-plan.md",
);

const ALLOWED_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "UNKNOWN";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function hasDocumentedUncolorScopeException(proposal) {
  const text = [
    proposal.proposedTruthColor,
    proposal.proposalAction,
    proposal.truthRule,
    proposal.truthReason,
    proposal.sourceCoverage,
    proposal.effectiveSourceCoverage,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    proposal.proposedTruthColor === "UNKNOWN" &&
    /OFFICIAL_CONTEXT_ONLY|SCOPE_EXCLUSION|NO_DIRECT_CANNABIS_STATUTE|NO_APPLICABLE|CONTEXT_ONLY/i.test(text)
  );
}

function applyDisposition(proposal, primaryLawBlockerGeos) {
  if (primaryLawBlockerGeos.has(proposal.geo)) {
    return "BLOCKED_PRIMARY_LAW_PROOF";
  }
  if (hasDocumentedUncolorScopeException(proposal)) {
    return "PENDING_AUTHORIZED_UNCOLOR_SCOPE_EXCEPTION";
  }
  if (proposal.proposedTruthColor === "UNKNOWN") {
    return "PENDING_UNCOLOR_SCOPE_REVIEW";
  }
  return "PENDING_AUTHORIZED_SSOT_MAP_UPDATE";
}

function safetyNotes(proposal, disposition) {
  const notes = [
    "Do not apply automatically.",
    "Do not use Wikipedia as a truth source.",
    "Apply only through explicit Truth Pipeline authorization.",
  ];
  if (proposal.proposedTruthColor === "UNKNOWN") {
    notes.push("UNKNOWN means uncolored, not an additional map color.");
  }
  if (disposition === "PENDING_AUTHORIZED_UNCOLOR_SCOPE_EXCEPTION") {
    notes.push("Documented scope exception: leave uncolored only after explicit Truth Pipeline authorization.");
  }
  if (disposition === "PENDING_UNCOLOR_SCOPE_REVIEW") {
    notes.push("Leave uncolored only after an explicit scope decision or stronger applicable primary law proof.");
  }
  if (disposition === "BLOCKED_PRIMARY_LAW_PROOF") {
    notes.push("Blocked until direct applicable primary cannabis law is proven.");
  }
  if (/PARTIAL|LIFECYCLE|RESEARCH|PRODUCTION|EXPORT|CBD|SATIVEX/.test(proposal.truthRule || "")) {
    notes.push("Yellow is limited/non-patient/full-program guard output, not medical-program green.");
  }
  return notes;
}

function mdCell(value, limit = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const trimmed = text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Color Apply Plan");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Apply status: ${output.applyStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Requires explicit authorization: ${output.requiresExplicitAuthorization ? "TRUE" : "FALSE"}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  for (const [group, counts] of Object.entries(output.counts)) {
    lines.push(`### ${group}`);
    for (const [key, value] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- \`${key}\`: ${value}`);
    }
    lines.push("");
  }
  lines.push("## Rows");
  lines.push("");
  lines.push("| GEO | Territory | Current | Proposed | Action | Disposition | Rule |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.currentColor)} | ${mdCell(row.proposedTruthColor)} | ${mdCell(row.proposalAction)} | ${mdCell(row.applyDisposition)} | ${mdCell(row.truthRule)} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This artifact is a review/apply plan only. It does not mutate SSOT, map colors, production, source evidence, or current statuses.");
  lines.push("- Rows with `BLOCKED_PRIMARY_LAW_PROOF` must not be applied until direct applicable primary cannabis law is proven.");
  lines.push("- Rows with `PENDING_AUTHORIZED_UNCOLOR_SCOPE_EXCEPTION` have a documented context-only/scope-exception basis for no color, but still require explicit authorization before any downstream map/SSOT change.");
  lines.push("- Rows with `PENDING_UNCOLOR_SCOPE_REVIEW` require an explicit decision to leave the territory uncolored under Truth-first rules.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const colorProposals = readJson(COLOR_PROPOSALS_PATH);
  const primaryLawBlockers = readJsonIfExists(PRIMARY_LAW_BLOCKERS_PATH);
  const proposals = Array.isArray(colorProposals.proposals)
    ? colorProposals.proposals
    : [];
  const primaryLawBlockerGeos = new Set(
    (Array.isArray(primaryLawBlockers?.blockers)
      ? primaryLawBlockers.blockers
      : []
    )
      .map((blocker) => String(blocker.geo || ""))
      .filter(Boolean),
  );

  const rows = proposals.map((proposal, index) => {
    const disposition = applyDisposition(proposal, primaryLawBlockerGeos);
    return {
      planIndex: index + 1,
      geo: String(proposal.geo || ""),
      territory: String(proposal.territory || ""),
      currentColor: String(proposal.currentColor || "UNKNOWN"),
      proposedTruthColor: String(proposal.proposedTruthColor || "UNKNOWN"),
      proposalAction: String(proposal.proposalAction || "UNKNOWN"),
      applyDisposition: disposition,
      blockedByPrimaryLaw: primaryLawBlockerGeos.has(proposal.geo),
      truthRule: String(proposal.truthRule || "UNKNOWN"),
      truthReason: String(proposal.truthReason || ""),
      currentReason: String(proposal.currentReason || ""),
      sourceCoverage: String(proposal.sourceCoverage || "UNKNOWN"),
      effectiveSourceCoverage: String(
        proposal.effectiveSourceCoverage || proposal.sourceCoverage || "UNKNOWN",
      ),
      safetyNotes: safetyNotes(proposal, disposition),
    };
  });

  const proposalGeos = proposals.map((proposal) => String(proposal.geo || "")).sort();
  const planGeos = rows.map((row) => row.geo).sort();
  const validation = {
    rowsMatchProposals: rows.length === proposals.length,
    geosMatchProposals: JSON.stringify(planGeos) === JSON.stringify(proposalGeos),
    allowedTargetColorsOnly: rows.every((row) =>
      ALLOWED_COLORS.has(row.proposedTruthColor),
    ),
    allowedCurrentColorsOnly: rows.every((row) =>
      ALLOWED_COLORS.has(row.currentColor),
    ),
    nonMutating: true,
    appliedRows: 0,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.2.0",
    inputColorProposals: path.relative(ROOT, COLOR_PROPOSALS_PATH),
    inputPrimaryLawBlockers: primaryLawBlockers
      ? path.relative(ROOT, PRIMARY_LAW_BLOCKERS_PATH)
      : null,
    nonMutating: true,
    applyStatus: "PENDING_AUTHORIZATION",
    requiresExplicitAuthorization: true,
    safeToAutoApply: false,
    mutationPolicy:
      "This plan does not update SSOT, map colors, production, or source evidence. It is a deterministic review/apply transaction plan that requires explicit authorization before any downstream mutation.",
    rowsTotal: rows.length,
    allowedTargetColors: [...ALLOWED_COLORS],
    counts: {
      proposalAction: countBy(rows, (row) => row.proposalAction),
      colorTransition: countBy(
        rows,
        (row) => `${row.currentColor}->${row.proposedTruthColor}`,
      ),
      proposedTruthColor: countBy(rows, (row) => row.proposedTruthColor),
      applyDisposition: countBy(rows, (row) => row.applyDisposition),
      effectiveSourceCoverage: countBy(rows, (row) => row.effectiveSourceCoverage),
    },
    validation,
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`COLOR_APPLY_PLAN_ROWS=${output.rowsTotal}`);
  console.log(`COLOR_APPLY_PLAN_STATUS=${output.applyStatus}`);
  console.log(`COLOR_APPLY_PLAN_NON_MUTATING=${output.nonMutating ? 1 : 0}`);
  console.log(`COLOR_APPLY_PLAN_REQUIRES_AUTH=${output.requiresExplicitAuthorization ? 1 : 0}`);
  console.log(`COLOR_APPLY_PLAN_APPLIED_ROWS=${output.validation.appliedRows}`);
  console.log(`COLOR_APPLY_PLAN_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`COLOR_APPLY_PLAN_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
}

main();

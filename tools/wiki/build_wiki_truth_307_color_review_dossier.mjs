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
const COLOR_APPLY_PLAN_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-plan.json",
);
const COLOR_APPLY_GATE_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-gate.json",
);
const PRIMARY_LAW_BLOCKERS_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-primary-law-blockers.json",
);
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-review-dossier.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-review-dossier.md",
);

const ALLOWED_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function reviewDecision(planRow, gateRow) {
  if (planRow.applyDisposition === "BLOCKED_PRIMARY_LAW_PROOF") {
    return "REVIEW_BLOCKED_PRIMARY_LAW_PROOF";
  }
  if (planRow.applyDisposition === "PENDING_AUTHORIZED_UNCOLOR_SCOPE_EXCEPTION") {
    return "REVIEW_SCOPE_EXCEPTION_PROVEN_PENDING_AUTHORIZATION";
  }
  if (planRow.applyDisposition === "PENDING_UNCOLOR_SCOPE_REVIEW") {
    return "REVIEW_PENDING_UNCOLOR_SCOPE_DECISION";
  }
  if (gateRow?.gateDecision === "BLOCKED") {
    return "REVIEW_READY_PENDING_AUTHORIZATION";
  }
  if (gateRow?.gateDecision === "WOULD_APPLY_AFTER_AUTHORIZATION") {
    return "REVIEW_READY_FOR_AUTHORIZED_LOCAL_APPLY";
  }
  return "REVIEW_UNKNOWN";
}

function legalBasisClass(planRow) {
  if (planRow.blockedByPrimaryLaw) return "PRIMARY_LAW_BLOCKED";
  if (planRow.effectiveSourceCoverage === "OFFICIAL_CONTEXT_ONLY") {
    return "CONTEXT_ONLY_UNCOLOR_REVIEW";
  }
  if (planRow.effectiveSourceCoverage === "COMPOSITE_APPLICABLE_PRIMARY_LAW") {
    return "COMPOSITE_PRIMARY_LAW";
  }
  if (planRow.effectiveSourceCoverage === "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW") {
    return "DIRECT_PRIMARY_LAW";
  }
  return "UNKNOWN_LEGAL_BASIS";
}

function nonApplyReason(planRow, gateRow) {
  if (planRow.applyDisposition === "BLOCKED_PRIMARY_LAW_PROOF") {
    return "Direct applicable primary cannabis law is not proven for this GEO.";
  }
  if (planRow.applyDisposition === "PENDING_AUTHORIZED_UNCOLOR_SCOPE_EXCEPTION") {
    return "Documented context-only/scope-exception basis supports no color; explicit Truth Pipeline authorization is still required before any downstream mutation.";
  }
  if (planRow.applyDisposition === "PENDING_UNCOLOR_SCOPE_REVIEW") {
    return "Truth color is UNKNOWN; an explicit uncolor/scope decision is required.";
  }
  if (gateRow?.gateReasons?.includes("AUTHORIZATION_MISSING")) {
    return "Explicit Truth Pipeline authorization is missing.";
  }
  return "No automatic SSOT/map mutation is allowed by this dossier.";
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Color Review Dossier");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Review status: ${output.reviewStatus}`);
  lines.push(`Rows: ${output.rowsTotal}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
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
  lines.push("| GEO | Territory | Transition | Action | Review decision | Apply disposition | Legal basis | Non-apply reason |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(`${row.currentColor}->${row.proposedTruthColor}`)} | ${mdCell(row.proposalAction)} | ${mdCell(row.reviewDecision)} | ${mdCell(row.applyDisposition)} | ${mdCell(row.legalBasisClass)} | ${mdCell(row.nonApplyReason)} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This dossier closes the local review packet for all non-matching color rows, but it does not close the underlying color-review acceptance gate.");
  lines.push("- SSOT/map/prod remain untouched. Applying any row still requires explicit Truth Pipeline authorization and no primary-law blockers.");
  lines.push("- `REVIEW_READY_PENDING_AUTHORIZATION` means the legal review packet is ready, not that a mutation has been approved.");
  lines.push("- `REVIEW_SCOPE_EXCEPTION_PROVEN_PENDING_AUTHORIZATION` means no-color treatment is supported by the documented context-only/scope-exception rule, but still requires explicit authorization before any downstream change.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const colorProposals = readJson(COLOR_PROPOSALS_PATH);
  const applyPlan = readJson(COLOR_APPLY_PLAN_PATH);
  const applyGate = readJson(COLOR_APPLY_GATE_PATH);
  const primaryLawBlockers = readJson(PRIMARY_LAW_BLOCKERS_PATH);
  const proposals = Array.isArray(colorProposals.proposals)
    ? colorProposals.proposals
    : [];
  const planRows = Array.isArray(applyPlan.rows) ? applyPlan.rows : [];
  const gateRows = Array.isArray(applyGate.rows) ? applyGate.rows : [];
  const gateByGeo = new Map(gateRows.map((row) => [row.geo, row]));
  const proposalByGeo = new Map(proposals.map((row) => [row.geo, row]));
  const primaryLawBlockerGeos = (Array.isArray(primaryLawBlockers.blockers)
    ? primaryLawBlockers.blockers
    : []
  )
    .map((blocker) => String(blocker.geo || ""))
    .filter(Boolean)
    .sort();

  const rows = planRows.map((planRow) => {
    const proposal = proposalByGeo.get(planRow.geo) || {};
    const gateRow = gateByGeo.get(planRow.geo) || null;
    const decision = reviewDecision(planRow, gateRow);
    return {
      reviewIndex: Number(planRow.planIndex || 0),
      geo: String(planRow.geo || ""),
      territory: String(planRow.territory || ""),
      currentColor: String(planRow.currentColor || "UNKNOWN"),
      proposedTruthColor: String(planRow.proposedTruthColor || "UNKNOWN"),
      proposalAction: String(planRow.proposalAction || "UNKNOWN"),
      applyDisposition: String(planRow.applyDisposition || "UNKNOWN"),
      gateDecision: String(gateRow?.gateDecision || "UNKNOWN"),
      gateReasons: Array.isArray(gateRow?.gateReasons) ? gateRow.gateReasons : [],
      reviewDecision: decision,
      legalBasisClass: legalBasisClass(planRow),
      evidenceCoverage: String(planRow.effectiveSourceCoverage || "UNKNOWN"),
      truthRule: String(planRow.truthRule || "UNKNOWN"),
      truthReason: String(planRow.truthReason || proposal.truthReason || ""),
      currentReason: String(planRow.currentReason || proposal.currentReason || ""),
      blockedByPrimaryLaw: planRow.blockedByPrimaryLaw === true,
      allowedColorOnly:
        ALLOWED_COLORS.has(String(planRow.currentColor || "UNKNOWN")) &&
        ALLOWED_COLORS.has(String(planRow.proposedTruthColor || "UNKNOWN")),
      nonApplyReason: nonApplyReason(planRow, gateRow),
    };
  });

  const proposalGeos = proposals.map((row) => String(row.geo || "")).sort();
  const planGeos = planRows.map((row) => String(row.geo || "")).sort();
  const dossierGeos = rows.map((row) => row.geo).sort();
  const validation = {
    rowsMatchProposals: rows.length === proposals.length,
    rowsMatchPlan: rows.length === planRows.length,
    rowsMatchGate: rows.length === gateRows.length,
    geosMatchProposals: JSON.stringify(dossierGeos) === JSON.stringify(proposalGeos),
    geosMatchPlan: JSON.stringify(dossierGeos) === JSON.stringify(planGeos),
    allRowsHaveReviewDecision: rows.every((row) =>
      row.reviewDecision.startsWith("REVIEW_") &&
      row.reviewDecision !== "REVIEW_UNKNOWN",
    ),
    allRowsHaveLegalBasisClass: rows.every((row) => row.legalBasisClass !== "UNKNOWN_LEGAL_BASIS"),
    allowedColorsOnly: rows.every((row) => row.allowedColorOnly),
    appliedRowsZero: true,
    nonMutating: true,
  };
  const readyPendingAuthorizationRows = rows.filter(
    (row) =>
      row.reviewDecision === "REVIEW_READY_PENDING_AUTHORIZATION" ||
      row.reviewDecision === "REVIEW_SCOPE_EXCEPTION_PROVEN_PENDING_AUTHORIZATION",
  ).length;
  const blockedRows = rows.filter((row) =>
    row.reviewDecision.includes("BLOCKED") ||
    row.reviewDecision.includes("PENDING_UNCOLOR"),
  ).length;
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.2.0",
    inputColorProposals: path.relative(ROOT, COLOR_PROPOSALS_PATH),
    inputColorApplyPlan: path.relative(ROOT, COLOR_APPLY_PLAN_PATH),
    inputColorApplyGate: path.relative(ROOT, COLOR_APPLY_GATE_PATH),
    inputPrimaryLawBlockers: path.relative(ROOT, PRIMARY_LAW_BLOCKERS_PATH),
    nonMutating: true,
    localOnly: true,
    reviewStatus: blockedRows
      ? "REVIEW_DOSSIER_COMPLETE_PENDING_AUTHORIZATION_OR_BLOCKER_CLOSURE"
      : "REVIEW_DOSSIER_COMPLETE_PENDING_AUTHORIZATION",
    mutationPolicy:
      "This dossier writes only data/reviews artifacts. It does not apply SSOT, map, production, source, status, or color mutations.",
    rowsTotal: rows.length,
    appliedRows: 0,
    readyPendingAuthorizationRows,
    scopeExceptionReadyRows: rows.filter(
      (row) =>
        row.reviewDecision === "REVIEW_SCOPE_EXCEPTION_PROVEN_PENDING_AUTHORIZATION",
    ).length,
    blockedRows,
    primaryLawBlockerGeos,
    counts: {
      reviewDecision: countBy(rows, (row) => row.reviewDecision),
      applyDisposition: countBy(rows, (row) => row.applyDisposition),
      proposalAction: countBy(rows, (row) => row.proposalAction),
      legalBasisClass: countBy(rows, (row) => row.legalBasisClass),
      colorTransition: countBy(
        rows,
        (row) => `${row.currentColor}->${row.proposedTruthColor}`,
      ),
      gateDecision: countBy(rows, (row) => row.gateDecision),
    },
    validation,
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`COLOR_REVIEW_DOSSIER_ROWS=${output.rowsTotal}`);
  console.log(`COLOR_REVIEW_DOSSIER_STATUS=${output.reviewStatus}`);
  console.log(`COLOR_REVIEW_DOSSIER_NON_MUTATING=${output.nonMutating ? 1 : 0}`);
  console.log(`COLOR_REVIEW_DOSSIER_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`COLOR_REVIEW_DOSSIER_READY_PENDING_AUTH=${output.readyPendingAuthorizationRows}`);
  console.log(`COLOR_REVIEW_DOSSIER_BLOCKED_ROWS=${output.blockedRows}`);
  console.log(`COLOR_REVIEW_DOSSIER_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`COLOR_REVIEW_DOSSIER_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
}

main();

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");
const TOTAL_GEO = 307;
const CONFIDENCE_LEVELS = new Set([
  "PROVEN",
  "STRONG",
  "PARTIAL",
  "CONFLICTING",
  "UNKNOWN",
]);
const CANONICAL_CONFIDENCE_FIELDS = [
  "truth_confidence",
  "source_authority",
  "source_freshness",
  "evidence_completeness",
  "jurisdiction_match_confidence",
  "legal_interpretation_confidence",
];
const RECONCILIATION_PATH = path.join(ROOT, "data", "reviews", "wiki-truth-307-final-reconciliation.json");
const LEGAL_COMPLETION_PATH = path.join(ROOT, "data", "reviews", "wiki-truth-307-completion-gap-dossier.json");
const STORE_AUDIT_PATH = path.join(ROOT, "data", "reviews", "wiki-truth-307-store-audit.json");
const OUT_JSON_PATH = path.join(ROOT, "data", "reviews", "wiki-truth-307-goal-acceptance.json");
const OUT_MD_PATH = path.join(ROOT, "data", "reviews", "wiki-truth-307-goal-acceptance.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function integer(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bit(value) {
  return value === true;
}

function hashInput(filePath) {
  const body = fs.readFileSync(filePath);
  return {
    path: path.relative(ROOT, filePath),
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    bytes: body.length,
  };
}

function requirement(id, proven, reason, evidenceSource) {
  return {
    id,
    status: proven ? "PROVEN" : "INCOMPLETE",
    completion_impact: proven ? "SATISFIED" : "BLOCKS_COMPLETION",
    reason,
    evidence_source: evidenceSource,
  };
}

function hasCanonicalConfidenceDimensions(row) {
  const result = row?.canonicalTruthResult;
  return (
    result &&
    typeof result === "object" &&
    CANONICAL_CONFIDENCE_FIELDS.every((field) =>
      CONFIDENCE_LEVELS.has(String(result[field] || "").trim()),
    )
  );
}

export function buildStoreGoalAcceptance({ reconciliation, legalCompletion, storeAudit }) {
  const rows = Array.isArray(reconciliation?.rows) ? reconciliation.rows : [];
  const uniqueGeos = new Set(rows.map((row) => String(row?.geo || "").trim().toUpperCase()).filter(Boolean));
  if (rows.length !== TOTAL_GEO || uniqueGeos.size !== TOTAL_GEO) {
    throw new Error(`GOAL_ACCEPTANCE_RECONCILIATION_UNIVERSE_INVALID:${rows.length}/${uniqueGeos.size}`);
  }
  const auditRows = Array.isArray(storeAudit?.rows) ? storeAudit.rows : [];
  const uniqueStoreGeos = new Set(auditRows.map((row) => String(row?.geo_id || "").trim().toUpperCase()).filter(Boolean));
  if (auditRows.length !== TOTAL_GEO || uniqueStoreGeos.size !== TOTAL_GEO) {
    throw new Error(`GOAL_ACCEPTANCE_STORE_UNIVERSE_INVALID:${auditRows.length}/${uniqueStoreGeos.size}`);
  }

  const reconciliationAcceptance = reconciliation?.acceptance || {};
  const reconciliationFlags = reconciliationAcceptance.flags || {};
  const reconciliationCounts = reconciliation?.counts || {};
  const truthColors = reconciliationCounts.truthColors || {};
  const truthConfidence = reconciliationCounts.truthConfidence || {};
  const falseClasses = reconciliationCounts.falseClasses || {};
  const storeCounts = storeAudit?.counts || {};
  const storeAcceptance = storeAudit?.acceptance || {};
  const conflictRows = Array.isArray(reconciliationAcceptance.crossLayerConflictRows)
    ? reconciliationAcceptance.crossLayerConflictRows
    : [];
  const declaredAppliedRows = integer(reconciliation?.noMutationProof?.appliedRows);
  const observedAppliedRows = rows.filter(
    (row) => row?.ssot?.mutationApplied === true,
  );
  const appliedCrossLayerConflictRows = observedAppliedRows
    .filter((row) => row?.layerConflict === true)
    .map((row) => String(row.geo || "").trim().toUpperCase())
    .filter(Boolean);
  const unprovenGreenRows = Array.isArray(reconciliationAcceptance.unprovenGreenRows)
    ? reconciliationAcceptance.unprovenGreenRows
    : [];

  const legalRowsPresent =
    bit(reconciliationFlags.rows307Reconciled) &&
    bit(reconciliationFlags.canonicalTruthResultSchemaComplete) &&
    rows.length === TOTAL_GEO;
  const canonicalConfidenceDimensionsComplete = rows.every(
    hasCanonicalConfidenceDimensions,
  );
  const legalHumanSummaryIntegrity = bit(
    reconciliationFlags.humanSummariesFreeOfMachinePlaceholders,
  );
  const legalFullyReconciled =
    bit(reconciliation?.complete) &&
    bit(legalCompletion?.overallComplete) &&
    canonicalConfidenceDimensionsComplete;
  const legalAppliedConflictFree =
    declaredAppliedRows === observedAppliedRows.length &&
    appliedCrossLayerConflictRows.length === 0;
  const legalGreenProofComplete = bit(reconciliationFlags.allGreenOperationallyProven) && unprovenGreenRows.length === 0;
  const legalVisualAcceptance = bit(reconciliationFlags.freshOfficialVisualReviewComplete);
  const legalNoMutation = bit(reconciliation?.noMutationProof?.unchanged) && bit(reconciliationFlags.ssotMapProductionRuntimeUnchanged);
  const storeInventoryComplete = bit(storeAcceptance.all_geo_accounted) && integer(storeCounts.STORE_GEO_CHECKED) === TOTAL_GEO;
  const storeDiscoveryComplete = bit(storeAcceptance.store_discovery_complete);
  const storeVisibilitySafe = bit(storeAcceptance.all_visible_stores_validated);
  const storeJurisdictionSafe = bit(storeAcceptance.jurisdiction_collisions_zero);
  const storeCircularDependencySafe = bit(storeAcceptance.circular_truth_dependency_zero);
  const storeVisualAcceptance = bit(storeAcceptance.visual_map_audit_pass);
  const worldViewSafe = integer(storeAcceptance.low_zoom_marker_count) === 0;
  const productionUntouched =
    bit(storeAcceptance.production_touched) === false &&
    bit(storeAcceptance.production_deployed) === false &&
    legalNoMutation;

  const requirements = [
    requirement("LEGAL_CANONICAL_RESULT_307", legalRowsPresent, "Each GEO has exactly one schema-complete canonical_truth_result; unknown axes remain explicit rather than inferred from color.", "wiki-truth-307-final-reconciliation.json"),
    requirement("LEGAL_CANONICAL_CONFIDENCE_307", canonicalConfidenceDimensionsComplete, "Each canonical_truth_result must separately materialize only PROVEN/STRONG/PARTIAL/CONFLICTING/UNKNOWN values for truth, source authority, source freshness, evidence completeness, jurisdiction match, and legal interpretation.", "wiki-truth-307-final-reconciliation.json"),
    requirement("LEGAL_HUMAN_SUMMARY_INTEGRITY", legalHumanSummaryIntegrity, `${integer(reconciliationCounts?.humanSummary?.MACHINE_PLACEHOLDER_ROWS)} canonical human summaries contain a machine placeholder.`, "wiki-truth-307-final-reconciliation.json"),
    requirement("LEGAL_TRUTH_RECONCILED_307", legalFullyReconciled, "All legal completion-dossier and final-reconciliation gates must close before 307/307 is claimed.", "wiki-truth-307-completion-gap-dossier.json"),
    requirement("LEGAL_APPLIED_CROSS_LAYER_CONFLICTS_ZERO", legalAppliedConflictFree, `${appliedCrossLayerConflictRows.length} applied legal cross-layer conflict rows remain; ${conflictRows.length} proposal-only candidate conflicts stay blocked from apply.`, "wiki-truth-307-final-reconciliation.json"),
    requirement("LEGAL_GREEN_PROOF_COMPLETE", legalGreenProofComplete, `${unprovenGreenRows.length} GREEN rows still lack final operational proof.`, "wiki-truth-307-final-reconciliation.json"),
    requirement("LEGAL_VISUAL_ACCEPTANCE_COMPLETE", legalVisualAcceptance, "Fresh official visual acceptance is a separate final legal gate.", "wiki-truth-307-final-reconciliation.json"),
    requirement("STORE_GEO_CHECKED_307", storeInventoryComplete, "All 307 GEO must have a store discovery state.", "wiki-truth-307-store-audit.json"),
    requirement("STORE_DISCOVERY_COMPLETE", storeDiscoveryComplete, "Official-first registry discovery/extraction must be complete before the store layer can close.", "wiki-truth-307-store-audit.json"),
    requirement("STORE_VISIBLE_RECORDS_VALIDATED", storeVisibilitySafe, "Every projected store must pass source, type, licence, and coordinate gates.", "wiki-truth-307-store-audit.json"),
    requirement("STORE_JURISDICTION_COLLISIONS_ZERO", storeJurisdictionSafe, `${integer(storeCounts.STORE_JURISDICTION_COLLISIONS)} store jurisdiction collisions remain.`, "wiki-truth-307-store-audit.json"),
    requirement("CIRCULAR_TRUTH_DEPENDENCY_ZERO", storeCircularDependencySafe, `${integer(storeCounts.CIRCULAR_TRUTH_DEPENDENCY)} circular legal/store dependencies remain.`, "wiki-truth-307-store-audit.json"),
    requirement("MAP_LOW_ZOOM_INDIVIDUAL_MARKERS_ZERO", worldViewSafe, `${integer(storeAcceptance.low_zoom_marker_count)} individual store markers appear at world zoom.`, "wiki-truth-307-store-audit.json"),
    requirement("MAP_STORE_VISUAL_AUDIT_PASS", storeVisualAcceptance, "A reviewed medium/local store-map visual sequence is required when a validated projection exists.", "wiki-truth-307-store-audit.json"),
    requirement("PRODUCTION_UNTOUCHED", productionUntouched, "Legal/store artifacts must remain local-only with no SSOT, map-runtime, production, or deployment mutation.", "wiki-truth-307-final-reconciliation.json + wiki-truth-307-store-audit.json"),
  ];
  const blockers = requirements.filter((item) => item.status !== "PROVEN");
  const goalAchieved = blockers.length === 0;
  const truthReconciled = legalFullyReconciled ? TOTAL_GEO : 0;

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    local_only: true,
    non_mutating: true,
    dependency_direction: "LEGAL_EVIDENCE -> CANONICAL_LEGAL_TRUTH -> STORE_ELIGIBILITY -> STORE_DISCOVERY -> STORE_PROJECTION",
    legal: {
      TOTAL_GEO,
      PROCESSED_GEO: rows.length,
      CANONICAL_TRUTH_ROWS: uniqueGeos.size,
      CANONICAL_TRUTH_RESULT_SCHEMA_COMPLETE: bit(
        reconciliationFlags.canonicalTruthResultSchemaComplete,
      ),
      CANONICAL_CONFIDENCE_DIMENSIONS_COMPLETE: canonicalConfidenceDimensionsComplete,
      HUMAN_SUMMARY_MACHINE_PLACEHOLDER_ROWS: integer(
        reconciliationCounts?.humanSummary?.MACHINE_PLACEHOLDER_ROWS,
      ),
      TRUTH_RECONCILED: truthReconciled,
      TRUTH_RECONCILIATION_STATE: legalFullyReconciled ? "COMPLETE" : "FAIL_CLOSED_INCOMPLETE",
      TRUTH_PROVEN: integer(truthConfidence.PROVEN),
      TRUTH_STRONG: integer(truthConfidence.STRONG),
      TRUTH_PARTIAL: integer(truthConfidence.PARTIAL),
      TRUTH_CONFLICTING: integer(truthConfidence.CONFLICTING),
      TRUTH_UNKNOWN: integer(truthConfidence.UNKNOWN),
      FINAL_GREEN: integer(truthColors.GREEN),
      FINAL_YELLOW: integer(truthColors.YELLOW),
      FINAL_RED: integer(truthColors.RED),
      FINAL_UNKNOWN: integer(truthColors.UNKNOWN),
      CROSS_LAYER_TRUTH_CONFLICTS: conflictRows.length,
      APPLIED_TRUTH_ROWS: declaredAppliedRows,
      APPLIED_CROSS_LAYER_TRUTH_CONFLICTS: appliedCrossLayerConflictRows.length,
      UNPROVEN_GREEN_ROWS: unprovenGreenRows.length,
      FALSE_UNKNOWN_REGRESSIONS: integer(falseClasses.FALSE_UNKNOWN),
      FALSE_GREEN_REGRESSIONS: integer(falseClasses.FALSE_GREEN),
      FALSE_YELLOW_REGRESSIONS: integer(falseClasses.FALSE_YELLOW),
      FALSE_RED_REGRESSIONS: integer(falseClasses.FALSE_RED),
    },
    store: {
      STORE_GEO_CHECKED: integer(storeCounts.STORE_GEO_CHECKED),
      STORE_GEO_ELIGIBLE: integer(storeCounts.STORE_GEO_ELIGIBLE),
      STORES_NOT_LEGAL: integer(storeCounts.STORES_NOT_LEGAL),
      LEGAL_NO_STOREFRONT_MODEL: integer(storeCounts.LEGAL_NO_STOREFRONT_MODEL),
      OFFICIAL_REGISTRY_FOUND: integer(storeCounts.OFFICIAL_REGISTRY_FOUND),
      REGISTRY_NOT_FOUND: integer(storeCounts.REGISTRY_NOT_FOUND),
      SOURCE_NEEDS_EXTRACTION: integer(storeCounts.SOURCE_NEEDS_EXTRACTION),
      REGISTRY_PARTIAL: integer(storeCounts.REGISTRY_PARTIAL),
      STORE_DATA_CONFLICTING: integer(storeCounts.STORE_DATA_CONFLICTING),
      UNKNOWN_LEGALITY: integer(storeCounts.UNKNOWN_LEGALITY),
      STORE_SOURCES_VALIDATED: integer(storeCounts.STORE_SOURCES_VALIDATED),
      STORES_EXTRACTED: integer(storeCounts.STORES_EXTRACTED),
      STORES_DEDUPLICATED: integer(storeCounts.STORES_DEDUPLICATED),
      STORES_VALIDATED: integer(storeCounts.STORES_VALIDATED),
      STORES_VISIBLE: integer(storeCounts.STORES_VISIBLE),
      STORES_BLOCKED: integer(storeCounts.STORES_BLOCKED),
      STORES_REVOKED: integer(storeCounts.STORES_REVOKED),
      STORES_EXPIRED: integer(storeCounts.STORES_EXPIRED),
      STORES_SUSPENDED: integer(storeCounts.STORES_SUSPENDED),
      STORES_MISSING_FROM_SOURCE: integer(storeCounts.STORES_MISSING_FROM_SOURCE),
      STORE_JURISDICTION_COLLISIONS: integer(storeCounts.STORE_JURISDICTION_COLLISIONS),
      CIRCULAR_TRUTH_DEPENDENCY: integer(storeCounts.CIRCULAR_TRUTH_DEPENDENCY),
    },
    map: {
      LOW_ZOOM_MARKER_COUNT: integer(storeAcceptance.low_zoom_marker_count),
      LOCAL_ZOOM_MARKER_COUNT: integer(storeAcceptance.local_zoom_marker_count),
      VIEWPORT_QUERY_PASS: bit(storeAcceptance.viewport_query_pass),
      CLUSTERING_PASS: bit(storeAcceptance.clustering_pass),
      STALE_VIEWPORT_RESPONSE_COUNT: integer(storeAcceptance.stale_viewport_response_count),
      VISUAL_MAP_AUDIT_PASS: bit(storeAcceptance.visual_map_audit_pass),
    },
    production: {
      PRODUCTION_TOUCHED: bit(storeAcceptance.production_touched),
      PRODUCTION_DEPLOYED: bit(storeAcceptance.production_deployed),
    },
    requirements,
    completion_blockers: blockers,
    GOAL_ACHIEVED: goalAchieved,
  };
}

function writeMarkdown(report) {
  const lines = [
    "# 307-GEO legal truth and licensed-store final acceptance",
    "",
    `Generated: ${report.generated_at}`,
    `GOAL_ACHIEVED=${report.GOAL_ACHIEVED}`,
    `TRUTH_RECONCILED=${report.legal.TRUTH_RECONCILED}/${TOTAL_GEO}`,
    `TRUTH_PROVEN=${report.legal.TRUTH_PROVEN}`,
    `TRUTH_STRONG=${report.legal.TRUTH_STRONG}`,
    `TRUTH_PARTIAL=${report.legal.TRUTH_PARTIAL}`,
    `TRUTH_CONFLICTING=${report.legal.TRUTH_CONFLICTING}`,
    `TRUTH_UNKNOWN=${report.legal.TRUTH_UNKNOWN}`,
    `HUMAN_SUMMARY_MACHINE_PLACEHOLDER_ROWS=${report.legal.HUMAN_SUMMARY_MACHINE_PLACEHOLDER_ROWS}`,
    `STORE_GEO_CHECKED=${report.store.STORE_GEO_CHECKED}/${TOTAL_GEO}`,
    `CROSS_LAYER_TRUTH_CONFLICTS=${report.legal.CROSS_LAYER_TRUTH_CONFLICTS}`,
    `STORE_JURISDICTION_COLLISIONS=${report.store.STORE_JURISDICTION_COLLISIONS}`,
    `CIRCULAR_TRUTH_DEPENDENCY=${report.store.CIRCULAR_TRUTH_DEPENDENCY}`,
    `VISUAL_MAP_AUDIT_PASS=${report.map.VISUAL_MAP_AUDIT_PASS}`,
    `PRODUCTION_TOUCHED=${report.production.PRODUCTION_TOUCHED}`,
    `PRODUCTION_DEPLOYED=${report.production.PRODUCTION_DEPLOYED}`,
    "",
    "## Requirements",
    "",
    "| Requirement | Status | Impact | Reason |",
    "| --- | --- | --- | --- |",
    ...report.requirements.map((item) => `| ${item.id} | ${item.status} | ${item.completion_impact} | ${item.reason.replace(/\|/g, "\\|")} |`),
    "",
    "## Completion blockers",
    "",
    ...(report.completion_blockers.length
      ? report.completion_blockers.map((item) => `- ${item.id}: ${item.reason}`)
      : ["- None."]),
    "",
  ];
  fs.writeFileSync(OUT_MD_PATH, `${lines.join("\n")}\n`);
}

function main() {
  const report = buildStoreGoalAcceptance({
    reconciliation: readJson(RECONCILIATION_PATH),
    legalCompletion: readJson(LEGAL_COMPLETION_PATH),
    storeAudit: readJson(STORE_AUDIT_PATH),
  });
  report.input_hashes = [
    hashInput(RECONCILIATION_PATH),
    hashInput(LEGAL_COMPLETION_PATH),
    hashInput(STORE_AUDIT_PATH),
  ];
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeMarkdown(report);
  console.log(`GOAL_ACCEPTANCE legal_rows=${report.legal.CANONICAL_TRUTH_ROWS} truth_reconciled=${report.legal.TRUTH_RECONCILED} store_geos=${report.store.STORE_GEO_CHECKED} visible=${report.store.STORES_VISIBLE} goal_achieved=${report.GOAL_ACHIEVED}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();

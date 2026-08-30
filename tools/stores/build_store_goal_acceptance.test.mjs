import assert from "node:assert/strict";
import test from "node:test";
import { buildStoreGoalAcceptance } from "./build_store_goal_acceptance.mjs";

function canonicalTruthResult(geo) {
  const axis = {
    value: "UNKNOWN_UNPROVEN_AXIS",
    status: "UNKNOWN",
  };
  return {
    geo_id: geo,
    display_name: geo,
    jurisdiction_level: "CANONICAL_GEO",
    parent_geo_id: null,
    governing_jurisdiction: geo,
    evidence_freshness: "CURRENT_EFFECTIVE_OFFICIAL_SOURCE_PRESENT",
    truth_status: "TEST_RULE",
    truth_color: "GREEN",
    resolver_rule: "TEST_RULE",
    truth_confidence: "STRONG",
    source_authority: "PROVEN",
    source_freshness: "STRONG",
    evidence_completeness: "STRONG",
    jurisdiction_match_confidence: "PROVEN",
    legal_interpretation_confidence: "STRONG",
    human_explanation: "Test-only canonical truth result.",
    apply_state: "BLOCKED",
    official_sources: [],
    effective_date: { status: "CURRENT_EFFECTIVE_SOURCE_PRESENT" },
    adult_use: axis,
    medical_use: axis,
    operational_patient_access: axis,
    possession: axis,
    cultivation: axis,
    dispensing: axis,
    retail: axis,
    pharmacy_access: axis,
    club_access: axis,
    prescription_only: axis,
    pharmaceutical_only: axis,
    research_only: axis,
    cultivation_only: axis,
    export_only: axis,
    decriminalized: axis,
    pending_legislation: axis,
  };
}

function rows(key) {
  return Array.from({ length: 307 }, (_, index) => {
    const geo = `G${String(index).padStart(3, "0")}`;
    return key === "geo"
      ? { geo, truthColor: "GREEN", canonicalTruthResult: canonicalTruthResult(geo) }
      : { [key]: geo };
  });
}

function inputs() {
  return {
    reconciliation: {
      rows: rows("geo"),
      complete: true,
      noMutationProof: { unchanged: true, appliedRows: 0 },
      counts: {
        truthColors: { GREEN: 100, YELLOW: 100, RED: 50, UNKNOWN: 57 },
        truthConfidence: { PROVEN: 20, STRONG: 200, PARTIAL: 40, CONFLICTING: 7, UNKNOWN: 40 },
        falseClasses: {},
      },
      acceptance: {
        flags: { rows307Reconciled: true, canonicalTruthResultSchemaComplete: true, humanSummariesFreeOfMachinePlaceholders: true, allGreenOperationallyProven: true, freshOfficialVisualReviewComplete: true, ssotMapProductionRuntimeUnchanged: true },
        crossLayerConflictRows: [],
        unprovenGreenRows: [],
      },
    },
    legalCompletion: { overallComplete: true },
    storeAudit: {
      rows: rows("geo_id"),
      counts: { STORE_GEO_CHECKED: 307, STORE_GEO_ELIGIBLE: 200 },
      acceptance: {
        all_geo_accounted: true,
        store_discovery_complete: true,
        all_visible_stores_validated: true,
        jurisdiction_collisions_zero: true,
        circular_truth_dependency_zero: true,
        visual_map_audit_pass: true,
        low_zoom_marker_count: 0,
        local_zoom_marker_count: 3,
        viewport_query_pass: true,
        clustering_pass: true,
        stale_viewport_response_count: 0,
        production_touched: false,
        production_deployed: false,
      },
    },
  };
}

test("permits completion only when both legal and store acceptance are proven", () => {
  const report = buildStoreGoalAcceptance(inputs());
  assert.equal(report.GOAL_ACHIEVED, true);
  assert.equal(report.legal.TRUTH_RECONCILED, 307);
  assert.equal(report.legal.TRUTH_STRONG, 200);
  assert.equal(report.store.STORE_GEO_CHECKED, 307);
  assert.equal(report.completion_blockers.length, 0);
});

test("fails closed when a source-only store queue or visual audit remains", () => {
  const fixture = inputs();
  fixture.storeAudit.acceptance.store_discovery_complete = false;
  fixture.storeAudit.acceptance.visual_map_audit_pass = false;
  fixture.storeAudit.counts.SOURCE_NEEDS_EXTRACTION = 41;
  const report = buildStoreGoalAcceptance(fixture);
  assert.equal(report.GOAL_ACHIEVED, false);
  assert.equal(report.legal.TRUTH_RECONCILED, 307);
  assert.deepEqual(report.completion_blockers.map((item) => item.id), ["STORE_DISCOVERY_COMPLETE", "MAP_STORE_VISUAL_AUDIT_PASS"]);
});

test("does not call 307 legal truth reconciled while a legal acceptance gate remains open", () => {
  const fixture = inputs();
  fixture.reconciliation.complete = false;
  fixture.legalCompletion.overallComplete = false;
  fixture.reconciliation.acceptance.crossLayerConflictRows = ["US-CO"];
  const report = buildStoreGoalAcceptance(fixture);
  assert.equal(report.legal.TRUTH_RECONCILED, 0);
  assert.equal(report.GOAL_ACHIEVED, false);
  assert.ok(report.completion_blockers.some((item) => item.id === "LEGAL_TRUTH_RECONCILED_307"));
  assert.equal(report.legal.CROSS_LAYER_TRUTH_CONFLICTS, 1);
  assert.equal(report.legal.APPLIED_CROSS_LAYER_TRUTH_CONFLICTS, 0);
  assert.ok(report.requirements.some((item) => item.id === "LEGAL_APPLIED_CROSS_LAYER_CONFLICTS_ZERO" && item.status === "PROVEN"));
});

test("fails closed when canonical rows do not materialize the required truth result schema", () => {
  const fixture = inputs();
  fixture.reconciliation.acceptance.flags.canonicalTruthResultSchemaComplete = false;
  const report = buildStoreGoalAcceptance(fixture);
  assert.equal(report.GOAL_ACHIEVED, false);
  assert.equal(report.legal.CANONICAL_TRUTH_RESULT_SCHEMA_COMPLETE, false);
  assert.ok(report.completion_blockers.some((item) => item.id === "LEGAL_CANONICAL_RESULT_307"));
});

test("fails closed when canonical confidence dimensions use an unapproved vocabulary", () => {
  const fixture = inputs();
  fixture.reconciliation.rows[0].canonicalTruthResult.truth_confidence = "HIGH";
  const report = buildStoreGoalAcceptance(fixture);
  assert.equal(report.GOAL_ACHIEVED, false);
  assert.equal(report.legal.CANONICAL_CONFIDENCE_DIMENSIONS_COMPLETE, false);
  assert.ok(report.completion_blockers.some((item) => item.id === "LEGAL_CANONICAL_CONFIDENCE_307"));
  assert.ok(report.completion_blockers.some((item) => item.id === "LEGAL_TRUTH_RECONCILED_307"));
});

test("fails closed when canonical human summaries expose a machine placeholder", () => {
  const fixture = inputs();
  fixture.reconciliation.acceptance.flags.humanSummariesFreeOfMachinePlaceholders = false;
  fixture.reconciliation.counts.humanSummary = { MACHINE_PLACEHOLDER_ROWS: 1 };
  const report = buildStoreGoalAcceptance(fixture);
  assert.equal(report.GOAL_ACHIEVED, false);
  assert.equal(report.legal.HUMAN_SUMMARY_MACHINE_PLACEHOLDER_ROWS, 1);
  assert.ok(report.completion_blockers.some((item) => item.id === "LEGAL_HUMAN_SUMMARY_INTEGRITY"));
});

test("blocks an applied cross-layer conflict without treating proposal-only mismatches as applied", () => {
  const fixture = inputs();
  fixture.reconciliation.noMutationProof.appliedRows = 1;
  fixture.reconciliation.rows[0] = {
    ...fixture.reconciliation.rows[0],
    geo: "US-CO",
    layerConflict: true,
    ssot: { mutationApplied: true },
  };
  fixture.reconciliation.acceptance.crossLayerConflictRows = ["US-CO"];
  const report = buildStoreGoalAcceptance(fixture);
  assert.equal(report.legal.CROSS_LAYER_TRUTH_CONFLICTS, 1);
  assert.equal(report.legal.APPLIED_TRUTH_ROWS, 1);
  assert.equal(report.legal.APPLIED_CROSS_LAYER_TRUTH_CONFLICTS, 1);
  assert.ok(report.completion_blockers.some((item) => item.id === "LEGAL_APPLIED_CROSS_LAYER_CONFLICTS_ZERO"));
  assert.equal(report.GOAL_ACHIEVED, false);
});

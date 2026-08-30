import type { WikiTruthSecondPassProgress } from "@/lib/wikiTruthSecondPass";

export type WikiTruthFinalReconciliationRow = {
  geo: string;
  territory: string;
  previousColor: string;
  truthColor: string;
  falseClass: string | null;
  changed: boolean;
  truthRuleId: string;
  truthReason: string;
  truthConfidence?: string;
  applyState?: "SAFE_TO_APPLY" | "BLOCKED" | "NEEDS_REVIEW" | string;
  greenProof: boolean;
  layerConflict: boolean;
  canonicalTruthResult?: {
    geo_id: string;
    display_name: string;
    jurisdiction_level: string;
    parent_geo_id: string | null;
    governing_jurisdiction: string;
    evidence_freshness: string;
    truth_status: string;
    truth_color: string;
    resolver_rule: string;
    truth_confidence: string;
    human_explanation: string;
    apply_state: string;
    official_sources: string[];
    effective_date: { status: string; source_urls?: string[] };
    [axis: string]: unknown;
  };
  primaryLaw: {
    effectiveSourceCoverage: string;
    primaryLawUrl: string;
  };
  wikipedia: {
    status: string;
    reason: string;
  };
  ssot: {
    status: string;
  };
};

export type WikiTruthFinalReconciliationView = {
  generatedAt: string;
  reportVersion: string;
  rowsTotal: number;
  rowsExpected: number;
  nonMutating: boolean;
  localOnly: boolean;
  deterministicColorFunction: string;
  ruleEngineCorrections: string[];
  counts: {
    truthColors: Record<string, number>;
    truthConfidence?: Record<string, number>;
    falseClasses: Record<string, number>;
    freshSourceRecheck: Record<string, number>;
    applyStates?: Record<string, number>;
  };
  changes: WikiTruthFinalReconciliationRow[];
  unknownRows: WikiTruthFinalReconciliationRow[];
  acceptance: {
    complete: boolean;
    flags: Record<string, boolean>;
    crossLayerConflictRows: string[];
    unprovenGreenRows: string[];
    coloredWithoutOfficialEvidence: string[];
  };
  noMutationProof: {
    unchanged: boolean;
    appliedRows: number;
    productionTouched: boolean;
  };
  progress: WikiTruthSecondPassProgress;
  rows: WikiTruthFinalReconciliationRow[];
};

export const emptyWikiTruthFinalReconciliation: WikiTruthFinalReconciliationView = {
  generatedAt: "",
  reportVersion: "MISSING",
  rowsTotal: 0,
  rowsExpected: 0,
  nonMutating: true,
  localOnly: true,
  deterministicColorFunction: "",
  ruleEngineCorrections: [],
  counts: {
    truthColors: {},
    truthConfidence: {},
    falseClasses: {},
    freshSourceRecheck: {},
    applyStates: {},
  },
  changes: [],
  unknownRows: [],
  acceptance: {
    complete: false,
    flags: {},
    crossLayerConflictRows: [],
    unprovenGreenRows: [],
    coloredWithoutOfficialEvidence: [],
  },
  noMutationProof: {
    unchanged: false,
    appliedRows: 0,
    productionTouched: false,
  },
  progress: {
    schemaVersion: 0,
    generatedAt: "",
    total_geo_count: 0,
    processed_geo_count: 0,
    working_search_artifact_count: 0,
    working_review_artifact_count: 0,
    fresh_search_count: 0,
    fresh_visual_review_count: 0,
    screenshot_count: 0,
    baseline_screenshot_count: 0,
    canonical_evidence_record_count: 0,
    direct_evidence_count: 0,
    composite_evidence_count: 0,
    context_only_count: 0,
    negative_result_count: 0,
    non_cannabis_rejected_count: 0,
    confirmed_match_count: 0,
    confirmed_mismatch_count: 0,
    partial_match_count: 0,
    insufficient_evidence_count: 0,
    project_status_missing_count: 0,
    source_conflict_count: 0,
    proposed_status_changes: 0,
    proposed_color_changes: 0,
    status_data_changed: false,
    map_colors_changed: false,
    production_touched: false,
    goal_achieved: false,
    acceptance_flags: {},
    artifacts: {},
  },
  rows: [],
};

export function normalizeWikiTruthFinalReconciliation(
  payload: unknown,
): WikiTruthFinalReconciliationView {
  if (!payload || typeof payload !== "object") {
    return emptyWikiTruthFinalReconciliation;
  }
  const record = payload as Partial<WikiTruthFinalReconciliationView>;
  return {
    ...emptyWikiTruthFinalReconciliation,
    ...record,
    counts: {
      ...emptyWikiTruthFinalReconciliation.counts,
      ...(record.counts || {}),
    },
    acceptance: {
      ...emptyWikiTruthFinalReconciliation.acceptance,
      ...(record.acceptance || {}),
    },
    noMutationProof: {
      ...emptyWikiTruthFinalReconciliation.noMutationProof,
      ...(record.noMutationProof || {}),
    },
    progress: {
      ...emptyWikiTruthFinalReconciliation.progress,
      ...(record.progress || {}),
    },
    rows: Array.isArray(record.rows) ? record.rows : [],
    changes: Array.isArray(record.changes) ? record.changes : [],
    unknownRows: Array.isArray(record.unknownRows)
      ? record.unknownRows
      : [],
    ruleEngineCorrections: Array.isArray(record.ruleEngineCorrections)
      ? record.ruleEngineCorrections
      : [],
  };
}

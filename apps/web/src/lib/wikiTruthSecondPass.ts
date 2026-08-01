export type WikiTruthSecondPassProgress = {
  schemaVersion: number;
  generatedAt: string;
  total_geo_count: number;
  processed_geo_count: number;
  working_search_artifact_count: number;
  working_review_artifact_count: number;
  fresh_search_count: number;
  fresh_visual_review_count: number;
  screenshot_count: number;
  baseline_screenshot_count: number;
  canonical_evidence_record_count: number;
  direct_evidence_count: number;
  composite_evidence_count: number;
  context_only_count: number;
  negative_result_count: number;
  non_cannabis_rejected_count: number;
  confirmed_match_count: number;
  confirmed_mismatch_count: number;
  partial_match_count: number;
  insufficient_evidence_count: number;
  project_status_missing_count: number;
  source_conflict_count: number;
  proposed_status_changes: number;
  proposed_color_changes: number;
  status_data_changed: boolean;
  map_colors_changed: boolean;
  production_touched: boolean;
  goal_achieved: boolean;
  acceptance_flags: Record<string, unknown>;
  artifacts: Record<string, string>;
};

export const emptyWikiTruthSecondPassProgress: WikiTruthSecondPassProgress = {
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
};

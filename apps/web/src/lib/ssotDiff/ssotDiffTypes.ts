export type SsotDiffType =
  | "STATUS_CHANGE"
  | "MED_STATUS_CHANGE"
  | "NOTES_UPDATE"
  | "OFFICIAL_SOURCE_ADDED"
  | "OFFICIAL_SOURCE_REMOVED"
  | "WIKI_PAGE_CHANGED";

export type SsotSnapshotRow = {
  geo: string;
  rec_status: string;
  med_status: string;
  notes_hash: string;
  official_sources: string[];
  wiki_page_url: string | null;
};

export type SsotSnapshot = {
  generated_at: string;
  row_count: number;
  rows: SsotSnapshotRow[];
};

export type SsotDiffEntry = {
  geo: string;
  type: SsotDiffType;
  old_value: string | null;
  new_value: string | null;
  ts: string;
  change_key: string;
};

export type SsotPendingChange = {
  change_key: string;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  entry: Omit<SsotDiffEntry, "ts">;
};

export type SsotDiffRegistry = {
  generated_at: string;
  changes: SsotDiffEntry[];
};

export type SsotDiffCache = {
  generated_at: string;
  last_24h: SsotDiffEntry[];
  last_7d: SsotDiffEntry[];
  pending: SsotPendingChange[];
};

export type SsotDiffRunResult = {
  status: "baseline" | "pending" | "changed" | "stable";
  snapshotCount: number;
  registryCount: number;
  pendingCount: number;
  confirmedCount: number;
};

export type OfficialOwnerScope = "country" | "state" | "territory" | "multi_geo" | "global" | "unknown";
export type OfficialSourceScope = "country" | "state" | "multi_geo" | "global" | "unknown";
export type OfficialOwnershipQuality = "STRONG_OFFICIAL" | "WEAK_OFFICIAL" | "GLOBAL_FALLBACK" | "UNKNOWN";
export type OfficialOwnershipBasis =
  | "country_domain_match"
  | "state_domain_match"
  | "manual_alias_match"
  | "multi_geo_match"
  | "global_projection"
  | "unresolved";
export type OfficialExclusionReason =
  | "none"
  | "banned_non_official"
  | "global_non_country_coverage"
  | "unknown_ownership"
  | "unresolved";

export type OfficialSourceKind =
  | "government"
  | "ministry"
  | "parliament"
  | "court"
  | "regulator"
  | "official_publication"
  | "treaty_body"
  | "other_official";

export type OfficialMatchingBasis =
  | "manual"
  | "registry_hint"
  | "page_title"
  | "country_name_match"
  | "state_name_match"
  | "treaty_mapping"
  | "domain_rule";

export type OfficialConfidence = "high" | "medium" | "low";

export type OfficialLinkOwnershipEntry = {
  url: string;
  normalized_url: string;
  domain: string;
  source_scope: OfficialSourceScope;
  owner_scope: OfficialOwnerScope;
  owner_geos: string[];
  owner_country: string | null;
  source_kind: OfficialSourceKind;
  matching_basis: OfficialMatchingBasis;
  ownership_basis: OfficialOwnershipBasis;
  ownership_quality: OfficialOwnershipQuality;
  confidence: OfficialConfidence;
  notes: string;
  is_active_for_country_coverage: boolean;
  effective: boolean;
  exclusion_reason: OfficialExclusionReason;
};

export type OfficialLinkOwnershipDiagnostics = {
  registry_total_raw: number;
  registry_total_unique_urls: number;
  registry_total_unique_domains: number;
  duplicates_exact: number;
  duplicates_same_target: number;
  unresolved_links: number;
  assigned_country_links: number;
  assigned_state_links: number;
  assigned_territory_links: number;
  assigned_multi_geo_links: number;
  assigned_global_links: number;
  unresolved_unknown_links: number;
  raw_vs_effective_explainer: string;
};

export type OfficialLinkOwnershipDataset = {
  generated_at: string;
  raw_registry_total: number;
  effective_registry_total: number;
  items: OfficialLinkOwnershipEntry[];
  diagnostics: OfficialLinkOwnershipDiagnostics;
};

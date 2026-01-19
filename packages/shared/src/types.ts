export type LawStatus = "allowed" | "restricted" | "illegal";

export type RiskFlag =
  | "border_crossing"
  | "public_use"
  | "driving"
  | "federal_property_us";

export type Source = { title: string; url: string };

export type VerificationStatus =
  | "known"
  | "unknown"
  | "needs_review"
  | "provisional";
export type ConfidenceLevel = "high" | "medium" | "low";
export type JurisdictionKey = string;
export type LocationMethod = "gps" | "ip" | "manual";

export type LocationResolution = {
  method: LocationMethod;
  confidence: ConfidenceLevel;
  note?: string;
};

export type LocationMeta = LocationResolution;

export type ResultStatusLevel = "green" | "yellow" | "red" | "gray";

export type ExtrasStatus = "allowed" | "restricted" | "illegal" | "unknown";

export type ExtrasItem = {
  key: string;
  label: string;
  value: string;
};

export type ResultViewModel = {
  jurisdictionKey: string;
  title: string;
  statusLevel: ResultStatusLevel;
  statusTitle: string;
  bullets: string[];
  keyRisks: string[];
  sources: Source[];
  verifiedAt?: string;
  updatedAt?: string;
  extrasPreview?: ExtrasItem[];
  extrasFull?: ExtrasItem[];
  nearestLegal?: {
    title: string;
    jurisdictionKey: string;
    distanceKm: number;
    approx: true;
  };
  location: {
    mode: "detected" | "manual" | "query";
    method?: LocationMethod;
    confidence?: ConfidenceLevel;
  };
  meta: {
    requestId?: string;
    cacheHit?: boolean;
    verifiedFresh?: boolean;
    needsReview?: boolean;
    paid?: boolean;
    paywallHint?: boolean;
    ssotChanged?: boolean;
    nowIso?: string;
    offlineMode?: boolean;
    offlineFallback?: boolean;
    offlineFallbackSources?: Source[];
    offlineFallbackNote?: string;
    verifyReason?: string | null;
  };
};

export type JurisdictionLawProfile = {
  schema_version: number;
  id: string;
  country: string;
  region?: string;
  medical: LawStatus;
  recreational: LawStatus;
  possession_limit?: string;
  public_use: "allowed" | "restricted" | "illegal";
  home_grow?: "allowed" | "restricted" | "illegal";
  cross_border: "illegal";
  risks: RiskFlag[];
  sources: Source[];
  updated_at: string;
  verified_at: string | null;
  confidence: ConfidenceLevel;
  status: VerificationStatus;
  provenance?: {
    method: "ocr+ai";
    extracted_at: string;
    model_id: string;
    input_hashes: string[];
    citations?: Array<{
      url: string;
      snippet_hash: string;
      retrieved_at: string;
    }>;
  };
  extras?: {
    purchase?: ExtrasStatus;
    retail_shops?: ExtrasStatus;
    edibles?: ExtrasStatus;
    vapes?: ExtrasStatus;
    concentrates?: ExtrasStatus;
    cbd?: ExtrasStatus;
    paraphernalia?: ExtrasStatus;
    medical_card?: ExtrasStatus;
    home_grow_plants?: string;
    social_clubs?: ExtrasStatus;
    hemp?: ExtrasStatus;
    workplace?: ExtrasStatus;
    testing_dui?: ExtrasStatus;
  };
  verified_official?: boolean;
  effective_date?: string | null;
  facts?: Array<{
    category: string;
    url: string;
    effective_date?: string | null;
    text_snippet?: string | null;
  }>;
  status_recreational?: "legal" | "decriminalized" | "illegal";
  status_medical?: "legal" | "decriminalized" | "illegal";
  official_sources?: string[];
  wiki_source?: string | null;
  wiki_claim?: {
    name_in_wiki: string;
    wiki_row_url: string;
    recreational_status: "Legal" | "Decrim" | "Illegal" | "Unenforced" | "Unknown";
    medical_status: "Legal" | "Limited" | "Illegal" | "Unknown";
    notes_main_articles: Source[];
    wiki_revision_id?: string;
    fetched_at?: string;
  } | null;
  legal_ssot?: {
    recreational: "legal" | "decriminalized" | "illegal";
    medical: "legal" | "decriminalized" | "illegal";
    notes?: string | null;
    confidence?: ConfidenceLevel;
    sources?: Source[];
    generated_at?: string | null;
    generatedAt?: string | null;
  };
  auto_verified?: {
    status_recreational: "legal" | "decriminalized" | "illegal" | "unknown";
    status_medical: "legal" | "decriminalized" | "illegal" | "unknown";
    medical_allowed?: boolean;
    restricted_notes?: string | null;
    confidence?: "low" | "med" | "machine_high";
    official_source_ok?: boolean;
    source_url?: string | null;
    snapshot_path?: string | null;
    snapshot_ref?: string | null;
    content_hash?: string | null;
    retrieved_at?: string | null;
    model_id?: string | null;
    evidence_kind?: "law" | "non_law";
    evidence?: Array<{
      type?: "pdf_page" | "html_anchor";
      page?: string | null;
      anchor?: string | null;
      quote?: string | null;
      snapshot_path: string;
      kind?: "pdf_page" | "html_anchor";
      ref?: string;
      snippet?: string;
      snippet_hash?: string;
    }>;
  };
  machine_verified?: {
    status_recreational: "legal" | "decriminalized" | "illegal" | "unknown";
    status_medical: "legal" | "decriminalized" | "illegal" | "unknown";
    medical_allowed?: boolean;
    restricted_notes?: string | null;
    confidence?: "low" | "med" | "machine_high";
    official_source_ok?: boolean;
    source_url?: string | null;
    snapshot_path?: string | null;
    snapshot_ref?: string | null;
    content_hash?: string | null;
    retrieved_at?: string | null;
    model_id?: string | null;
    evidence_kind?: "law" | "non_law";
    evidence?: Array<{
      type?: "pdf_page" | "html_anchor";
      page?: string | null;
      anchor?: string | null;
      quote?: string | null;
      snapshot_path: string;
      kind?: "pdf_page" | "html_anchor";
      ref?: string;
      snippet?: string;
      snippet_hash?: string;
    }>;
  };
};

export type TripPlan = "free" | "trip_pass";

export type Trip = {
  id: string;
  startedAt: string;
  endsAt?: string | null;
  isActive: boolean;
  plan: TripPlan;
  maxDays: number;
  maxEvents: number;
};

export type TripEvent = {
  id: string;
  tripId: string;
  ts: string;
  jurisdictionKey: string;
  country: string;
  region?: string;
  method: LocationMethod;
  confidence: ConfidenceLevel;
  statusLevel: "green" | "yellow" | "red";
  statusCode: string;
  verified_at?: string | null;
  needs_review?: boolean;
};

export type Product = "TRIP_PASS_7_DAYS" | "TRIP_PASS_14_DAYS";

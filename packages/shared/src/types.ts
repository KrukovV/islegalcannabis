export type LawStatus = "allowed" | "restricted" | "illegal";

export type RiskFlag =
  | "border_crossing"
  | "public_use"
  | "driving"
  | "federal_property_us";

export type Source = { title: string; url: string };

export type JurisdictionLawProfile = {
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
};

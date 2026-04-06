export type AIRequest = {
  message: string;
  geo_hint?: string;
};

export type TravelRiskLevel = "high" | "medium" | "low";

export type AirportEntry = {
  iata: string;
  icao: string;
  name: string;
  country: string;
  region?: string;
  city?: string;
  type?: string;
  strict?: boolean;
};

export type TravelAdvisory = {
  geo: string;
  locationLabel: string;
  riskLevel: TravelRiskLevel;
  text: string;
  sources: string[];
};

export type AIResponse = {
  answer: string;
  sources: string[];
  safety_note: string;
};

export type RagChunk = {
  id: string;
  source: string;
  kind: "legal" | "culture";
  geo?: string;
  title: string;
  text: string;
  keywords?: string[];
};

export type TravelRiskBlock = {
  title: string;
  bullets: string[];
};

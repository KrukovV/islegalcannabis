export type AIRequest = {
  message: string;
  geo_hint?: string;
  lat?: number;
  lng?: number;
  model?: string;
};

export type AIIntent =
  | "legal"
  | "buy"
  | "possession"
  | "tourists"
  | "airport"
  | "medical"
  | "culture"
  | "nearby"
  | "general";

export type AIResponse = {
  answer: string;
  sources: string[];
  safety_note: string;
  model?: string;
  llm_connected?: boolean;
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

export type DialogState = {
  lastQuery: string | null;
  lastUser: string | null;
  lastLocation: string | null;
  lastIntent: AIIntent | null;
  lastTopic: string | null;
  lastAnswer: string | null;
  lastAssistant: string | null;
  source: "user" | "ui" | "geo" | null;
  tone: "calm";
  depth: "short" | "medium";
};

export type AIContext = {
  query: string;
  language: string;
  location: {
    geoHint: string | null;
    name: string | null;
    source?: "user" | "ui" | "geo" | null;
    lat?: number | null;
    lng?: number | null;
  };
  intent: AIIntent;
  legal: {
    resultStatus: string | null;
    recreational: string | null;
    medical: string | null;
    distribution: string | null;
    finalRisk: string | null;
    prison: boolean;
    arrest: boolean;
  } | null;
  notes: string | null;
  enforcement: {
    level: string | null;
    recreational: string | null;
  } | null;
  medical: {
    status: string | null;
    scope: string | null;
  } | null;
  social: {
    summary: string | null;
    confidence: number | null;
  } | null;
  airports: {
    summary: string | null;
  } | null;
  culture: Array<{
    title: string;
    text: string;
    source: string;
  }>;
  compare: {
    geoHint: string | null;
    name: string | null;
    recreational: string | null;
    medical: string | null;
    finalRisk: string | null;
    notes: string | null;
  } | null;
  nearby: {
    warning: string;
    results: Array<{
      country: string;
      geo: string;
      distanceKm: number;
      effectiveDistanceKm: number;
      accessType: "legal" | "mostly_allowed" | "limited" | "tolerated" | "strict";
      truthScore: number;
      explanation: string;
      whyThisResult: string;
      destinationRisk: "low" | "medium" | "high";
      pathRisk: "low" | "medium" | "high";
    }>;
  } | null;
  memory: Array<{
    query: string;
    answer: string;
    score: number;
  }>;
  history: DialogState;
  sources: string[];
};

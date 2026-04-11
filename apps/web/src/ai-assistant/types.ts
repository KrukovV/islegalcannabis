export type AIRequest = {
  message: string;
  geo_hint?: string;
};

export type AIIntent = "legal" | "buy" | "possession" | "tourists" | "airport" | "medical" | "culture" | "general";

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

export type DialogState = {
  lastLocation: string | null;
  lastIntent: AIIntent | null;
  lastTopic: string | null;
  tone: "calm";
  depth: "short" | "medium";
};

export type AIContext = {
  query: string;
  language: string;
  location: {
    geoHint: string | null;
    name: string | null;
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
  history: DialogState;
  sources: string[];
};

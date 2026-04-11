export type AIRequest = {
  message: string;
  geo_hint?: string;
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

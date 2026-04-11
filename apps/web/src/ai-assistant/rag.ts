import cultureData from "../../../../data/ai/culture.json";
import cultureDeepData from "../../../../data/ai/culture_deep.json";
import artistsExtendedData from "../../../../data/ai/artists_extended.json";
import legalBaselineData from "../../../../data/ai/legal_baseline.json";
import moviesData from "../../../../data/ai/movies.json";
import travelRisksData from "../../../../data/ai/travel_risks.json";
import type { RagChunk, TravelRiskBlock } from "./types";

type LegalBaselineRow = {
  country: string;
  summary: string;
  risk: string;
  notes?: string;
};

type CultureRow = {
  topic: string;
  content: string;
  keywords?: string[];
};

type TravelRisksRow = {
  title: string;
  bullets: string[];
};

const legalRows = legalBaselineData as LegalBaselineRow[];
const cultureRows = [
  ...(cultureData as CultureRow[]),
  ...(cultureDeepData as CultureRow[]),
  ...(artistsExtendedData as CultureRow[]),
  ...(moviesData as CultureRow[])
];
const travelRisks = travelRisksData as TravelRisksRow[];

const corpus: RagChunk[] = [
  ...legalRows.map((row) => ({
    id: `legal:${row.country}`,
    source: `legal_baseline:${row.country}`,
    kind: "legal" as const,
    geo: row.country,
    title: row.country,
    text: [row.summary, row.risk, row.notes].filter(Boolean).join(". "),
    keywords: [row.country]
  })),
  ...cultureRows.map((row) => ({
    id: `culture:${row.topic}`,
    source: `culture:${row.topic}`,
    kind: "culture" as const,
    title: row.topic,
    text: row.content,
    keywords: row.keywords || [row.topic]
  }))
];

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function buildVector(tokens: string[]) {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function cosineScore(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (const value of a.values()) aNorm += value * value;
  for (const value of b.values()) bNorm += value * value;
  for (const [token, aValue] of a.entries()) {
    const bValue = b.get(token);
    if (bValue) dot += aValue * bValue;
  }

  if (!dot || !aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function retrieveTopChunks(query: string, geoHint?: string, limit: number = 5) {
  const queryTokens = tokenize([query, geoHint].filter(Boolean).join(" "));
  const queryVector = buildVector(queryTokens);

  return corpus
    .map((chunk) => {
      const chunkTokens = tokenize([chunk.title, chunk.text, ...(chunk.keywords || [])].join(" "));
      const score = cosineScore(queryVector, buildVector(chunkTokens)) + (geoHint && chunk.geo === geoHint ? 0.35 : 0);
      return { chunk, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.chunk);
}

const RISK_PATTERNS = [/airport/i, /flight/i, /fly/i, /travel/i, /carry/i, /border/i, /transport/i];

export function getTravelRiskBlock(query: string): TravelRiskBlock | null {
  if (!RISK_PATTERNS.some((pattern) => pattern.test(query))) return null;
  const block = travelRisks[0];
  return block ? { title: block.title, bullets: block.bullets } : null;
}

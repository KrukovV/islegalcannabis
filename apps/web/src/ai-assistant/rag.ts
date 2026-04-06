import cultureData from "../../../../data/ai/culture.json";
import cultureDeepData from "../../../../data/ai/culture_deep.json";
import artistsExtendedData from "../../../../data/ai/artists_extended.json";
import culture420Data from "../../../../data/ai/culture/420.json";
import cultureDelta8Data from "../../../../data/ai/culture/delta8.json";
import cultureReggaeData from "../../../../data/ai/culture/reggae.json";
import cultureRastafariData from "../../../../data/ai/culture/rastafari.json";
import cultureJamaicaKingstonData from "../../../../data/ai/culture/jamaica_kingston.json";
import cultureArtistsData from "../../../../data/ai/culture/artists.json";
import culturePersonalitiesData from "../../../../data/ai/culture/personalities.json";
import cultureFilmsData from "../../../../data/ai/culture/films.json";
import cultureFunFactsData from "../../../../data/ai/culture/fun_facts.json";
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
  content?: string;
  content_en?: string;
  content_ru?: string;
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
  ...(moviesData as CultureRow[]),
  ...(culture420Data as CultureRow[]),
  ...(cultureDelta8Data as CultureRow[]),
  ...(cultureReggaeData as CultureRow[]),
  ...(cultureRastafariData as CultureRow[]),
  ...(cultureJamaicaKingstonData as CultureRow[]),
  ...(cultureArtistsData as CultureRow[]),
  ...(culturePersonalitiesData as CultureRow[]),
  ...(cultureFilmsData as CultureRow[]),
  ...(cultureFunFactsData as CultureRow[])
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
    text: [row.content, row.content_en, row.content_ru].filter(Boolean).join(" "),
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

const RISK_PATTERNS = [/airport/i, /flight/i, /travel/i, /carry/i, /border/i, /transport/i];

export function getTravelRiskBlock(query: string): TravelRiskBlock | null {
  if (!RISK_PATTERNS.some((pattern) => pattern.test(query))) return null;
  const block = travelRisks[0];
  return block ? { title: block.title, bullets: block.bullets } : null;
}

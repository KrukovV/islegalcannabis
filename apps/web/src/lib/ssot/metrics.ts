import { ALL_GEO, GEO_TOTAL } from "@/lib/geo/allGeo";

type WikiClaimRow = {
  notesWiki?: string;
  notes_text?: string;
  notes?: string;
};

export type WikiCoverageMetrics = {
  GEO_TOTAL: number;
  WIKI_ROWS_TOTAL: number;
  WIKI_MISSING_TOTAL: number;
  WIKI_NOTES_NONEMPTY: number;
  WIKI_NOTES_EMPTY: number;
  WIKI_MISSING: string[];
};

function getWikiNotes(entry: WikiClaimRow | undefined): string {
  if (!entry) return "";
  return String(entry.notesWiki || entry.notes_text || entry.notes || "");
}

export function computeWikiCoverageMetrics(
  wikiClaims: Record<string, WikiClaimRow> | null | undefined
): WikiCoverageMetrics {
  const claims = wikiClaims || {};
  const keys = Object.keys(claims);
  const missing = ALL_GEO.filter((geo) => !claims[geo]);
  let notesNonEmpty = 0;
  for (const geo of keys) {
    const notes = getWikiNotes(claims[geo]);
    if (notes.trim().length > 0) notesNonEmpty += 1;
  }
  const wikiRowsTotal = keys.length;
  const notesEmpty = Math.max(0, wikiRowsTotal - notesNonEmpty);
  return {
    GEO_TOTAL,
    WIKI_ROWS_TOTAL: wikiRowsTotal,
    WIKI_MISSING_TOTAL: missing.length,
    WIKI_NOTES_NONEMPTY: notesNonEmpty,
    WIKI_NOTES_EMPTY: notesEmpty,
    WIKI_MISSING: missing
  };
}

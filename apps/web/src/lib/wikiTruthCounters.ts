export type WikiTruthUniverseId =
  | "WIKI_COUNTRIES"
  | "ISO_COUNTRIES"
  | "REF_SSOT"
  | "US_STATES"
  | "TERRITORIES";

export type WikiTruthSummaryCard = {
  id: WikiTruthUniverseId | "OFFICIAL_REGISTRY" | "OFFICIAL_GEO_COVERAGE" | "DIAGNOSTICS";
  title: string;
  sourceOfTruth: string;
  covered: number;
  total: number;
  missing: number;
  inclusionRule: string;
};

export type WikiTruthIssueCounters = {
  statusMismatch: number;
  noOurRow: number;
  officialSourcesMissing: number;
  sourcesMissing: number;
  wikiNotesMissing: number;
};

export function buildSummaryCard(input: WikiTruthSummaryCard): WikiTruthSummaryCard {
  return {
    ...input,
    missing: Math.max(input.total - input.covered, input.missing, 0)
  };
}

export function buildIssueCounters(flagsByRow: string[][]): WikiTruthIssueCounters {
  const counters: WikiTruthIssueCounters = {
    statusMismatch: 0,
    noOurRow: 0,
    officialSourcesMissing: 0,
    sourcesMissing: 0,
    wikiNotesMissing: 0
  };

  for (const flags of flagsByRow) {
    if (flags.includes("STATUS_MISMATCH")) counters.statusMismatch += 1;
    if (flags.includes("NO_OUR_ROW")) counters.noOurRow += 1;
    if (flags.includes("OFFICIAL_SOURCES_MISSING")) counters.officialSourcesMissing += 1;
    if (flags.includes("SOURCES_MISSING")) counters.sourcesMissing += 1;
    if (flags.includes("WIKI_NOTES_MISSING")) counters.wikiNotesMissing += 1;
  }

  return counters;
}

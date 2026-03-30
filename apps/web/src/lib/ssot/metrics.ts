import { ALL_GEO, GEO_TOTAL } from "@/lib/geo/allGeo";

type WikiClaimRow = {
  notesWiki?: string;
  notes_text?: string;
  notes?: string;
  country?: string;
  name?: string;
  geo_name?: string;
  rec_status?: string;
  med_status?: string;
  wiki_rec?: string;
  wiki_med?: string;
  recreational_status?: string;
  medical_status?: string;
  primary_source?: string;
  source_type?: string;
};

type LegalityRow = {
  iso2?: string;
  country?: string;
  rec_status?: string;
  med_status?: string;
};

export type MissingCoverageRow = {
  geo: string;
  name: string;
  type: "country" | "state" | "us";
  wiki_page_url?: string;
  expected_wiki_page_url?: string;
  expected_source_hint: "WIKI_COUNTRIES" | "US_JURISDICTION";
  missing_reason:
    | "NO_WIKI_ROW"
    | "NO_ISO_MATCH"
    | "NO_LEGALITY"
    | "NO_MED"
    | "NO_NOTES"
    | "NO_STATUS_RECORD"
    | "NO_SSOT_ENTRY"
    | "NO_US_STATE_ENTRY";
};

export type WikiCoverageMetrics = {
  COUNTRY_UNIVERSE_TOTAL: number;
  REF_UNIVERSE_TOTAL: number;
  GEO_TOTAL: number;
  WIKI_ROWS_TOTAL: number;
  WIKI_COUNTRY_ROWS: number;
  WIKI_COUNTRY_ROWS_MATCHED_ISO: number;
  WIKI_COUNTRY_MISSING: number;
  COUNTRY_WIKI_ROWS: number;
  COUNTRY_NOTES_WIKI_TOTAL: number;
  COUNTRY_MISSING_TOTAL: number;
  ISO_MISSING_LEGALITY: number;
  MISSING_ISO2_LIST: string[];
  MISSING_REASON_MAP: Record<string, "NO_WIKI_ROW" | "NO_ISO_MATCH">;
  WIKI_COUNTRY_ROWS_EMPTY_ISO: number;
  WIKI_COUNTRY_ROWS_NON_ISO: number;
  WIKI_COUNTRY_ROWS_DUPLICATES: number;
  WIKI_COVERED_TOTAL: number;
  WIKI_MISSING_TOTAL_REF: number;
  WIKI_MISSING_TOTAL: number;
  WIKI_MISSING_STATES_TOTAL: number;
  WIKI_COUNTRY_TOTAL: number;
  WIKI_STATES_TOTAL: number;
  WIKI_NOTES_NONEMPTY: number;
  WIKI_NOTES_EMPTY: number;
  NOTES_WIKI_NONEMPTY: number;
  NOTES_WIKI_EMPTY: number;
  NOTES_WIKI_TOTAL: number;
  WIKI_MISSING: string[];
  WIKI_MISSING_STATES: string[];
  US_STATES_TOTAL: number;
  US_STATES_COVERED_TOTAL: number;
  US_STATES_MISSING_TOTAL: number;
  US_STATES_MISSING: string[];
  LEGALITY_COVERED_TOTAL: number;
  LEGALITY_MISSING_TOTAL: number;
  WIKI_MISSING_ROWS: MissingCoverageRow[];
  COVERAGE_SOURCE_WIKI: number;
  COVERAGE_SOURCE_OFFICIAL: number;
  COVERAGE_SOURCE_US_JURISDICTION: number;
  COVERAGE_SOURCE_UNKNOWN: number;
  SSOT_REF_COVERED: number;
  SSOT_REF_MISSING: number;
  STATUS_RECORD_COVERED_TOTAL: number;
  STATUS_RECORD_MISSING_TOTAL: number;
  SSOT_MISSING_ROWS: MissingCoverageRow[];
};

function normalizeCountryName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getWikiNotes(entry: WikiClaimRow | undefined): string {
  if (!entry) return "";
  return String(entry.notes_text || "");
}

function getWikiPageUrl(entry: WikiClaimRow | undefined): string {
  if (!entry) return "";
  const candidate = String((entry as { wiki_row_url?: string }).wiki_row_url || "").trim();
  return /^https?:\/\//i.test(candidate) ? candidate : "";
}

function hasStatus(entry: WikiClaimRow | undefined): boolean {
  if (!entry) return false;
  const rec = String(entry.wiki_rec || entry.recreational_status || entry.rec_status || "").trim();
  const med = String(entry.wiki_med || entry.medical_status || entry.med_status || "").trim();
  return rec.length > 0 || med.length > 0;
}

export function computeWikiCoverageMetrics(
  wikiClaims: Record<string, WikiClaimRow> | null | undefined,
  wikiKeysOverride?: string[],
  useOverride = false,
  legalityRowsInput?: LegalityRow[],
  wikiPageUniverse?: Record<string, string>,
  usStatesWikiKeys?: string[]
): WikiCoverageMetrics {
  const claims = wikiClaims || {};
  const baseKeys = wikiKeysOverride && (useOverride || wikiKeysOverride.length)
    ? wikiKeysOverride
    : Object.keys(claims);
  const keys = baseKeys.map((key) => String(key).toUpperCase());
  const allGeo = ALL_GEO.map((geo) => String(geo).toUpperCase());
  const allCountries = allGeo.filter((geo) => !/-/.test(geo) && geo !== "US");
  const allStates = allGeo.filter((geo) => /^US-/.test(geo));
  const usStatesWikiSet = new Set((usStatesWikiKeys || []).map((k) => String(k).toUpperCase()));
  const wikiCountries = keys.filter((geo) => !/-/.test(geo));
  const wikiStates = keys.filter((geo) => /^US-/.test(geo));
  const wikiCountrySet = new Set(wikiCountries);
  const wikiStateSet = new Set(wikiStates);
  const missing = allCountries.filter((geo) => !wikiCountrySet.has(geo));
  const missingStates = allStates.filter((geo) => !wikiStateSet.has(geo));
  const legalityRows = Array.isArray(legalityRowsInput) ? legalityRowsInput : [];
  const countryIsoCounts = new Map<string, number>();
  const countryNameToIso = new Map<string, string>();
  for (const [geo, claim] of Object.entries(claims)) {
    const iso = String(geo || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso) || iso === "US") continue;
    const normalized = normalizeCountryName(claim?.country || claim?.name || claim?.geo_name || "");
    if (!normalized || countryNameToIso.has(normalized)) continue;
    countryNameToIso.set(normalized, iso);
  }
  let wikiCountryRowsEmptyIso = 0;
  let wikiCountryRowsNonIso = 0;
  const noIsoMatchSet = new Set<string>();
  for (const row of legalityRows) {
    const iso = String(row?.iso2 || "").toUpperCase();
    const countryName = normalizeCountryName(row?.country || "");
    const matchedIsoByName = countryNameToIso.get(countryName) || "";
    if (!iso) {
      wikiCountryRowsEmptyIso += 1;
      if (matchedIsoByName) noIsoMatchSet.add(matchedIsoByName);
      continue;
    }
    if (/^US-/.test(iso) || iso === "US") continue;
    if (!allCountries.includes(iso)) {
      wikiCountryRowsNonIso += 1;
      if (matchedIsoByName) noIsoMatchSet.add(matchedIsoByName);
      continue;
    }
    countryIsoCounts.set(iso, (countryIsoCounts.get(iso) || 0) + 1);
  }
  let wikiCountryRowsDuplicates = 0;
  for (const count of countryIsoCounts.values()) {
    if (count > 1) wikiCountryRowsDuplicates += count - 1;
  }
  const legalitySet = new Set(
    legalityRows.map((row) => String(row?.iso2 || "").toUpperCase()).filter(Boolean)
  );
  const legalityCoveredTotal = legalitySet.size;
  const legalityMissingTotal = allGeo.length - legalityCoveredTotal;
  const wikiCountryRowsMatchedIso = allCountries.filter((geo) => legalitySet.has(geo)).length;
  const wikiCountryRows = legalityRows.length;
  const wikiCountryMissing = allCountries.length - wikiCountryRowsMatchedIso;
  for (const iso of Array.from(noIsoMatchSet)) {
    if (legalitySet.has(iso)) noIsoMatchSet.delete(iso);
  }

  const claimByGeo = new Map<string, WikiClaimRow>();
  for (const key of Object.keys(claims)) {
    claimByGeo.set(String(key).toUpperCase(), claims[key]);
  }
  const legalityByGeo = new Map<string, LegalityRow>();
  for (const row of legalityRows) {
    const geo = String(row?.iso2 || "").toUpperCase();
    if (geo) legalityByGeo.set(geo, row);
  }

  const missingIso2List = allCountries
    .map((geo) => String(geo).toUpperCase())
    .filter((geo) => !legalitySet.has(geo))
    .sort();
  const missingReasonMap = Object.fromEntries(
    missingIso2List.map((iso) => [
      iso,
      noIsoMatchSet.has(iso) ? "NO_ISO_MATCH" : "NO_WIKI_ROW"
    ])
  ) as Record<string, "NO_WIKI_ROW" | "NO_ISO_MATCH">;

  const wikiMissingRows: MissingCoverageRow[] = allCountries
    .map((geo) => String(geo).toUpperCase())
    .filter((geo) => !legalitySet.has(geo))
    .map((geo) => {
      const claim = claimByGeo.get(geo);
      const legality = legalityByGeo.get(geo);
      const type: MissingCoverageRow["type"] = geo === "US" ? "us" : /^US-/.test(geo) ? "state" : "country";
      const name = String(
        legality?.country || claim?.country || claim?.name || claim?.geo_name || geo
      );
      const wikiPageUrl = getWikiPageUrl(claim);
      return {
        geo,
        name,
        type,
        wiki_page_url: wikiPageUrl || undefined,
        expected_wiki_page_url: wikiPageUniverse?.[geo] || undefined,
        expected_source_hint: (type === "state" ? "US_JURISDICTION" : "WIKI_COUNTRIES") as MissingCoverageRow["expected_source_hint"],
        missing_reason: missingReasonMap[geo] || "NO_WIKI_ROW"
      };
    })
    .sort((a, b) => {
      const rank = (type: MissingCoverageRow["type"]) => (type === "state" ? 1 : 0);
      const rankDiff = rank(a.type) - rank(b.type);
      if (rankDiff !== 0) return rankDiff;
      return a.geo.localeCompare(b.geo);
    });

  let notesNonEmpty = 0;
  let sourceWiki = 0;
  let sourceOfficial = 0;
  let sourceUsJurisdiction = 0;
  let sourceUnknown = 0;
  for (const geo of allGeo) {
    if (!/^US-/.test(geo) && geo !== "US" && legalitySet.has(geo)) {
      const notes = getWikiNotes(claimByGeo.get(geo));
      if (notes.trim().length > 0) notesNonEmpty += 1;
    }
    const entry = claimByGeo.get(geo);
    if (!entry) continue;
    const primary = String(entry.primary_source || entry.source_type || "").toUpperCase();
    if (primary === "WIKI_US_JURISDICTION") {
      sourceUsJurisdiction += 1;
    } else if (primary === "OFFICIAL") {
      sourceOfficial += 1;
    } else if (primary === "WIKI_COUNTRIES" || primary.startsWith("WIKI")) {
      sourceWiki += 1;
    } else {
      sourceUnknown += 1;
    }
  }
  const wikiRowsTotal = legalitySet.size;
  const notesEmpty = Math.max(0, wikiCountryRows - notesNonEmpty);
  const usStatesCoveredTotal = allStates.filter((geo) => usStatesWikiSet.has(geo)).length;
  const usStatesMissingTotal = allStates.length - usStatesCoveredTotal;
  const usStatesMissing = allStates.filter((geo) => !usStatesWikiSet.has(geo));
  const ssotMissingRows: MissingCoverageRow[] = allGeo
    .filter((geo) => {
      const claim = claimByGeo.get(geo);
      return !claim || !hasStatus(claim);
    })
    .map((geo) => {
      const type: MissingCoverageRow["type"] = geo === "US" ? "us" : /^US-/.test(geo) ? "state" : "country";
      return {
        geo,
        name: geo,
        type,
        expected_source_hint: (/^US-/.test(geo) ? "US_JURISDICTION" : "WIKI_COUNTRIES") as MissingCoverageRow["expected_source_hint"],
        missing_reason: type === "state" ? "NO_US_STATE_ENTRY" : "NO_SSOT_ENTRY"
      };
    });
  const statusRecordCoveredTotal = allGeo.length - ssotMissingRows.length;
  return {
    COUNTRY_UNIVERSE_TOTAL: allCountries.length,
    REF_UNIVERSE_TOTAL: GEO_TOTAL,
    GEO_TOTAL,
    WIKI_ROWS_TOTAL: wikiRowsTotal,
    WIKI_COUNTRY_ROWS: wikiCountryRows,
    WIKI_COUNTRY_ROWS_MATCHED_ISO: wikiCountryRowsMatchedIso,
    WIKI_COUNTRY_MISSING: wikiCountryMissing,
    COUNTRY_WIKI_ROWS: wikiCountryRows,
    COUNTRY_NOTES_WIKI_TOTAL: notesNonEmpty,
    COUNTRY_MISSING_TOTAL: wikiCountryMissing,
    ISO_MISSING_LEGALITY: wikiCountryMissing,
    MISSING_ISO2_LIST: missingIso2List,
    MISSING_REASON_MAP: missingReasonMap,
    WIKI_COUNTRY_ROWS_EMPTY_ISO: wikiCountryRowsEmptyIso,
    WIKI_COUNTRY_ROWS_NON_ISO: wikiCountryRowsNonIso,
    WIKI_COUNTRY_ROWS_DUPLICATES: wikiCountryRowsDuplicates,
    WIKI_COVERED_TOTAL: wikiCountryRowsMatchedIso,
    WIKI_MISSING_TOTAL_REF: legalityMissingTotal,
    WIKI_MISSING_TOTAL: missing.length,
    WIKI_MISSING_STATES_TOTAL: missingStates.length,
    WIKI_COUNTRY_TOTAL: wikiCountries.length,
    WIKI_STATES_TOTAL: wikiStates.length,
    WIKI_NOTES_NONEMPTY: notesNonEmpty,
    WIKI_NOTES_EMPTY: notesEmpty,
    NOTES_WIKI_NONEMPTY: notesNonEmpty,
    NOTES_WIKI_EMPTY: notesEmpty,
    NOTES_WIKI_TOTAL: wikiCountryRows,
    WIKI_MISSING: missing,
    WIKI_MISSING_STATES: missingStates,
    US_STATES_TOTAL: allStates.length,
    US_STATES_COVERED_TOTAL: usStatesCoveredTotal,
    US_STATES_MISSING_TOTAL: usStatesMissingTotal,
    US_STATES_MISSING: usStatesMissing,
    LEGALITY_COVERED_TOTAL: legalityCoveredTotal,
    LEGALITY_MISSING_TOTAL: legalityMissingTotal,
    WIKI_MISSING_ROWS: wikiMissingRows,
    COVERAGE_SOURCE_WIKI: sourceWiki,
    COVERAGE_SOURCE_OFFICIAL: sourceOfficial,
    COVERAGE_SOURCE_US_JURISDICTION: sourceUsJurisdiction,
    COVERAGE_SOURCE_UNKNOWN: sourceUnknown,
    SSOT_REF_COVERED: statusRecordCoveredTotal,
    SSOT_REF_MISSING: ssotMissingRows.length,
    STATUS_RECORD_COVERED_TOTAL: statusRecordCoveredTotal,
    STATUS_RECORD_MISSING_TOTAL: ssotMissingRows.length,
    SSOT_MISSING_ROWS: ssotMissingRows
  };
}

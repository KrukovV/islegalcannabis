import {
  getEffectiveOfficialCountryCoverage,
  getEffectiveOfficialLinksByGeo,
  getFilteredOwnershipRows,
  matchesOfficialGeoOwnership,
  type buildOfficialLinkOwnershipIndex
} from "@/lib/officialSources/officialLinkOwnership";
import type { OfficialLinkOwnershipDataset } from "@/lib/officialSources/officialLinkOwnershipTypes";
import { buildOfficialOwnershipView, type OfficialOwnershipViewModel } from "@/lib/officialSources/officialOwnershipView";
import { type OfficialRegistrySummary } from "@/lib/officialSources/registry";
import { computeWikiCoverageMetrics, type MissingCoverageRow } from "@/lib/ssot/metrics";
import { buildIssueCounters, buildSummaryCard, type WikiTruthIssueCounters, type WikiTruthSummaryCard } from "@/lib/wikiTruthCounters";
import { buildRegions, buildSSOTStatusIndex } from "@/lib/mapData";
import { buildStatusContract, isSupportedStatusPair } from "@/lib/statusPairMatrix";
import {
  classifyGarbageRow,
  normalizeCountryKey,
  normalizeWikiDisplayTitle,
  type WikiTruthResolutionReason
} from "@/lib/wikiTruthNormalization";

type LegalityRow = {
  country?: string;
  iso2?: string;
  rec_status?: string;
  med_status?: string;
  wiki_notes_hint?: string;
};

type ClaimRow = {
  geo_id?: string;
  geo_key?: string;
  iso2?: string;
  country?: string;
  name?: string;
  geo_name?: string;
  notes_text?: string;
  notes_kind?: string;
  rec_status?: string;
  med_status?: string;
  wiki_rec?: string;
  wiki_med?: string;
  recreational_status?: string;
  medical_status?: string;
  wiki_row_url?: string;
  name_in_wiki?: string;
  source?: string;
  source_type?: string;
  source_page?: string;
  source_url?: string;
  sources?: Array<{ title?: string; url?: string }>;
  main_articles?: Array<{ title?: string; url?: string }>;
};

type OfficialEvalRow = {
  sources_total?: number;
  sources_official?: number;
  official?: number;
};

type OfficialBadgeRow = {
  url?: string;
  title?: string;
  official_badge?: boolean;
};

type EnrichedRef = {
  url?: string;
  official?: boolean;
};

type LinkItem = {
  url?: string;
  title?: string;
  isOfficial?: boolean;
  ownershipQuality?: string;
};

export type WikiTruthAuditRow = {
  geoKey: string;
  country: string;
  wikiRec: string;
  wikiMed: string;
  finalRec: string;
  finalMed: string;
  wikiStatus: string;
  finalStatus: string;
  finalMapCategory: string;
  truthSourceLabel: string;
  statusOverrideReason: string;
  snapshotId: string;
  snapshotBuiltAt: string;
  snapshotDatasetHash: string;
  ruleId: string;
  wikiNotes: string;
  notesPresent: boolean;
  notesText: string;
  notesExplainability: string;
  notesLen: number;
  notesQuality: string;
  triggerPhraseExcerpt: string;
  contextNote: string;
  enforcementNote: string;
  socialRealityNote: string;
  evidenceDelta: string;
  evidenceDeltaReason: string;
  evidenceSourceType: string;
  evidenceDeltaApproved: boolean;
  changesFinalStatus: boolean;
  wikiPageUrl: string;
  sources: LinkItem[];
  officialSources: LinkItem[];
  official: "yes" | "no";
  officialSignal: "strong" | "weak" | "fallback" | "no";
  flags: string[];
  mismatchFlags: string[];
  delta: string;
};

export type WikiTruthGarbageRow = {
  country: string;
  iso2: string;
  reason: WikiTruthResolutionReason;
};

export type WikiTruthAliasRow = {
  geo: string;
  country: string;
  canonicalTitle: string;
  wikiAliasTitle: string;
  expectedWikiTitle: string;
  expectedWikiUrl: string;
  actualWikiUrl: string;
  reason: WikiTruthResolutionReason;
};

export type WikiTruthCoverageRow = {
  geo: string;
  name: string;
  type: string;
  expectedWikiTitle: string;
  expectedWikiUrl: string;
  expectedSourceHint: string;
  reason: string;
};

export type WikiTruthAuditModel = {
  summaryCards: WikiTruthSummaryCard[];
  issueCounters: WikiTruthIssueCounters;
  allRows: WikiTruthAuditRow[];
  mainRows: WikiTruthAuditRow[];
  diagnostics: {
    garbageRows: WikiTruthGarbageRow[];
    unresolvedAliases: WikiTruthAliasRow[];
    missingWikiRows: WikiTruthCoverageRow[];
    emptyIsoCount: number;
    nonIsoCount: number;
    duplicateCount: number;
  };
  uncoveredCountries: WikiTruthCoverageRow[];
  usStates: {
    total: number;
    covered: number;
    missing: number;
    rows: MissingCoverageRow[];
  };
  ssotCoverage: {
    total: number;
    covered: number;
    missing: number;
      rows: WikiTruthCoverageRow[];
  };
  officialOwnership: {
    rawRegistryTotal: number;
    effectiveRegistryTotal: number;
    unresolvedUnknownLinks: number;
    assignedCountryLinks: number;
    assignedStateLinks: number;
    assignedMultiGeoLinks: number;
    assignedGlobalLinks: number;
    discrepancyExplanation: string;
  };
  officialOwnershipView: OfficialOwnershipViewModel;
};

type BuildInput = {
  legalityRows: LegalityRow[];
  claimsItems: Record<string, ClaimRow>;
  officialItems: Record<string, OfficialEvalRow>;
  officialBadgeItems: Record<string, OfficialBadgeRow[]>;
  enrichedItems: Record<string, EnrichedRef[]>;
  coverageSummary: Record<string, string>;
  expectedWikiPageByIso: Record<string, string>;
  usStatesWikiKeys: string[];
  officialRegistrySummary: OfficialRegistrySummary;
  officialOwnershipIndex: ReturnType<typeof buildOfficialLinkOwnershipIndex>;
  officialOwnershipDataset: OfficialLinkOwnershipDataset;
};

function classifyNotes(text: string, kind?: string): string {
  const trimmed = String(text || "").trim();
  const upperKind = String(kind || "").toUpperCase();
  if (!trimmed) return "EMPTY";
  if (/^See also:/i.test(trimmed) || /^Further information:/i.test(trimmed)) return "PLACEHOLDER";
  if (upperKind) return upperKind;
  if (trimmed.length < 80) return "WEAK";
  return "RICH";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function buildOwnershipMatchedOfficialSources(params: {
  geoKey: string;
  sourcesRaw: Array<{ title?: string; url?: string }>;
  enrichedRefs: EnrichedRef[];
  officialBadges: OfficialBadgeRow[];
  officialOwnershipIndex: ReturnType<typeof buildOfficialLinkOwnershipIndex>;
}) {
  const byUrl = new Map<string, LinkItem>();

  const pushIfMatched = (url: string, title?: string) => {
    const normalizedUrl = String(url || "").trim();
    if (!normalizedUrl || !isHttpUrl(normalizedUrl)) return;
    if (!matchesOfficialGeoOwnership(normalizedUrl, params.geoKey, params.officialOwnershipIndex)) return;
    const current = byUrl.get(normalizedUrl);
    byUrl.set(normalizedUrl, {
      url: normalizedUrl,
      title: String(title || current?.title || "").trim(),
      isOfficial: true
    });
  };

  for (const source of params.sourcesRaw) {
    pushIfMatched(String(source?.url || "").trim(), String(source?.title || "").trim());
  }
  for (const entry of params.enrichedRefs) {
    pushIfMatched(String(entry?.url || "").trim(), "");
  }
  for (const badge of params.officialBadges) {
    pushIfMatched(String(badge?.url || "").trim(), String(badge?.title || "").trim());
  }

  return Array.from(byUrl.values());
}

function buildWikiFallbackSource(row: {
  source?: string;
  source_type?: string;
  source_page?: string;
  source_url?: string;
  wiki_row_url?: string;
}) {
  const sourceKey = String(row.source_type || row.source || "").toLowerCase();
  const wikiBacked = sourceKey.includes("wiki") || sourceKey === "countries" || sourceKey === "states";
  if (!wikiBacked) return null;
  const fallbackUrl = String(row.source_url || row.wiki_row_url || "").trim();
  const fallbackTitle = String(row.source_page || "Legality_of_cannabis").trim();
  if (!fallbackUrl && !fallbackTitle) return null;
  return {
    title: fallbackTitle || "Legality_of_cannabis",
    url: fallbackUrl,
    isOfficial: false
  };
}

function buildStatusLabel(rec: string, med: string) {
  return `Rec: ${rec} / Med: ${med}`;
}

function resolveExpectedTitleDisplay(input: {
  country: string;
  expectedWikiUrl: string;
  actualWikiUrl: string;
  wikiAliasTitle: string;
}) {
  const expectedTitle = normalizeWikiDisplayTitle(input.expectedWikiUrl);
  const actualTitle = normalizeWikiDisplayTitle(input.actualWikiUrl);
  const aliasTitle = String(input.wikiAliasTitle || "").trim();
  const countryTitle = String(input.country || "").trim();
  const expectedKey = normalizeCountryKey(expectedTitle);
  const trustedKeys = new Set(
    [normalizeCountryKey(actualTitle), normalizeCountryKey(aliasTitle), normalizeCountryKey(countryTitle)].filter(Boolean)
  );

  if (expectedTitle && trustedKeys.has(expectedKey)) return expectedTitle;
  return actualTitle || aliasTitle || countryTitle || expectedTitle;
}

export function buildWikiTruthAudit(input: BuildInput): WikiTruthAuditModel {
  const resolverStatusIndex = buildSSOTStatusIndex(buildRegions());
  const garbageRows = input.legalityRows
    .map((row) => ({
      country: String(row.country || "").trim() || "-",
      iso2: String(row.iso2 || "").trim().toUpperCase() || "-",
      reason: classifyGarbageRow(row)
    }))
    .filter((row): row is WikiTruthGarbageRow => Boolean(row.reason));

  const validLegalityRows = input.legalityRows.filter((row) => !classifyGarbageRow(row));
  const rawWikiCountryRows = input.legalityRows.length;
  const legalityKeys = validLegalityRows.map((row) => String(row.iso2 || "").toUpperCase()).filter(Boolean);
  const wikiMetrics = computeWikiCoverageMetrics(
    input.claimsItems,
    legalityKeys,
    true,
    validLegalityRows,
    input.expectedWikiPageByIso,
    input.usStatesWikiKeys
  );

  const claimsByIso2 = new Map<string, ClaimRow>();
  const claimsByName = new Map<string, ClaimRow>();
  for (const claim of Object.values(input.claimsItems)) {
    const iso2 = String(claim.iso2 || claim.geo_id || claim.geo_key || "").toUpperCase();
    if (iso2) claimsByIso2.set(iso2, claim);
    const normalizedName = normalizeCountryKey(claim.country || claim.name || claim.geo_name || "");
    if (normalizedName) claimsByName.set(normalizedName, claim);
  }

  const auditedRows = validLegalityRows.map((row) => {
    const iso2 = String(row.iso2 || "").toUpperCase();
    const country = String(row.country || "").trim();
    const claim = claimsByIso2.get(iso2) || claimsByName.get(normalizeCountryKey(country));
    const geoKey = String(claim?.geo_id || claim?.geo_key || iso2 || "").toUpperCase();
    const resolverStatus = resolverStatusIndex.get(geoKey) || resolverStatusIndex.get(iso2);
    const wikiContract = buildStatusContract({
      wikiRecStatus: row.rec_status,
      wikiMedStatus: row.med_status
    });
    const finalContract = buildStatusContract({
      wikiRecStatus: wikiContract.wikiRecStatus,
      wikiMedStatus: wikiContract.wikiMedStatus,
      finalRecStatus: resolverStatus?.finalRecStatus || wikiContract.wikiRecStatus,
      finalMedStatus: resolverStatus?.finalMedStatus || wikiContract.wikiMedStatus,
      evidenceDelta: resolverStatus?.evidenceDelta,
      evidenceDeltaApproved: resolverStatus?.evidenceDeltaApproved
    });
    const recWiki = wikiContract.wikiRecStatus;
    const medWiki = wikiContract.wikiMedStatus;
    const finalRec = finalContract.finalRecStatus;
    const finalMed = finalContract.finalMedStatus;
    const notesWikiRaw = String(row.wiki_notes_hint || "").trim();
    const normalizedNotes = String(claim?.notes_text || "").trim();
    const notesExplainability = String(resolverStatus?.notesInterpretationSummary || "").trim();
    const notesPresent = Boolean(normalizedNotes || notesWikiRaw || notesExplainability);
    const hasKnownStatus =
      recWiki !== "Unknown" ||
      medWiki !== "Unknown" ||
      finalRec !== "Unknown" ||
      finalMed !== "Unknown";
    const notesQualityBase = classifyNotes(normalizedNotes || notesWikiRaw, claim?.notes_kind);
    const notesQuality = notesQualityBase === "EMPTY" && hasKnownStatus ? "VALID_EMPTY" : notesQualityBase;
    const sourcesRaw = Array.isArray(claim?.sources) ? claim.sources : Array.isArray(claim?.main_articles) ? claim.main_articles : [];
    const fallbackSource = buildWikiFallbackSource(claim || {});
    const enrichedRefs = Array.isArray(input.enrichedItems[geoKey]) ? input.enrichedItems[geoKey] : [];
    const officialBadges = Array.isArray(input.officialBadgeItems[geoKey]) ? input.officialBadgeItems[geoKey] : [];
    const matchedRowSources = buildOwnershipMatchedOfficialSources({
      geoKey,
      sourcesRaw,
      enrichedRefs,
      officialBadges,
      officialOwnershipIndex: input.officialOwnershipIndex
    });
    const filteredOwnershipRows = getFilteredOwnershipRows(input.officialOwnershipDataset).filter((entry) =>
      entry.owner_geos.map((geo) => String(geo || "").toUpperCase()).includes(geoKey)
    );
    const effectiveOwnershipSources = getEffectiveOfficialLinksByGeo(geoKey, input.officialOwnershipDataset).map((entry) => ({
      url: entry.url.startsWith("http") ? entry.url : `https://${entry.url}`,
      title: entry.domain,
      isOfficial: true,
      ownershipQuality: entry.ownership_quality
    }));
    const officialSources = effectiveOwnershipSources.length ? effectiveOwnershipSources.slice(0, 5) : matchedRowSources.slice(0, 5);
    const officialUrlSet = new Set(officialSources.map((entry) => String(entry.url || "").trim()).filter(Boolean));
    const sources = sourcesRaw
      .map((entry) => ({
        url: String(entry?.url || "").trim(),
        title: String(entry?.title || "").trim(),
        isOfficial: officialUrlSet.has(String(entry?.url || "").trim())
      }))
      .filter((entry) => entry.url || entry.title);
    if (fallbackSource && !sources.length) sources.push(fallbackSource);

    const officialSignal = effectiveOwnershipSources.some((entry) => entry.ownershipQuality === "STRONG_OFFICIAL")
      ? "strong"
      : effectiveOwnershipSources.some((entry) => entry.ownershipQuality === "WEAK_OFFICIAL")
        ? "weak"
        : filteredOwnershipRows.some((entry) => entry.ownership_quality === "GLOBAL_FALLBACK")
          ? "fallback"
          : "no";
    const officialExpected = Number(input.officialItems[geoKey]?.sources_official ?? input.officialItems[geoKey]?.official ?? 0) > 0;
    const flags = Array.from(
      new Set(
        [
          !claim ? "NO_OUR_ROW" : "",
          recWiki !== "Unknown" && finalRec !== "Unknown" && recWiki !== finalRec ? "STATUS_MISMATCH" : "",
          medWiki !== "Unknown" && finalMed !== "Unknown" && medWiki !== finalMed ? "STATUS_MISMATCH" : "",
          !sources.length ? "SOURCES_MISSING" : "",
          !notesWikiRaw ? "WIKI_NOTES_MISSING" : "",
          officialExpected && !effectiveOwnershipSources.length ? "OFFICIAL_SOURCES_MISSING" : "",
          !isSupportedStatusPair(finalRec, finalMed) ? "FORBIDDEN_STATUS_PAIR" : "",
          resolverStatus?.notesAffectFinalStatus && !resolverStatus?.evidenceDeltaApproved ? "NOTES_OVERRIDE_UNAPPROVED" : ""
        ].filter(Boolean)
      )
    ).sort();

    const deltaParts: string[] = [];
    if (recWiki !== "Unknown" && finalRec !== "Unknown" && recWiki !== finalRec) deltaParts.push(`Rec ${recWiki} -> ${finalRec}`);
    if (medWiki !== "Unknown" && finalMed !== "Unknown" && medWiki !== finalMed) deltaParts.push(`Med ${medWiki} -> ${finalMed}`);

    return {
      geoKey,
      country: country || geoKey || "-",
      wikiRec: recWiki,
      wikiMed: medWiki,
      finalRec,
      finalMed,
      wikiStatus: buildStatusLabel(recWiki, medWiki),
      finalStatus: buildStatusLabel(finalRec, finalMed),
      finalMapCategory: String(resolverStatus?.finalMapCategory || finalContract.finalMapCategory || "UNKNOWN"),
      truthSourceLabel: String(resolverStatus?.truthSourceLabel || "Unknown"),
      statusOverrideReason: String(resolverStatus?.statusOverrideReason || finalContract.ruleId || "NONE"),
      snapshotId: String(resolverStatus?.finalSnapshotId || "UNCONFIRMED"),
      snapshotBuiltAt: String(resolverStatus?.snapshotBuiltAt || "UNCONFIRMED"),
      snapshotDatasetHash: String(resolverStatus?.snapshotDatasetHash || "UNCONFIRMED"),
      ruleId: String(finalContract.ruleId || "DIRECT_FINAL_PAIR"),
      wikiNotes: notesWikiRaw || "-",
      notesPresent,
      notesText: normalizedNotes || "-",
      notesExplainability: notesExplainability || "-",
      notesLen: String(normalizedNotes || "").trim().length,
      notesQuality,
      triggerPhraseExcerpt: String(resolverStatus?.triggerPhraseExcerpt || "-"),
      contextNote: String(resolverStatus?.contextNote || "-"),
      enforcementNote: String(resolverStatus?.enforcementNote || "-"),
      socialRealityNote: String(resolverStatus?.socialRealityNote || "-"),
      evidenceDelta: String(resolverStatus?.evidenceDelta || "NONE"),
      evidenceDeltaReason: String(resolverStatus?.evidenceDeltaReason || "-"),
      evidenceSourceType: String(resolverStatus?.evidenceSourceType || "none"),
      evidenceDeltaApproved: resolverStatus?.evidenceDeltaApproved === true,
      changesFinalStatus: resolverStatus?.notesAffectFinalStatus === true,
      wikiPageUrl: String(claim?.wiki_row_url || "").trim() || "-",
      sources: sources.slice(0, 5),
      officialSources,
      official: effectiveOwnershipSources.length > 0 ? "yes" : "no",
      officialSignal,
      flags,
      mismatchFlags: flags,
      delta: deltaParts.join("; ") || "-"
    } satisfies WikiTruthAuditRow;
  });

  const mainRows = auditedRows.filter((row) => row.flags.length > 0 || row.delta !== "-");

  const unresolvedAliases = validLegalityRows
    .map((row) => {
      const iso2 = String(row.iso2 || "").toUpperCase();
      const claim = claimsByIso2.get(iso2) || claimsByName.get(normalizeCountryKey(String(row.country || "")));
      const actualWikiUrl = String(claim?.wiki_row_url || "").trim();
      const expectedWikiUrl = String(input.expectedWikiPageByIso[iso2] || "").trim();
      const actualWikiTitle = normalizeWikiDisplayTitle(actualWikiUrl);
      const wikiAliasTitle = String(claim?.name_in_wiki || "").trim();
      const canonicalTitle =
        actualWikiTitle || wikiAliasTitle || String(claim?.country || claim?.name || row.country || "");
      const expectedTitle = normalizeWikiDisplayTitle(expectedWikiUrl);
      const reason =
        claim && expectedWikiUrl && actualWikiUrl && expectedTitle && actualWikiTitle && expectedTitle !== actualWikiTitle
          ? "TITLE_ALIAS_MISS"
          : null;
      return {
        geo: iso2,
        country: String(row.country || claim?.country || claim?.name || iso2),
        canonicalTitle,
        wikiAliasTitle,
        expectedWikiTitle: resolveExpectedTitleDisplay({
          country: String(row.country || claim?.country || claim?.name || iso2),
          expectedWikiUrl,
          actualWikiUrl,
          wikiAliasTitle
        }),
        expectedWikiUrl,
        actualWikiUrl,
        reason: reason || "NO_WIKI_ROW"
      } satisfies WikiTruthAliasRow;
    })
    .filter((row) => row.reason === "TITLE_ALIAS_MISS");

  const uncoveredCountries = wikiMetrics.WIKI_MISSING_ROWS.filter((row) => row.type === "country").map((row) => {
    const claim = claimsByIso2.get(String(row.geo || "").toUpperCase());
    const actualWikiUrl = String(claim?.wiki_row_url || row.wiki_page_url || "").trim();
    const expectedWikiUrl = String(row.expected_wiki_page_url || "").trim();
    return {
      geo: row.geo,
      name: row.name,
      type: row.type,
      expectedWikiTitle: resolveExpectedTitleDisplay({
        country: row.name,
        expectedWikiUrl,
        actualWikiUrl,
        wikiAliasTitle: String(claim?.name_in_wiki || "").trim()
      }),
      expectedWikiUrl,
      expectedSourceHint: row.expected_source_hint,
      reason: row.missing_reason
    } satisfies WikiTruthCoverageRow;
  });
  const missingWikiRows = validLegalityRows
    .filter((row) => {
      const iso2 = String(row.iso2 || "").toUpperCase();
      const claim = claimsByIso2.get(iso2) || claimsByName.get(normalizeCountryKey(String(row.country || "")));
      return !claim;
    })
    .map((row) => ({
      geo: String(row.iso2 || "").toUpperCase(),
      name: String(row.country || "").trim() || String(row.iso2 || "").toUpperCase(),
      type: "country",
      expectedWikiTitle: normalizeWikiDisplayTitle(String(input.expectedWikiPageByIso[String(row.iso2 || "").toUpperCase()] || "")),
      expectedWikiUrl: String(input.expectedWikiPageByIso[String(row.iso2 || "").toUpperCase()] || ""),
      expectedSourceHint: "WIKI_COUNTRIES",
      reason: "NO_WIKI_ROW"
    } satisfies WikiTruthCoverageRow));

  const officialGeoCoverage = getEffectiveOfficialCountryCoverage(auditedRows, input.officialOwnershipDataset);

  const summaryCards = [
    buildSummaryCard({
      id: "WIKI_COUNTRIES",
      title: "Wiki country coverage",
      sourceOfTruth: "Wikipedia legality country rows",
      covered: rawWikiCountryRows,
      total: rawWikiCountryRows,
      missing: 0,
      inclusionRule: "Rows physically present in the wiki country table."
    }),
    buildSummaryCard({
      id: "ISO_COUNTRIES",
      title: "ISO country audit",
      sourceOfTruth: "ISO2 country universe",
      covered: Number(input.coverageSummary.COUNTRIES_WIKI_COVERED || wikiMetrics.WIKI_COUNTRY_ROWS_MATCHED_ISO || 0),
      total: Number(input.coverageSummary.COUNTRIES_ISO_TOTAL || wikiMetrics.COUNTRY_UNIVERSE_TOTAL || 0),
      missing: Number(input.coverageSummary.COUNTRIES_MISSING || wikiMetrics.WIKI_COUNTRY_MISSING || 0),
      inclusionRule: "All ISO countries; territories are excluded."
    }),
    buildSummaryCard({
      id: "REF_SSOT",
      title: "SSOT reference coverage",
      sourceOfTruth: "ALL_GEO / SSOT reference universe",
      covered: Number(input.coverageSummary.SSOT_REF_COVERED || wikiMetrics.SSOT_REF_COVERED || 0),
      total: Number(input.coverageSummary.REF_UNIVERSE_TOTAL || wikiMetrics.REF_UNIVERSE_TOTAL || 0),
      missing: Number(input.coverageSummary.SSOT_REF_MISSING || wikiMetrics.SSOT_REF_MISSING || 0),
      inclusionRule: "All supported geos including countries, territories and US states."
    }),
    buildSummaryCard({
      id: "US_STATES",
      title: "US states coverage",
      sourceOfTruth: "US state universe",
      covered: Number(input.coverageSummary.US_STATES_COVERED || wikiMetrics.US_STATES_COVERED_TOTAL || 0),
      total: Number(input.coverageSummary.US_STATES_TOTAL || wikiMetrics.US_STATES_TOTAL || 0),
      missing: Number(input.coverageSummary.US_STATES_MISSING || wikiMetrics.US_STATES_MISSING_TOTAL || 0),
      inclusionRule: "Only `US-XX` rows from the US state audit universe."
    }),
    buildSummaryCard({
      id: "OFFICIAL_REGISTRY",
      title: "Official registry",
      sourceOfTruth: "Protected SSOT official registry",
      covered: input.officialRegistrySummary.rawDomainCount,
      total: input.officialRegistrySummary.rawDomainCount,
      missing: 0,
      inclusionRule:
        "Protected SSOT official domains/links registry. 404/timeout/redirect do not shrink the registry."
    }),
    buildSummaryCard({
      id: "OFFICIAL_GEO_COVERAGE",
      title: "Official geo coverage",
      sourceOfTruth: "official_link_ownership SSOT projection",
      covered: officialGeoCoverage.covered,
      total: officialGeoCoverage.total,
      missing: officialGeoCoverage.missing,
      inclusionRule:
        "Valid wiki country rows with at least one effective owner-matched official link. Global, banned and unresolved rows are excluded."
    }),
    buildSummaryCard({
      id: "DIAGNOSTICS",
      title: "Diagnostics",
      sourceOfTruth: "Normalization + parser diagnostics",
      covered: garbageRows.length + unresolvedAliases.length,
      total: garbageRows.length + unresolvedAliases.length,
      missing: 0,
      inclusionRule: "Parser leftovers, empty ISO rows and alias-resolution problems."
    })
  ];

  const officialOwnershipView = buildOfficialOwnershipView({
    dataset: input.officialOwnershipDataset,
    countryRows: auditedRows.map((row) => ({ geoKey: row.geoKey }))
  });

  return {
    summaryCards,
    issueCounters: buildIssueCounters(mainRows.map((row) => row.flags)),
    allRows: auditedRows,
    mainRows,
    diagnostics: {
      garbageRows,
      unresolvedAliases,
      missingWikiRows,
      emptyIsoCount: Number(input.coverageSummary.WIKI_COUNTRY_ROWS_EMPTY_ISO || wikiMetrics.WIKI_COUNTRY_ROWS_EMPTY_ISO || 0),
      nonIsoCount: Number(input.coverageSummary.WIKI_COUNTRY_ROWS_NON_ISO || wikiMetrics.WIKI_COUNTRY_ROWS_NON_ISO || 0),
      duplicateCount: Number(input.coverageSummary.WIKI_COUNTRY_ROWS_DUPLICATES || wikiMetrics.WIKI_COUNTRY_ROWS_DUPLICATES || 0)
    },
    uncoveredCountries,
    usStates: {
      total: wikiMetrics.US_STATES_TOTAL,
      covered: wikiMetrics.US_STATES_COVERED_TOTAL,
      missing: wikiMetrics.US_STATES_MISSING_TOTAL,
      rows: wikiMetrics.US_STATES_MISSING.map((geo) => ({
        geo,
        name: geo,
        type: "state",
        expectedWikiTitle: geo,
        expectedWikiUrl: "",
        expected_source_hint: "US_JURISDICTION",
        missing_reason: "NO_US_STATE_ENTRY"
      }))
    },
    ssotCoverage: {
      total: Number(input.coverageSummary.REF_UNIVERSE_TOTAL || wikiMetrics.REF_UNIVERSE_TOTAL || 0),
      covered: Number(input.coverageSummary.SSOT_REF_COVERED || wikiMetrics.SSOT_REF_COVERED || 0),
      missing: Number(input.coverageSummary.SSOT_REF_MISSING || wikiMetrics.SSOT_REF_MISSING || 0),
      rows: wikiMetrics.SSOT_MISSING_ROWS.map((row) => ({
        geo: row.geo,
        name: row.name,
        type: row.type,
        expectedWikiTitle: normalizeWikiDisplayTitle(String(row.expected_wiki_page_url || "")) || row.name,
        expectedWikiUrl: String(row.expected_wiki_page_url || ""),
        expectedSourceHint: row.expected_source_hint,
        reason: row.missing_reason
      }))
    },
    officialOwnership: {
      rawRegistryTotal: input.officialOwnershipDataset.raw_registry_total,
      effectiveRegistryTotal: input.officialOwnershipDataset.effective_registry_total,
      unresolvedUnknownLinks: input.officialOwnershipDataset.diagnostics.unresolved_unknown_links,
      assignedCountryLinks: input.officialOwnershipDataset.diagnostics.assigned_country_links,
      assignedStateLinks: input.officialOwnershipDataset.diagnostics.assigned_state_links,
      assignedMultiGeoLinks: input.officialOwnershipDataset.diagnostics.assigned_multi_geo_links,
      assignedGlobalLinks: input.officialOwnershipDataset.diagnostics.assigned_global_links,
      discrepancyExplanation: input.officialOwnershipDataset.diagnostics.raw_vs_effective_explainer
    },
    officialOwnershipView
  };
}

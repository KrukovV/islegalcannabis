import { getDisplayName } from "@/lib/countryNames";
import { isEffectiveOfficialOwnership } from "./officialLinkOwnership";
import type {
  OfficialLinkOwnershipDataset,
  OfficialLinkOwnershipEntry,
  OfficialOwnershipQuality,
  OfficialSourceScope
} from "./officialLinkOwnershipTypes";

export type OfficialOwnershipExclusionReason =
  | "none"
  | "banned_non_official"
  | "global_non_country_coverage"
  | "multi_geo_non_country_coverage"
  | "unknown_ownership";

export type OfficialOwnershipRowView = {
  registryId: number;
  url: string;
  domain: string;
  rawSource: string;
  isProtectedRegistryEntry: boolean;
  isBannedNonOfficial: boolean;
  ownershipType: OfficialLinkOwnershipEntry["owner_scope"];
  assignedGeoCodes: string[];
  assignedGeoNames: string[];
  isEffective: boolean;
  exclusionReason: OfficialOwnershipExclusionReason;
  sourceScope: OfficialSourceScope;
  ownershipQuality: OfficialOwnershipQuality;
  ownershipBasis: OfficialLinkOwnershipEntry["ownership_basis"];
  registrySourceType: "official_gov" | "semi_official" | "aggregator" | "unknown" | "invalid";
  registryState: "active" | "invalid";
  sourceKind: OfficialLinkOwnershipEntry["source_kind"];
  matchingBasis: OfficialLinkOwnershipEntry["matching_basis"];
  confidence: OfficialLinkOwnershipEntry["confidence"];
  notes: string;
};

export type OfficialOwnershipGeoSummaryRow = {
  geo: string;
  country: string;
  assignedCount: number;
  effectiveCount: number;
  linkDomains: string[];
  representativeLinks: string[];
};

export type OfficialOwnershipViewModel = {
  rawTotal: number;
  resolvedOwnershipTotal: number;
  effectiveRowsTotal: number;
  filteredRowsTotal: number;
  excludedRowsTotal: number;
  effectiveTotal: number;
  excludedProtectedTotal: number;
  bannedFilteredTotal: number;
  unknownOwnershipTotal: number;
  multiGeoTotal: number;
  globalTotal: number;
  countryAssignedTotal: number;
  stateAssignedTotal: number;
  countriesWithEffectiveLinks: number;
  countriesWithStrongOfficialLinks: number;
  countriesWithWeakOnlyOfficialLinks: number;
  countriesWithFallbackOnlyLinks: number;
  countriesWithoutEffectiveLinks: number;
  countriesWithMultipleEffectiveLinks: number;
  statesWithEffectiveLinks: number;
  rows: OfficialOwnershipRowView[];
  effectiveAssignedRows: OfficialOwnershipRowView[];
  unknownRows: OfficialOwnershipRowView[];
  filteredRows: OfficialOwnershipRowView[];
  globalRows: OfficialOwnershipRowView[];
  geoSummaryRows: OfficialOwnershipGeoSummaryRow[];
};

function classifyRegistrySourceType(entry: OfficialLinkOwnershipEntry): OfficialOwnershipRowView["registrySourceType"] {
  if (/^start\.html$|^satta-king-fast\.com$|^royalmail\.com$|^dominicanrepublic\.com$|^somalilandgov\.com$/i.test(entry.domain)) {
    return "invalid";
  }
  if (entry.owner_scope === "global" || entry.ownership_quality === "GLOBAL_FALLBACK") return "semi_official";
  if (entry.owner_scope === "unknown" && /press|republic/i.test(entry.domain)) return "aggregator";
  if (
    ["government", "ministry", "parliament", "court", "regulator", "official_publication"].includes(entry.source_kind) &&
    entry.owner_scope !== "unknown"
  ) {
    return "official_gov";
  }
  if (entry.owner_scope === "unknown") return "unknown";
  return "semi_official";
}

function classifyRegistryState(entry: OfficialLinkOwnershipEntry): OfficialOwnershipRowView["registryState"] {
  return classifyRegistrySourceType(entry) === "invalid" ? "invalid" : "active";
}

function isBannedNonOfficial(entry: OfficialLinkOwnershipEntry) {
  return (
    /wikipedia\.org$|^books\.google\.|(?:^|\.)archive\.org$/i.test(entry.domain) ||
    /excluded from country-level official coverage/i.test(entry.notes || "")
  );
}

function getGeoName(geo: string, ownerCountry: string | null) {
  const normalized = String(geo || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return getDisplayName(normalized) || ownerCountry || normalized;
  if (/^US-[A-Z]{2}$/.test(normalized)) return normalized;
  return ownerCountry || normalized;
}

function getExclusionReason(entry: OfficialLinkOwnershipEntry): OfficialOwnershipExclusionReason {
  if (entry.effective && entry.exclusion_reason === "none") return "none";
  if (isBannedNonOfficial(entry)) return "banned_non_official";
  if (entry.owner_scope === "global") return "global_non_country_coverage";
  if (entry.owner_scope === "multi_geo") return "multi_geo_non_country_coverage";
  return "unknown_ownership";
}

function toRowView(entry: OfficialLinkOwnershipEntry, registryId: number): OfficialOwnershipRowView {
  return {
    registryId,
    url: entry.url,
    domain: entry.domain,
    rawSource: entry.url,
    isProtectedRegistryEntry: true,
    isBannedNonOfficial: isBannedNonOfficial(entry),
    ownershipType: entry.owner_scope,
    assignedGeoCodes: entry.owner_geos,
    assignedGeoNames: entry.owner_geos.map((geo) => getGeoName(geo, entry.owner_country)),
    isEffective: isEffectiveOfficialOwnership(entry),
    exclusionReason: getExclusionReason(entry),
    sourceScope: entry.source_scope,
    ownershipQuality: entry.ownership_quality,
    ownershipBasis: entry.ownership_basis,
    registrySourceType: classifyRegistrySourceType(entry),
    registryState: classifyRegistryState(entry),
    sourceKind: entry.source_kind,
    matchingBasis: entry.matching_basis,
    confidence: entry.confidence,
    notes: entry.notes
  };
}

export function buildOfficialOwnershipView(input: {
  dataset: OfficialLinkOwnershipDataset;
  countryRows: Array<{ geoKey: string }>;
}) {
  const rows = (input.dataset.items || []).map((entry, index) => toRowView(entry, index + 1));
  const effectiveAssignedRows = rows.filter(
    (row) => row.isEffective && ["country", "state", "territory"].includes(row.ownershipType)
  );
  const unknownRows = rows.filter((row) => row.ownershipType === "unknown");
  const filteredRows = rows.filter((row) => !row.isEffective);
  const globalRows = rows.filter((row) => row.ownershipQuality === "GLOBAL_FALLBACK");

  const geoSummaryMap = new Map<string, OfficialOwnershipGeoSummaryRow>();
  for (const row of rows) {
    for (let index = 0; index < row.assignedGeoCodes.length; index += 1) {
      const geo = row.assignedGeoCodes[index];
      const name = row.assignedGeoNames[index] || geo;
      const current = geoSummaryMap.get(geo) || {
        geo,
        country: name,
        assignedCount: 0,
        effectiveCount: 0,
        linkDomains: [],
        representativeLinks: []
      };
      current.assignedCount += 1;
      if (row.isEffective) current.effectiveCount += 1;
      if (!current.linkDomains.includes(row.domain)) current.linkDomains.push(row.domain);
      if (!current.representativeLinks.includes(row.url)) current.representativeLinks.push(row.url);
      geoSummaryMap.set(geo, current);
    }
  }

  const geoSummaryRows = Array.from(geoSummaryMap.values())
    .map((row) => ({
      ...row,
      linkDomains: row.linkDomains.slice(0, 6),
      representativeLinks: row.representativeLinks.slice(0, 3)
    }))
    .sort((a, b) => b.effectiveCount - a.effectiveCount || a.geo.localeCompare(b.geo));

  const countryRows = input.countryRows.filter((row) => /^[A-Z]{2}$/.test(row.geoKey));
  const countriesWithEffectiveLinks = countryRows.filter((row) => (geoSummaryMap.get(row.geoKey)?.effectiveCount || 0) > 0).length;
  const countriesWithoutEffectiveLinks = countryRows.filter(
    (row) => (geoSummaryMap.get(row.geoKey)?.effectiveCount || 0) === 0
  ).length;
  const countriesWithMultipleEffectiveLinks = countryRows.filter(
    (row) => (geoSummaryMap.get(row.geoKey)?.effectiveCount || 0) >= 2
  ).length;
  const statesWithEffectiveLinks = geoSummaryRows.filter((row) => /^US-[A-Z]{2}$/.test(row.geo) && row.effectiveCount > 0).length;

  const countriesWithStrongOfficialLinks = countryRows.filter((row) =>
    rows.some(
      (entry) =>
        entry.assignedGeoCodes.includes(row.geoKey) &&
        entry.isEffective &&
        entry.ownershipQuality === "STRONG_OFFICIAL"
    )
  ).length;
  const countriesWithWeakOnlyOfficialLinks = countryRows.filter((row) => {
    const assigned = rows.filter((entry) => entry.assignedGeoCodes.includes(row.geoKey));
    const hasStrong = assigned.some((entry) => entry.isEffective && entry.ownershipQuality === "STRONG_OFFICIAL");
    const hasWeak = assigned.some((entry) => entry.isEffective && entry.ownershipQuality === "WEAK_OFFICIAL");
    return !hasStrong && hasWeak;
  }).length;
  const countriesWithFallbackOnlyLinks = countryRows.filter((row) => {
    const assigned = rows.filter((entry) => entry.assignedGeoCodes.includes(row.geoKey));
    const hasEffective = assigned.some((entry) => entry.isEffective);
    const hasFallback = assigned.some((entry) => entry.ownershipQuality === "GLOBAL_FALLBACK");
    return !hasEffective && hasFallback;
  }).length;

  return {
    rawTotal: input.dataset.raw_registry_total,
    resolvedOwnershipTotal: rows.filter((row) => row.ownershipType !== "unknown").length,
    effectiveRowsTotal: rows.filter((row) => row.isEffective).length,
    filteredRowsTotal: filteredRows.length,
    excludedRowsTotal: rows.filter((row) => row.exclusionReason !== "none").length,
    effectiveTotal: input.dataset.effective_registry_total,
    excludedProtectedTotal: rows.filter((row) => !row.isEffective).length,
    bannedFilteredTotal: rows.filter((row) => row.exclusionReason === "banned_non_official").length,
    unknownOwnershipTotal: unknownRows.length,
    multiGeoTotal: rows.filter((row) => row.ownershipType === "multi_geo").length,
    globalTotal: rows.filter((row) => row.ownershipType === "global").length,
    countryAssignedTotal: rows.filter((row) => row.ownershipType === "country").length,
    stateAssignedTotal: rows.filter((row) => row.ownershipType === "state").length,
    countriesWithEffectiveLinks,
    countriesWithStrongOfficialLinks,
    countriesWithWeakOnlyOfficialLinks,
    countriesWithFallbackOnlyLinks,
    countriesWithoutEffectiveLinks,
    countriesWithMultipleEffectiveLinks,
    statesWithEffectiveLinks,
    rows,
    effectiveAssignedRows,
    unknownRows,
    filteredRows,
    globalRows,
    geoSummaryRows
  } satisfies OfficialOwnershipViewModel;
}

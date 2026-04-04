import { buildRegions } from "@/lib/mapData";
import { getCountryMetaByIso2 } from "@/lib/countryNames";

type GeoHint = {
  country?: string | null;
  iso2?: string | null;
};

type RegionRow = ReturnType<typeof buildRegions>[number];

export type AiGeoContext = {
  geo: string;
  country: string;
  region: string | null;
  displayName: string;
  iso2: string | null;
  type: "country" | "state";
  legalStatus: string;
  medicalStatus: string;
  notes: string;
  officialSources: string[];
  wikiPageUrl: string | null;
};

function normalizeToken(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNameCandidates(entry: RegionRow) {
  const candidates = new Set<string>();
  const primaryName = String(entry.name || entry.geo || "").trim();
  if (primaryName) candidates.add(normalizeToken(primaryName));
  if (entry.type === "country") {
    const meta = getCountryMetaByIso2(entry.geo);
    if (meta?.englishName) candidates.add(normalizeToken(meta.englishName));
    if (meta?.commonName) candidates.add(normalizeToken(meta.commonName));
    if (meta?.officialName) candidates.add(normalizeToken(meta.officialName));
    if (meta?.localName) candidates.add(normalizeToken(meta.localName));
    Object.values(meta?.translations || {}).forEach((row) => {
      if (row.common) candidates.add(normalizeToken(row.common));
      if (row.official) candidates.add(normalizeToken(row.official));
    });
    Object.values(meta?.nativeNames || {}).forEach((row) => {
      if (row.common) candidates.add(normalizeToken(row.common));
      if (row.official) candidates.add(normalizeToken(row.official));
    });
  }
  return [...candidates].filter(Boolean);
}

function resolveFromHint(regions: RegionRow[], geo?: GeoHint | null) {
  const iso2 = String(geo?.iso2 || "").trim().toUpperCase();
  const country = normalizeToken(geo?.country);
  if (iso2) {
    const isoMatch = regions.find((entry) => entry.type === "country" && entry.geo === iso2);
    if (isoMatch) return isoMatch;
  }
  if (!country) return null;
  for (const entry of regions) {
    if (entry.type !== "country") continue;
    if (buildNameCandidates(entry).includes(country)) return entry;
  }
  return null;
}

function toContext(entry: RegionRow): AiGeoContext {
  const countryGeo = entry.type === "state" ? entry.geo.slice(0, 2) : entry.geo;
  const countryMeta = getCountryMetaByIso2(countryGeo);
  return {
    geo: entry.geo,
    country: countryMeta?.englishName || countryMeta?.commonName || countryGeo,
    region: entry.type === "state" ? String(entry.name || entry.geo) : null,
    displayName: String(entry.name || entry.geo),
    iso2: countryGeo || null,
    type: entry.type === "state" ? "state" : "country",
    legalStatus: String(entry.finalRecStatus || entry.legalStatusGlobal || "Unknown"),
    medicalStatus: String(entry.finalMedStatus || entry.medicalStatusGlobal || "Unknown"),
    notes: String(entry.notesInterpretationSummary || entry.notesWiki || entry.notesOur || "").trim(),
    officialSources: Array.isArray(entry.officialSources) ? entry.officialSources.filter(Boolean) : [],
    wikiPageUrl: entry.wikiPageUrl || null
  };
}

export function retrieveAiContext(_query: string, geo?: GeoHint | null) {
  const regions = buildRegions();
  const match = resolveFromHint(regions, geo);
  return match ? toContext(match) : null;
}

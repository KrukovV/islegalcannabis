import firstWaveProfiles from "../../../../data/cannabis_profiles/first_wave_profiles.json";
import localNamesDictionary from "../../../../data/cannabis_profiles/local_names.dictionary.json";

export type CannabisProfileLocalName = {
  geo: string;
  country: string;
  term: string;
  kind: string;
  source: string;
  evidence: string;
};

export type CannabisProfileSections = {
  history: string[];
  local_names: string[];
  products: string[];
  traditional_use: string[];
  cannabis_foods: string[];
  slang: string[];
  cultivation: string[];
  market: string[];
  enforcement_notes: string[];
  culture: string[];
};

export type CannabisProfile = {
  geo: string;
  country: string;
  wiki_title: string;
  wiki_url: string;
  sections: CannabisProfileSections;
  local_names: CannabisProfileLocalName[];
};

export type CannabisProfileCard = {
  history: string[];
  localNames: string[];
  culture: string[];
  enforcementReality: string[];
  products: string[];
  traditionalUse: string[];
  cannabisFoods: string[];
  slang: string[];
  cultivation: string[];
  market: string[];
};

export type CannabisProfileAiContext = CannabisProfileCard & {
  source: string;
};

type ProfilesPayload = {
  profiles: CannabisProfile[];
};

type LocalNamesPayload = {
  entries: CannabisProfileLocalName[];
};

const profiles = (firstWaveProfiles as ProfilesPayload).profiles || [];
const dictionaryEntries = (localNamesDictionary as LocalNamesPayload).entries || [];
const profilesByGeo = new Map(profiles.map((profile) => [profile.geo.toUpperCase(), profile] as const));

function normalizeGeo(geo: string | null | undefined) {
  return String(geo || "").trim().toUpperCase();
}

function cleanItems(items: string[] | undefined, limit: number) {
  return (items || [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function isEmptyCard(card: CannabisProfileCard) {
  return Object.values(card).every((value) => Array.isArray(value) && value.length === 0);
}

export function getCannabisProfileForGeo(geo: string | null | undefined) {
  return profilesByGeo.get(normalizeGeo(geo)) || null;
}

export function getLocalNamesDictionary() {
  return dictionaryEntries.slice();
}

export function buildCannabisProfileCard(geo: string | null | undefined, itemLimit = 3): CannabisProfileCard | null {
  const profile = getCannabisProfileForGeo(geo);
  if (!profile) return null;
  const card: CannabisProfileCard = {
    history: cleanItems(profile.sections.history, itemLimit),
    localNames: cleanItems(profile.sections.local_names, 12),
    culture: cleanItems(profile.sections.culture, itemLimit),
    enforcementReality: cleanItems(profile.sections.enforcement_notes, itemLimit),
    products: cleanItems(profile.sections.products, itemLimit),
    traditionalUse: cleanItems(profile.sections.traditional_use, itemLimit),
    cannabisFoods: cleanItems(profile.sections.cannabis_foods, itemLimit),
    slang: cleanItems(profile.sections.slang, 8),
    cultivation: cleanItems(profile.sections.cultivation, itemLimit),
    market: cleanItems(profile.sections.market, itemLimit)
  };
  return isEmptyCard(card) ? null : card;
}

export function buildCannabisProfileAiContext(geo: string | null | undefined): CannabisProfileAiContext | null {
  const profile = getCannabisProfileForGeo(geo);
  const card = buildCannabisProfileCard(geo, 2);
  if (!profile || !card) return null;
  return {
    ...card,
    source: profile.wiki_url
  };
}

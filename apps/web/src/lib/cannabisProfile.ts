import knowledgeDb from "../../../../data/cannabis_profiles/knowledge_db.json";
import localNamesDictionary from "../../../../data/cannabis_profiles/local_names.dictionary.json";
import { sanitizeEvidenceQuoteText } from "@/lib/text/sanitizeEvidenceQuoteText";

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
  notes?: string[];
};

export type CannabisProfile = {
  geo: string;
  country: string;
  wiki_title: string;
  wiki_url: string;
  source_type?: string;
  sections: CannabisProfileSections;
  local_names: CannabisProfileLocalName[];
};

export type CannabisProfileCard = {
  sourceUrl: string;
  sourceTitle: string;
  history: string[];
  localNames: string[];
  culture: string[];
  enforcementReality: string[];
  products: string[];
  traditionalUse: string[];
  notes: string[];
  cannabisFoods: string[];
  slang: string[];
  cultivation: string[];
  market: string[];
};

export type CannabisProfileAiContext = CannabisProfileCard & {
  source: string;
};

type CannabisProfileCardSectionId = Exclude<keyof CannabisProfileCard, "sourceUrl" | "sourceTitle">;

const PROFILE_CARD_DEDUPE_ORDER: CannabisProfileCardSectionId[] = [
  "localNames",
  "slang",
  "cannabisFoods",
  "products",
  "traditionalUse",
  "cultivation",
  "market",
  "enforcementReality",
  "history",
  "culture",
  "notes"
];

type ProfilesPayload = {
  profiles: CannabisProfile[];
};

type KnowledgeRecord = {
  geo: string;
  country: string;
  wikiTitle: string;
  wikiUrl: string;
  revisionId?: string | null;
  sourceType?: string;
  history?: string[];
  culture?: string[];
  localNames?: Array<CannabisProfileLocalName | string>;
  products?: string[];
  traditionalUse?: string[];
  cultivation?: string[];
  market?: string[];
  enforcementReality?: string[];
  notes?: string[];
};

type KnowledgePayload = {
  entries?: KnowledgeRecord[];
};

type LocalNamesPayload = {
  entries: CannabisProfileLocalName[];
};

type ProfileState = {
  profiles: CannabisProfile[];
  dictionaryEntries: CannabisProfileLocalName[];
  profilesByGeo: Map<string, CannabisProfile>;
  knowledgeMtimeMs: number | null;
  dictionaryMtimeMs: number | null;
};

type NodeFsLike = {
  readFileSync: (_filePath: string, _encoding: string) => string;
  statSync: (_filePath: string) => { mtimeMs: number };
};

let nodeFsCache: NodeFsLike | null | undefined;

function getNodeFs(): NodeFsLike | null {
  if (typeof window !== "undefined") return null;
  if (nodeFsCache !== undefined) return nodeFsCache;
  try {
    const runtimeRequire = Function("return require")() as (_id: string) => NodeFsLike;
    nodeFsCache = runtimeRequire("node:fs");
  } catch {
    nodeFsCache = null;
  }
  return nodeFsCache;
}

function getRepoDataPath(relativePath: string) {
  return `${process.cwd()}/${relativePath}`;
}

const KNOWLEDGE_DB_PATH = getRepoDataPath("data/cannabis_profiles/knowledge_db.json");
const LOCAL_NAMES_DICTIONARY_PATH = getRepoDataPath("data/cannabis_profiles/local_names.dictionary.json");

function isDedicatedCannabisArticle(title: string | null | undefined, url: string | null | undefined) {
  return /^Cannabis in\b/i.test(String(title || "").trim()) || /\/wiki\/Cannabis_in_/i.test(String(url || "").trim());
}

function hasExplicitKnowledgeContent(record: {
  history?: string[];
  culture?: string[];
  localNames?: Array<CannabisProfileLocalName | string>;
  products?: string[];
  traditionalUse?: string[];
  enforcementReality?: string[];
  notes?: string[];
}) {
  return [
    record.history,
    record.culture,
    record.localNames,
    record.products,
    record.traditionalUse,
    record.enforcementReality,
    record.notes
  ].some((items) => Array.isArray(items) && items.length > 0);
}

function canonicalizeProfileSourceType(record: KnowledgeRecord) {
  const raw = String(record.sourceType || "wikipedia");
  if (
    isDedicatedCannabisArticle(record.wikiTitle, record.wikiUrl) &&
    hasExplicitKnowledgeContent(record) &&
    (raw === "missing_wikipedia_article" || raw === "wikipedia_related_article" || raw === "wikipedia")
  ) {
    return "wikipedia_cannabis_article";
  }
  return raw;
}

function profileFromKnowledgeRecord(record: KnowledgeRecord): CannabisProfile {
  const localNames = (record.localNames || []).filter(
    (item): item is CannabisProfileLocalName => Boolean(item) && typeof item === "object"
  );
  return {
    geo: record.geo,
    country: record.country,
    wiki_title: record.wikiTitle,
    wiki_url: record.wikiUrl,
    source_type: canonicalizeProfileSourceType(record),
    sections: {
      history: record.history || [],
      local_names: (record.localNames || [])
        .map((item) => (typeof item === "string" ? item : item.term))
        .filter(Boolean),
      products: record.products || [],
      traditional_use: record.traditionalUse || [],
      cannabis_foods: [
        ...(record.products || []).filter((item) => /\b(food|pizza|edible|dish|ingredient)\b/i.test(item)),
        ...localNames.filter((entry) => entry.kind === "cannabis_food").map((entry) => entry.term)
      ],
      slang: localNames
        .filter((entry) => entry.kind === "local_cannabis_name" || entry.kind === "slang_name")
        .map((entry) => entry.term),
      cultivation: record.cultivation || [],
      market: record.market || [],
      enforcement_notes: record.enforcementReality || [],
      culture: record.culture || [],
      notes: record.notes || []
    },
    local_names: localNames
  };
}

function buildProfileState(
  knowledgePayload: KnowledgePayload | ProfilesPayload,
  dictionaryPayload: LocalNamesPayload,
  meta: Pick<ProfileState, "knowledgeMtimeMs" | "dictionaryMtimeMs">
): ProfileState {
  const profiles = ((knowledgePayload as KnowledgePayload).entries || []).map(profileFromKnowledgeRecord) ||
    ((knowledgePayload as ProfilesPayload).profiles || []);
  const dictionaryEntries = (dictionaryPayload.entries || []).slice();
  return {
    profiles,
    dictionaryEntries,
    profilesByGeo: new Map(profiles.map((profile) => [profile.geo.toUpperCase(), profile] as const)),
    knowledgeMtimeMs: meta.knowledgeMtimeMs,
    dictionaryMtimeMs: meta.dictionaryMtimeMs
  };
}

function readJsonFile<T>(fs: NodeFsLike, filePath: string, fallback: T) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const staticProfileState = buildProfileState(
  knowledgeDb as KnowledgePayload | ProfilesPayload,
  localNamesDictionary as LocalNamesPayload,
  { knowledgeMtimeMs: null, dictionaryMtimeMs: null }
);
let runtimeProfileStateCache: ProfileState | null = null;

function getProfileState() {
  if (process.env.NODE_ENV === "production") return staticProfileState;
  try {
    const fs = getNodeFs();
    if (!fs) return staticProfileState;
    const knowledgeMtimeMs = fs.statSync(KNOWLEDGE_DB_PATH).mtimeMs;
    const dictionaryMtimeMs = fs.statSync(LOCAL_NAMES_DICTIONARY_PATH).mtimeMs;
    if (
      runtimeProfileStateCache &&
      runtimeProfileStateCache.knowledgeMtimeMs === knowledgeMtimeMs &&
      runtimeProfileStateCache.dictionaryMtimeMs === dictionaryMtimeMs
    ) {
      return runtimeProfileStateCache;
    }
    runtimeProfileStateCache = buildProfileState(
      readJsonFile(fs, KNOWLEDGE_DB_PATH, knowledgeDb as KnowledgePayload | ProfilesPayload),
      readJsonFile(fs, LOCAL_NAMES_DICTIONARY_PATH, localNamesDictionary as LocalNamesPayload),
      { knowledgeMtimeMs, dictionaryMtimeMs }
    );
    return runtimeProfileStateCache;
  } catch {
    return staticProfileState;
  }
}

function normalizeGeo(geo: string | null | undefined) {
  return String(geo || "").trim().toUpperCase();
}

function cleanItems(items: string[] | undefined, limit?: number) {
  return (items || [])
    .map((item) => sanitizeEvidenceQuoteText(String(item || "")))
    .filter(Boolean)
    .slice(0, limit);
}

function dedupeCardSections(card: CannabisProfileCard): CannabisProfileCard {
  const seen = new Set<string>();
  const deduped = { ...card };
  for (const sectionId of PROFILE_CARD_DEDUPE_ORDER) {
    deduped[sectionId] = deduped[sectionId].filter((item) => {
      const normalized = item.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }
  return deduped;
}

function isEmptyCard(card: CannabisProfileCard) {
  return PROFILE_CARD_DEDUPE_ORDER.every((sectionId) => Array.isArray(card[sectionId]) && card[sectionId].length === 0);
}

export function getCannabisProfileForGeo(geo: string | null | undefined) {
  return getProfileState().profilesByGeo.get(normalizeGeo(geo)) || null;
}

export function getLocalNamesDictionary() {
  return getProfileState().dictionaryEntries.slice();
}

export function buildCannabisProfileCard(
  geo: string | null | undefined,
  itemLimit?: number,
  _seedNotes?: string | null
): CannabisProfileCard | null {
  const profile = getCannabisProfileForGeo(geo);
  if (!profile) return null;
  if (profile.source_type === "missing_wikipedia_article" || profile.source_type === "wikipedia_related_article") {
    return null;
  }

  const safeLimit = typeof itemLimit === "number" && Number.isFinite(itemLimit) ? Math.max(1, Math.floor(itemLimit)) : undefined;
  const card: CannabisProfileCard = {
    sourceUrl: profile.wiki_url,
    sourceTitle: profile.wiki_title || "Wikipedia source",
    history: cleanItems(profile.sections.history, safeLimit),
    localNames: cleanItems(profile.sections.local_names),
    culture: cleanItems(profile.sections.culture, safeLimit),
    enforcementReality: cleanItems(profile.sections.enforcement_notes, safeLimit),
    products: cleanItems(profile.sections.products, safeLimit),
    traditionalUse: cleanItems(profile.sections.traditional_use, safeLimit),
    notes: cleanItems(profile.sections.notes || [], safeLimit),
    cannabisFoods: cleanItems(profile.sections.cannabis_foods, safeLimit),
    slang: cleanItems(profile.sections.slang, 8),
    cultivation: cleanItems(profile.sections.cultivation, safeLimit),
    market: cleanItems(profile.sections.market, safeLimit)
  };
  const dedupedCard = dedupeCardSections(card);
  return isEmptyCard(dedupedCard) ? null : dedupedCard;
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

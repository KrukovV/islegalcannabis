import fs from "node:fs";
import path from "node:path";

export type WikiClaim = Record<string, unknown> & {
  geo_key?: string;
  wiki_rec?: string;
  wiki_med?: string;
  notes_raw?: string;
  notes_text?: string;
  notes_main_articles?: unknown[];
  main_articles?: unknown[];
  wiki_row_url?: string | null;
  fetched_at?: string | null;
};

type JsonRecord = Record<string, unknown>;

const ROOT = process.cwd();
const WIKI_CLAIMS_MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const WIKI_CLAIMS_SNAPSHOT_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.json");
const WIKI_CLAIMS_DIR = path.join(ROOT, "data", "wiki", "wiki_claims");
const WIKI_REFS_PATH = path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json");
const WIKI_OFFICIAL_EVAL_PATH = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");
const OFFICIAL_DOMAINS_PATH = path.join(
  ROOT,
  "data",
  "official",
  "official_domains.ssot.json"
);

let wikiClaimsCache: Record<string, WikiClaim> | null = null;
let wikiRefsCache: Record<string, unknown[]> | null = null;
let wikiOfficialCache: Record<string, unknown> | null = null;
let officialDomainsCache: Set<string> | null = null;

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function normalizeWikiClaim(entry: unknown): WikiClaim | null {
  if (!entry || typeof entry !== "object") return null;
  const payload = entry as JsonRecord;
  const geo = String(payload.geo_key || payload.geoKey || payload.geo || payload.id || "");
  const mainArticles = Array.isArray(payload.main_articles)
    ? payload.main_articles
    : Array.isArray(payload.notes_main_articles)
      ? payload.notes_main_articles
      : [];
  const notesRaw =
    typeof payload.notes_raw === "string"
      ? payload.notes_raw
      : typeof payload.notes_text === "string"
        ? payload.notes_text
        : "";
  const wikiRec = String(payload.wiki_rec || payload.rec_status || payload.recreational_status || "Unknown");
  const wikiMed = String(payload.wiki_med || payload.med_status || payload.medical_status || "Unknown");
  return {
    ...payload,
    geo_key: geo.toUpperCase(),
    wiki_rec: wikiRec,
    wiki_med: wikiMed,
    notes_raw: notesRaw,
    main_articles: mainArticles,
    recreational_status: String(payload.recreational_status || wikiRec),
    medical_status: String(payload.medical_status || wikiMed),
    notes_main_articles: Array.isArray(payload.notes_main_articles)
      ? payload.notes_main_articles
      : mainArticles
  };
}

function buildClaimsMap(payload: unknown): Record<string, WikiClaim> {
  const map: Record<string, WikiClaim> = {};
  if (!payload || typeof payload !== "object") return map;
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const normalized = normalizeWikiClaim(entry);
      const key = String(normalized?.geo_key || "").toUpperCase();
      if (!key) continue;
      map[key] = normalized as WikiClaim;
    }
    return map;
  }
  const items = (payload as JsonRecord).items;
  if (Array.isArray(items)) {
    for (const entry of items) {
      const normalized = normalizeWikiClaim(entry);
      const key = String(normalized?.geo_key || "").toUpperCase();
      if (!key) continue;
      map[key] = normalized as WikiClaim;
    }
    return map;
  }
  if (items && typeof items === "object") {
    for (const [key, value] of Object.entries(items as JsonRecord)) {
      const normalized = normalizeWikiClaim(value);
      const normalizedKey = String(normalized?.geo_key || key || "").toUpperCase();
      if (!normalizedKey) continue;
      map[normalizedKey] = normalized as WikiClaim;
    }
    return map;
  }
  for (const [key, value] of Object.entries(payload as JsonRecord)) {
    const normalized = normalizeWikiClaim(value);
    const normalizedKey = String(normalized?.geo_key || key || "").toUpperCase();
    if (!normalizedKey) continue;
    map[normalizedKey] = normalized as WikiClaim;
  }
  return map;
}

export function readWikiClaimsMap(): Record<string, WikiClaim> {
  if (wikiClaimsCache) return wikiClaimsCache;
  const payload = readJson(WIKI_CLAIMS_MAP_PATH, null as unknown);
  if (payload) {
    wikiClaimsCache = buildClaimsMap(payload);
    return wikiClaimsCache;
  }
  const snapshot = readJson(WIKI_CLAIMS_SNAPSHOT_PATH, null as unknown);
  if (snapshot) {
    wikiClaimsCache = buildClaimsMap(snapshot);
    return wikiClaimsCache;
  }
  wikiClaimsCache = {};
  return wikiClaimsCache;
}

export function readWikiClaim(geoKey: string): WikiClaim | null {
  const key = String(geoKey || "").toUpperCase();
  if (!key) return null;
  const map = readWikiClaimsMap();
  if (map[key]) return map[key];
  if (fs.existsSync(WIKI_CLAIMS_MAP_PATH)) return null;
  const claimPath = path.join(WIKI_CLAIMS_DIR, `${key}.json`);
  return normalizeWikiClaim(readJson(claimPath, null)) as WikiClaim | null;
}

export function readWikiRefs(geoKey: string): unknown[] {
  const key = String(geoKey || "").toUpperCase();
  if (!key) return [];
  if (wikiRefsCache) {
    const match = wikiRefsCache[key];
    return Array.isArray(match) ? match : [];
  }
  const payload = readJson(WIKI_REFS_PATH, null as unknown);
  if (!payload) return [];
  const items = Array.isArray(payload) ? payload : (payload as JsonRecord).items;
  if (!Array.isArray(items)) return [];
  const map: Record<string, unknown[]> = {};
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as JsonRecord;
    const geo = String(item.geo || item.geo_key || item.geoKey || "").toUpperCase();
    if (!geo) continue;
    map[geo] = Array.isArray(item.refs) ? item.refs : [];
  }
  wikiRefsCache = map;
  const match = map[key];
  return Array.isArray(match) ? match : [];
}

export function readWikiOfficialEval(geoKey: string): unknown | null {
  const key = String(geoKey || "").toUpperCase();
  if (!key) return null;
  if (wikiOfficialCache) return wikiOfficialCache[key] ?? null;
  const payload = readJson(WIKI_OFFICIAL_EVAL_PATH, null as unknown);
  const items = payload && typeof payload === "object" ? (payload as JsonRecord).items : null;
  if (items && typeof items === "object") {
    wikiOfficialCache = items as Record<string, unknown>;
    return wikiOfficialCache[key] ?? null;
  }
  return null;
}

export function readOfficialDomains(): Set<string> {
  if (officialDomainsCache) return officialDomainsCache;
  const payload = readJson(OFFICIAL_DOMAINS_PATH, null as unknown);
  const domains = (Array.isArray(payload)
    ? payload
    : Array.isArray((payload as JsonRecord)?.domains)
      ? (payload as JsonRecord).domains
      : []) as unknown[];
  const set = new Set<string>();
  for (const entry of domains) {
    const value = String(entry || "").trim().toLowerCase();
    if (value) set.add(value);
  }
  officialDomainsCache = set;
  return officialDomainsCache;
}

export function resetSsotCaches() {
  wikiClaimsCache = null;
  wikiRefsCache = null;
  wikiOfficialCache = null;
  officialDomainsCache = null;
}

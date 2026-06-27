import fs from "node:fs";
import path from "node:path";
import {
  buildOfficialLinkOwnershipIndex,
  readOfficialLinkOwnership
} from "./officialSources/officialLinkOwnership";
import type { OfficialLinkOwnershipDataset } from "./officialSources/officialLinkOwnershipTypes";
import { US_STATE_WIKI_TABLE_ROWS } from "./usStateWikiTable.snapshot";

type CentroidItem = {
  lat: number;
  lon: number;
  name?: string;
};

type GeoJsonFeature = {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
};

type GeoJsonPayload = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

type LegalSsotEntry = {
  status_recreational?: string | null;
  status_medical?: string | null;
  official_override_rec?: string | null;
  official_override_med?: string | null;
  notes?: string | null;
  extracted_facts?: { notes?: string | null };
  wiki_url?: string;
  official_sources?: string[];
  fetched_at?: string | null;
  updated_at?: string | null;
};

type WikiClaimsEntry = {
  wiki_rec?: string | null;
  wiki_med?: string | null;
  recreational_status?: string | null;
  medical_status?: string | null;
  notes?: string | null;
  notes_text?: string | null;
  wiki_row_url?: string | null;
  fetched_at?: string | null;
};

export type WikiPagesUniverseEntry = {
  iso2?: string;
  country?: string;
  country_name?: string;
  expected_wiki_url?: string;
  expected_wiki_page_url?: string;
  wiki_page_url?: string;
  from_cannabis_by_country?: boolean;
};

export type StatusReviewOverrideEntry = {
  name?: string;
  recreational?: "LEGAL" | "ILLEGAL" | null;
  medical?: "REGULATED" | "LIMITED" | "NONE" | null;
  enforcement?: "SOFT" | "STRICT" | null;
  wikiRecStatus?: string | null;
  wikiMedStatus?: string | null;
  notes?: string | null;
  sources?: string[];
  reason?: string;
};

type StatusEngineV9SsotEntry = {
  id?: string;
  name?: string;
  recreational?: "LEGAL" | "ILLEGAL" | null;
  medical?: "REGULATED" | "LIMITED" | "NONE" | null;
  enforcement?: "SOFT" | "STRICT" | null;
  color?: "GREEN" | "YELLOW" | "RED";
  reviewRequired?: boolean;
  sourceUrl?: string | null;
};

type WikiLegalityTableEntry = {
  country?: string;
  iso2?: string;
  rec_status?: string | null;
  med_status?: string | null;
  wiki_notes_hint?: string | null;
};

type UsStateSsotEntry = {
  geo?: string;
  name?: string;
  state_name?: string;
  rec_status?: string | null;
  med_status?: string | null;
  official_override_rec?: string | null;
  official_override_med?: string | null;
  source_url?: string | null;
  secondary_source_url?: string | null;
  jurisdiction_source_url?: string | null;
  wiki_page_url?: string;
};

type UsStateWikiTableEntry = {
  name?: string;
  link?: string;
  wiki_row_url?: string;
  recreational_raw?: string | null;
};

type Retailer = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type?: string;
  license?: string;
  website?: string;
  updatedAt?: string;
  geo?: string;
};

const SPECIAL_COUNTRY_OWNER_GEO_BY_ADM0_A3: Record<string, string> = {
  SOL: "SO",
  CYN: "CY",
  CNM: "CY",
  WSB: "CY",
  ESB: "CY",
  USG: "CU"
};

const SPECIAL_COUNTRY_UNKNOWN_FALLBACK_BY_ADM0_A3 = new Set(["BJN", "BRT", "KAS", "PGA", "SCR", "SER", "SPI"]);

let OFFICIAL_OWNERSHIP_INDEX_CACHE:
  | ReturnType<typeof buildOfficialLinkOwnershipIndex>
  | null = null;
let OFFICIAL_OWNERSHIP_DATASET_CACHE: OfficialLinkOwnershipDataset | null = null;

const GEOJSON_FILE_CACHE = new Map<string, GeoJsonPayload | null>();

function resolveDataRoot() {
  const workspaceData = path.resolve(process.cwd(), "..", "..", "data");
  if (fs.existsSync(path.join(workspaceData, "legal_ssot", "legal_ssot.json"))) {
    return workspaceData;
  }
  const repoData = path.resolve(process.cwd(), "data");
  if (fs.existsSync(path.join(repoData, "legal_ssot", "legal_ssot.json"))) {
    return repoData;
  }
  return workspaceData;
}

const DATA_ROOT = resolveDataRoot();
const REPO_ROOT = path.dirname(DATA_ROOT);

const DATA_FILE_PATHS: Record<string, string> = {
  "data/centroids/adm0.json": path.join(DATA_ROOT, "centroids", "adm0.json"),
  "data/centroids/us_adm1.json": path.join(DATA_ROOT, "centroids", "us_adm1.json"),
  "data/legal_ssot/legal_ssot.json": path.join(DATA_ROOT, "legal_ssot", "legal_ssot.json"),
  "data/wiki/wiki_claims_map.json": path.join(DATA_ROOT, "wiki", "wiki_claims_map.json"),
  "data/wiki/ssot_legality_table.json": path.join(DATA_ROOT, "wiki", "ssot_legality_table.json"),
  "data/status-engine/manual_review_overrides.json": path.join(DATA_ROOT, "status-engine", "manual_review_overrides.json"),
  "data/status-engine/status_ssot_v9.json": path.join(DATA_ROOT, "status-engine", "status_ssot_v9.json"),
  "data/ssot/wiki_pages_universe.json": path.join(DATA_ROOT, "ssot", "wiki_pages_universe.json"),
  "data/ssot/us_states_wiki.json": path.join(DATA_ROOT, "ssot", "us_states_wiki.json"),
  "data/ssot/us_states.json": path.join(DATA_ROOT, "ssot", "us_states.json"),
  "data/wiki/cache/legality_us_states.json": path.join(DATA_ROOT, "wiki", "cache", "legality_us_states.json"),
  "data/retailers/retailers.json": path.join(DATA_ROOT, "retailers", "retailers.json"),
};

const GEOJSON_FILE_PATHS: Record<string, string> = {
  "ne_10m_admin_0_countries.geojson": path.join(DATA_ROOT, "geojson", "ne_10m_admin_0_countries.geojson"),
  "ne_50m_admin_0_countries.geojson": path.join(DATA_ROOT, "geojson", "ne_50m_admin_0_countries.geojson"),
  "ne_50m_admin_1_states_provinces.geojson": path.join(DATA_ROOT, "geojson", "ne_50m_admin_1_states_provinces.geojson"),
};

export function resolveDataPath(...parts: string[]) {
  const key = parts.join("/");
  const file = DATA_FILE_PATHS[key];
  if (!file) {
    throw new Error(`Unsupported data path: ${key}`);
  }
  return file;
}

function normalizeUsStateLookupName(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/\(u\.s\.\s*state\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadCentroids(file: string) {
  if (!fs.existsSync(file)) return {};
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return (payload?.items || {}) as Record<string, CentroidItem>;
}

export function loadLegalSsot(): Record<string, LegalSsotEntry> {
  const file = resolveDataPath("data", "legal_ssot", "legal_ssot.json");
  if (!fs.existsSync(file)) return {};
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return payload?.entries || {};
}

export function loadWikiClaimsMap(): Record<string, WikiClaimsEntry> {
  const file = resolveDataPath("data", "wiki", "wiki_claims_map.json");
  if (!fs.existsSync(file)) return {};
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return payload?.items || {};
}

export function loadWikiPagesUniverse(): WikiPagesUniverseEntry[] {
  const file = resolveDataPath("data", "ssot", "wiki_pages_universe.json");
  if (!fs.existsSync(file)) return [];
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(payload?.items) ? payload.items : [];
}

export function loadStatusReviewOverrides(): Record<string, StatusReviewOverrideEntry> {
  const file = resolveDataPath("data", "status-engine", "manual_review_overrides.json");
  if (!fs.existsSync(file)) return {};
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return payload?.entries || {};
}

export function loadStatusEngineV9Ssot(): Record<string, StatusEngineV9SsotEntry> {
  const file = resolveDataPath("data", "status-engine", "status_ssot_v9.json");
  if (!fs.existsSync(file)) return {};
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  return entries.reduce((acc: Record<string, StatusEngineV9SsotEntry>, row: StatusEngineV9SsotEntry) => {
    const geo = String(row?.id || "").toUpperCase();
    if (geo) acc[geo] = row;
    return acc;
  }, {});
}

export function loadWikiLegalityTableByIso(): Record<string, WikiLegalityTableEntry> {
  const file = resolveDataPath("data", "wiki", "ssot_legality_table.json");
  if (!fs.existsSync(file)) return {};
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows.reduce((acc: Record<string, WikiLegalityTableEntry>, row: WikiLegalityTableEntry) => {
    const iso2 = String(row?.iso2 || "").toUpperCase();
    if (iso2) acc[iso2] = row;
    return acc;
  }, {});
}

export function loadUsStatesSsot(): UsStateSsotEntry[] {
  const wikiFile = resolveDataPath("data", "ssot", "us_states_wiki.json");
  if (fs.existsSync(wikiFile)) {
    const wikiPayload = JSON.parse(fs.readFileSync(wikiFile, "utf8"));
    const wikiItems = Array.isArray(wikiPayload?.items) ? wikiPayload.items : [];
    const filtered = wikiItems.filter((row: UsStateSsotEntry) =>
      /^US-[A-Z]{2}$/.test(String(row?.geo || "").toUpperCase())
    );
    if (filtered.length > 0) return filtered;
  }
  const file = resolveDataPath("data", "ssot", "us_states.json");
  if (!fs.existsSync(file)) return [];
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.filter((row: UsStateSsotEntry) => /^US-[A-Z]{2}$/.test(String(row?.geo || "").toUpperCase()));
}

export function loadUsStateWikiTableIndex(
  stateCentroids: Record<string, CentroidItem>,
  stateEntries: UsStateSsotEntry[]
) {
  const file = resolveDataPath("data", "wiki", "cache", "legality_us_states.json");
  const payload = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : { rows: US_STATE_WIKI_TABLE_ROWS };
  const items = Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload?.items) ? payload.items : [];
  const geoByStateName = new Map<string, string>();
  const geoByWikiRowUrl = new Map<string, string>();
  Object.entries(stateCentroids).forEach(([geo, centroid]) => {
    const normalized = normalizeUsStateLookupName(centroid?.name);
    if (normalized) geoByStateName.set(normalized, geo);
  });
  stateEntries.forEach((entry) => {
    const geo = String(entry.geo || "").toUpperCase();
    const normalizedName = normalizeUsStateLookupName(entry.state_name || entry.name || geo);
    const wikiRowUrl = String(entry.wiki_page_url || "").trim();
    if (geo && normalizedName) geoByStateName.set(normalizedName, geo);
    if (geo && wikiRowUrl) geoByWikiRowUrl.set(wikiRowUrl, geo);
  });
  const index = new Map<string, UsStateWikiTableEntry>();
  items.forEach((row: UsStateWikiTableEntry) => {
    const normalizedName = normalizeUsStateLookupName(row?.name || row?.link);
    const wikiRowUrl = String(row?.wiki_row_url || "").trim();
    const geo = geoByWikiRowUrl.get(wikiRowUrl) || geoByStateName.get(normalizedName);
    if (!geo) return;
    index.set(geo, row);
  });
  return index;
}

export function loadRetailers(): Retailer[] {
  const file = resolveDataPath("data", "retailers", "retailers.json");
  if (!fs.existsSync(file)) return [];
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(payload?.items) ? payload.items : [];
}

export function loadGeoJsonFile(name: string) {
  if (GEOJSON_FILE_CACHE.has(name)) {
    return GEOJSON_FILE_CACHE.get(name) || null;
  }
  const file = GEOJSON_FILE_PATHS[name];
  if (!file) {
    GEOJSON_FILE_CACHE.set(name, null);
    return null;
  }
  if (!fs.existsSync(file)) return null;
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  if (payload?.type !== "FeatureCollection" || !Array.isArray(payload?.features)) return null;
  const typedPayload = payload as GeoJsonPayload;
  GEOJSON_FILE_CACHE.set(name, typedPayload);
  return typedPayload;
}

export function loadOfficialOwnershipIndex() {
  if (OFFICIAL_OWNERSHIP_INDEX_CACHE) return OFFICIAL_OWNERSHIP_INDEX_CACHE;
  if (OFFICIAL_OWNERSHIP_DATASET_CACHE) {
    OFFICIAL_OWNERSHIP_INDEX_CACHE = buildOfficialLinkOwnershipIndex(OFFICIAL_OWNERSHIP_DATASET_CACHE);
    return OFFICIAL_OWNERSHIP_INDEX_CACHE;
  }
  OFFICIAL_OWNERSHIP_DATASET_CACHE = readOfficialLinkOwnership(REPO_ROOT);
  OFFICIAL_OWNERSHIP_INDEX_CACHE = buildOfficialLinkOwnershipIndex(OFFICIAL_OWNERSHIP_DATASET_CACHE);
  return OFFICIAL_OWNERSHIP_INDEX_CACHE;
}

export function loadOfficialOwnershipDataset() {
  if (OFFICIAL_OWNERSHIP_DATASET_CACHE) return OFFICIAL_OWNERSHIP_DATASET_CACHE;
  loadOfficialOwnershipIndex();
  return OFFICIAL_OWNERSHIP_DATASET_CACHE || readOfficialLinkOwnership(REPO_ROOT);
}

export function isoFromCountryProps(props: Record<string, unknown>) {
  const candidates = [
    props?.ISO_A2_EH,
    props?.iso_a2_eh,
    props?.ISO_A2,
    props?.iso_a2
  ]
    .map((value) => String(value || "").toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value) && value !== "-99");
  return candidates[0] || "";
}

export function resolveSpecialCountryGeoFromProps(props: Record<string, unknown>) {
  const featureIdCandidates = [
    props?.ADM0_A3,
    props?.adm0_a3,
    props?.GU_A3,
    props?.gu_a3,
    props?.SU_A3,
    props?.su_a3,
    props?.SOV_A3,
    props?.sov_a3
  ]
    .map((value) => String(value || "").toUpperCase().trim())
    .filter(Boolean);
  for (const featureId of featureIdCandidates) {
    const ownerGeo = SPECIAL_COUNTRY_OWNER_GEO_BY_ADM0_A3[featureId];
    if (ownerGeo) {
      return {
        geo: ownerGeo,
        forceFallback: false
      };
    }
    if (SPECIAL_COUNTRY_UNKNOWN_FALLBACK_BY_ADM0_A3.has(featureId)) {
      return {
        geo: featureId,
        forceFallback: true
      };
    }
  }
  return null;
}

export function extractFeaturePolygons(geometry: { type: string; coordinates: unknown }) {
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates as number[][][]];
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates as number[][][][];
  }
  return [];
}

export function getPolygonAnchor(polygon: number[][][]) {
  const outerRing = Array.isArray(polygon[0]) ? polygon[0] : [];
  if (outerRing.length === 0) return null;
  const lngValues = outerRing.map((pair) => Number(pair[0])).filter(Number.isFinite);
  const latValues = outerRing.map((pair) => Number(pair[1])).filter(Number.isFinite);
  if (lngValues.length === 0 || latValues.length === 0) return null;
  return {
    lng: (Math.min(...lngValues) + Math.max(...lngValues)) / 2,
    lat: (Math.min(...latValues) + Math.max(...latValues)) / 2
  };
}

export function squaredDistance(
  left: { lng: number; lat: number },
  right: { lng: number; lat: number }
) {
  return (left.lng - right.lng) ** 2 + (left.lat - right.lat) ** 2;
}

export function geoFromStateProps(props: Record<string, unknown>) {
  const iso2 = String(props?.iso_a2 || props?.ISO_A2 || props?.iso_a2_eh || "").toUpperCase();
  const postal = String(props?.postal || "").toUpperCase();
  if (iso2 && postal) return `${iso2}-${postal}`;
  const iso3166 = String(props?.iso_3166_2 || "").toUpperCase();
  if (iso3166) return iso3166;
  return "";
}

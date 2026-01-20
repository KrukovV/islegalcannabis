import fs from "node:fs";
import path from "node:path";

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

type RegionEntry = {
  geo: string;
  type: string;
  legalStatusGlobal: string;
  medicalStatusGlobal: string;
  notes?: string | null;
  wikiSources?: string[];
  coordinates?: { lat: number; lng: number };
  updatedAt?: string | null;
  name?: string;
};

type LegalSsotEntry = {
  status_recreational?: string | null;
  status_medical?: string | null;
  notes?: string | null;
  extracted_facts?: { notes?: string | null };
  wiki_url?: string;
  official_sources?: string[];
  fetched_at?: string | null;
  updated_at?: string | null;
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

function resolveDataPath(...parts: string[]) {
  const roots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "..", "..")
  ];
  for (const root of roots) {
    const candidate = path.join(root, ...parts);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(process.cwd(), ...parts);
}

function mapLegalStatus(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (["legal", "allowed"].includes(normalized)) return "Legal";
  if (["decriminalized", "decrim", "restricted"].includes(normalized)) return "Decriminalized";
  if (["illegal"].includes(normalized)) return "Illegal";
  return "Unknown";
}

function mapMedicalStatus(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (["legal", "allowed"].includes(normalized)) return "Legal";
  if (["limited", "restricted"].includes(normalized)) return "Limited";
  if (["illegal"].includes(normalized)) return "Illegal";
  return "Unknown";
}

function loadCentroids(file: string) {
  if (!fs.existsSync(file)) return {};
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return (payload?.items || {}) as Record<string, CentroidItem>;
}

function loadLegalSsot(): Record<string, LegalSsotEntry> {
  const file = resolveDataPath("data", "legal_ssot", "legal_ssot.json");
  if (!fs.existsSync(file)) return {};
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return payload?.entries || {};
}

function loadUsLaws() {
  const dir = resolveDataPath("data", "laws", "us");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  return files.map((file) => {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    return payload || {};
  });
}

function loadRetailers() {
  const file = resolveDataPath("data", "retailers", "retailers.json");
  if (!fs.existsSync(file)) return [];
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(payload?.items) ? payload.items : [];
}

function loadGeoJsonFile(name: string) {
  const file = resolveDataPath("data", "geojson", name);
  if (!fs.existsSync(file)) return null;
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  if (payload?.type !== "FeatureCollection" || !Array.isArray(payload?.features)) return null;
  return payload as GeoJsonPayload;
}

function isoFromCountryProps(props: Record<string, unknown>) {
  const candidates = [
    props?.ISO_A2,
    props?.iso_a2,
    props?.ISO_A2_EH,
    props?.iso_a2_eh
  ]
    .map((value) => String(value || "").toUpperCase())
    .filter((value) => value && value !== "-99");
  return candidates[0] || "";
}

function geoFromStateProps(props: Record<string, unknown>) {
  const iso2 = String(props?.iso_a2 || props?.ISO_A2 || props?.iso_a2_eh || "").toUpperCase();
  const postal = String(props?.postal || "").toUpperCase();
  if (iso2 && postal) return `${iso2}-${postal}`;
  const iso3166 = String(props?.iso_3166_2 || "").toUpperCase();
  if (iso3166) return iso3166;
  return "";
}

export function buildRegions() {
  const entries = loadLegalSsot();
  const centroids = loadCentroids(resolveDataPath("data", "centroids", "adm0.json"));
  const regions: RegionEntry[] = [];
  for (const [geo, entry] of Object.entries(entries)) {
    const centroid = centroids[geo] || null;
    const wikiSources = [entry?.wiki_url, ...(entry?.official_sources || [])].filter(
      (value): value is string => Boolean(value)
    );
    regions.push({
      geo,
      type: "country",
      legalStatusGlobal: mapLegalStatus(entry?.status_recreational),
      medicalStatusGlobal: mapMedicalStatus(entry?.status_medical),
      notes: entry?.notes || entry?.extracted_facts?.notes || null,
      wikiSources,
      coordinates: centroid ? { lat: centroid.lat, lng: centroid.lon } : undefined,
      updatedAt: entry?.fetched_at || entry?.updated_at || null,
      name: centroid?.name
    });
  }

  const stateCentroids = loadCentroids(resolveDataPath("data", "centroids", "us_adm1.json"));
  const stateEntries = loadUsLaws();
  stateEntries.forEach((entry) => {
    const region = String(entry?.region || "").toUpperCase();
    if (!region) return;
    const geo = `US-${region}`;
    const centroid = stateCentroids[geo] || null;
    regions.push({
      geo,
      type: "state",
      legalStatusGlobal: mapLegalStatus(entry?.recreational),
      medicalStatusGlobal: mapMedicalStatus(entry?.medical),
      notes: entry?.notes || null,
      wikiSources: Array.isArray(entry?.sources) ? entry.sources.map((item: { url?: string }) => item?.url).filter(Boolean) : [],
      coordinates: centroid ? { lat: centroid.lat, lng: centroid.lon } : undefined,
      updatedAt: entry?.updated_at || entry?.verified_at || null,
      name: centroid?.name
    });
  });

  return regions;
}

export function buildGeoJson(type: string) {
  const regions = buildRegions();
  const lookup = new Map(regions.map((entry) => [entry.geo, entry]));
  const isState = type === "states";
  const fileName = isState
    ? "ne_50m_admin_1_states_provinces.geojson"
    : "ne_50m_admin_0_countries.geojson";
  const geojson = loadGeoJsonFile(fileName);
  if (!geojson) {
    return {
      type: "FeatureCollection",
      features: []
    };
  }
  const features = geojson.features
    .map((feature) => {
      const props = feature.properties || {};
      const geo = isState ? geoFromStateProps(props) : isoFromCountryProps(props);
      if (!geo) return null;
      const entry = lookup.get(geo);
      if (!entry) return null;
      return {
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          geo: entry.geo,
          name: entry.name || String(props?.NAME || props?.name || entry.geo),
          type: entry.type,
          legalStatusGlobal: entry.legalStatusGlobal,
          medicalStatusGlobal: entry.medicalStatusGlobal,
          notes: entry.notes,
          wikiSources: entry.wikiSources,
          updatedAt: entry.updatedAt
        }
      } as GeoJsonFeature;
    })
    .filter(Boolean) as GeoJsonFeature[];
  return {
    type: "FeatureCollection",
    features
  };
}

export function buildRetailers(geo?: string | null) {
  const items = loadRetailers() as Retailer[];
  const normalizedGeo = String(geo || "").toUpperCase();
  if (!normalizedGeo) return items;
  return items.filter((item) => String(item.geo || "").toUpperCase() === normalizedGeo);
}

import fs from "node:fs";
import path from "node:path";
import type { TruthLevel } from "@/lib/statusUi";

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
  recOur?: string;
  medOur?: string;
  recDerived?: string;
  medDerived?: string;
  recWiki?: string;
  medWiki?: string;
  officialOverrideRec?: string | null;
  officialOverrideMed?: string | null;
  hasOfficialOverride?: boolean;
  effectiveRec?: string;
  effectiveMed?: string;
  notesOur?: string | null;
  notesWiki?: string | null;
  wikiPageUrl?: string | null;
  officialSources?: string[];
  wikiSources?: string[];
  truthLevel?: string;
  truthReasonCodes?: string[];
  truthSources?: { wiki?: string | null; official?: string[]; our_rules?: string[] };
  coordinates?: { lat: number; lng: number };
  updatedAt?: string | null;
  name?: string;
};

export type SSOTStatusModel = {
  geoKey: string;
  recEffective: string;
  medEffective: string;
  recDerived: string;
  medDerived: string;
  truthLevel: TruthLevel;
  officialOverride: boolean;
  officialLinksCount: number;
  reasons: string[];
  wikiPage?: string | null;
  sources: string[];
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

type WikiClaimsEntry = {
  wiki_rec?: string | null;
  wiki_med?: string | null;
  recreational_status?: string | null;
  medical_status?: string | null;
  notes?: string | null;
  notes_text?: string | null;
  wiki_row_url?: string | null;
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

export function deriveStatusFromNotes(text: string, kind: "rec" | "med"): string {
  const normalized = String(text || "").toLowerCase();
  if (!normalized.trim()) return "Limited";
  if (/\billegal\b|\bprohibit|\bprohibited\b|\bbanned\b|\bban\b/.test(normalized)) {
    return "Illegal";
  }
  if (/\bdecriminal/.test(normalized)) {
    return "Decriminalized";
  }
  if (/\bunenforced\b|\bnot enforced\b|\brarely enforced\b|\blax\b|\btolerated\b/.test(normalized)) {
    return "Unenforced";
  }
  if (kind === "med") {
    if (/\bmedical\b/.test(normalized) && /\blegal\b|\ballowed\b|\bpermitted\b/.test(normalized)) {
      return "Legal";
    }
    if (/\bmedical\b/.test(normalized) && /\blimited\b|\brestricted\b|\bonly\b/.test(normalized)) {
      return "Limited";
    }
  }
  if (/\blegal\b|\ballowed\b|\bpermitted\b|\bregulated\b|\bregulation\b/.test(normalized)) {
    return "Legal";
  }
  return "Limited";
}

function deriveStatus(params: {
  truthLevel: string;
  effective: string;
  notes: string;
  kind: "rec" | "med";
}) {
  if (params.truthLevel === "CONFLICT") return "Unknown";
  if (params.effective && params.effective !== "Unknown") return params.effective;
  return deriveStatusFromNotes(params.notes, params.kind);
}

function computeTruthLevel(params: {
  recWiki: string;
  medWiki: string;
  officialOverrideRec: string | null;
  officialOverrideMed: string | null;
  officialSources: string[];
  wikiPageUrl?: string | null;
  rawOurRec?: string | null;
  rawOurMed?: string | null;
}) {
  const truthReasonCodes: string[] = [];
  const truthSources = {
    wiki: params.wikiPageUrl || null,
    official: params.officialSources || [],
    our_rules: []
  };
  let truthLevel = "WIKI_ONLY";
  const hasOverride = Boolean(params.officialOverrideRec || params.officialOverrideMed);
  if (hasOverride) {
    truthLevel = "OFFICIAL";
    truthReasonCodes.push("OFFICIAL_OVERRIDE");
  } else if (truthSources.official.length > 0 && (params.recWiki !== "Unknown" || params.medWiki !== "Unknown")) {
    truthLevel = "WIKI_CORROBORATED";
    truthReasonCodes.push("OFFICIAL_SOURCES_PRESENT");
  }
  const ourRec = params.rawOurRec ? mapLegalStatus(params.rawOurRec) : null;
  const ourMed = params.rawOurMed ? mapMedicalStatus(params.rawOurMed) : null;
  if (!hasOverride && ((ourRec && ourRec !== params.recWiki) || (ourMed && ourMed !== params.medWiki))) {
    truthLevel = "CONFLICT";
    truthReasonCodes.push("NO_OFFICIAL_FOR_UPGRADE");
  }
  return { truthLevel, truthReasonCodes, truthSources };
}

export function buildSSOTStatusModel(entry: RegionEntry): SSOTStatusModel {
  const truthLevel = (entry.truthLevel || "WIKI_ONLY") as TruthLevel;
  const officialLinks = Array.isArray(entry.officialSources) ? entry.officialSources : [];
  const wikiLinks = Array.isArray(entry.wikiSources) ? entry.wikiSources : [];
  const sources = Array.from(new Set([...officialLinks, ...wikiLinks])).filter(Boolean);
  return {
    geoKey: entry.geo,
    recEffective: entry.effectiveRec || entry.legalStatusGlobal || "Unknown",
    medEffective: entry.effectiveMed || entry.medicalStatusGlobal || "Unknown",
    recDerived: entry.recDerived || entry.effectiveRec || entry.legalStatusGlobal || "Unknown",
    medDerived: entry.medDerived || entry.effectiveMed || entry.medicalStatusGlobal || "Unknown",
    truthLevel,
    officialOverride: Boolean(entry.hasOfficialOverride),
    officialLinksCount: officialLinks.length,
    reasons: Array.isArray(entry.truthReasonCodes) ? entry.truthReasonCodes : [],
    wikiPage: entry.wikiPageUrl ?? null,
    sources
  };
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

function loadWikiClaimsMap(): Record<string, WikiClaimsEntry> {
  const file = resolveDataPath("data", "wiki", "wiki_claims_map.json");
  if (!fs.existsSync(file)) return {};
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return payload?.items || {};
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
  const wikiClaims = loadWikiClaimsMap();
  const centroids = loadCentroids(resolveDataPath("data", "centroids", "adm0.json"));
  const regions: RegionEntry[] = [];
  for (const [geo, entry] of Object.entries(entries)) {
    const centroid = centroids[geo] || null;
    const wiki = wikiClaims[geo] || {};
    const recWiki = mapLegalStatus(wiki?.wiki_rec ?? wiki?.recreational_status);
    const medWiki = mapMedicalStatus(wiki?.wiki_med ?? wiki?.medical_status);
    const officialOverrideRec = entry?.official_override_rec
      ? mapLegalStatus(entry?.official_override_rec)
      : null;
    const officialOverrideMed = entry?.official_override_med
      ? mapMedicalStatus(entry?.official_override_med)
      : null;
    const hasOfficialOverride = Boolean(officialOverrideRec || officialOverrideMed);
    const effectiveRec = hasOfficialOverride && officialOverrideRec ? officialOverrideRec : recWiki;
    const effectiveMed = hasOfficialOverride && officialOverrideMed ? officialOverrideMed : medWiki;
    const truth = computeTruthLevel({
      recWiki,
      medWiki,
      officialOverrideRec,
      officialOverrideMed,
      officialSources: entry?.official_sources || [],
      wikiPageUrl: wiki?.wiki_row_url || entry?.wiki_url || null,
      rawOurRec: null,
      rawOurMed: null
    });
    const notesCombined = `${entry?.notes || entry?.extracted_facts?.notes || ""} ${
      wiki?.notes ?? wiki?.notes_text ?? ""
    }`;
    const recDerived = deriveStatus({
      truthLevel: truth.truthLevel,
      effective: effectiveRec,
      notes: notesCombined,
      kind: "rec"
    });
    const medDerived = deriveStatus({
      truthLevel: truth.truthLevel,
      effective: effectiveMed,
      notes: notesCombined,
      kind: "med"
    });
    const wikiSources = [entry?.wiki_url, ...(entry?.official_sources || [])].filter(
      (value): value is string => Boolean(value)
    );
    regions.push({
      geo,
      type: "country",
      legalStatusGlobal: effectiveRec,
      medicalStatusGlobal: effectiveMed,
      recOur: null,
      medOur: null,
      recWiki,
      medWiki,
      officialOverrideRec,
      officialOverrideMed,
      hasOfficialOverride,
      effectiveRec,
      effectiveMed,
      recDerived,
      medDerived,
      notesOur: entry?.notes || entry?.extracted_facts?.notes || null,
      notesWiki: wiki?.notes ?? wiki?.notes_text ?? null,
      wikiPageUrl: wiki?.wiki_row_url || entry?.wiki_url || null,
      officialSources: entry?.official_sources || [],
      wikiSources,
      truthLevel: truth.truthLevel,
      truthReasonCodes: truth.truthReasonCodes,
      truthSources: truth.truthSources,
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
    const wiki = wikiClaims[geo] || {};
    const recWiki = mapLegalStatus(wiki?.wiki_rec ?? wiki?.recreational_status);
    const medWiki = mapMedicalStatus(wiki?.wiki_med ?? wiki?.medical_status);
    const officialOverrideRec = entry?.official_override_rec
      ? mapLegalStatus(entry?.official_override_rec)
      : null;
    const officialOverrideMed = entry?.official_override_med
      ? mapMedicalStatus(entry?.official_override_med)
      : null;
    const hasOfficialOverride = Boolean(officialOverrideRec || officialOverrideMed);
    const effectiveRec = hasOfficialOverride && officialOverrideRec ? officialOverrideRec : recWiki;
    const effectiveMed = hasOfficialOverride && officialOverrideMed ? officialOverrideMed : medWiki;
    const truth = computeTruthLevel({
      recWiki,
      medWiki,
      officialOverrideRec,
      officialOverrideMed,
      officialSources: [],
      wikiPageUrl: wiki?.wiki_row_url || null,
      rawOurRec: null,
      rawOurMed: null
    });
    const notesCombined = `${entry?.notes || ""} ${wiki?.notes ?? wiki?.notes_text ?? ""}`;
    const recDerived = deriveStatus({
      truthLevel: truth.truthLevel,
      effective: effectiveRec,
      notes: notesCombined,
      kind: "rec"
    });
    const medDerived = deriveStatus({
      truthLevel: truth.truthLevel,
      effective: effectiveMed,
      notes: notesCombined,
      kind: "med"
    });
    regions.push({
      geo,
      type: "state",
      legalStatusGlobal: effectiveRec,
      medicalStatusGlobal: effectiveMed,
      recOur: null,
      medOur: null,
      recWiki,
      medWiki,
      officialOverrideRec,
      officialOverrideMed,
      hasOfficialOverride,
      effectiveRec,
      effectiveMed,
      recDerived,
      medDerived,
      notesOur: entry?.notes || null,
      notesWiki: wiki?.notes ?? wiki?.notes_text ?? null,
      wikiPageUrl: wiki?.wiki_row_url || null,
      officialSources: [],
      wikiSources: Array.isArray(entry?.sources)
        ? entry.sources.map((item: { url?: string }) => item?.url).filter(Boolean)
        : [],
      truthLevel: truth.truthLevel,
      truthReasonCodes: truth.truthReasonCodes,
      truthSources: truth.truthSources,
      coordinates: centroid ? { lat: centroid.lat, lng: centroid.lon } : undefined,
      updatedAt: entry?.updated_at || entry?.verified_at || null,
      name: centroid?.name
    });
  });

  return regions;
}

export function buildStatusIndex(regions: RegionEntry[]) {
  const index = new Map<string, RegionEntry>();
  regions.forEach((entry) => {
    index.set(entry.geo, entry);
  });
  return index;
}

export function buildSSOTStatusIndex(regions: RegionEntry[]) {
  const index = new Map<string, SSOTStatusModel>();
  regions.forEach((entry) => {
    index.set(entry.geo, buildSSOTStatusModel(entry));
  });
  return index;
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
  const makeProperties = (entry: RegionEntry, fallbackName?: string) => {
    const statusModel = buildSSOTStatusModel(entry);
    return {
      geo: entry.geo,
      name: entry.name || fallbackName || entry.geo,
      type: entry.type,
      legalStatusGlobal: statusModel.recEffective,
      medicalStatusGlobal: statusModel.medEffective,
      officialOverrideRec: entry.officialOverrideRec,
      officialOverrideMed: entry.officialOverrideMed,
      hasOfficialOverride: entry.hasOfficialOverride,
      recEffective: statusModel.recEffective,
      medEffective: statusModel.medEffective,
      recDerived: statusModel.recDerived,
      medDerived: statusModel.medDerived,
      notesOur: entry.notesOur,
      notesWiki: entry.notesWiki,
      wikiPage: statusModel.wikiPage,
      officialLinksCount: statusModel.officialLinksCount,
      sources: statusModel.sources,
      truthLevel: statusModel.truthLevel,
      reasons: statusModel.reasons,
      updatedAt: entry.updatedAt
    };
  };
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
        properties: makeProperties(entry, String(props?.NAME || props?.name || entry.geo))
      } as GeoJsonFeature;
    })
    .filter(Boolean) as GeoJsonFeature[];
  const existing = new Set(features.map((feature) => String(feature.properties.geo || "")));
  const fallbackPoints = regions
    .filter((entry) => entry.type === (isState ? "state" : "country"))
    .filter((entry) => !existing.has(entry.geo))
    .map((entry) => {
      const coords = entry.coordinates || { lat: 0, lng: 0 };
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [coords.lng, coords.lat]
        },
        properties: makeProperties(entry)
      } as GeoJsonFeature;
    }) as GeoJsonFeature[];
  return {
    type: "FeatureCollection",
    features: [...features, ...fallbackPoints]
  };
}

export function buildRetailers(geo?: string | null) {
  const items = loadRetailers() as Retailer[];
  const normalizedGeo = String(geo || "").toUpperCase();
  if (!normalizedGeo) return items;
  return items.filter((item) => String(item.geo || "").toUpperCase() === normalizedGeo);
}

import { assessTruth, type TruthAccessType } from "@/core/truthModel";
import { assessDistanceModel, type DistanceJurisdiction, type DistanceMode } from "@/core/distanceModel";
import { getSupplementalAdjacency } from "@/data/countryAdjacency";
import { getSocialReality } from "@/data/socialRealityIndex";
import {
  getCountryPageData,
  getCountryPageIndexByGeoCode,
  getCountryPageIndexByIso2,
  listCountryPageData,
  type CountryPageData
} from "@/lib/countryPageStorage";

export type NearbyRiskLevel = "low" | "medium" | "high";

export type NearbyPlace = {
  country: string;
  geo: string;
  distance_km: number;
  effective_distance_km: number;
  distance_type: DistanceMode;
  distance: {
    raw_km: number;
    effective_km: number;
    type: "geo" | "border" | "access";
  };
  access: {
    type: TruthAccessType;
    truthScore: number;
    explanation: string;
  };
  why_this_result: string;
  reason: "status" | "notes" | "social" | "mixed";
  risk: {
    destination: NearbyRiskLevel;
    path: NearbyRiskLevel;
  };
};

export type NearbyTruthResult = {
  origin: {
    geo: string;
    name: string;
    lat: number;
    lng: number;
    source: "gps" | "ip" | "selected_geo";
  } | null;
  current: NearbyPlace | null;
  nearby: NearbyPlace[];
  warning: string;
};

type OriginInput = {
  geoHint?: string | null;
  lat?: number | null;
  lng?: number | null;
};

const BORDER_WARNING = "Crossing borders with cannabis is illegal in most countries.";
const TRUTH_THRESHOLD = 0.3;
const WINDOW_SIZE = 8;
const RESULT_LIMIT = 4;
const DISTANCE_PRIMARY_DELTA_KM = 100;

let geoIndexCache: ReturnType<typeof getCountryPageIndexByGeoCode> | null = null;
let isoIndexCache: ReturnType<typeof getCountryPageIndexByIso2> | null = null;
let countryListCache: CountryPageData[] | null = null;
let distanceGeoCache: Map<string, DistanceJurisdiction> | null = null;

function getGeoIndex() {
  if (!geoIndexCache) geoIndexCache = getCountryPageIndexByGeoCode();
  return geoIndexCache;
}

function getIsoIndex() {
  if (!isoIndexCache) isoIndexCache = getCountryPageIndexByIso2();
  return isoIndexCache;
}

function getCountryList() {
  if (!countryListCache) countryListCache = listCountryPageData();
  return countryListCache;
}

function getDistanceGeoIndex() {
  if (!distanceGeoCache) {
    distanceGeoCache = new Map<string, DistanceJurisdiction>();
    const jurisdictionsByCode = new Map<string, DistanceJurisdiction>();
    const adjacencyByCode = new Map<string, Set<string>>();

    for (const item of getCountryList()) {
      const jurisdiction = toDistanceJurisdiction(item);
      if (!jurisdiction) continue;
      jurisdictionsByCode.set(jurisdiction.key, jurisdiction);
      adjacencyByCode.set(jurisdiction.key, buildRawAdjacency(item));
    }

    for (const [code, jurisdiction] of jurisdictionsByCode) {
      const neighbors = new Set(adjacencyByCode.get(code) || []);
      for (const [otherCode, otherNeighbors] of adjacencyByCode) {
        if (otherCode !== code && otherNeighbors.has(code)) neighbors.add(otherCode);
      }
      jurisdiction.neighbors = [...neighbors].filter(
        (neighborCode) => neighborCode !== code && jurisdictionsByCode.has(neighborCode)
      );
      distanceGeoCache.set(jurisdiction.key, jurisdiction);
      distanceGeoCache.set(jurisdiction.geo, jurisdiction);
    }
  }
  return distanceGeoCache;
}

function isFiniteCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function resolveGeoData(input: string | null | undefined) {
  const value = String(input || "").trim().toUpperCase();
  if (!value) return null;
  if (value.startsWith("US-")) return getGeoIndex().get(value) || null;
  if (value.length === 2) return getIsoIndex().get(value) || null;
  if (value.length === 3 || value.startsWith("US-")) return getCountryPageData(value.toLowerCase());
  return null;
}

function resolveOrigin(input: OriginInput) {
  const geoData = resolveGeoData(input.geoHint);
  if (!geoData) return null;
  const lat = isFiniteCoord(input.lat) ? input.lat : geoData.coordinates?.lat;
  const lng = isFiniteCoord(input.lng) ? input.lng : geoData.coordinates?.lng;
  if (!isFiniteCoord(lat) || !isFiniteCoord(lng)) return null;
  return {
    geo: geoData.geo_code.toUpperCase(),
    name: geoData.name,
    lat,
    lng,
    source: (isFiniteCoord(input.lat) && isFiniteCoord(input.lng) ? "gps" : "selected_geo") as
      | "gps"
      | "selected_geo",
    page: geoData
  };
}

function destinationRisk(entry: CountryPageData, truthScore: number): NearbyRiskLevel {
  const finalRisk = String(entry.legal_model.signals?.final_risk || "").toUpperCase();
  if (finalRisk === "HIGH_RISK") return "high";
  if (finalRisk === "RESTRICTED") return truthScore >= 0.6 ? "medium" : "high";
  if (truthScore >= 0.8) return "low";
  if (truthScore >= 0.45) return "medium";
  return "high";
}

function pathRisk(origin: CountryPageData, candidate: CountryPageData, destination: NearbyRiskLevel): NearbyRiskLevel {
  if (origin.geo_code === candidate.geo_code) return destination;
  const sameParent = Boolean(
    origin.parent_country?.code &&
      candidate.parent_country?.code &&
      origin.parent_country.code === candidate.parent_country.code
  );
  if (sameParent) return destination === "high" ? "high" : "medium";
  return "high";
}

function rankScore(distanceKm: number, truthScore: number) {
  return distanceKm * (1 / Math.max(truthScore + 0.05, 0.05));
}

function hasAccessInclusionSignal(candidate: CountryPageData, accessType: TruthAccessType) {
  if (accessType === "tolerated") return true;
  if (typeof candidate.facts.possession_limit === "string" && candidate.facts.possession_limit.trim().length > 0) {
    return true;
  }
  const enforcementLevel = String(candidate.legal_model.signals?.enforcement_level || "").toLowerCase();
  if (enforcementLevel === "rare" || enforcementLevel === "unenforced") return true;
  const socialSignals = getSocialReality(candidate.iso2 || candidate.geo_code)?.signals;
  return Boolean(socialSignals?.low_enforcement || socialSignals?.tolerated);
}

function getAccessDistanceFactor(accessType: TruthAccessType) {
  if (accessType === "legal") return 0.9;
  if (accessType === "mostly_allowed") return 1.0;
  if (accessType === "tolerated") return 1.05;
  if (accessType === "limited") return 1.1;
  return 1.25;
}

function toPublicDistanceType(distanceType: DistanceMode): "geo" | "border" | "access" {
  if (distanceType === "geo_direct") return "geo";
  if (distanceType === "border_entry") return "border";
  return "access";
}

function computeEffectiveDistanceKm(
  candidate: CountryPageData,
  accessType: TruthAccessType,
  distanceKmValue: number,
  distanceType: DistanceMode
) {
  let factor = 1;
  if (distanceType === "border_entry") factor *= 0.8;
  if (distanceType === "geo_direct") factor *= 1.0;
  const hasLandBorders = candidate.graph.geo_neighbors.length > 0 || getSupplementalAdjacency(candidate.code).length > 0;
  if (!hasLandBorders && candidate.node_type === "country") factor *= 1.2;
  factor *= getAccessDistanceFactor(accessType);
  return distanceKmValue * factor;
}

function buildWhyThisResult(
  candidate: CountryPageData,
  accessType: TruthAccessType,
  distanceType: DistanceMode,
  reason: NearbyPlace["reason"]
) {
  const accessLabel =
    accessType === "legal" ? "legal access" :
    accessType === "mostly_allowed" ? "mostly allowed access" :
    accessType === "limited" ? "limited access" :
    accessType === "tolerated" ? "tolerated use" :
    "strict access";
  const distanceLabel =
    distanceType === "border_entry" ? "closest border-entry option" :
    distanceType === "geo_direct" ? "closest direct option" :
    "closest access-first option";
  const reasonLabel =
    reason === "social" ? "lower enforcement in practice" :
    reason === "notes" ? "notes-based access signals" :
    reason === "mixed" ? "mixed law and practice signals" :
    "status-based access signal";
  return `${distanceLabel} with ${accessLabel} and ${reasonLabel} in ${candidate.name}`;
}

function assertAccessWindow(results: NearbyPlace[]) {
  if (!results.length) return;
  const byDistance = [...results].sort((left, right) => left.effective_distance_km - right.effective_distance_km);
  const farthest = byDistance.at(-1)?.effective_distance_km || 0;
  for (const candidate of results) {
    const page = resolveGeoData(candidate.geo);
    if (candidate.access.truthScore < TRUTH_THRESHOLD && !(page && hasAccessInclusionSignal(page, candidate.access.type))) {
      throw new Error(`ACCESS_WINDOW_BROKEN: ${candidate.geo} outside inclusion contract`);
    }
    if (candidate.effective_distance_km > farthest) {
      throw new Error(`ACCESS_WINDOW_BROKEN: ${candidate.geo} escaped distance window`);
    }
  }
}

function buildRawAdjacency(entry: CountryPageData) {
  return new Set(
    [...entry.graph.geo_neighbors.map((item) => item.code), ...getSupplementalAdjacency(entry.code)].map((item) =>
      item.toUpperCase()
    )
  );
}

function toDistanceJurisdiction(entry: CountryPageData): DistanceJurisdiction | null {
  if (!entry.coordinates) return null;
  return {
    key: entry.code.toUpperCase(),
    geo: entry.geo_code.toUpperCase(),
    center: {
      lat: entry.coordinates.lat,
      lng: entry.coordinates.lng
    },
    neighbors: []
  };
}

function buildPlace(origin: CountryPageData, candidate: CountryPageData, originCoords: { lat: number; lng: number }, usedDirectCoords: boolean): NearbyPlace | null {
  if (!candidate.coordinates) return null;
  const byGeo = getDistanceGeoIndex();
  const originJurisdiction = byGeo.get(origin.code.toUpperCase()) || byGeo.get(origin.geo_code.toUpperCase()) || null;
  const candidateJurisdiction =
    byGeo.get(candidate.code.toUpperCase()) || byGeo.get(candidate.geo_code.toUpperCase()) || null;
  if (!originJurisdiction || !candidateJurisdiction) return null;
  const assessment = assessTruth(candidate);
  if (assessment.truthScore < TRUTH_THRESHOLD && !hasAccessInclusionSignal(candidate, assessment.accessType)) return null;
  const distanceAssessment = assessDistanceModel({
    originPoint: originCoords,
    origin: originJurisdiction,
    candidate: candidateJurisdiction,
    hasPreciseOrigin: usedDirectCoords,
    byKey: byGeo
  });
  const destination = destinationRisk(candidate, assessment.truthScore);
  const effectiveDistanceKm = computeEffectiveDistanceKm(
    candidate,
    assessment.accessType,
    distanceAssessment.distanceKm,
    distanceAssessment.mode
  );
  return {
    country: candidate.name,
    geo: candidate.geo_code.toUpperCase(),
    distance_km: distanceAssessment.distanceKm,
    effective_distance_km: effectiveDistanceKm,
    distance_type: distanceAssessment.mode,
    distance: {
      raw_km: distanceAssessment.distanceKm,
      effective_km: effectiveDistanceKm,
      type: toPublicDistanceType(distanceAssessment.mode)
    },
    access: {
      type: assessment.accessType,
      truthScore: Number(assessment.truthScore.toFixed(3)),
      explanation: assessment.explanation
    },
    why_this_result: buildWhyThisResult(candidate, assessment.accessType, distanceAssessment.mode, assessment.reason),
    reason: assessment.reason,
    risk: {
      destination,
      path: pathRisk(origin, candidate, destination)
    }
  };
}

function listCandidates(origin: CountryPageData) {
  const entries = getCountryList();
  if (origin.node_type === "state" && origin.parent_country?.code === "usa") {
    return entries.filter((entry) => entry.parent_country?.code === "usa" && entry.node_type === "state");
  }
  return entries.filter((entry) => entry.node_type === "country");
}

export function findNearbyTruth(input: OriginInput): NearbyTruthResult | null {
  const origin = resolveOrigin(input);
  if (!origin) return null;
  const usedDirectCoords = isFiniteCoord(input.lat) && isFiniteCoord(input.lng);
  const current = buildPlace(origin.page, origin.page, { lat: origin.lat, lng: origin.lng }, usedDirectCoords);
  const nearby = listCandidates(origin.page)
    .filter((candidate) => candidate.geo_code.toUpperCase() !== origin.geo)
    .map((candidate) => buildPlace(origin.page, candidate, { lat: origin.lat, lng: origin.lng }, usedDirectCoords))
    .filter((candidate): candidate is NearbyPlace => Boolean(candidate))
    .sort((left, right) => left.effective_distance_km - right.effective_distance_km)
    .slice(0, WINDOW_SIZE)
    .sort((left, right) => {
      const distanceDelta = left.effective_distance_km - right.effective_distance_km;
      if (Math.abs(distanceDelta) > DISTANCE_PRIMARY_DELTA_KM) {
        return distanceDelta;
      }
      const leftScore = rankScore(left.effective_distance_km, left.access.truthScore);
      const rightScore = rankScore(right.effective_distance_km, right.access.truthScore);
      if (leftScore !== rightScore) return leftScore - rightScore;
      if (left.effective_distance_km !== right.effective_distance_km) return left.effective_distance_km - right.effective_distance_km;
      return right.access.truthScore - left.access.truthScore;
    })
    .slice(0, RESULT_LIMIT);
  assertAccessWindow(nearby);

  return {
    origin: {
      geo: origin.geo,
      name: origin.name,
      lat: origin.lat,
      lng: origin.lng,
      source: origin.source
    },
    current,
    nearby,
    warning: BORDER_WARNING
  };
}

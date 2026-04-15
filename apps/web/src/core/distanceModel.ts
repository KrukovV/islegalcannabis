import { haversineKm } from "@islegal/shared";

export type DistanceMode =
  | "geo_direct"
  | "border_entry"
  | "access_first";

export type DistancePoint = {
  lat: number;
  lng: number;
};

export type DistanceJurisdiction = {
  key: string;
  geo: string;
  center: DistancePoint;
  neighbors: string[];
};

export type DistanceAssessment = {
  mode: DistanceMode;
  distanceKm: number;
  directKm: number;
  borderEntryKm: number | null;
};

function normalizeGeo(value: string) {
  return String(value || "").trim().toUpperCase();
}

export function distanceKm(a: DistancePoint, b: DistancePoint) {
  return haversineKm(
    { lat: a.lat, lon: a.lng },
    { lat: b.lat, lon: b.lng }
  );
}

export function computeBorderEntryKm(
  originPoint: DistancePoint,
  origin: DistanceJurisdiction,
  byKey: Map<string, DistanceJurisdiction>
) {
  const neighborDistances = origin.neighbors
    .map((geo) => byKey.get(normalizeGeo(geo)))
    .filter((item): item is DistanceJurisdiction => Boolean(item))
    .map((neighbor) => distanceKm(originPoint, neighbor.center))
    .filter((value) => Number.isFinite(value));

  if (!neighborDistances.length) return null;
  return Math.min(...neighborDistances);
}

export function assessDistanceModel(input: {
  originPoint: DistancePoint;
  origin: DistanceJurisdiction;
  candidate: DistanceJurisdiction;
  hasPreciseOrigin: boolean;
  byKey: Map<string, DistanceJurisdiction>;
}): DistanceAssessment {
  const directKm = distanceKm(input.originPoint, input.candidate.center);
  if (normalizeGeo(input.origin.key) === normalizeGeo(input.candidate.key)) {
    return {
      mode: input.hasPreciseOrigin ? "geo_direct" : "access_first",
      distanceKm: directKm,
      directKm,
      borderEntryKm: null
    };
  }

  if (input.hasPreciseOrigin) {
    return {
      mode: "geo_direct",
      distanceKm: directKm,
      directKm,
      borderEntryKm: null
    };
  }

  const borderEntryKm = computeBorderEntryKm(input.originPoint, input.origin, input.byKey);
  const isNeighbor = input.origin.neighbors.some(
    (geo) => normalizeGeo(geo) === normalizeGeo(input.candidate.key)
  );

  if (isNeighbor && borderEntryKm !== null) {
    return {
      mode: "border_entry",
      distanceKm: Math.min(directKm, borderEntryKm),
      directKm,
      borderEntryKm
    };
  }

  if (borderEntryKm !== null) {
    return {
      mode: "access_first",
      distanceKm: borderEntryKm + directKm,
      directKm,
      borderEntryKm
    };
  }

  return {
    mode: "access_first",
    distanceKm: directKm,
    directKm,
    borderEntryKm: null
  };
}

import type { ResultStatusLevel } from "../types";

export type GeoPoint = { lat: number; lon: number };

export type NearestCandidate = {
  jurisdictionKey: string;
  statusLevel: ResultStatusLevel;
  point: GeoPoint;
};

export type NearestResult = {
  jurisdictionKey: string;
  distanceKm: number;
};

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function nearestFrom(
  fromPoint: GeoPoint,
  candidates: NearestCandidate[]
): NearestResult | null {
  let best: NearestResult | null = null;
  for (const candidate of candidates) {
    if (candidate.statusLevel === "red") continue;
    const distanceKm = haversineKm(fromPoint, candidate.point);
    if (!best || distanceKm < best.distanceKm) {
      best = { jurisdictionKey: candidate.jurisdictionKey, distanceKm };
    }
  }
  return best;
}

export function nearestLegalCountry(
  fromPoint: GeoPoint,
  candidates: NearestCandidate[]
): NearestResult | null {
  return nearestFrom(fromPoint, candidates);
}

export function nearestLegalState(
  fromPoint: GeoPoint,
  candidates: NearestCandidate[]
): NearestResult | null {
  return nearestFrom(fromPoint, candidates);
}

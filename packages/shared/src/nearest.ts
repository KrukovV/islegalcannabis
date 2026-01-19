import { haversineKm } from "./geo/nearestLegal";

export type NearestBorderLevel = "green" | "yellow" | "red";

export type NearestBorderCandidate = {
  id: string;
  name: string;
  level: NearestBorderLevel;
  lat: number;
  lon: number;
  sourcesCount: number;
};

export type NearestBorderResult = {
  id: string;
  name: string;
  level: NearestBorderLevel;
  distanceKm: number;
  sourcesCount: number;
};

const levelRank: Record<NearestBorderLevel, number> = {
  red: 0,
  yellow: 1,
  green: 2
};

export function nearestBetterLocation(
  current: { level: NearestBorderLevel; lat: number; lon: number },
  candidates: NearestBorderCandidate[]
): NearestBorderResult | null {
  const currentRank = levelRank[current.level];
  if (currentRank >= levelRank.green) return null;
  let best: NearestBorderResult | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (levelRank[candidate.level] <= currentRank) continue;
    const distanceKm = haversineKm(
      { lat: current.lat, lon: current.lon },
      { lat: candidate.lat, lon: candidate.lon }
    );
    if (distanceKm < bestDistance) {
      bestDistance = distanceKm;
      best = {
        id: candidate.id,
        name: candidate.name,
        level: candidate.level,
        distanceKm,
        sourcesCount: candidate.sourcesCount
      };
    }
  }
  return best;
}

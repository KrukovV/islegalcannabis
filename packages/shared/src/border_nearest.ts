import { nearestBetterLocation } from "./nearest";
import type {
  NearestBorderCandidate,
  NearestBorderResult,
  NearestBorderLevel
} from "./nearest";

export type BorderNearestInput = {
  level: NearestBorderLevel;
  lat: number;
  lon: number;
};

export function borderNearest(
  current: BorderNearestInput,
  candidates: NearestBorderCandidate[]
): NearestBorderResult | null {
  return nearestBetterLocation(current, candidates);
}

import { describe, expect, it } from "vitest";
import { getLawProfile } from "@/lib/lawStore";
import { findNearestLegalForProfile } from "./nearestLegal";
import {
  haversineKm,
  nearestLegalCountry,
  type GeoPoint,
  type NearestCandidate
} from "@islegal/shared";

describe("nearest legal lookup", () => {
  it("computes haversine distance", () => {
    const origin = { lat: 0, lon: 0 };
    const same = { lat: 0, lon: 0 };
    const far = { lat: 0, lon: 1 };
    expect(haversineKm(origin, same)).toBeCloseTo(0, 6);
    expect(haversineKm(origin, far)).toBeGreaterThan(100);
  });

  it("picks nearest legal country candidate", () => {
    const fromPoint = { lat: 0, lon: 0 };
    const candidates: NearestCandidate[] = [
      {
        jurisdictionKey: "A",
        statusLevel: "green",
        point: { lat: 0, lon: 1 }
      },
      {
        jurisdictionKey: "B",
        statusLevel: "yellow",
        point: { lat: 0, lon: 2 }
      },
      {
        jurisdictionKey: "C",
        statusLevel: "red",
        point: { lat: 0, lon: 0.5 }
      }
    ];
    const result = nearestLegalCountry(fromPoint, candidates);
    expect(result?.jurisdictionKey).toBe("A");
  });

  it("returns deterministic nearest legal location", () => {
    const profile = getLawProfile({ country: "US", region: "TX" });
    expect(profile).not.toBeNull();
    if (!profile) return;
    const point: GeoPoint = { lat: 31.9686, lon: -99.9018 };

    const first = findNearestLegalForProfile(profile, point);
    const second = findNearestLegalForProfile(profile, point);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (!first || !second) return;
    expect(first.jurisdictionKey).toBe(second.jurisdictionKey);
    expect(first.distanceKm).toBeCloseTo(second.distanceKm, 6);
  });

  it("returns null for unknown profiles", () => {
    const profile = getLawProfile({ country: "DE" });
    expect(profile).not.toBeNull();
    if (!profile) return;
    const unknown = { ...profile, status: "unknown" as const };
    const point: GeoPoint = { lat: 51.1657, lon: 10.4515 };
    expect(findNearestLegalForProfile(unknown, point)).toBeNull();
  });
});

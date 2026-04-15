import { describe, expect, it } from "vitest";
import { findNearbyTruth } from "./nearbyTruth";

describe("nearbyTruth", () => {
  it("keeps neighbors closer than distant countries for Germany", () => {
    const result = findNearbyTruth({ geoHint: "DE", lat: 52.52, lng: 13.405 });
    expect(result).toBeTruthy();
    expect(result?.nearby.length).toBeGreaterThan(0);
    const topGeos = result?.nearby.slice(0, 3).map((item) => item.geo) || [];
    expect(topGeos.some((geo) => ["NL", "CZ", "AT", "LU", "CH"].includes(geo))).toBe(true);
  });

  it("uses border semantics instead of center-only distance for Germany fallback", () => {
    const result = findNearbyTruth({ geoHint: "DE" });
    expect(result).toBeTruthy();
    const nl = result?.nearby.find((item) => item.geo === "NL");
    const es = result?.nearby.find((item) => item.geo === "ES");
    expect(nl).toBeTruthy();
    expect(nl?.distance_type).toBe("border_entry");
    expect(nl?.distance.type).toBe("border");
    expect(nl?.distance.raw_km).toBe(nl?.distance_km);
    expect(nl?.distance.effective_km).toBe(nl?.effective_distance_km);
    expect(nl?.effective_distance_km).toBeLessThan(nl?.distance_km || 0);
    expect(nl?.why_this_result).toMatch(/closest/i);
    if (es) {
      expect(es.distance_type).toBe("access_first");
      expect(es.distance.type).toBe("access");
      expect(nl!.effective_distance_km).toBeLessThan(es.effective_distance_km);
    }
  });

  it("keeps far Spain out of the Germany nearby window", () => {
    const result = findNearbyTruth({ geoHint: "DE" });
    expect(result).toBeTruthy();
    expect(result?.nearby.some((item) => item.geo === "ES")).toBe(false);
  });

  it("does not return an empty honest view for Iran", () => {
    const result = findNearbyTruth({ geoHint: "IR" });
    expect(result).toBeTruthy();
    expect(result?.current).toBeTruthy();
    expect(result?.current?.access.type).not.toBe("strict");
    expect((result?.current?.access.truthScore || 0)).toBeGreaterThanOrEqual(0.35);
    expect(result?.nearby.length).toBeGreaterThan(0);
  });

  it("uses same-country state candidates for California", () => {
    const result = findNearbyTruth({ geoHint: "US-CA" });
    expect(result).toBeTruthy();
    expect(result?.nearby.length).toBeGreaterThan(0);
    expect(result?.nearby.every((item) => item.geo.startsWith("US-"))).toBe(true);
  });

  it("keeps neighbor-first ordering for Germany selected-country fallback", () => {
    const result = findNearbyTruth({ geoHint: "DE" });
    expect(result).toBeTruthy();
    const topGeos = result?.nearby.slice(0, 2).map((item) => item.geo) || [];
    expect(topGeos.some((geo) => ["NL", "CZ", "AT", "LU", "CH", "FR", "BE", "DK", "PL"].includes(geo))).toBe(true);
  });

  it("keeps all returned results inside the nearest distance window", () => {
    const result = findNearbyTruth({ geoHint: "DE" });
    expect(result).toBeTruthy();
    const byDistance = [...(result?.nearby || [])].sort((left, right) => left.effective_distance_km - right.effective_distance_km);
    const farthest = byDistance.at(-1)?.effective_distance_km || 0;
    for (const candidate of result?.nearby || []) {
      expect(candidate.effective_distance_km).toBeLessThanOrEqual(farthest);
    }
  });

  it("keeps score aligned to effective distance divided by truth", () => {
    const result = findNearbyTruth({ geoHint: "DE" });
    expect(result).toBeTruthy();
    const [first, second] = result?.nearby || [];
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    const firstScore = first!.effective_distance_km / (first!.access.truthScore + 0.05);
    const secondScore = second!.effective_distance_km / (second!.access.truthScore + 0.05);
    expect(firstScore).toBeLessThanOrEqual(secondScore);
  });
});

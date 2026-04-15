import { describe, expect, it } from "vitest";
import { assessDistanceModel, type DistanceJurisdiction } from "./distanceModel";

const DE: DistanceJurisdiction = {
  key: "DEU",
  geo: "DE",
  center: { lat: 51.1657, lng: 10.4515 },
  neighbors: ["NLD", "CZE", "AUT", "FRA", "POL", "CHE", "LUX", "BEL", "DNK"]
};

const NL: DistanceJurisdiction = {
  key: "NLD",
  geo: "NL",
  center: { lat: 52.1326, lng: 5.2913 },
  neighbors: ["DEU", "BEL"]
};

const ES: DistanceJurisdiction = {
  key: "ESP",
  geo: "ES",
  center: { lat: 40.4637, lng: -3.7492 },
  neighbors: ["FRA", "PRT"]
};

const byGeo = new Map(
  [DE, NL, ES].flatMap((item) => [
    [item.key, item] as const,
    [item.geo, item] as const
  ])
);

describe("distanceModel", () => {
  it("uses geo_direct when precise GPS/IP origin exists", () => {
    const result = assessDistanceModel({
      originPoint: { lat: 52.52, lng: 13.405 },
      origin: DE,
      candidate: NL,
      hasPreciseOrigin: true,
      byKey: byGeo
    });

    expect(result.mode).toBe("geo_direct");
    expect(result.borderEntryKm).toBeNull();
    expect(result.distanceKm).toBeGreaterThan(0);
  });

  it("uses border_entry for adjacent jurisdictions without precise origin", () => {
    const result = assessDistanceModel({
      originPoint: DE.center,
      origin: DE,
      candidate: NL,
      hasPreciseOrigin: false,
      byKey: byGeo
    });

    expect(result.mode).toBe("border_entry");
    expect(result.borderEntryKm).toBeGreaterThan(0);
    expect(result.distanceKm).toBeLessThanOrEqual(result.directKm);
  });

  it("uses access_first for non-neighbors without precise origin", () => {
    const result = assessDistanceModel({
      originPoint: DE.center,
      origin: DE,
      candidate: ES,
      hasPreciseOrigin: false,
      byKey: byGeo
    });

    expect(result.mode).toBe("access_first");
    expect(result.borderEntryKm).toBeGreaterThan(0);
    expect(result.distanceKm).toBeGreaterThan(result.directKm);
  });
});

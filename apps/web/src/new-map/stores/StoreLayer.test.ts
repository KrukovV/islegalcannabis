import { describe, expect, it } from "vitest";
import { buildStoreGeoSummaryFeatures } from "./StoreLayer";

describe("buildStoreGeoSummaryFeatures", () => {
  it("places one count marker at the low-precision aggregate anchor and omits incomplete rows", () => {
    const collection = buildStoreGeoSummaryFeatures([
      { geo_id: "US-CA", count: 42, anchor_lng: -119.5, anchor_lat: 37 },
      { geo_id: "US-NV", count: 0, anchor_lng: -116.5, anchor_lat: 39 },
      { geo_id: "ZZ", count: 3, anchor_lng: Number.NaN, anchor_lat: 0 },
    ]);

    expect(collection.features).toEqual([{
      type: "Feature",
      geometry: { type: "Point", coordinates: [-119.5, 37] },
      properties: { kind: "geo_summary", geo_id: "US-CA", count: 42 },
    }]);
  });
});

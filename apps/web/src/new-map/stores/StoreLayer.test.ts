import { describe, expect, it } from "vitest";
import { buildStoreGeoSummaryFeatures, canonicalizeStoreViewportBounds, renderStorePopup } from "./StoreLayer";

describe("canonicalizeStoreViewportBounds", () => {
  it("keeps continuous world-copy cameras queryable against canonical Store Truth coordinates", () => {
    expect(canonicalizeStoreViewportBounds({
      west: 285.94884060430036,
      south: 40.67409921637261,
      east: 286.0724367957082,
      north: 40.73266031137331,
    })).toEqual({
      west: -74.05115939569964,
      south: 40.67409921637261,
      east: -73.9275632042918,
      north: 40.73266031137331,
    });
  });

  it("retains antimeridian-crossing bounds and maps a full wrapped world to the canonical extent", () => {
    expect(canonicalizeStoreViewportBounds({ west: 179, south: -10, east: 181, north: 10 }))
      .toEqual({ west: 179, south: -10, east: -179, north: 10 });
    expect(canonicalizeStoreViewportBounds({ west: 180, south: -10, east: 540, north: 10 }))
      .toEqual({ west: -180, south: -10, east: 180, north: 10 });
  });
});

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

describe("renderStorePopup", () => {
  it("does not invent a business, permit lifecycle or opening state for a municipal toleration address", () => {
    const popup = renderStorePopup({
      type: "Feature",
      geometry: { type: "Point", coordinates: [4.9, 52.4] },
      properties: {
        record_kind: "MUNICIPAL_TOLERATION_ADDRESS",
        legal_name: "Unpublished business name",
        store_type: "ADULT_USE_RETAIL",
        address: "Example Street 1",
        city: "Amsterdam",
        region: "Noord-Holland",
        license_status: "UNKNOWN_STATUS",
        operational_status: "UNKNOWN_STATUS",
        source_semantics: "Current municipal toleration-list address; the source does not publish the operator name, licence lifecycle, opening hours or factual operating state.",
        source_authority: "Municipality",
        source_checked_at: "2026-08-24T20:49:18.054Z",
        source_url: "https://example.gov/policy",
      },
    });
    expect(popup).toContain("Municipal tolerated coffeeshop address");
    expect(popup).toContain("Individual permit, operator, hours and factual operating status: not published");
    expect(popup).toContain("Operating status: not separately published");
    expect(popup).toContain("Province / region: Noord-Holland");
    expect(popup).not.toContain("Unpublished business name");
    expect(popup).not.toContain("License: not published");
  });
});

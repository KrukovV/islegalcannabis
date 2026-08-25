import { describe, expect, it } from "vitest";
import { buildStoreGeoSummaryFeatures, renderStorePopup } from "./StoreLayer";

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

import { describe, expect, it } from "vitest";
import { loadCanonicalLegalTruthByGeo, loadCanonicalStoreRecords, loadStoreEligibilityByGeo, loadStoreSources, queryStoreCountrySummaries, queryStoreGeoSummaries, queryStoreSummaryLevels, validateStoreVisibility } from "@/lib/storeTruth";
import { GET } from "./route";

describe("/api/truth-map/stores/summary", () => {
  it("returns one compact count per GEO from the same validated-store gate as leaves", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    const payload = await response.json();
    const { geoRows, countryRows } = queryStoreSummaryLevels();
    expect(payload.rows).toEqual(geoRows);
    expect(payload.countryRows).toEqual(countryRows);
    expect(payload.meta.geoCount).toBe(geoRows.length);
    expect(payload.meta.countryCount).toBe(countryRows.length);
    expect(payload.meta.visibleStores).toBe(geoRows.reduce((total, row) => total + row.count, 0));
    expect(geoRows.every((row) => (
      /^[A-Z]{2}(?:-[A-Z]{2})?$/.test(row.geo_id)
      && row.count > 0
      && Number.isFinite(row.anchor_lng)
      && Number.isFinite(row.anchor_lat)
      && Number.isInteger(row.anchor_lng * 2)
      && Number.isInteger(row.anchor_lat * 2)
    ))).toBe(true);
    expect(countryRows.every((row) => /^[A-Z]{2}$/.test(row.geo_id))).toBe(true);
    expect(countryRows.reduce((total, row) => total + row.count, 0)).toBe(payload.meta.visibleStores);
    expect(countryRows.length).toBeLessThan(geoRows.length);
  });

  it("does not count records that fail the current Store Truth visibility gate", () => {
    const sourceById = new Map(loadStoreSources().map((source) => [source.source_id, source]));
    const truthByGeo = loadCanonicalLegalTruthByGeo();
    const eligibilityByGeo = loadStoreEligibilityByGeo();
    const expected = new Map<string, number>();
    for (const record of loadCanonicalStoreRecords()) {
      const visible = validateStoreVisibility(
        record,
        sourceById.get(record.source_id),
        truthByGeo.get(record.geo_id),
        eligibilityByGeo.get(record.geo_id),
      ).visible;
      if (visible) expected.set(record.geo_id, (expected.get(record.geo_id) || 0) + 1);
    }
    expect(queryStoreGeoSummaries().map(({ geo_id, count }) => ({ geo_id, count }))).toEqual(
      [...expected.entries()]
        .map(([geo_id, count]) => ({ geo_id, count }))
        .sort((left, right) => left.geo_id.localeCompare(right.geo_id)),
    );
    const expectedCountry = new Map<string, number>();
    for (const [geoId, count] of expected.entries()) {
      const countryGeo = geoId.split("-", 1)[0];
      expectedCountry.set(countryGeo, (expectedCountry.get(countryGeo) || 0) + count);
    }
    expect(queryStoreCountrySummaries().map(({ geo_id, count }) => ({ geo_id, count }))).toEqual(
      [...expectedCountry.entries()]
        .map(([geo_id, count]) => ({ geo_id, count }))
        .sort((left, right) => left.geo_id.localeCompare(right.geo_id)),
    );
  });

  it("includes only the exact-coordinate Netherlands municipal address table and individual permit records in the GEO total", () => {
    const nl = queryStoreGeoSummaries().find((row) => row.geo_id === "NL");
    expect(nl?.count).toBe(140);
    expect(nl?.anchor_lng).toBeGreaterThan(3);
    expect(nl?.anchor_lat).toBeGreaterThan(50);
  });
});

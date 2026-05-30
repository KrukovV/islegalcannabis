import { describe, expect, it } from "vitest";
import { buildStaticCountrySourceSnapshot, getStaticCountriesAsset } from "./staticCountries";

describe("static countries payload", () => {
  it("keeps the map payload slim and precompressed", () => {
    const snapshot = buildStaticCountrySourceSnapshot();
    const asset = getStaticCountriesAsset();

    expect(snapshot.features.length).toBeGreaterThan(190);
    expect(asset.hash).toMatch(/^[a-f0-9]{12}$/);
    expect(asset.byteLength).toBeLessThanOrEqual(2_500_000);
    expect(asset.gzipByteLength).toBeLessThanOrEqual(900_000);
    expect(asset.brotliByteLength).toBeLessThanOrEqual(600_000);
    expect(asset.cacheControl).toContain("immutable");
  });
});

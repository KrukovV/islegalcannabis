import { describe, expect, it } from "vitest";
import {
  STATIC_COUNTRIES_HASH,
  STATIC_COUNTRIES_URL,
  getStaticCountriesAsset
} from "@/new-map/staticCountries";
import { dynamic, GET, revalidate } from "./route";

describe("countries compatibility route", () => {
  it("redirects to the precomputed static URL without rebuilding the payload", async () => {
    expect(dynamic).toBe("force-static");
    expect(revalidate).toBe(false);

    const response = await GET(new Request("https://www.islegal.info/api/new-map/countries"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(STATIC_COUNTRIES_URL);
    expect(response.headers.get("x-new-map-countries-hash")).toBe(STATIC_COUNTRIES_HASH);
  });

  it("returns inline JSON payload when requested", async () => {
    const asset = getStaticCountriesAsset();
    const response = await GET(new Request("https://www.islegal.info/api/new-map/countries?inline=1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-encoding")).toBe("identity");
    expect(response.headers.get("x-new-map-countries-hash")).toBe(asset.hash);
    expect(response.headers.get("x-new-map-countries-bytes")).toBe(String(asset.byteLength));
    expect(await response.text()).toBe(asset.json);
  });
});

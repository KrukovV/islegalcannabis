import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import * as countrySource from "@/new-map/countrySource";
import { getCountryPageIndexByGeoCode } from "@/lib/countryPageStorage";

describe("card-entry route", () => {
  it("keeps popup card responses CDN-cacheable for fast rich-popup upgrades", async () => {
    const response = await GET(new Request("https://www.islegal.info/api/new-map/card-entry?geo=FR"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate=604800");
  });

  it("returns complete selected cards without building unrelated cards or geometry", async () => {
    const expected = countrySource.buildCardIndexSnapshot();
    const fullIndex = vi.spyOn(countrySource, "buildCardIndexSnapshot").mockImplementation(() => {
      throw new Error("UNRELATED_FULL_INDEX_BUILT");
    });
    try {
      for (const geo of ["FR", "US-CA"]) {
        const response = await GET(new Request(`http://localhost/api/new-map/card-entry?geo=${geo}`));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expected[geo]);
      }
      expect(fullIndex).not.toHaveBeenCalled();
    } finally {
      fullIndex.mockRestore();
    }
  });

  it("retains the original complete fallback for a map-only GEO", async () => {
    const expected = countrySource.buildCardIndexSnapshot();
    const pages = getCountryPageIndexByGeoCode();
    const geo = Object.keys(expected).find((candidate) => !pages.has(candidate));
    expect(geo).toBeDefined();
    const response = await GET(new Request(`http://localhost/api/new-map/card-entry?geo=${geo}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected[geo!]);
  });
});

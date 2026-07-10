import { describe, expect, it } from "vitest";
import {
  STATIC_COUNTRIES_HASH,
  STATIC_COUNTRIES_URL
} from "@/new-map/staticCountries";
import { dynamic, GET, revalidate } from "./route";

describe("countries compatibility route", () => {
  it("redirects to the precomputed static URL without rebuilding the payload", async () => {
    expect(dynamic).toBe("force-static");
    expect(revalidate).toBe(false);

    const response = await GET();

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(STATIC_COUNTRIES_URL);
    expect(response.headers.get("x-new-map-countries-hash")).toBe(STATIC_COUNTRIES_HASH);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { reverseGeocode, resetReverseGeocodeCacheForTests } from "./reverseGeocode";

const mockFetch = vi.fn();

describe("reverseGeocode", () => {
  beforeEach(() => {
    resetReverseGeocodeCacheForTests();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    delete process.env.GEOAPIFY_API_KEY;
  });

  it("returns nominatim result when available", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        address: { country_code: "de" }
      })
    });

    const result = await reverseGeocode(52.52, 13.405);

    expect(result).toEqual({
      country: "DE",
      region: undefined,
      method: "nominatim"
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to bbox when nominatim fails and geoapify is missing", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const result = await reverseGeocode(37.7749, -122.4194);

    expect(result).toEqual({
      country: "US",
      region: "CA",
      method: "bbox"
    });
  });
});

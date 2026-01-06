import { describe, expect, it } from "vitest";
import { refreshLawProfile } from "../../../../tools/refresh-laws";

describe("refreshLawProfile", () => {
  it("marks needs_review when headers change", async () => {
    const profile = {
      id: "DE",
      country: "DE",
      medical: "restricted",
      recreational: "illegal",
      possession_limit: "Not specified",
      public_use: "illegal",
      home_grow: "illegal",
      cross_border: "illegal",
      risks: ["public_use"],
      sources: [{ title: "Example", url: "https://example.com" }],
      updated_at: "2024-01-01",
      verified_at: "2024-01-01",
      confidence: "medium",
      status: "known"
    };

    const cache = {
      "https://example.com": {
        etag: "abc",
        lastModified: "yesterday",
        contentLength: "123",
        checkedAt: "2024-01-01T00:00:00.000Z"
      }
    };

    const fetchFn = async () => ({
      ok: true,
      etag: "def",
      lastModified: "yesterday",
      contentLength: "123"
    });

    const now = new Date("2025-01-06T12:00:00Z");
    const refreshed = await refreshLawProfile(profile, cache, now, fetchFn);

    expect(refreshed.status).toBe("needs_review");
  });
});

import { describe, expect, it } from "vitest";
import { addCachedCheck, findNearbyCached, resetNearbyCacheForTests } from "./nearbyCache";

describe("nearby cache", () => {
  it("returns cached entry for same cell within window", () => {
    resetNearbyCacheForTests();
    const now = new Date("2025-01-06T10:00:00Z");
    addCachedCheck({
      ts: now.toISOString(),
      jurisdictionKey: "DE",
      country: "DE",
      statusCode: "recreational_legal",
      statusLevel: "green",
      profileHash: "hash",
      lawUpdatedAt: "2025-01-01",
      sources: [],
      location: { method: "gps", confidence: "high" },
      approxCell: "cell:abc"
    });

    const hit = findNearbyCached(
      "cell:abc",
      "DE",
      120,
      now.getTime() + 10 * 60 * 1000
    );
    expect(hit?.jurisdictionKey).toBe("DE");
  });

  it("does not return stale cache outside window", () => {
    resetNearbyCacheForTests();
    const now = new Date("2025-01-06T10:00:00Z");
    addCachedCheck({
      ts: now.toISOString(),
      jurisdictionKey: "DE",
      country: "DE",
      statusCode: "recreational_legal",
      statusLevel: "green",
      profileHash: "hash",
      lawUpdatedAt: "2025-01-01",
      sources: [],
      location: { method: "gps", confidence: "high" },
      approxCell: "cell:abc"
    });

    const hit = findNearbyCached(
      "cell:abc",
      "DE",
      60,
      now.getTime() + 2 * 60 * 60 * 1000
    );
    expect(hit).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  loadRecent,
  purgeLRU,
  resetNearbyCacheForTests,
  saveCheck
} from "./nearbyCacheStorage";

const baseEntry = {
  ts: new Date("2025-01-06T10:00:00Z").toISOString(),
  jurisdictionKey: "DE",
  country: "DE",
  region: undefined,
  statusCode: "recreational_legal",
  statusLevel: "green" as const,
  profileHash: "hash",
  verifiedAt: "2025-01-05",
  lawUpdatedAt: "2025-01-01",
  sources: [{ title: "Source", url: "https://example.com" }],
  location: { method: "ip" as const, confidence: "low" as const },
  approxCell: "country:DE"
};

describe("nearbyCacheStorage", () => {
  beforeEach(() => {
    resetNearbyCacheForTests();
  });

  it("returns a recent entry by jurisdiction", () => {
    saveCheck(baseEntry);
    const now = new Date("2025-01-06T10:30:00Z").getTime();
    const result = loadRecent(null, "DE", 120, now);
    expect(result?.jurisdictionKey).toBe("DE");
  });

  it("ignores stale entries outside window", () => {
    const past = new Date("2025-01-06T06:00:00Z").toISOString();
    saveCheck({ ...baseEntry, ts: past });
    const now = new Date("2025-01-06T10:30:00Z").getTime();
    const result = loadRecent(null, "DE", 120, now);
    expect(result).toBeNull();
  });

  it("never matches across different jurisdiction keys", () => {
    saveCheck({ ...baseEntry, jurisdictionKey: "DE", approxCell: "cell:10,10" });
    const result = loadRecent("cell:10,10", "FR", 120, Date.now());
    expect(result).toBeNull();
  });

  it("purges entries beyond max size", () => {
    const entries = Array.from({ length: 101 }, (_, idx) => ({
      ...baseEntry,
      ts: new Date(2025, 0, 6, 10, 0, idx).toISOString(),
      profileHash: `hash-${idx}`
    }));
    const trimmed = purgeLRU(entries);
    expect(trimmed.length).toBe(100);
  });
});

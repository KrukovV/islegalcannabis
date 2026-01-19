import { describe, expect, it } from "vitest";
import { nearestBetterLocation } from "@islegal/shared";

describe("nearestBetterLocation", () => {
  it("returns nearest better candidate", () => {
    const current = { level: "red" as const, lat: 0, lon: 0 };
    const candidates = [
      {
        id: "A",
        name: "Alpha",
        level: "yellow" as const,
        lat: 1,
        lon: 1,
        sourcesCount: 2
      },
      {
        id: "B",
        name: "Beta",
        level: "green" as const,
        lat: 10,
        lon: 10,
        sourcesCount: 3
      }
    ];
    const result = nearestBetterLocation(current, candidates);
    expect(result?.id).toBe("A");
  });
});

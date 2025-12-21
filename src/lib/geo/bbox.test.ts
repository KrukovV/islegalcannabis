import { describe, expect, it } from "vitest";
import { resolveByBbox } from "./bbox";

describe("resolveByBbox", () => {
  it("returns DE for Berlin coordinates", () => {
    expect(resolveByBbox(52.52, 13.405)).toEqual({ country: "DE" });
  });

  it("returns US-CA for Los Angeles coordinates", () => {
    expect(resolveByBbox(34.0522, -118.2437)).toEqual({
      country: "US",
      region: "CA"
    });
  });
});

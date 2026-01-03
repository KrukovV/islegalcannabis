import { describe, expect, it } from "vitest";
import { resolveByBbox } from "./bbox";

describe("resolveByBbox", () => {
  it("returns DE for Berlin coordinates", () => {
    expect(resolveByBbox(52.52, 13.405)).toEqual({ country: "DE" });
  });

  it("returns DE for Munich coordinates", () => {
    expect(resolveByBbox(48.1351, 11.582)).toEqual({ country: "DE" });
  });

  it("returns US-CA for Amsterdam coordinates", () => {
    expect(resolveByBbox(52.3676, 4.9041)).toEqual({
      country: "US",
      region: "CA"
    });
  });

  it("returns US-CA for San Francisco coordinates", () => {
    expect(resolveByBbox(37.7749, -122.4194)).toEqual({
      country: "US",
      region: "CA"
    });
  });
});

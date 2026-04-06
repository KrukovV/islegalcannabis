import { describe, expect, it } from "vitest";
import { normalizeCountry, normalizeState, resolveLocation } from "./resolveLocation";

describe("resolveLocation", () => {
  it("resolves us states from aliases", () => {
    expect(normalizeState("California airport")).toBe("US-CA");
    expect(normalizeState("Can I fly with weed from Texas?")).toBe("US-TX");
  });

  it("resolves countries from names and iso", () => {
    expect(normalizeCountry("Germany cannabis")).toBe("DE");
    expect(normalizeCountry("Travel in Nepal")).toBe("NP");
  });

  it("prefers state over country and then falls back to geo hint", () => {
    expect(resolveLocation("California weed", "US")).toBe("US-CA");
    expect(resolveLocation("unknown place", "DE")).toBe("DE");
    expect(resolveLocation("unknown place")).toBeNull();
  });
});

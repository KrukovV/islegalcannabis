import { describe, expect, it } from "vitest";
import { extrasFromProfile } from "@islegal/shared";
import type { JurisdictionLawProfile } from "@islegal/shared";

const baseProfile: JurisdictionLawProfile = {
  schema_version: 1,
  id: "DE",
  country: "DE",
  medical: "allowed",
  recreational: "restricted",
  possession_limit: "Up to 25g",
  public_use: "restricted",
  home_grow: "allowed",
  cross_border: "illegal",
  risks: [],
  sources: [{ title: "Example", url: "https://example.com" }],
  updated_at: "2024-01-01",
  verified_at: "2024-01-01",
  confidence: "medium",
  status: "known"
};

describe("extrasFromProfile", () => {
  it("maps allowed public use to green", () => {
    const extras = extrasFromProfile({ ...baseProfile, public_use: "allowed" });
    expect(extras[0]?.level).toBe("green");
  });

  it("maps restricted public use to yellow", () => {
    const extras = extrasFromProfile({ ...baseProfile, public_use: "restricted" });
    expect(extras[0]?.level).toBe("yellow");
  });

  it("maps illegal public use to red", () => {
    const extras = extrasFromProfile({ ...baseProfile, public_use: "illegal" });
    expect(extras[0]?.level).toBe("red");
  });
});

import { describe, expect, it } from "vitest";
import { buildExtrasItems, extrasPreview } from "./extras";
import type { JurisdictionLawProfile } from "@islegal/shared";

const profile: JurisdictionLawProfile = {
  id: "US-CA",
  country: "US",
  region: "CA",
  medical: "allowed",
  recreational: "allowed",
  possession_limit: "Up to 1 oz",
  public_use: "restricted",
  home_grow: "allowed",
  cross_border: "illegal",
  risks: ["public_use"],
  sources: [{ title: "Example", url: "https://example.com" }],
  updated_at: "2024-01-01",
  verified_at: "2024-01-02",
  confidence: "medium",
  status: "known",
  extras: {
    purchase: "allowed",
    retail_shops: "allowed",
    edibles: "restricted",
    vapes: "restricted",
    concentrates: "restricted",
    cbd: "allowed",
    paraphernalia: "allowed",
    medical_card: "allowed",
    home_grow_plants: "up to 6 plants",
    social_clubs: "unknown",
    hemp: "allowed",
    workplace: "restricted",
    testing_dui: "unknown"
  }
};

describe("extras mapping", () => {
  it("builds deterministic extras list", () => {
    const items = buildExtrasItems(profile);
    expect(items.length).toBe(13);
    expect(items[0].label).toBe("Purchase");
    expect(items[0].value).toBe("Allowed");
  });

  it("builds preview with two items", () => {
    const items = buildExtrasItems(profile);
    const preview = extrasPreview(items);
    expect(preview.length).toBe(2);
  });
});

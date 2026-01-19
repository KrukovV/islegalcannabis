import { describe, expect, it } from "vitest";
import { buildWhyBullets } from "./why";
import type { JurisdictionLawProfile } from "./types";

const baseProfile: JurisdictionLawProfile = {
  schema_version: 1,
  id: "DE",
  country: "DE",
  medical: "allowed",
  recreational: "restricted",
  possession_limit: "Up to 25g",
  public_use: "restricted",
  cross_border: "illegal",
  risks: [],
  sources: [{ title: "Example", url: "https://example.com" }],
  updated_at: "2024-01-01",
  verified_at: "2025-01-06",
  confidence: "medium",
  status: "known"
};

describe("buildWhyBullets", () => {
  it("starts with medical allowed when recreational is restricted", () => {
    const bullets = buildWhyBullets(baseProfile);
    expect(bullets[0]).toBe("Medical use: allowed.");
  });

  it("keeps medical bullet when recreational is allowed", () => {
    const bullets = buildWhyBullets({
      ...baseProfile,
      recreational: "allowed"
    });
    expect(bullets.filter((bullet) => bullet === "Medical use: allowed.").length).toBe(
      1
    );
  });

  it("uses medical unknown when profile is unknown", () => {
    const bullets = buildWhyBullets({
      ...baseProfile,
      status: "unknown",
      medical: "unknown" as JurisdictionLawProfile["medical"]
    });
    expect(bullets[0]).toBe("Medical use: unknown.");
  });
});

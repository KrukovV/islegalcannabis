import { describe, expect, it } from "vitest";
import { buildBullets } from "./summary";
import { getStaticLawProfile } from "@/laws/registry";

describe("buildBullets", () => {
  it("returns stable bullet labels for US-CA", () => {
    const profile = getStaticLawProfile({ country: "US", region: "CA" });
    expect(profile).not.toBeNull();
    const bullets = buildBullets(profile!);
    expect(bullets.map((b) => b.label)).toEqual([
      "Medical",
      "Recreational",
      "Possession limit",
      "Public use",
      "Home grow",
      "Cross-border"
    ]);
  });

  it("returns stable bullet labels for NL", () => {
    const profile = getStaticLawProfile({ country: "NL" });
    expect(profile).not.toBeNull();
    const bullets = buildBullets(profile!);
    expect(bullets.map((b) => b.label)).toEqual([
      "Medical",
      "Recreational",
      "Possession limit",
      "Public use",
      "Home grow",
      "Cross-border"
    ]);
  });
});

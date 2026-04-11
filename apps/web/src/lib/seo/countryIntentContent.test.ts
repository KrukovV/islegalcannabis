import { describe, expect, it } from "vitest";
import { getCountryPageData } from "@/lib/countryPageStorage";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";

describe("countryIntentContent", () => {
  it("builds the required SEO intent sections from stored country data and sorts them by strength", () => {
    const netherlands = getCountryPageData("nld");
    expect(netherlands).toBeTruthy();
    const sections = buildCountryIntentSections(netherlands!);

    expect(sections).toHaveLength(5);
    expect(sections.map((section) => section.id).sort()).toEqual(["airport", "buy", "medical", "possession", "tourists"]);
    expect(sections[0].strength).toBeGreaterThanOrEqual(sections[1].strength);
    expect(sections[1].strength).toBeGreaterThanOrEqual(sections[2].strength);
    expect(sections[0].related_regions.length).toBeGreaterThan(0);
    expect(sections[0].related_regions[0].score).toBeGreaterThanOrEqual(sections[0].related_regions.at(-1)?.score || 0);
    expect(sections[0].related_heading).toContain("Related regions");
  });

  it("keeps airport and risk language grounded in stored legal signals", () => {
    const egypt = getCountryPageData("egy");
    expect(egypt).toBeTruthy();
    const sections = buildCountryIntentSections(egypt!);
    const airport = sections.find((section) => section.id === "airport");
    const tourists = sections.find((section) => section.id === "tourists");

    expect(airport?.body.toLowerCase()).toContain("airport");
    expect(airport?.body.toLowerCase()).toContain("illegal");
    expect(tourists?.body.toLowerCase()).toContain("tourists");
    expect(tourists?.body.toLowerCase()).toContain("restricted");
  });

  it("boosts the matching intent when the query matches a known intent", () => {
    const california = getCountryPageData("us-ca");
    expect(california).toBeTruthy();
    const sections = buildCountryIntentSections(california!, { query: "buy" });

    expect(sections[0]?.id).toBe("buy");
    expect(sections[0]?.heading).toContain("Can you buy cannabis");
  });
});

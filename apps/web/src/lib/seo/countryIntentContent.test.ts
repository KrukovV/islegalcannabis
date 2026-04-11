import { describe, expect, it } from "vitest";
import { getCountryPageData } from "@/lib/countryPageStorage";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";

describe("countryIntentContent", () => {
  it("builds the required SEO intent sections from stored country data", () => {
    const netherlands = getCountryPageData("nld");
    expect(netherlands).toBeTruthy();
    const sections = buildCountryIntentSections(netherlands!);

    expect(sections).toHaveLength(5);
    expect(sections.map((section) => section.id)).toEqual(["buy", "possession", "tourists", "airport", "medical"]);
    expect(sections[0].heading).toContain("Can you buy cannabis");
    expect(sections[1].heading).toContain("Possession rules");
    expect(sections[2].heading).toBe("Is cannabis allowed for tourists?");
    expect(sections[3].heading).toBe("Airport rules");
    expect(sections[4].heading).toContain("Medical cannabis");
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
});

import { describe, expect, it } from "vitest";

import { buildCannabisProfileAiContext, buildCannabisProfileCard, getCannabisProfileForGeo, getLocalNamesDictionary } from "./cannabisProfile";

describe("cannabisProfile", () => {
  it("keeps required local names in the separate dictionary", () => {
    const terms = getLocalNamesDictionary().map((entry) => entry.term.toLowerCase());

    for (const term of ["dawamesc", "kif", "hachich", "tekrouri", "diamba", "liamba", "happy pizza", "dagga", "chanvre à fumer"]) {
      expect(terms).toContain(term);
    }
  });

  it("exposes Cambodia profile data without making it a status signal", () => {
    const profile = getCannabisProfileForGeo("KH");
    const card = buildCannabisProfileCard("KH");

    expect(profile?.sections.local_names).toContain("happy pizza");
    expect(card?.cannabisFoods.join(" ")).toMatch(/happy pizza|food cooked with marijuana/i);
    expect(card?.enforcementReality.join(" ")).toMatch(/opportunistically|unenforced/i);
  });

  it("builds compact AI context for local names", () => {
    const context = buildCannabisProfileAiContext("AO");

    expect(context?.localNames).toEqual(expect.arrayContaining(["diamba", "liamba"]));
    expect(context?.source).toMatch(/^https?:\/\//);
  });
});

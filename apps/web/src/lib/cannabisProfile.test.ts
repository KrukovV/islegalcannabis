import { describe, expect, it } from "vitest";

import {
  buildCannabisProfileAiContext,
  buildCannabisProfileCard,
  getCannabisProfileCardSections,
  getCannabisProfileForGeo,
  getLocalNamesDictionary
} from "./cannabisProfile";

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

  it("preserves persisted cultivation and market sections in runtime popup cards", () => {
    const profile = getCannabisProfileForGeo("AU");
    const card = buildCannabisProfileCard("AU");

    expect((profile?.sections.cultivation || []).length).toBeGreaterThan(0);
    expect((profile?.sections.market || []).length).toBeGreaterThan(0);
    expect((card?.cultivation || []).length).toBeGreaterThan(0);
    expect((card?.market || []).length).toBeGreaterThan(0);
  });

  it("builds compact AI context only from explicit cannabis-article profiles", () => {
    const context = buildCannabisProfileAiContext("KH");

    expect(context?.localNames).toEqual(expect.arrayContaining(["happy pizza"]));
    expect(context?.source).toMatch(/^https?:\/\//);
  });

  it("does not invent popup profile sections from notes when knowledge entry is absent", () => {
    const fallback = buildCannabisProfileCard(
      "ZZ",
      4,
      "Cannabis in this region was introduced during the 18th century. It is traditionally used in ritual ceremonies and is still culturally significant."
        + " In recent years enforcement remains active, and possession can result in fines or arrest."
        + " Cultivation is limited but edible products such as hash and cannabis-based infusions are present."
    );

    expect(fallback).toBeNull();
  });

  it("upgrades explicit dedicated-article profiles even when legacy source tags are stale", () => {
    const profile = getCannabisProfileForGeo("AD");
    const andorra = buildCannabisProfileCard(
      "AD",
      6,
      'style="background:#C4C9CD;" | {{Hs|5}} In 2026 historical changes introduced medical access to [[Cannabis|cannabis]].'
    );

    expect(profile?.source_type).toBe("wikipedia_cannabis_article");
    expect(andorra?.enforcementReality.join(" ")).toMatch(/two years in prison|fines up to 600 euros/i);
  });

  it("dedupes repeated cannabis profile sentences across rendered sections", () => {
    const card = buildCannabisProfileCard("KH");
    const counts = new Map<string, number>();

    for (const items of [
      card?.history || [],
      card?.localNames || [],
      card?.culture || [],
      card?.enforcementReality || [],
      card?.products || [],
      card?.traditionalUse || [],
      card?.notes || [],
      card?.cannabisFoods || [],
      card?.slang || [],
      card?.cultivation || [],
      card?.market || []
    ]) {
      for (const item of items) {
        const key = item.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    expect(Math.max(...counts.values())).toBe(1);
  });

  it("keeps Montana popup profile text complete after sanitizing runtime cards", () => {
    const geos = ["US", "US-AK", "US-CA", "US-MT"];
    const failures: string[] = [];
    let montanaText = "";

    for (const geo of geos) {
      const card = buildCannabisProfileCard(geo, 20);
      const flatItems = getCannabisProfileCardSections(card).flatMap((section) => section.items);
      if (geo === "US-MT") montanaText = flatItems.join(" ");
      for (const item of flatItems) {
        if (/\bv\.$/i.test(item) || /\benem\.$/i.test(item) || /\.{3}$/.test(item)) {
          failures.push(`${geo}:${item}`);
        }
      }
    }

    expect(montanaText).toMatch(/political enemies/i);
    expect(failures).toEqual([]);
  });

  it("drops unattributed quote fragments from popup profile cards", () => {
    const sweden = buildCannabisProfileCard("SE", 10);
    const historyText = (sweden?.history || []).join(" ");

    expect(historyText).not.toMatch(/\bshe said\b/i);
    expect(historyText).not.toMatch(/I hate the law book here/i);
    expect(historyText).toMatch(/Medical Products Agency|European Court of Human Rights/i);
  });
});

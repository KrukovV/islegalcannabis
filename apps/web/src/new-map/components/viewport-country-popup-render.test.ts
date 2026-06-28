import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { deriveCountryCardEntryFromCountryPageData, getCountryPageData } from "@/lib/countryPageStorage";
import ViewportCountryPopup from "./ViewportCountryPopup";

describe("ViewportCountryPopup render contract", () => {
  it("shows parent-country Details CTA for territory fallback entries", () => {
    const baseEntry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("aus")!);
    const entry = {
      ...baseEntry,
      geo: "GF",
      code: "gf",
      displayName: "French Guiana",
      iso2: "GF",
      pageHref: "/c/fra",
      detailsHref: null,
      parentCountry: {
        code: "FRA",
        name: "France"
      },
      parentLawSummary: "French Guiana belongs to France and follows France's laws.",
      jurisdictionContextNotes: ["French law and local enforcement practice apply."]
    };
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(html).toContain("French Guiana");
    expect(html).toContain("Details →");
    expect(html).toContain('href="/c/fra"');
    expect(html).toContain("Jurisdiction");
    expect(html).toContain("French Guiana belongs to France");
  });

  it("renders full Cannabis Profile sections when available", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("khm")!);
    entry.cannabisProfile = {
      sourceUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Cambodia",
      sourceTitle: "Wikipedia: Cannabis in Cambodia",
      history: ["history 1", "history 2", "history 3", "history 4"],
      localNames: [
        "name 1",
        "name 2",
        "name 3",
        "name 4",
        "name 5",
        "name 6",
        "name 7",
        "name 8",
        "name 9",
        "name 10",
        "name 11",
        "name 12",
        "name 13",
        "name 14"
      ],
      culture: ["culture 1", "culture 2", "culture 3", "culture 4", "culture 5"],
      enforcementReality: ["enforce 1", "enforce 2", "enforce 3", "enforce 4"],
      products: ["product 1", "product 2", "product 3", "product 4", "product 5"],
      traditionalUse: ["trad 1", "trad 2", "trad 3"],
      notes: ["note 1", "note 2", "note 3"],
      cannabisFoods: ["food 1", "food 2", "food 3", "food 4", "food 5"],
      slang: ["slang 1", "slang 2"],
      cultivation: ["cult 1", "cult 2", "cult 3"],
      market: ["market 1", "market 2", "market 3"]
    };
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(html).toContain("Status");
    expect(html).toContain("Local Names");
    expect(html).toContain("name 6");
    expect(html).toContain("Enforcement Reality");
    expect(html).toContain("product 3");
    expect(html).toContain("history 3");
  });

  it("hides profile sections instead of templating them from notes when profile data is unavailable", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("aus")!);
    entry.cannabisProfile = null;
    entry.notes =
      "Cannabis law changed in 1982 and possession is now decriminalized, while traditional ceremonies still use hemp preparations in cultural festivals.";

    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(html).not.toContain("History");
    expect(html).not.toContain("Culture");
    expect(html).not.toContain("Products");
    expect(html).not.toContain("Traditional Use");
    expect(html).not.toContain("Enforcement Reality");
  });

  it("normalizes wiki markup before rendering popup profile text", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("aus")!);
    entry.cannabisProfile = {
      sourceUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Australia",
      sourceTitle: "Wikipedia: Cannabis in Australia",
      history: ["In 2020 [[Cannabis|cannabis]] laws were revised."],
      localNames: ["\"dagga\""],
      culture: ["{{Culture|cannabis}} events are common."],
      enforcementReality: ["<ref>obsolete</ref> Possession can trigger fines https://example.com/raw-url"],
      products: ["Cannabis oil [[used]]"],
      traditionalUse: ["[https://example.com Traditional use]"],
      notes: ["style=\"background:#C4C9CD;\" | Known as \"dagga\" and regulated."],
      cannabisFoods: ["cannabis foods (pizza)"],
      slang: ["called [[weed|weed]]"],
      cultivation: ["Grown in gardens."],
      market: ["The [[dispensary|dispensaries]] remain limited."]
    };
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(html).toContain("cannabis laws were revised");
    expect(html).toContain("weed");
    expect(html).toContain("dispensaries remain limited");
    expect(html).not.toContain("[[");
    expect(html).not.toContain("{{");
    expect(html).not.toContain("<ref");
    expect(html).not.toContain("https://example.com/raw-url");
  });

  it("renders the dedicated cannabis article in Sources when profile sections are visible", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("alb")!);
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(entry.cannabisProfile).toBeTruthy();
    expect(entry.sources.some((source) => source.url === getCountryPageData("alb")!.sources.legal)).toBe(true);
    expect(html).toContain("Sources");
    expect(html).toContain("Wikipedia: Cannabis in Albania");
  });

  it("renders status context even without a dedicated cannabis profile article", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("ai")!);
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(entry.cannabisProfile).toBeNull();
    expect(html).toContain("Recreational use is banned.");
    expect(html).toContain("Criminal penalties can include prison.");
    expect(html).toContain("Access depends on local channels and conditions.");
    expect(html).toContain("Cannabis remains prohibited and criminal penalties remain in force.");
  });

  it("renders the canonical section source next to visible profile section headings", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("aus")!);
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(entry.cannabisProfile?.sourceUrl).toBe(getCountryPageData("aus")!.sources.legal);
    expect(html).toContain("History");
    expect(html).toContain("Wikipedia: Cannabis in Australia");
  });

  it("keeps a later reform fact visible when History is compacted to three items", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("khm")!);
    entry.cannabisProfile = {
      sourceUrl: "https://en.wikipedia.org/wiki/Cannabis_in_El_Salvador",
      sourceTitle: "Wikipedia: Cannabis in El Salvador",
      history: [
        "The country criminalized production and distribution.",
        "The country remains conservative on drug policy.",
        "A 2016 study estimated lifetime use at 17%.",
        "In 2014, activists protested to decriminalize personal cultivation."
      ],
      localNames: [],
      culture: [],
      enforcementReality: [],
      products: [],
      traditionalUse: [],
      notes: [],
      cannabisFoods: [],
      slang: [],
      cultivation: [],
      market: []
    };
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(html).toContain("History");
    expect(html).toContain("protested to decriminalize personal cultivation");
    expect(html).not.toContain("A 2016 study estimated lifetime use at 17%");
  });
});

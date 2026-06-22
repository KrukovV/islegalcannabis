import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ViewportCountryPopup from "./ViewportCountryPopup";
import { deriveCountryCardEntryFromCountryPageData, getCountryPageData } from "@/lib/countryPageStorage";

describe("ViewportCountryPopup", () => {
  it("keeps Details CTA on the country SEO page", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("aus")!);
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(html).toContain("Details →");
    expect(html).toContain('href="/c/aus"');
    expect(html).not.toContain("Legal source →");
  });

  it("keeps Details CTA on the state SEO page while state legal source stays external elsewhere", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("us-ca")!);
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(html).toContain("Details →");
    expect(html).toContain('href="/c/us-ca"');
    expect(html).not.toContain("Legal source →");
  });

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
      history: ["line 1", "line 2", "line 3", "line 4"],
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

    expect(html).toContain("Local Names");
    expect(html).toContain("name 6");
    expect(html).toContain("Enforcement Reality");
    expect(html).toContain("product 3");
    expect(html).toContain("line 3");
  });

  it("does not synthesize profile sections from notes when shared profile data is unavailable", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("aus")!);
    entry.cannabisProfile = null;
    entry.notes = `In 1945 the national policy changed and medicinal cultivation was introduced in early studies.
      Traditional ceremonies and cultural events still include hemp preparations.
      Retail shops and licensed markets remain limited.
      Cannabis foods are now popular in wellness products and beverages.
      The law uses decriminalized possession and occasional arrest has been reported.
      The plant is often called "dagga" in older references and used in medicine.`;

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
    expect(html).not.toContain("Cultivation");
    expect(html).not.toContain("Market");
    expect(html).not.toContain("Cannabis Foods");
    expect(html).not.toContain("Traditional Use");
    expect(html).not.toContain("Local Names");
  });
});

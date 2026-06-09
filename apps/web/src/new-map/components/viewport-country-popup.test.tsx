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

  it("hides Details CTA for map-only territory fallback entries", () => {
    const baseEntry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("aus")!);
    const entry = {
      ...baseEntry,
      geo: "GF",
      code: "gf",
      displayName: "French Guiana",
      iso2: "GF",
      pageHref: "/new-map?geo=GF",
      detailsHref: null
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
    expect(html).not.toContain("Details →");
  });

  it("renders compact Cannabis Profile sections when available", () => {
    const entry = deriveCountryCardEntryFromCountryPageData(getCountryPageData("khm")!);
    const html = renderToStaticMarkup(
      createElement(ViewportCountryPopup, {
        entry,
        locale: "en",
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(html).toContain("Local Names");
    expect(html).toContain("happy pizza");
    expect(html).toContain("Enforcement Reality");
  });
});

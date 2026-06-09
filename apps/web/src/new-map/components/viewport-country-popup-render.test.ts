import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { deriveCountryCardEntryFromCountryPageData, getCountryPageData } from "@/lib/countryPageStorage";
import ViewportCountryPopup from "./ViewportCountryPopup";

describe("ViewportCountryPopup render contract", () => {
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

    expect(html).toContain("Status");
    expect(html).toContain("Local Names");
    expect(html).toContain("happy pizza");
    expect(html).toContain("Enforcement Reality");
  });
});

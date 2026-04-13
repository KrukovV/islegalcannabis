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
        anchor: { x: 100, y: 100 },
        onClose: () => {}
      })
    );

    expect(html).toContain("Details →");
    expect(html).toContain('href="/c/aus"');
    expect(html).not.toContain("Legal source →");
  });
});

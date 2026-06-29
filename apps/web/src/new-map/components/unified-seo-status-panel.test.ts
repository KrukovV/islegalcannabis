import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UnifiedSeoStatusPanel from "./UnifiedSeoStatusPanel";
import { getCountryPageData } from "@/lib/countryPageStorage";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import { buildCardIndexSnapshot } from "@/new-map/countrySource";

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
}));

describe("UnifiedSeoStatusPanel", () => {
  function renderPanel(code: string) {
    const data = getCountryPageData(code);
    expect(data).toBeTruthy();
    return renderToStaticMarkup(
      createElement(UnifiedSeoStatusPanel, {
        data: data!,
        locale: "en",
        onClose: () => {}
      })
    );
  }

  function renderFallbackPanel(geo: string) {
    const entry = buildCardIndexSnapshot({ fresh: true })[geo];
    expect(entry).toBeTruthy();
    return renderToStaticMarkup(
      createElement(UnifiedSeoStatusPanel, {
        entry: entry!,
        locale: "en",
        onClose: () => {}
      })
    );
  }

  it("renders a color-coded status badge and legal source link for core status buckets", () => {
    const fixtures = ["aus", "irn", "deu"] as const;

    for (const fixture of fixtures) {
      const data = getCountryPageData(fixture)!;
      const card = deriveCountryCardEntryFromCountryPageData(data);
      const html = renderPanel(fixture);

      expect(html).toContain(`data-category="${card.mapCategory}"`);
      expect(html).toContain(`${card.panel.levelTitle} in`);
      expect(html).toContain("Legal source →");
      expect(html).toContain(String(data.sources.legal));
    }
  });

  it("keeps the overlay honest when no dedicated Cannabis_in_* profile exists", () => {
    const html = renderPanel("ai");

    expect(html).not.toContain("Cannabis profile");
    expect(html).toContain("Legal source →");
    expect(html).toContain("https://en.wikipedia.org/wiki/Anguilla");
    expect(html).not.toContain("Cannabis_in_Anguilla");
  });

  it("uses Cannabis_in_* legal sources for US state SEO panels too", () => {
    const html = renderPanel("us-ca");

    expect(html).toContain("Legal or partly allowed in California");
    expect(html).toContain("Legal source →");
    expect(html).toContain("Cannabis_in_California");
    expect(html).toContain("Cannabis can be legally accessed through recreational or regulated medical programs.");
    expect(html).not.toContain("Recreational:");
    expect(html).not.toContain("Medical:");
    expect(html).not.toContain("Distribution:");
  });

  it("renders cannabis profile sections in the overlay when a comparable profile exists", () => {
    const html = renderPanel("geo");

    expect(html).toContain("Cannabis profile");
    expect(html).toContain("History");
    expect(html).toContain("Culture");
    expect(html).toContain("Enforcement Reality");
    expect(html).toContain("Wikipedia: Cannabis in Georgia (country)");
  });

  it("keeps Georgia country and Georgia state source titles distinct in the SEO panel", () => {
    const countryHtml = renderPanel("geo");
    const stateHtml = renderPanel("us-ga");

    expect(countryHtml).toContain("Cannabis_in_Georgia_(country)");
    expect(countryHtml).toContain("Wikipedia: Cannabis in Georgia (country)");
    expect(stateHtml).toContain("Cannabis_in_Georgia_(U.S._state)");
    expect(stateHtml).toContain("Wikipedia: Cannabis in Georgia (U.S. state)");
    expect(countryHtml).toContain("Constitutional Court of Georgia on 30 July 2018");
    expect(countryHtml).not.toContain("Atlanta, Savannah, Macon, Athens");
    expect(stateHtml).toContain("Atlanta, Savannah, Macon, Athens");
    expect(stateHtml).not.toContain("Constitutional Court of Georgia on 30 July 2018");
  });

  it("renders a runtime fallback SEO overlay for GEO without CountryPageData", () => {
    const html = renderFallbackPanel("XK");

    expect(html).toContain("Country View");
    expect(html).toContain("Cannabis profile");
    expect(html).toContain("Wikipedia: Cannabis in Kosovo");
    expect(html).toContain("No dedicated Cannabis_in_* source.");
  });
});

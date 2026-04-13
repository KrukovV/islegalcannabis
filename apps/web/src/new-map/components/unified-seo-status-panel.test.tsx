import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UnifiedSeoStatusPanel from "./UnifiedSeoStatusPanel";
import { getCountryPageData } from "@/lib/countryPageStorage";

describe("UnifiedSeoStatusPanel", () => {
  it("renders a color-coded status badge and legal source link for core status buckets", () => {
    const fixtures = [
      { code: "aus", category: "LIMITED_OR_MEDICAL", text: "Restricted", source: "Cannabis_in_Australia" },
      { code: "irn", category: "ILLEGAL", text: "Illegal", source: "Cannabis_in_Iran" },
      { code: "deu", category: "LEGAL_OR_DECRIM", text: "Legal or partly allowed", source: "Cannabis_in_Germany" }
    ] as const;

    for (const fixture of fixtures) {
      const data = getCountryPageData(fixture.code);
      expect(data).toBeTruthy();
      const html = renderToStaticMarkup(
        createElement(UnifiedSeoStatusPanel, {
          data: data!,
          onClose: () => {}
        })
      );

      expect(html).toContain(`data-category="${fixture.category}"`);
      expect(html).toContain(`${fixture.text} in`);
      expect(html).toContain("Legal source →");
      expect(html).toContain(fixture.source);
    }
  });

  it("does not render a dead country-page CTA when no Cannabis_in_* source exists", () => {
    const data = getCountryPageData("ata");
    expect(data).toBeTruthy();
    const html = renderToStaticMarkup(
      createElement(UnifiedSeoStatusPanel, {
        data: data!,
        onClose: () => {}
      })
    );

    expect(html).toContain("No dedicated Cannabis_in_* source.");
    expect(html).not.toContain("Country page →");
  });

  it("uses Cannabis_in_* legal sources for US state SEO panels too", () => {
    const data = getCountryPageData("us-ca");
    expect(data).toBeTruthy();
    const html = renderToStaticMarkup(
      createElement(UnifiedSeoStatusPanel, {
        data: data!,
        onClose: () => {}
      })
    );

    expect(html).toContain("Restricted in California");
    expect(html).toContain("Legal source →");
    expect(html).toContain("Cannabis_in_California");
  });
});

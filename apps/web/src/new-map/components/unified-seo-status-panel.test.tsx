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
      expect(html).toContain(fixture.text);
      expect(html).toContain("Legal source →");
      expect(html).toContain(fixture.source);
    }
  });
});

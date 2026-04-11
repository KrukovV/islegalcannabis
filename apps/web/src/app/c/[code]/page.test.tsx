import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CountryCodePage from "./page";

describe("/c/[code] page", () => {
  it("keeps one H1 in normal SSR flow without the old top overlay shell", async () => {
    const element = await CountryCodePage({
      params: Promise.resolve({ code: "us-ca" }),
      searchParams: Promise.resolve({})
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('id="seo-content"');
    expect((html.match(/<h1/g) || []).length).toBe(1);
    expect(html).not.toContain("panelCard");
  });
});

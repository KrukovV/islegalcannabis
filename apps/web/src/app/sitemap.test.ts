import { describe, expect, it } from "vitest";
import {
  buildCountrySitemapEntries,
  buildI18nSitemapEntries,
  buildMainSitemapEntries,
  buildSitemapIndexEntries,
  buildStateSitemapEntries,
  renderSitemapIndexXml,
  renderUrlSetXml
} from "@/lib/seo/sitemaps";

describe("sitemap", () => {
  it("builds a sitemap index with split sitemap files", () => {
    const entries = buildSitemapIndexEntries();
    const xml = renderSitemapIndexXml(entries);
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://islegal.info/sitemap-main.xml",
      "https://islegal.info/sitemap-countries.xml",
      "https://islegal.info/sitemap-states.xml",
      "https://islegal.info/sitemap-i18n.xml"
    ]);
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("https://islegal.info/sitemap-i18n.xml");
  });

  it("includes only absolute canonical URLs in main/country/state sitemap splits", () => {
    const entries = [...buildMainSitemapEntries(), ...buildCountrySitemapEntries(), ...buildStateSitemapEntries()];
    expect(entries.length).toBeGreaterThan(1);
    expect(entries[0]?.url).toBe("https://islegal.info/");
    for (const entry of entries) {
      expect(entry.url.startsWith("https://islegal.info")).toBe(true);
      expect(entry.url.includes("?")).toBe(false);
      expect(typeof entry.lastModified).toBe("string");
      if (entry.url !== "https://islegal.info/") {
        expect(entry.url.startsWith("https://islegal.info/c/")).toBe(true);
      }
    }
  });

  it("builds i18n sitemap entries with hreflang alternates", () => {
    const entries = buildI18nSitemapEntries();
    const sample = entries.find((entry) => entry.url.endsWith("/es/c/nld"));
    expect(sample).toBeTruthy();
    expect(sample?.alternates?.map((alternate) => alternate.hreflang)).toEqual(["en", "es", "fr", "de"]);
    const xml = renderUrlSetXml(entries.slice(0, 3));
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('hreflang="en"');
  });
});

import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { buildCountrySitemapEntries, buildI18nSitemapEntries, buildMainSitemapEntries, buildStateSitemapEntries } from "@/lib/seo/sitemaps";

describe("sitemap", () => {
  it("builds one canonical sitemap with root and /c/* pages", () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(10);
    expect(entries[0]?.url).toBe("https://www.islegal.info/");

    for (const entry of entries) {
      expect(entry.url.startsWith("https://www.islegal.info")).toBe(true);
      expect(entry.url.includes("?")).toBe(false);
      expect(entry.lastModified instanceof Date).toBe(true);
      if (entry.url !== "https://www.islegal.info/") {
        expect(entry.url.startsWith("https://www.islegal.info/")).toBe(true);
      }
    }
  });

  it("includes countries, us states, and localized priority pages", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(entries).toHaveLength(312);
    expect(buildMainSitemapEntries()).toHaveLength(2);
    expect(buildCountrySitemapEntries()).toHaveLength(238);
    expect(buildStateSitemapEntries()).toHaveLength(50);
    expect(buildI18nSitemapEntries()).toHaveLength(22);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("https://www.islegal.info/jurisdictions");
    expect(urls).toContain("https://www.islegal.info/c/nld");
    expect(urls).toContain("https://www.islegal.info/c/us-ca");
    expect(urls).toContain("https://www.islegal.info/c/geo");
    expect(urls).toContain("https://www.islegal.info/c/us-ga");
    expect(urls).toContain("https://www.islegal.info/es/c/nld");
    expect(urls).toContain("https://www.islegal.info/pt/c/nld");
  });

  it("never publishes the local-only Truth Map route", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/truth-map"))).toBe(false);
  });
});

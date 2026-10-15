import { describe, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";
import { buildCountrySitemapEntries, buildI18nSitemapEntries, buildMainSitemapEntries, buildPrimarySitemapEntries, buildStateSitemapEntries, renderUrlSetXml } from "@/lib/seo/sitemaps";
import nextConfig from "../../next.config";
import { GET as getFullSitemap } from "@/app/sitemap-main.xml/route";

describe("sitemap", () => {
  it("builds one canonical sitemap with root and /c/* pages", () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(10);
    expect(entries[0]?.url).toBe("https://www.islegal.info/");

    for (const entry of entries) {
      expect(entry.url.startsWith("https://www.islegal.info")).toBe(true);
      expect(entry.url.includes("?")).toBe(false);
      expect(entry.lastModified).toBeUndefined();
      if (entry.url !== "https://www.islegal.info/") {
        expect(entry.url.startsWith("https://www.islegal.info/")).toBe(true);
      }
    }
  });

  it("never invents significant update dates from process time or supporting records", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
      const before = renderUrlSetXml(buildPrimarySitemapEntries());
      vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
      expect(renderUrlSetXml(buildPrimarySitemapEntries())).toBe(before);
      expect(before).not.toContain("<lastmod>");
      expect(before).not.toContain("Invalid Date");
      expect(sitemap().every((entry) => entry.lastModified === undefined)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    // An explicitly evidenced date remains supported by the XML serializer.
    expect(renderUrlSetXml([{ url: "https://www.islegal.info/", lastModified: "2026-10-13" }]))
      .toContain("<lastmod>2026-10-13</lastmod>");
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

  it("preserves every language alternate and priority in the metadata fallback", () => {
    const entries = sitemap();
    const source = buildPrimarySitemapEntries();
    expect(entries).toHaveLength(source.length);
    for (const [index, entry] of source.entries()) {
      expect(entries[index]?.url).toBe(entry.url);
      expect(entries[index]?.priority).toBe(entry.priority ? Number(entry.priority) : undefined);
      expect(entries[index]?.alternates?.languages).toEqual(entry.alternates?.length
        ? Object.fromEntries(entry.alternates.map(({ hreflang, href }) => [hreflang, href]))
        : undefined);
    }
    expect(entries.filter((entry) => entry.alternates)).toHaveLength(22);
  });

  it("internally rewrites the exact root address to the full XML handler before files", async () => {
    expect(await nextConfig.rewrites?.()).toEqual({
      beforeFiles: [{ source: "/sitemap.xml", destination: "/sitemap-main.xml" }],
      afterFiles: [],
      fallback: []
    });
  });

  it("delivers the complete UTF-8 XML projection without an HTML or empty fallback", async () => {
    const response = await getFullSitemap();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    const xml = await response.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(urls).toEqual(buildPrimarySitemapEntries().map((entry) => entry.url));
    expect(new Set(urls).size).toBe(312);
    expect(xml).not.toMatch(/<html|<!DOCTYPE html|\/truth-map|\/wiki-truth/i);
    for (const entry of buildI18nSitemapEntries()) {
      for (const alternate of entry.alternates || []) {
        expect(xml).toContain(`hreflang="${alternate.hreflang}" href="${alternate.href}"`);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("builds one canonical sitemap with root and /c/* pages", () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(10);
    expect(entries[0]?.url).toBe("https://islegal.info/");

    for (const entry of entries) {
      expect(entry.url.startsWith("https://islegal.info")).toBe(true);
      expect(entry.url.includes("?")).toBe(false);
      expect(entry.lastModified instanceof Date).toBe(true);
      if (entry.url !== "https://islegal.info/") {
        expect(entry.url.startsWith("https://islegal.info/")).toBe(true);
      }
    }
  });

  it("includes countries, us states, and localized priority pages", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("https://islegal.info/c/nld");
    expect(urls).toContain("https://islegal.info/c/us-ca");
    expect(urls).toContain("https://islegal.info/c/geo");
    expect(urls).toContain("https://islegal.info/c/us-ga");
    expect(urls).toContain("https://islegal.info/es/c/nld");
    expect(urls).toContain("https://islegal.info/pt/c/nld");
  });
});

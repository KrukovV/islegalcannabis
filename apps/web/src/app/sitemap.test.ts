import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("includes only the homepage and /c/* routes with absolute URLs", () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(1);
    expect(entries[0]?.url).toBe("https://islegal.info/");
    for (const entry of entries) {
      expect(entry.url.startsWith("https://islegal.info")).toBe(true);
      expect(entry.url.includes("?")).toBe(false);
      expect(entry.lastModified instanceof Date).toBe(true);
      if (entry.url !== "https://islegal.info/") {
        expect(entry.url.startsWith("https://islegal.info/c/")).toBe(true);
      }
    }
  });
});

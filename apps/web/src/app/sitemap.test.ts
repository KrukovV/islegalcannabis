import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("builds one canonical root-only sitemap delivery entry", () => {
    const entries = sitemap();
    expect(entries.length).toBe(1);
    expect(entries[0]?.url).toBe("https://www.islegal.info/");

    for (const entry of entries) {
      expect(entry.url.startsWith("https://www.islegal.info")).toBe(true);
      expect(entry.url.includes("?")).toBe(false);
      expect(entry.lastModified instanceof Date).toBe(true);
    }
  });

  it("keeps canonical delivery on the www host only", () => {
    expect(sitemap()[0]?.url).toBe("https://www.islegal.info/");
  });
});

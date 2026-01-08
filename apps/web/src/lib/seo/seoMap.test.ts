import { describe, expect, it } from "vitest";
import { TOP25 } from "@islegal/shared";
import { SEO_MAP } from "./seoMap.generated";

describe("SEO_MAP integrity", () => {
  it("covers all TOP25 keys and slugs uniquely", () => {
    const mapKeys = new Set(SEO_MAP.map((entry) => entry.jurisdictionKey));
    const mapSlugs = new Set(SEO_MAP.map((entry) => entry.slug));
    const topKeys = new Set(TOP25.map((entry) => entry.jurisdictionKey));

    expect(mapKeys.size).toBe(SEO_MAP.length);
    expect(mapSlugs.size).toBe(SEO_MAP.length);
    for (const key of topKeys) {
      expect(mapKeys.has(key)).toBe(true);
    }
  });

  it("is bi-directional for slug and key", () => {
    const keyToSlug = new Map(
      SEO_MAP.map((entry) => [entry.jurisdictionKey, entry.slug])
    );
    const slugToKey = new Map(
      SEO_MAP.map((entry) => [entry.slug, entry.jurisdictionKey])
    );
    for (const entry of SEO_MAP) {
      expect(keyToSlug.get(entry.jurisdictionKey)).toBe(entry.slug);
      expect(slugToKey.get(entry.slug)).toBe(entry.jurisdictionKey);
    }
  });
});

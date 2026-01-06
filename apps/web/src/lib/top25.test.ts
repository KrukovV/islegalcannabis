import { describe, expect, it } from "vitest";
import { TOP25, slugMap } from "@islegal/shared";

describe("TOP25 mapping", () => {
  it("is bijective between TOP25 and slugMap", () => {
    expect(TOP25.length).toBe(25);

    const slugs = Object.keys(slugMap);
    const slugSet = new Set(slugs);
    expect(slugs.length).toBe(slugSet.size);

    const keySet = new Set(TOP25.map((entry) => entry.jurisdictionKey));
    expect(keySet.size).toBe(TOP25.length);

    for (const entry of TOP25) {
      const mapping = slugMap[entry.slug];
      expect(mapping).toBeTruthy();
      expect(mapping.country).toBe(entry.country);
      expect(mapping.region ?? undefined).toBe(entry.region ?? undefined);
    }

    for (const [slug, mapping] of Object.entries(slugMap)) {
      const match = TOP25.find((entry) => entry.slug === slug);
      expect(match).toBeTruthy();
      expect(match?.country).toBe(mapping.country);
      expect(match?.region ?? undefined).toBe(mapping.region ?? undefined);
    }
  });
});

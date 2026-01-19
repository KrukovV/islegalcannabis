import { describe, expect, it } from "vitest";
import { getIsoMeta, listIsoMeta } from "@islegal/shared";

describe("iso3166 SSOT", () => {
  it("loads 249 entries with unique alpha2", () => {
    const entries = listIsoMeta();
    expect(entries.length).toBe(249);
    const unique = new Set(entries.map((entry) => entry.alpha2));
    expect(unique.size).toBe(entries.length);
  });

  it("computes flag and verify links", () => {
    const meta = getIsoMeta("DE");
    expect(meta).toBeTruthy();
    expect(meta?.flag).toBe("🇩🇪");
    expect(meta?.verify.isoObp).toContain("iso:code:3166:DE");
  });
});

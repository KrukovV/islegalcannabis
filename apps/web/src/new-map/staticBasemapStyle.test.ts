import { createHash } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import acceptedStyle from "./styles/positron.9e07dd691d25.json";
import { STATIC_BASEMAP_STYLE } from "./staticBasemapStyle";

describe("native basemap sprite delivery", () => {
  it("preserves every accepted layer, tile, glyph and presentation field", () => {
    const { sprite, ...actual } = STATIC_BASEMAP_STYLE;
    const { sprite: upstreamSprite, ...accepted } = acceptedStyle;
    expect(upstreamSprite).toBe("https://tiles.basemaps.cartocdn.com/gl/positron-gl-style/sprite");
    expect(sprite).toBe("/map-sprite/ffd461572dc4/sprite");
    expect(actual).toEqual(accepted);
    expect(actual.layers).toHaveLength(93);
  });

  it("retains the exact upstream atlas pixels and metadata at both pixel ratios", () => {
    const hashes = {
      ".json": "90687964a039c843f2705e2265251370ac0d8a1576f67b263cd23428f07a6ec6",
      ".png": "9e68cba832fb823e063b05c26382f3dcfd47ec38125eaab0d2810738ef11e8d8",
      "@2x.json": "fbd8db78293f0d61571601ba932d59a2e1ac905558ba4d12258b6604f597e3f0",
      "@2x.png": "76b5a3bdf8b93e95122edbedaeee8e765458630b870f901bffd1c4aba486afd3"
    };
    const bundle = createHash("sha256");
    for (const [suffix, expected] of Object.entries(hashes)) {
      const file = `sprite${suffix}`;
      const bytes = fs.readFileSync(new URL(`../../public/map-sprite/ffd461572dc4/${file}`, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
      bundle.update(file).update("\0").update(bytes);
    }
    expect(bundle.digest("hex").slice(0, 12)).toBe("ffd461572dc4");
  });
});

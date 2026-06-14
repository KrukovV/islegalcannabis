import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INITIAL_OCEAN_STYLE,
  NEW_MAP_OCEAN_BACKGROUND_LAYER_ID
} from "./createMap";
import { NEW_MAP_OCEAN_BACKGROUND, NEW_MAP_WATER_COLOR } from "./mapPalette";

const forbiddenWhiteValues = new Set(["#fff", "#ffffff", "white", "transparent", "rgba(255,255,255,0)"]);

describe("new-map ocean background", () => {
  it("keeps one historical ocean color token", () => {
    expect(NEW_MAP_OCEAN_BACKGROUND).toBe("#d7dcdc");
    expect(NEW_MAP_WATER_COLOR).toBe(NEW_MAP_OCEAN_BACKGROUND);
    expect(forbiddenWhiteValues.has(NEW_MAP_OCEAN_BACKGROUND.toLowerCase())).toBe(false);
  });

  it("keeps the initial ocean style as a non-white background layer", () => {
    const firstLayer = INITIAL_OCEAN_STYLE.layers?.[0];

    expect(firstLayer?.id).toBe(NEW_MAP_OCEAN_BACKGROUND_LAYER_ID);
    expect(firstLayer?.type).toBe("background");
    expect(firstLayer?.paint?.["background-color"]).toBe(NEW_MAP_OCEAN_BACKGROUND);
    expect(forbiddenWhiteValues.has(String(firstLayer?.paint?.["background-color"]).toLowerCase())).toBe(false);
  });

  it("keeps same-origin basemap style route inserting the ocean layer before upstream layers", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../app/api/new-map/basemap-style/route.ts", import.meta.url)),
      "utf8"
    );

    expect(source).toContain('layers.unshift({');
    expect(source).toContain('id: OCEAN_BACKGROUND_LAYER_ID');
    expect(source).toContain('"background-color": NEW_MAP_OCEAN_BACKGROUND');
    expect(source).toContain('id.includes("water")');
    expect(source).toContain('id.includes("ocean")');
    expect(source).toContain('id.includes("sea")');
    expect(source).toContain('"fill-color": NEW_MAP_WATER_COLOR');
    expect(source).not.toContain('"background-color": "#fff"');
    expect(source).not.toContain('"fill-color": "#fff"');
  });
});

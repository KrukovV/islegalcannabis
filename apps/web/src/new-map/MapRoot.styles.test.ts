import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("MapRoot ocean background CSS underlay", () => {
  it("keeps map root, surface, MapLibre container and canvas on the ocean color", () => {
    const css = readFileSync(fileURLToPath(new URL("./MapRoot.module.css", import.meta.url)), "utf8");

    expect(css).toContain("--new-map-ocean-background: var(--new-map-water-color, #d7dcdc)");
    expect(css).toContain("background: var(--new-map-ocean-background)");
    expect(css).toContain(".mapSurface :global(.maplibregl-map)");
    expect(css).toContain(".mapSurface :global(.maplibregl-canvas-container)");
    expect(css).toContain(".mapSurface :global(.maplibregl-control-container)");
    expect(css).toContain(".mapSurface :global(.maplibregl-canvas)");
    expect(css).not.toMatch(/(?:root|mapSurface|maplibregl-[^{]+)\s*\{[^}]*background:\s*(?:#fff|#ffffff|white)\b/is);
  });

  it("keeps app-level route background variables ocean-colored", () => {
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

    expect(css).toContain("--new-map-ocean-background: #d7dcdc");
    expect(css).toContain("--new-map-water-color: var(--new-map-ocean-background)");
    expect(css).not.toMatch(/--new-map-ocean-background:\s*(?:#fff|#ffffff|white|transparent)\b/i);
  });
});

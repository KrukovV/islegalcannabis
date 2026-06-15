import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("new-map route config", () => {
  it("keeps the route force-dynamic so local runtime refresh can converge", () => {
    const filePath = path.join(process.cwd(), "src", "app", "new-map", "page.tsx");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain('export const dynamic = "force-dynamic";');
  });

  it("keeps runtime identity request-time instead of module-level frozen constants", () => {
    const filePath = path.join(process.cwd(), "src", "app", "new-map", "runtimeConfig.ts");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain("export function getNewMapRuntimeIdentity()");
    expect(source).not.toContain("export const NEW_MAP_RUNTIME_IDENTITY");
    expect(source).not.toContain("export const NEW_MAP_VISIBLE_STAMP");
  });

  it("keeps early new-map JSON fetches without stale Carto preconnect hints", () => {
    const filePath = path.join(process.cwd(), "src", "app", "layout.tsx");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain('countries: loadJson("${NEW_MAP_COUNTRIES_URL}")');
    expect(source).not.toContain('style: loadJson("${NEW_MAP_STYLE_URL}")');
    expect(source).not.toContain('rel="preconnect" href="https://tiles.basemaps.cartocdn.com"');
    expect(source).not.toContain('rel="dns-prefetch" href="https://tiles.basemaps.cartocdn.com"');
  });

  it("keeps basemap metadata same-origin and host-specific", () => {
    const stylePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-style", "route.ts");
    const sourcePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-source", "route.ts");
    const styleSource = fs.readFileSync(stylePath, "utf8");
    const tilejsonSource = fs.readFileSync(sourcePath, "utf8");

    expect(styleSource).toContain('url: "/api/new-map/basemap-source"');
    expect(styleSource).toContain('style.glyphs = `${origin}${SAME_ORIGIN_GLYPHS_PATH}`');
    expect(styleSource).toContain('style.sprite = `${origin}${SAME_ORIGIN_SPRITE_PATH}`');
    expect(styleSource).toContain('request.headers.get("host")');
    expect(styleSource).toContain('dynamic = "force-dynamic"');
    expect(styleSource).toContain('"Vary": "Host"');
    expect(tilejsonSource).toContain('tilejson.tiles = ["/api/new-map/basemap-tile/{z}/{x}/{y}"];');
    expect(tilejsonSource).not.toContain('dynamic = "force-dynamic"');
  });
});

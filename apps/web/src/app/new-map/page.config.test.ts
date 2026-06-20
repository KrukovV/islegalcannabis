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

  it("keeps public basemap transport on upstream Carto origins instead of same-origin proxy hops", () => {
    const stylePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-style", "route.ts");
    const sourcePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-source", "route.ts");
    const styleSource = fs.readFileSync(stylePath, "utf8");
    const tilejsonSource = fs.readFileSync(sourcePath, "utf8");

    expect(styleSource).toContain('const UPSTREAM_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";');
    expect(styleSource).not.toContain('tiles: ["/api/new-map/basemap-tile/{z}/{x}/{y}"]');
    expect(styleSource).not.toContain('delete (sources.carto as Record<string, unknown>).url;');
    expect(styleSource).not.toContain("SAME_ORIGIN_GLYPHS_PATH");
    expect(styleSource).not.toContain("SAME_ORIGIN_SPRITE_PATH");
    expect(styleSource).not.toContain('request.headers.get("host")');
    expect(styleSource).toContain('dynamic = "force-dynamic"');
    expect(styleSource).not.toContain('"Vary": "Host"');
    expect(tilejsonSource).not.toContain('tilejson.tiles = ["/api/new-map/basemap-tile/{z}/{x}/{y}"];');
    expect(tilejsonSource).toContain('const UPSTREAM_TILEJSON_URL = "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json";');
    expect(tilejsonSource).not.toContain('dynamic = "force-dynamic"');
  });
});

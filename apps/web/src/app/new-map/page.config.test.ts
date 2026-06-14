import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("new-map route config", () => {
  it("keeps the route force-dynamic so local runtime refresh can converge", () => {
    const filePath = path.join(process.cwd(), "src", "app", "new-map", "page.tsx");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain('export const dynamic = "force-dynamic";');
  });

  it("passes the geo query param into the initial map selection", () => {
    const filePath = path.join(process.cwd(), "src", "app", "new-map", "page.tsx");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain("searchParams?: Promise");
    expect(source).toContain("normalizeGeoParam(resolvedSearchParams.geo)");
    expect(source).toContain("initialGeoCode={initialGeoCode}");
  });

  it("keeps runtime identity request-time instead of module-level frozen constants", () => {
    const filePath = path.join(process.cwd(), "src", "app", "new-map", "runtimeConfig.ts");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain("export function getNewMapRuntimeIdentity()");
    expect(source).not.toContain("export const NEW_MAP_RUNTIME_IDENTITY");
    expect(source).not.toContain("export const NEW_MAP_VISIBLE_STAMP");
  });

  it("keeps early new-map JSON fetches and explicit critical perf hints", () => {
    const filePath = path.join(process.cwd(), "src", "app", "layout.tsx");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain('countries: loadJson("${NEW_MAP_COUNTRIES_URL}")');
    expect(source).not.toContain('style: loadJson("${NEW_MAP_STYLE_URL}")');
    expect(source).toContain('rel="preconnect"');
    expect(source).toContain('href="https://basemaps.cartocdn.com"');
    expect(source).toContain('href="https://tiles.basemaps.cartocdn.com"');
    expect(source).toContain('rel="preload"');
    expect(source).toContain('as="fetch"');
    expect(source).not.toContain('rel="dns-prefetch" href="https://tiles.basemaps.cartocdn.com"');
  });

  it("keeps basemap critical resources off the protected production host", () => {
    const createMapPath = path.join(process.cwd(), "src", "new-map", "createMap.ts");
    const stylePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-style", "route.ts");
    const sourcePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-source", "route.ts");
    const createMapSource = fs.readFileSync(createMapPath, "utf8");
    const styleSource = fs.readFileSync(stylePath, "utf8");
    const tilejsonSource = fs.readFileSync(sourcePath, "utf8");

    expect(createMapSource).toContain('BASEMAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"');
    expect(createMapSource).not.toContain('BASEMAP_STYLE_URL = "/api/new-map/basemap-style');
    expect(createMapSource).toContain("/api/new-map/maplibre-worker");
    expect(createMapSource).toContain("setWorkerUrl");
    expect(styleSource).toContain('url: "/api/new-map/basemap-source"');
    expect(styleSource).toContain('style.glyphs = `${origin}${SAME_ORIGIN_GLYPHS_PATH}`');
    expect(styleSource).toContain('style.sprite = `${origin}${SAME_ORIGIN_SPRITE_PATH}`');
    expect(styleSource).toContain('request.headers.get("host")');
    expect(styleSource).toContain('dynamic = "force-dynamic"');
    expect(styleSource).toContain('"Vary": "Host"');
    expect(tilejsonSource).toContain("UPSTREAM_TILEJSON_URL");
    expect(tilejsonSource).not.toContain('tilejson.tiles = ["/api/new-map/basemap-tile/{z}/{x}/{y}"];');
    expect(tilejsonSource).not.toContain('dynamic = "force-dynamic"');
  });
});

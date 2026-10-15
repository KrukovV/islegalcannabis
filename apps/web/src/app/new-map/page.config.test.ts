import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { STATIC_BASEMAP_STYLE } from "@/new-map/staticBasemapStyle";

describe("new-map route config", () => {
  it("keeps the approved93-layer style byte-pinned with maintained compatible tile delivery", () => {
    const stylePath = path.join(process.cwd(), "src", "new-map", "styles", "positron.9e07dd691d25.json");
    const bytes = fs.readFileSync(stylePath);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    expect(path.basename(stylePath)).toBe(`positron.${hash}.json`);
    const style = JSON.parse(bytes.toString("utf8"));
    expect(STATIC_BASEMAP_STYLE).toEqual({
      ...style,
      sprite: "/map-sprite/ffd461572dc4/sprite"
    });
    expect(style.sources.carto.url).toBe("https://tiles.openfreemap.org/planet");
    expect(style.sources.carto.tiles).toBeUndefined();
    expect(style.sources.carto.minzoom).toBe(0);
    expect(style.sources.carto.maxzoom).toBe(14);
    expect(style.sources.carto.bounds).toEqual([-180, -85.0511, 180, 85.0511]);
    expect(style.sources.carto.attribution).toContain("OpenStreetMap");
    expect(style.sources.carto.attribution).toContain("OpenFreeMap");
    expect(style.sources.carto.attribution).toContain("OpenMapTiles");
    expect(style.sources.carto.attribution).toContain("https://carto.com/about-carto/");
    const approved = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "new-map", "styles", "positron.227fe978a37b.json"), "utf8"));
    // Preserve every native layer, glyph, sprite, paint and layout value.
    expect({ ...style, sources: approved.sources }).toEqual(approved);
    expect(style.glyphs).toBe("https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf");
    expect(style.layers.length).toBe(93);
    const publicMap = fs.readFileSync(path.join(process.cwd(), "src", "truth-map", "TruthMapRoot.tsx"), "utf8");
    expect(publicMap).toContain("style: structuredClone(STATIC_BASEMAP_STYLE)");
  });
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

  it("reports the mounted local MapLibre route as active", () => {
    const filePath = path.join(process.cwd(), "src", "app", "new-map", "runtimeConfig.ts");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain('mapRenderer: "maplibre"');
    expect(source).toContain('mapRuntime: "active"');
  });

  it("keeps the public main-map runtime free of audit Store and Social layers", () => {
    const mapRootPath = path.join(process.cwd(), "src", "new-map", "MapRoot.tsx");
    const pagePath = path.join(process.cwd(), "src", "app", "new-map", "page.tsx");
    const entryPath = path.join(process.cwd(), "src", "app", "new-map", "NewMapClientEntry.tsx");
    const mapRoot = fs.readFileSync(mapRootPath, "utf8");
    const page = fs.readFileSync(pagePath, "utf8");
    const entry = fs.readFileSync(entryPath, "utf8");
    expect(mapRoot).not.toContain('"./stores/StoreLayer"');
    expect(mapRoot).not.toContain('"./social/SocialLayer"');
    expect(page).not.toContain("getSocialRuntimeConfig");
    expect(entry).not.toContain("socialConfig");
  });

  it("checks runtime parity against the local map endpoint", () => {
    const mapRootPath = path.join(process.cwd(), "src", "new-map", "MapRoot.tsx");
    const metaRoutePath = path.join(process.cwd(), "src", "app", "api", "new-map", "build-meta", "route.ts");
    const mapRoot = fs.readFileSync(mapRootPath, "utf8");
    const metaRoute = fs.readFileSync(metaRoutePath, "utf8");
    expect(mapRoot).toContain('runtimeMetaPath="/api/new-map/build-meta"');
    expect(metaRoute).toContain("getNewMapRuntimeIdentity()");
  });

  it("accepts only a bounded explicit local map viewport", () => {
    const pagePath = path.join(process.cwd(), "src", "app", "new-map", "page.tsx");
    const mapRootPath = path.join(process.cwd(), "src", "new-map", "MapRoot.tsx");
    const page = fs.readFileSync(pagePath, "utf8");
    const mapRoot = fs.readFileSync(mapRootPath, "utf8");
    expect(page).toContain("function readBoundedNumber");
    expect(page).toContain("readBoundedNumber(resolvedSearchParams?.lat, -90, 90)");
    expect(page).toContain("readBoundedNumber(resolvedSearchParams?.lng, -180, 180)");
    expect(page).toContain("readBoundedNumber(resolvedSearchParams?.zoom, 0, 14)");
    expect(mapRoot).toContain("initialMapView?.zoom");
  });

  it("keeps early new-map JSON fetches without stale Carto preconnect hints", () => {
    const filePath = path.join(process.cwd(), "src", "app", "layout.tsx");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain('countries: loadJson("${NEW_MAP_COUNTRIES_URL}")');
    expect(source).toContain('if (location.pathname !== "/new-map") return;');
    expect(source).not.toContain('style: loadJson("${NEW_MAP_STYLE_URL}")');
    expect(source).not.toContain('rel="preconnect" href="https://tiles.basemaps.cartocdn.com"');
    expect(source).not.toContain('rel="dns-prefetch" href="https://tiles.basemaps.cartocdn.com"');
  });

  it("uses the previously working direct Carto vector, glyph and sprite transport", () => {
    const stylePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-style", "route.ts");
    const sourcePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-source", "route.ts");
    const styleSource = fs.readFileSync(stylePath, "utf8");
    const tilejsonSource = fs.readFileSync(sourcePath, "utf8");

    expect(styleSource).toContain('const UPSTREAM_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"');
    expect(styleSource).not.toContain("UPSTREAM_TILEJSON_URL");
    expect(styleSource).not.toContain("SAME_ORIGIN_GLYPHS_PATH");
    expect(styleSource).not.toContain("SAME_ORIGIN_SPRITE_PATH");
    expect(styleSource).not.toContain("/api/new-map/basemap-tile/{z}/{x}/{y}");
    expect(styleSource).toContain('dynamic = "force-dynamic"');
    // The old proxy endpoint is retained for compatibility, not as a map dependency.
    expect(tilejsonSource).toContain('tilejson.tiles = ["/api/new-map/basemap-tile/{z}/{x}/{y}"];');
    expect(tilejsonSource).not.toContain('dynamic = "force-dynamic"');
  });
});

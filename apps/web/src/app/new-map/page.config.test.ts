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
    expect(source).not.toContain('style: loadJson("${NEW_MAP_STYLE_URL}")');
    expect(source).not.toContain('rel="preconnect" href="https://tiles.basemaps.cartocdn.com"');
    expect(source).not.toContain('rel="dns-prefetch" href="https://tiles.basemaps.cartocdn.com"');
  });

  it("keeps basemap metadata same-origin and host-specific", () => {
    const stylePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-style", "route.ts");
    const sourcePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-source", "route.ts");
    const styleSource = fs.readFileSync(stylePath, "utf8");
    const tilejsonSource = fs.readFileSync(sourcePath, "utf8");

    expect(styleSource).toContain('tiles: ["/api/new-map/basemap-tile/{z}/{x}/{y}"]');
    expect(styleSource).toContain('delete (sources.carto as Record<string, unknown>).url;');
    expect(styleSource).toContain('style.glyphs = `${origin}${SAME_ORIGIN_GLYPHS_PATH}`');
    expect(styleSource).toContain('style.sprite = `${origin}${SAME_ORIGIN_SPRITE_PATH}`');
    expect(styleSource).toContain('request.headers.get("host")');
    expect(styleSource).toContain('dynamic = "force-dynamic"');
    expect(styleSource).toContain('"Vary": "Host"');
    expect(tilejsonSource).toContain('tilejson.tiles = ["/api/new-map/basemap-tile/{z}/{x}/{y}"];');
    expect(tilejsonSource).not.toContain('dynamic = "force-dynamic"');
  });
});

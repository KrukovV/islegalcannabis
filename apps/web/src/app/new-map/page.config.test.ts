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

  it("keeps early new-map preload hints without eager head JSON parsing or stale Carto preconnect hints", () => {
    const filePath = path.join(process.cwd(), "src", "app", "layout.tsx");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).not.toContain('countries: loadJson("${NEW_MAP_COUNTRIES_URL}")');
    expect(source).not.toContain("response.ok ? response.json() : null");
    expect(source).not.toContain('rel="preconnect" href="https://tiles.basemaps.cartocdn.com"');
    expect(source).not.toContain('rel="dns-prefetch" href="https://tiles.basemaps.cartocdn.com"');
  });

  it("keeps new-map route assets on single-consumer fetch paths without same-origin fetch-preload duplicates", () => {
    const pagePath = path.join(process.cwd(), "src", "app", "new-map", "page.tsx");
    const preloadPath = path.join(process.cwd(), "src", "new-map", "preloadRouteAssets.ts");
    const pageSource = fs.readFileSync(pagePath, "utf8");
    const preloadSource = fs.readFileSync(preloadPath, "utf8");

    expect(pageSource).not.toContain("preloadNewMapRouteAssets(");
    expect(preloadSource).not.toContain('crossOrigin: "use-credentials"');
    expect(preloadSource).toContain('crossOrigin: "anonymous"');
  });

  it("keeps the prod new-map runtime origin canonical instead of falling back to localhost", () => {
    const runtimeConfigPath = path.join(process.cwd(), "src", "app", "new-map", "runtimeConfig.ts");
    const runtimeIdentityPath = path.join(process.cwd(), "src", "lib", "runtimeIdentity.ts");
    const runtimeConfigSource = fs.readFileSync(runtimeConfigPath, "utf8");
    const runtimeIdentitySource = fs.readFileSync(runtimeIdentityPath, "utf8");

    expect(runtimeConfigSource).not.toContain('expectedOrigin: process.env.RUNTIME_EXPECTED_ORIGIN || "http://127.0.0.1:3000"');
    expect(runtimeIdentitySource).toContain('? "https://www.islegal.info"');
    expect(runtimeIdentitySource).toContain(': "http://127.0.0.1:3000"');
  });

  it("keeps public basemap transport on upstream Carto origins instead of same-origin proxy hops", () => {
    const stylePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-style", "route.ts");
    const sourcePath = path.join(process.cwd(), "src", "app", "api", "new-map", "basemap-source", "route.ts");
    const runtimeUrlsPath = path.join(process.cwd(), "src", "new-map", "runtimeUrls.ts");
    const styleSource = fs.readFileSync(stylePath, "utf8");
    const tilejsonSource = fs.readFileSync(sourcePath, "utf8");
    const runtimeUrlsSource = fs.readFileSync(runtimeUrlsPath, "utf8");

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
    expect(runtimeUrlsSource).toContain('NEW_MAP_MAPLIBRE_WORKER_URL = "/new-map/maplibre-gl-csp-worker.js?v=5.24.0"');
    expect(runtimeUrlsSource).not.toContain('NEW_MAP_MAPLIBRE_WORKER_URL = "/api/new-map/maplibre-worker');
  });
});

import { expect, test, type TestInfo } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  getViewportBox,
  openCountryPopup,
  readViewportMeta,
  saveMobileScreenshot,
  waitForMapReady,
  writeMobileJson
} from "./mobileTestUtils";

const LINK_STYLE_PROJECTS = new Set(["iphone-se-webkit", "iphone-12-mini-webkit"]);
const IPAD_PRO_ARTIFACT_PROJECTS = new Set(["ipad-pro-chrome"]);

function skipUnlessProject(testInfo: TestInfo, projects: Set<string>) {
  test.skip(!projects.has(testInfo.project.name), "targeted regression coverage only");
}

test("mobile viewport contract exposes safe-area, touch-action, and 44px targets", async ({ page }) => {
  await page.goto("/c/usa", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const viewportMeta = await readViewportMeta(page);
  expect(viewportMeta).toContain("width=device-width");
  expect(viewportMeta).toContain("initial-scale=1");
  expect(viewportMeta).toContain("viewport-fit=cover");

  const viewportContract = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="new-map-root"]') as HTMLElement | null;
    const canvas = document.querySelector(".maplibregl-canvas") as HTMLElement | null;
    if (!root || !canvas) return null;
    const rootStyle = getComputedStyle(root);
    return {
      safeTop: rootStyle.getPropertyValue("--new-map-safe-top").trim(),
      safeBottom: rootStyle.getPropertyValue("--new-map-safe-bottom").trim(),
      touchAction: getComputedStyle(canvas).touchAction,
      rootHeight: Math.round(root.getBoundingClientRect().height),
      innerHeight: window.innerHeight
    };
  });

  expect(viewportContract).not.toBeNull();
  expect(viewportContract?.safeTop).not.toBe("");
  expect(viewportContract?.safeBottom).not.toBe("");
  expect(viewportContract?.touchAction).toBe("none");
  expect(Math.abs((viewportContract?.rootHeight || 0) - (viewportContract?.innerHeight || 0))).toBeLessThanOrEqual(4);

  const touchTargets = [
    '[data-testid="new-map-ai-submit"]',
    '[data-testid="new-map-ai-input"]',
    'button[aria-label="Close country info"]',
    'button[aria-label="Open info for United States"]'
  ];

  for (const selector of touchTargets) {
    const box = await getViewportBox(page, selector);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await assertNoHorizontalOverflow(page);
});

test("mobile popup route keeps horizontal overflow disabled after viewport changes", async ({ page }) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await openCountryPopup(page, "FR");
  await assertNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await assertNoHorizontalOverflow(page);
});

test("mobile country route keeps document scroll usable after hash navigation", async ({ page }) => {
  await page.goto("/c/chn#law-distribution", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const scrollState = await page.evaluate(async () => {
    const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    window.scrollTo(0, 0);
    await settle();
    const before = window.scrollY;
    window.scrollBy(0, 480);
    await settle();
    const afterDown = window.scrollY;
    window.scrollBy(0, -240);
    await settle();
    return {
      before,
      afterDown,
      afterUp: window.scrollY,
      bodyRouteLock: document.body.dataset.newMapRoute || "",
      bodyOverflow: getComputedStyle(document.body).overflow,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight
    };
  });

  expect(scrollState.bodyRouteLock).toBe("");
  expect(scrollState.bodyOverflow).not.toBe("hidden");
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.innerHeight + 200);
  expect(scrollState.afterDown).toBeGreaterThan(scrollState.before + 100);
  expect(scrollState.afterUp).toBeLessThan(scrollState.afterDown);
  await assertNoHorizontalOverflow(page);
});

test("runtime country source excludes Antarctica fill artifact", async ({ page }) => {
  const response = await page.request.get("/api/new-map/countries");
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    features?: Array<{ properties?: { geo?: string } }>;
  };
  expect(payload.features?.some((feature) => feature.properties?.geo === "AQ")).toBe(false);
});

test("country content links use dotted internal and solid external underlines", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, LINK_STYLE_PROJECTS);
  await page.goto("/c/mng#law-status-explanation", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const linkStyles = await page.evaluate(() => {
    const readLinkStyle = (selector: string) => {
      const node = document.querySelector(selector) as HTMLAnchorElement | null;
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        href: node.getAttribute("href") || "",
        text: node.textContent?.trim() || "",
        line: style.textDecorationLine,
        style: style.textDecorationStyle
      };
    };
    return {
      internal: readLinkStyle('article a[href^="/c/"]'),
      external: readLinkStyle('article a[target="_blank"][href^="http"]')
    };
  });

  expect(linkStyles.internal?.line).toContain("underline");
  expect(linkStyles.internal?.style).toBe("dotted");
  expect(linkStyles.external?.line).toContain("underline");
  expect(linkStyles.external?.style).toBe("solid");
  await assertNoHorizontalOverflow(page);
});

test("mobile popup links use dotted internal and solid external underlines", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, LINK_STYLE_PROJECTS);
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await openCountryPopup(page, "FR");

  const linkStyles = await page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]');
    const readLinkStyle = (node: Element | null) => {
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        href: node.getAttribute("href") || "",
        text: node.textContent?.trim() || "",
        line: style.textDecorationLine,
        style: style.textDecorationStyle,
        marginLeft: style.marginLeft
      };
    };
    return {
      internal: readLinkStyle(popup?.querySelector('a[href^="/c/"]') || null),
      external: readLinkStyle(popup?.querySelector('a[target="_blank"][href^="http"]') || null)
    };
  });

  expect(linkStyles.internal?.line).toContain("underline");
  expect(linkStyles.internal?.style).toBe("dotted");
  expect(linkStyles.external?.line).toContain("underline");
  expect(linkStyles.external?.style).toBe("solid");
  await assertNoHorizontalOverflow(page);
});

test("ipad pro map keeps Antarctica visible without legal-fill or water artifacts", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, IPAD_PRO_ARTIFACT_PROJECTS);
  await page.goto("/c/bra", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          jumpTo: (_options: { center: [number, number]; zoom: number; bearing: number; pitch: number }) => void;
        } | null;
      };
    };
    host.__NEW_MAP_DEBUG__?.map?.jumpTo({ center: [-42, 0], zoom: 1.35, bearing: 0, pitch: 0 });
  });
  await page.waitForFunction(
    () => {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: {
            getCanvas: () => HTMLCanvasElement;
            getLayer: (_id: string) => unknown;
            queryRenderedFeatures: (_point: [number, number], _options?: { layers?: string[] }) => unknown[];
          } | null;
        };
      };
      const map = host.__NEW_MAP_DEBUG__?.map;
      if (!map?.getLayer("new-map-antarctica-land")) return false;
      const rect = map.getCanvas().getBoundingClientRect();
      const point: [number, number] = [Math.round(rect.width * 0.5), Math.round(rect.height * 0.86)];
      return map.queryRenderedFeatures(point, { layers: ["new-map-antarctica-land"] }).length > 0;
    },
    undefined,
    { timeout: 10000 }
  );
  await page.waitForTimeout(300);

  const antarcticaState = await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
          getCenter: () => { lng: number; lat: number };
          getLayer: (_id: string) => unknown;
          getZoom: () => number;
          getStyle: () => { layers?: Array<{ id?: string }> };
          getPaintProperty: (_layerId: string, _paintName: string) => unknown;
          querySourceFeatures: (
            _sourceId: string
          ) => Array<{ properties?: Record<string, unknown> }>;
          queryRenderedFeatures: (
            _point: [number, number],
            _options?: { layers?: string[] }
          ) => Array<{ layer?: { id?: string }; properties?: Record<string, unknown> }>;
          unproject: (_point: [number, number]) => { lat: number; lng: number };
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    const samplePoints = [0.74, 0.8, 0.86, 0.9, 0.94].flatMap((yRatio) =>
      [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78].map((xRatio) => ({
        id: `${xRatio}:${yRatio}`,
        xRatio,
        yRatio,
        point: [Math.round(rect.width * xRatio), Math.round(rect.height * yRatio)] as [number, number]
      }))
    );
    const layerOrder = (map.getStyle().layers || []).map((layer) => layer.id || "");
    const sourceFeatures = map.querySourceFeatures("legal-countries");
    const center = map.getCenter();
    const samples = samplePoints.map(({ id, xRatio, yRatio, point }) => {
      const layers = map.queryRenderedFeatures(point).map((feature) => feature.layer?.id || "").filter(Boolean);
      const antarcticaLandFeatures = map.queryRenderedFeatures(point, { layers: ["new-map-antarctica-land"] });
      const legalFillFeatures = map.queryRenderedFeatures(point, { layers: ["legal-fill"] });
      return {
        id,
        xRatio,
        yRatio,
        point,
        lngLat: map.unproject(point),
        layers,
        hasAntarcticaLand: antarcticaLandFeatures.length > 0,
        hasLegalFill: legalFillFeatures.length > 0
      };
    });
    const southSamples = samples.filter((sample) => sample.lngLat.lat < -60);
    const southLandSamples = southSamples.filter((sample) => sample.hasAntarcticaLand);
    const lowerSouthLandSamples = southLandSamples.filter((sample) => sample.yRatio >= 0.86);
    return {
      hasAppMaskLayer: Boolean(map.getLayer("new-map-antarctica-mask")),
      hasAntarcticaLandLayer: Boolean(map.getLayer("new-map-antarctica-land")),
      hasAqLegalFill: sourceFeatures.some((feature) => feature.properties?.geo === "AQ"),
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      center: { lng: center.lng, lat: center.lat },
      zoom: map.getZoom(),
      backgroundColor: map.getPaintProperty("background", "background-color"),
      waterColor: map.getPaintProperty("water", "fill-color"),
      layerOrder: {
        waterShadow: layerOrder.indexOf("water_shadow"),
        water: layerOrder.indexOf("water"),
        legalFill: layerOrder.indexOf("legal-fill"),
        antarcticaLand: layerOrder.indexOf("new-map-antarctica-land")
      },
      southSamples,
      southLandSampleCount: southLandSamples.length,
      lowerSouthLandSampleCount: lowerSouthLandSamples.length
    };
  });

  await writeMobileJson(testInfo, "ipad-pro-antarctica-state", antarcticaState);
  await saveMobileScreenshot(page, testInfo, "ipad-pro-c-bra-antarctica-overview");
  expect(antarcticaState?.hasAppMaskLayer).toBe(false);
  expect(antarcticaState?.hasAntarcticaLandLayer).toBe(true);
  expect(antarcticaState?.hasAqLegalFill).toBe(false);
  expect(antarcticaState?.viewport).toEqual({ width: 1024, height: 1366, dpr: 2 });
  expect(antarcticaState?.backgroundColor).not.toBe(antarcticaState?.waterColor);
  expect(antarcticaState?.layerOrder.antarcticaLand).toBeGreaterThan(antarcticaState?.layerOrder.water || -1);
  expect(antarcticaState?.layerOrder.antarcticaLand).toBeGreaterThan(antarcticaState?.layerOrder.waterShadow || -1);
  expect(antarcticaState?.layerOrder.legalFill).toBeLessThan(antarcticaState?.layerOrder.antarcticaLand || 0);
  expect(antarcticaState?.southSamples.length).toBeGreaterThanOrEqual(3);
  expect(antarcticaState?.southSamples.every((sample) => sample.hasLegalFill === false)).toBe(true);
  expect(antarcticaState?.southLandSampleCount).toBeGreaterThanOrEqual(12);
  expect(antarcticaState?.lowerSouthLandSampleCount).toBeGreaterThanOrEqual(8);
  await assertNoHorizontalOverflow(page);
});

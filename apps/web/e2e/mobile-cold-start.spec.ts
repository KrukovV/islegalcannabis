import { expect, test } from "playwright/test";
import fs from "node:fs";
import path from "node:path";

const QA_DIR = path.resolve(process.cwd(), "..", "..", "QA", "mobile", "cold-start");

type NewMapTrace = {
  marks?: Record<string, number>;
  metrics?: Record<string, number>;
};

async function waitForFullMap(page: import("playwright/test").Page) {
  await page.waitForSelector('[data-testid="new-map-ai-dock"]', { state: "visible" });
  await page.waitForFunction(() => {
    const trace = (window as unknown as { __NEW_MAP_TRACE__?: NewMapTrace }).__NEW_MAP_TRACE__;
    const map = (window as unknown as { __NEW_MAP_DEBUG__?: { map?: {
      queryRenderedFeatures: (_geometry?: unknown, _options?: { layers?: string[] }) => unknown[];
    } } }).__NEW_MAP_DEBUG__?.map;
    if (typeof trace?.marks?.NM_T7_FIRST_FILL_RENDERED !== "number" || !map) return false;
    return map.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length > 100;
  }, { timeout: 20000 });
}

async function collectStartupState(page: import("playwright/test").Page) {
  return page.evaluate(() => {
    const trace = (window as unknown as { __NEW_MAP_TRACE__?: NewMapTrace }).__NEW_MAP_TRACE__ || {};
    const countriesEntry = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/static/countries/countries."))
      .at(-1) as PerformanceResourceTiming | undefined;
    const map = (window as unknown as { __NEW_MAP_DEBUG__?: { map?: {
      getZoom: () => number;
      queryRenderedFeatures: (_geometry?: unknown, _options?: { layers?: string[] }) => unknown[];
    } } }).__NEW_MAP_DEBUG__?.map;
    return {
      trace,
      countriesUrl: countriesEntry?.name || null,
      countriesTransferSize: Math.round(countriesEntry?.transferSize || 0),
      countriesDecodedBodySize: Math.round(countriesEntry?.decodedBodySize || 0),
      firstFillMs: Math.round(trace.marks?.NM_T7_FIRST_FILL_RENDERED || -1),
      featureCount: map?.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length || 0,
      zoom: map?.getZoom() || null,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    };
  });
}

async function openPopup(page: import("playwright/test").Page) {
  const point = await page.evaluate(() => {
    const map = (window as unknown as { __NEW_MAP_DEBUG__?: { map?: {
      jumpTo: (_camera: { center: [number, number]; zoom: number; bearing: number; pitch: number }) => void;
      project: (_lngLat: [number, number]) => { x: number; y: number };
      queryRenderedFeatures: (_point: { x: number; y: number }, _options?: { layers?: string[] }) => Array<{ properties?: { geo?: string } }>;
    } } }).__NEW_MAP_DEBUG__?.map;
    if (!map) return null;
    map.jumpTo({ center: [10, 50], zoom: 3.2, bearing: 0, pitch: 0 });
    const projected = map.project([10, 50]);
    const hit = map.queryRenderedFeatures(projected, { layers: ["legal-fill"] })[0];
    if (!hit?.properties?.geo) return null;
    const canvas = document.querySelector(".maplibregl-canvas") as HTMLElement | null;
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return null;
    return { x: rect.left + projected.x, y: rect.top + projected.y };
  });
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect(page.getByTestId("new-map-country-popup")).toBeVisible();
}

test("mobile cold start uses cached static countries payload and keeps map interactive", async ({ page }) => {
  fs.mkdirSync(QA_DIR, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForFullMap(page);
  const cold = await collectStartupState(page);
  await page.screenshot({ path: path.join(QA_DIR, "webkit-cold-full-map.png"), fullPage: false });

  await openPopup(page);
  await page.screenshot({ path: path.join(QA_DIR, "webkit-popup-after-cold-start.png"), fullPage: false });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForFullMap(page);
  const warm = await collectStartupState(page);
  await page.screenshot({ path: path.join(QA_DIR, "webkit-warm-full-map.png"), fullPage: false });

  fs.writeFileSync(path.join(QA_DIR, "summary.json"), JSON.stringify({ cold, warm }, null, 2));

  expect(cold.countriesUrl).toContain("/static/countries/countries.");
  expect(cold.countriesDecodedBodySize).toBeLessThan(9_000_000);
  expect(cold.featureCount).toBeGreaterThan(100);
  expect(cold.horizontalOverflowPx).toBe(0);
  expect(warm.featureCount).toBeGreaterThan(100);
  expect(warm.firstFillMs).toBeLessThan(3_500);
});

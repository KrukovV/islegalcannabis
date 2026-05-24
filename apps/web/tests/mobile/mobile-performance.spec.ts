import { expect, test } from "@playwright/test";
import { collectMapVisualState, saveMobileScreenshot, waitForMapReady, writeMobileJson } from "./mobileTestUtils";

test("mobile production-local load reaches map interactive without layout spikes", async ({ page }, testInfo) => {
  const start = Date.now();
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  const interactiveMs = Date.now() - start;
  await saveMobileScreenshot(page, testInfo, "map-interactive");

  const metrics = await page.evaluate(() => {
    const paints = performance.getEntriesByType("paint").map((entry) => ({
      name: entry.name,
      startTime: entry.startTime
    }));
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const trace = (window as typeof window & {
      __NEW_MAP_TRACE__?: {
        marks?: Record<string, number>;
      };
    }).__NEW_MAP_TRACE__ || null;
    return {
      paints,
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      loadEventEnd: nav?.loadEventEnd ?? null,
      trace
    };
  });
  const visualState = await collectMapVisualState(page);

  expect(interactiveMs).toBeLessThan(20000);
  expect(visualState.forbidden.antarcticaLayer).toBe(false);
  expect(visualState.css.horizontalOverflowPx).toBeLessThanOrEqual(1);
  writeMobileJson(testInfo, "timings", { interactiveMs, metrics, visualState });
});

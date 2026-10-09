import { expect, test } from "@playwright/test";

test("truth-map keeps the established Antarctica animation alongside the editable audit controls", async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto("/truth-map?qa=1&lat=-77&lng=0&zoom=4", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("truth-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 55_000 });
  const animation = page.getByTestId("antarctic-ascii-overlay");
  await expect(animation).toHaveAttribute("data-ascii-state", "running", { timeout: 12_000 });
  await expect(animation).toHaveAttribute("data-renderer", "svg");
  await expect(animation).toHaveAttribute("data-svg-story-count", "34");
  await expect(animation).toHaveAttribute("data-ascii-scenario", "walking-smoker");
  await expect(animation).toHaveAttribute("data-svg-anchor-visible", "1");
  await expect(animation.locator('[data-svg-role="smoker"]')).toHaveCount(3);
  await page.waitForFunction(() => window.__TRUTH_MAP_DEBUG__?.map?.areTilesLoaded(), { timeout: 45_000 });
  const polarBounds = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const scene = document.querySelector<SVGGElement>('[data-testid="antarctic-ascii-overlay"] > g');
    if (!map || !scene) return null;
    const bounds = scene.getBoundingClientRect();
    const fractions = [0.05, 0.5, 0.95];
    const landGeos = fractions.flatMap((xFraction) => fractions.map((yFraction) => {
      const x = bounds.left + bounds.width * xFraction;
      const y = bounds.top + bounds.height * yFraction;
      const hits = map.queryRenderedFeatures([x, y], { layers: ["legal-fill"] });
      return hits[0]?.properties?.geo ?? null;
    }));
    return { sceneTop: bounds.top, northY: map.project([0, -71.5]).y, landGeos };
  });
  expect(polarBounds).not.toBeNull();
  expect(polarBounds!.sceneTop).toBeGreaterThanOrEqual(polarBounds!.northY - 2);
  expect(polarBounds!.landGeos).toEqual(Array(9).fill("AQ"));
  if (process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR}/antarctica-local-running.png` });
  }
  await expect(animation).toHaveAttribute("data-ascii-scenario", "antarctic-face-chorus", { timeout: 10_000 });
  await expect(animation.locator("[data-svg-animal]")).toHaveCount(6);
  await expect(page.getByTestId("new-map-ai-dock")).toBeVisible();
});

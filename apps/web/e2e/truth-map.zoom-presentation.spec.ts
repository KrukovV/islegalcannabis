import { expect, test } from "@playwright/test";

test("US country fallback remains painted before, during and after lazy state loading", async ({ page }) => {
  test.setTimeout(240_000);
  let releaseStates: () => void = () => {};
  const statesHeld = new Promise<void>((resolve) => { releaseStates = resolve; });
  let holdStates = false;
  let heldRequests = 0;
  await page.route("**/api/truth-map/us-states", async (route) => {
    // Arm only after boot: React may request this index more than once before
    // the MapLibre lazy source, so request ordinal is not a stable identity.
    if (holdStates) {
      heldRequests += 1;
      await statesHeld;
    }
    await route.continue();
  });

  try {
    await page.goto("/truth-map?qa=1&lat=38&lng=-96&zoom=4.2", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("truth-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 180_000 });
    holdStates = true;
    await page.evaluate(async () => { await window.__TRUTH_MAP_QA__?.jumpTo(-96, 38, 4.7); });
    await expect.poll(() => heldRequests, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map.getPaintProperty("legal-fill", "fill-opacity"))).toBe(1);
    await page.waitForFunction(() => {
      const map = window.__TRUTH_MAP_DEBUG__?.map;
      return Boolean(map && map.queryRenderedFeatures({ layers: ["legal-fill"] }).some((feature) => feature.properties?.geo === "US"));
    }, undefined, { timeout: 45_000 });
    if (process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR}/us-fill-before-state-source.png` });
    }
  } finally {
    releaseStates();
  }

  await expect.poll(async () => page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return Boolean(map && map.getPaintProperty("legal-fill", "fill-opacity") === 1 &&
      map.isSourceLoaded("us-states") && map.queryRenderedFeatures({ layers: ["us-states-fill"] }).length > 0);
  }), { timeout: 90_000 }).toBe(true);
  if (process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR}/us-fill-after-state-source.png` });
  }
});

test("native state labels remain placement-independent across Arkansas zooms", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/truth-map?qa=1&lat=34.8&lng=-92.3&zoom=7", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("truth-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 180_000 });
  const labels = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map) return [];
    return map.getStyle().layers.filter((layer) => /place_state/i.test(layer.id)).map((layer) => ({
      id: layer.id,
      allow: map.getLayoutProperty(layer.id, "text-allow-overlap"),
      ignore: map.getLayoutProperty(layer.id, "text-ignore-placement"),
    }));
  });
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every((label) => label.allow === true && label.ignore === true)).toBe(true);
  await expect(page.getByTestId("antarctic-ascii-overlay")).toHaveAttribute("data-svg-anchor-visible", "0");
  await page.waitForFunction(() => window.__TRUTH_MAP_DEBUG__?.map?.areTilesLoaded(), { timeout: 45_000 });
  if (process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR}/arkansas-zoom-7.png` });
  }
  await page.evaluate(async () => { await window.__TRUTH_MAP_QA__?.jumpTo(-92.3, 34.8, 8); });
  await expect(page.getByTestId("antarctic-ascii-overlay")).toHaveAttribute("data-svg-anchor-visible", "0");
  await page.waitForFunction(() => window.__TRUTH_MAP_DEBUG__?.map?.areTilesLoaded(), { timeout: 45_000 });
  if (process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.ISLEGAL_ZOOM_SCREENSHOT_DIR}/arkansas-zoom-8.png` });
  }
});

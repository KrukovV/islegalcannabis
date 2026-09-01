import { expect, test, type Page } from "@playwright/test";

const QA_ROUTE = "/truth-map?qa=1";

async function waitForTruthMapReady(page: Page) {
  await page.waitForSelector('[data-testid="truth-map-root"]', { timeout: 10_000, state: "attached" });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="truth-map-canvas"]')?.getAttribute("data-map-ready") === "1",
    { timeout: 30_000 }
  );
  await page.waitForFunction(() => Boolean(window.__TRUTH_MAP_QA__?.openGeo), { timeout: 20_000 });
}

test("an open SEO panel retains its country marker and does not block selecting another Truth Map popup", async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForTruthMapReady(page);

  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.openGeo("MN");
  });
  const mongoliaPopup = page.locator('[data-popup-variant="truth-map"]');
  await expect(mongoliaPopup).toBeVisible({ timeout: 20_000 });
  await expect(mongoliaPopup.getByTestId("truth-map-legal-evidence")).toContainText("Current legal conclusion: GREEN");
  await mongoliaPopup.getByTestId("country-popup-seo-link").click();

  const panel = page.getByTestId("new-map-seo-overlay");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.locator("[data-category]")).toHaveAttribute("data-category", "LEGAL_OR_DECRIM");
  const marker = page.locator('[data-seo-marker="1"][data-seo-marker-geo="MN"]');
  await expect(marker).toBeVisible({ timeout: 10_000 });

  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.jumpTo(2.35, 46.5, 5);
  });
  const francePoint = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.querySourceFeatures("legal-countries")
      .find((candidate) => candidate.properties?.geo === "FR");
    if (!map || !feature) return null;
    return map.project([
      Number(feature.properties?.labelAnchorLng),
      Number(feature.properties?.labelAnchorLat)
    ]);
  });
  if (!francePoint) throw new Error("truth_map_france_point_missing_with_seo_panel_open");
  await page.mouse.click(francePoint.x, francePoint.y);

  const francePopup = page.locator('[data-popup-variant="truth-map"]');
  await expect(francePopup).toBeVisible({ timeout: 15_000 });
  await expect(francePopup).toContainText("ISO2: FR");
  await expect(panel).toBeVisible();
  await expect(marker).toBeVisible();
});

test("the richer SEO panel stays inside a desktop viewport and wraps retained legal annotations", async ({ page }) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 1710, height: 1107 });
  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForTruthMapReady(page);

  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.openGeo("KZ");
  });
  const kazakhstanPopup = page.locator('[data-popup-variant="truth-map"]');
  await expect(kazakhstanPopup).toContainText("ISO2: KZ", { timeout: 20_000 });
  await kazakhstanPopup.getByTestId("country-popup-seo-link").click();

  const panel = page.getByTestId("new-map-seo-overlay");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel).toContainText("RED in Kazakhstan");
  await expect(panel).toContainText("OFFICIAL_LEGAL_INFORMATION_SYSTEM_REPUBLIC_OF_KAZAKHSTAN");

  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.openGeo("US-TX");
  });
  await expect(page.locator('[data-popup-variant="truth-map"]')).toContainText("ISO2: US-TX", { timeout: 15_000 });
  await expect(panel).toBeVisible();

  await expect.poll(() => page.evaluate(() => {
    const panel = document.querySelector('[data-testid="new-map-seo-overlay"]') as HTMLElement | null;
    if (!panel) return false;
    const panelRect = panel.getBoundingClientRect();
    const descendantsFit = Array.from(panel.querySelectorAll<HTMLElement>("*")).every((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1;
    });
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      && panel.scrollWidth <= panel.clientWidth + 1
      && panelRect.left >= 0
      && panelRect.right <= window.innerWidth
      && descendantsFit;
  }), { timeout: 10_000 }).toBe(true);
});

test("a canonical popup Action preserves camera and exposes the selected GEO marker on its richer under-map evidence", async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForTruthMapReady(page);

  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.openGeo("MN");
  });
  const mongoliaPopup = page.locator('[data-popup-variant="truth-map"]');
  await expect(mongoliaPopup).toBeVisible({ timeout: 20_000 });
  await expect(mongoliaPopup).toContainText("Current legal conclusion: GREEN");
  const expectedCamera = { lng: 107.4, lat: 46.7, zoom: 5.6 };
  await page.evaluate(async (camera) => {
    await window.__TRUTH_MAP_QA__?.jumpTo(camera.lng, camera.lat, camera.zoom);
  }, expectedCamera);
  const action = mongoliaPopup.getByRole("link", { name: /Action: recreational possession or use/i });
  await expect(action).toHaveAttribute("href", "/c/mng#law-recreational");
  await Promise.all([
    page.waitForURL(/\/c\/mng#law-recreational$/, { timeout: 20_000 }),
    action.click()
  ]);
  const publicRoot = page.getByTestId("public-map-root");
  await expect(publicRoot).toHaveAttribute("data-truth-map-source", "FINAL_307_RECONCILIATION");
  await expect(publicRoot).toHaveAttribute("data-overlay-scope", "map-only");
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  await expect(page.locator('[data-popup-variant="truth-map"]')).toHaveCount(0);
  await expect(page.getByTestId("new-map-seo-overlay")).toHaveCount(0);
  await expect(page.locator('[data-seo-marker="1"][data-seo-marker-geo="MN"]')).toBeVisible();
  const publicMapCanvas = page.locator("canvas.maplibregl-canvas");
  await expect.poll(() => publicMapCanvas.getAttribute("data-truth-map-initial-camera"), { timeout: 10_000 })
    .not.toBeNull();
  const restoredCamera = await publicMapCanvas.evaluate((canvas) =>
    JSON.parse((canvas as HTMLElement).dataset.truthMapInitialCamera || "{}") as { lng: number; lat: number; zoom: number }
  );
  expect(restoredCamera.lng).toBeCloseTo(expectedCamera.lng, 3);
  expect(restoredCamera.lat).toBeCloseTo(expectedCamera.lat, 3);
  expect(restoredCamera.zoom).toBeCloseTo(expectedCamera.zoom, 3);
  await expect(page.getByTestId("country-page-current-legal-evidence")).toContainText("Current legal conclusion: GREEN");
  await expect(page.locator("#law-recreational")).toContainText("Supplementary action-specific context — not the current legal conclusion");
  await expect(page.locator("body")).not.toContainText("Cannabis is illegal in Mongolia");
  await expect.poll(() => page.evaluate(() => ({
    locked: document.body.dataset.newMapRoute || null,
    scrollable: document.documentElement.scrollHeight > window.innerHeight
  }))).toEqual({ locked: null, scrollable: true });
});

test("the in-place SEO panel uses the same canonical Action hand-off as the rich popup", async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForTruthMapReady(page);

  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.openGeo("MN");
    await window.__TRUTH_MAP_QA__?.jumpTo(107.1, 46.3, 5.3);
  });
  const popup = page.locator('[data-popup-variant="truth-map"]');
  await expect(popup).toBeVisible({ timeout: 20_000 });
  await popup.getByTestId("country-popup-seo-link").click();
  const panel = page.getByTestId("new-map-seo-overlay");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  const action = panel.getByRole("link", { name: /Action: recreational possession or use/i });
  await expect(action).toHaveAttribute("href", "/c/mng#law-recreational");
  await Promise.all([
    page.waitForURL(/\/c\/mng#law-recreational$/, { timeout: 20_000 }),
    action.click()
  ]);

  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  await expect(page.locator('[data-seo-marker="1"][data-seo-marker-geo="MN"]')).toBeVisible();
  const restoredCamera = await page.locator("canvas.maplibregl-canvas").evaluate((canvas) =>
    JSON.parse((canvas as HTMLElement).dataset.truthMapInitialCamera || "{}") as { lng: number; lat: number; zoom: number }
  );
  expect(restoredCamera.lng).toBeCloseTo(107.1, 3);
  expect(restoredCamera.lat).toBeCloseTo(46.3, 3);
  expect(restoredCamera.zoom).toBeCloseTo(5.3, 3);
  await expect(page.locator('[data-popup-variant="truth-map"]')).toHaveCount(0);
  await expect(page.getByTestId("new-map-seo-overlay")).toHaveCount(0);
});

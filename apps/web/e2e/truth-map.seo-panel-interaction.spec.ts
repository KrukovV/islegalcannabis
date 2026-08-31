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

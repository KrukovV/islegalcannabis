import { expect, test } from "@playwright/test";

test("truth-map retains locality-only official records without projecting a cannabis leaf", async ({ page }) => {
  test.setTimeout(60_000);
  const response = await page.request.get("/api/truth-map/stores?west=14.05&south=35.75&east=14.65&north=36.10&zoom=13");
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { features?: Array<{ properties?: { geo_id?: string } }> };
  expect(payload.features?.some((feature) => feature.properties?.geo_id === "MT")).toBe(false);

  await page.goto("/truth-map?qa=1&lat=35.90&lng=14.45&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__TRUTH_MAP_DEBUG__?.map?.getLayer("validated-cannabis-store-markers")), { timeout: 30_000 });
  const maltaLeaves = await page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map
    ?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
    .filter((feature) => feature.properties?.geo_id === "MT").length ?? -1);
  expect(maltaLeaves).toBe(0);
});

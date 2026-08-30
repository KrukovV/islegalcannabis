import { expect, test } from "@playwright/test";

test("truth-map renders the refreshed current New York OCM adult-use retailer leaf", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=40.738069011824&lng=-74.006257711095&zoom=15", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "US-NY:LICENSE:ocm-retl-26-000510");
  }, { timeout: 30_000 });

  const store = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "US-NY:LICENSE:ocm-retl-26-000510");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(store).not.toBeNull();
  expect(store?.properties?.store_type).toBe("ADULT_USE_RETAIL");
  expect(store?.properties?.license_status).toBe("ACTIVE");
  expect(store?.properties?.operational_status).toBe("ACTIVE");
  await page.locator("canvas.maplibregl-canvas").click({ position: store! });
  await expect(page.getByTestId("store-popup")).toContainText("Upstate State Collective LLC");
  await expect(page.getByTestId("store-popup")).toContainText("License: OCM-RETL-26-000510 · ACTIVE");
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: confirmed active");
});

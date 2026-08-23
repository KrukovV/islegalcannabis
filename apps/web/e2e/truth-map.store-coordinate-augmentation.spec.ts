import { expect, test } from "@playwright/test";

test("truth-map renders the exact Census-augmented current DCC retailer only as a leaf", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=39.8781073&lng=-123.7292419&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "US-CA:LICENSE:c10-0001592-lic");
  }, { timeout: 30_000 });

  const exactStore = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "US-CA:LICENSE:c10-0001592-lic");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(exactStore).not.toBeNull();
  expect(exactStore?.properties?.license_status).toBe("ACTIVE");
  expect(exactStore?.properties?.operational_status).toBe("UNKNOWN_STATUS");
  await page.locator("canvas.maplibregl-canvas").click({ position: exactStore! });
  await expect(page.getByTestId("store-popup")).toContainText("Emerald Sasquatch");
  await expect(page.getByTestId("store-popup")).toContainText("C10-0001592-LIC");
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");
});

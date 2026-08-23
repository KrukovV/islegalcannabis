import { expect, test } from "@playwright/test";

test("truth-map renders the current New Hampshire DHHS operating ATC only after its exact Census gate", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=43.985083787135&lng=-71.112278832889&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "US-NH:SOURCE:9167f3202025a5b16bfc5d72");
  }, { timeout: 30_000 });

  const store = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "US-NH:SOURCE:9167f3202025a5b16bfc5d72");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(store).not.toBeNull();
  expect(store?.properties?.license_status).toBe("UNKNOWN_STATUS");
  expect(store?.properties?.operational_status).toBe("ACTIVE");
  await page.locator("canvas.maplibregl-canvas").click({ position: store! });
  await expect(page.getByTestId("store-popup")).toContainText("Sanctuary ATC");
  await expect(page.getByTestId("store-popup")).toContainText("234 White Mountain Highway");
  await expect(page.getByTestId("store-popup")).toContainText("License: not published · UNKNOWN_STATUS");
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: confirmed active");
});

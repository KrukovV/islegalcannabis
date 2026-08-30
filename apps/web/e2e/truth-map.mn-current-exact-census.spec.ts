import { expect, test } from "@playwright/test";

test("truth-map renders a current Minnesota OCM exact Census adult-use retailer leaf", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=44.9346748&lng=-93.6119882&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "US-MN:LICENSE_LOCATION:dis-l24-000039:b5e93f01105a219af4bd4aa8");
  }, { timeout: 30_000 });

  const store = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "US-MN:LICENSE_LOCATION:dis-l24-000039:b5e93f01105a219af4bd4aa8");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(store).not.toBeNull();
  expect(store?.properties?.license_status).toBe("ACTIVE");
  expect(store?.properties?.operational_status).toBe("ACTIVE");
  await page.locator("canvas.maplibregl-canvas").click({ position: store! });
  await expect(page.getByTestId("store-popup")).toContainText("The Joint Dispensary");
  await expect(page.getByTestId("store-popup")).toContainText("License: DIS-L24-000039 · ACTIVE");
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: confirmed active");
});

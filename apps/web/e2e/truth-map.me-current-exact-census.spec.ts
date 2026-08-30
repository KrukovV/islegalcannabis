import { expect, test } from "@playwright/test";

test("truth-map renders a current Maine exact Census retailer leaf", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=44.3256650&lng=-69.8562558&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "US-ME:LICENSE:ams102");
  }, { timeout: 30_000 });

  const store = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "US-ME:LICENSE:ams102");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(store).not.toBeNull();
  expect(store?.properties?.license_status).toBe("ACTIVE");
  expect(store?.properties?.operational_status).toBe("ACTIVE");
  await page.locator("canvas.maplibregl-canvas").click({ position: store! });
  await expect(page.getByTestId("store-popup")).toContainText("ORIGINS CANNABIS COMPANY LLC");
  await expect(page.getByTestId("store-popup")).toContainText("License: AMS102 · ACTIVE");
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: confirmed active");
});

test("truth-map renders a newly exact-geocoded Maine retailer under the declared no-ZIP policy", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=43.6606162&lng=-70.2671709&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "US-ME:LICENSE:ams110");
  }, { timeout: 30_000 });

  const store = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "US-ME:LICENSE:ams110");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(store).not.toBeNull();
  expect(store?.properties?.license_status).toBe("ACTIVE");
  expect(store?.properties?.operational_status).toBe("ACTIVE");
  await page.locator("canvas.maplibregl-canvas").click({ position: store! });
  await expect(page.getByTestId("store-popup")).toContainText("SEA LEVEL WEED CO.");
  await expect(page.getByTestId("store-popup")).toContainText("License: AMS110 · ACTIVE");
});

import { expect, test } from "@playwright/test";

test("truth-map renders the SHA-bound exact Census coordinate for a current Mississippi MMCP dispensary", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=32.590487284763&lng=-90.041509269334&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "US-MS:LICENSE:dspy001345");
  }, { timeout: 30_000 });

  const store = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "US-MS:LICENSE:dspy001345");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(store).not.toBeNull();
  expect(store?.properties?.license_status).toBe("UNKNOWN_STATUS");
  expect(store?.properties?.operational_status).toBe("UNKNOWN_STATUS");
  await page.locator("canvas.maplibregl-canvas").click({ position: store! });
  await expect(page.getByTestId("store-popup")).toContainText("Green Magnolia of Canton, LLC");
  await expect(page.getByTestId("store-popup")).toContainText("License: DSPY001345 · UNKNOWN_STATUS");
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");
});

test("truth-map renders a point accepted only after the corrected non-overlapping Mississippi Census batch", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=32.399420760059&lng=-90.122243396765&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "US-MS:LICENSE:dspy009925");
  }, { timeout: 30_000 });

  const store = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "US-MS:LICENSE:dspy009925");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(store).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: store! });
  await expect(page.getByTestId("store-popup")).toContainText("Uptown Funk LLC");
  await expect(page.getByTestId("store-popup")).toContainText("License: DSPY009925 · UNKNOWN_STATUS");
});

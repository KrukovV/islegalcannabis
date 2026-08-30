import { expect, test } from "@playwright/test";

test("truth-map renders the current AMCC-confirmed Alabama dispensary only after the exact Census gate", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=32.381700148242&lng=-86.219684008098&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "US-AL:SOURCE:e1eb23cb822b6bd622151893");
  }, { timeout: 30_000 });

  const store = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "US-AL:SOURCE:e1eb23cb822b6bd622151893");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(store).not.toBeNull();
  expect(store?.properties?.license_status).toBe("UNKNOWN_STATUS");
  expect(store?.properties?.operational_status).toBe("ACTIVE");
  await page.locator("canvas.maplibregl-canvas").click({ position: store! });
  await expect(page.getByTestId("store-popup")).toContainText("Callie's Apothecary");
  await expect(page.getByTestId("store-popup")).toContainText("MEDICAL DISPENSARY");
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: confirmed active");
});

import { expect, test } from "@playwright/test";

test("truth-map alone renders a current BC LCRB exact civic retailer leaf while retaining AI and Social", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=49.2466435&lng=-123.1008301&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.store_id === "CA:LICENSE:450022");
  }, { timeout: 30_000 });

  const exactStore = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "CA:LICENSE:450022");
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y, properties: feature.properties };
  });
  expect(exactStore).not.toBeNull();
  expect(exactStore?.properties).toMatchObject({
    legal_name: "LIGHTBOX ENTERPRISES LTD.",
    trade_name: "Dutch Love Cannabis",
    license_number: "450022",
    license_status: "ACTIVE",
    operational_status: "ACTIVE",
    store_type: "ADULT_USE_RETAIL",
  });
  await page.locator("canvas.maplibregl-canvas").click({ position: exactStore! });
  await expect(page.getByTestId("store-popup")).toContainText("Dutch Love Cannabis");
  await expect(page.getByTestId("store-popup")).toContainText("450022");
  await expect(page.getByRole("textbox", { name: "Ask about cannabis law in US" })).toBeEditable();
  await expect(page.getByTestId("truth-map-social-chat")).toBeVisible();
});

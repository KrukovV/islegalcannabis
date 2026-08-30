import { expect, test } from "@playwright/test";

test("truth-map renders a current Vermont CCB licensed-retailer leaf locally", async ({ page }) => {
  await page.goto("/truth-map?qa=1&lat=43.607738&lng=-72.981224&zoom=13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.geo_id === "US-VT"
        && feature.properties?.legal_name === "Mountain Girl Cannabis, Inc.");
  }, { timeout: 20_000 });

  const state = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.geo_id === "US-VT"
        && candidate.properties?.legal_name === "Mountain Girl Cannabis, Inc.");
    return {
      icon: map?.getLayoutProperty("validated-cannabis-store-markers", "icon-image"),
      feature: feature?.properties,
    };
  });

  expect(state.icon).toBe("validated-cannabis-store-leaf");
  expect(state.feature).toMatchObject({
    geo_id: "US-VT",
    legal_name: "Mountain Girl Cannabis, Inc.",
    license_status: "UNKNOWN_STATUS",
    operational_status: "UNKNOWN_STATUS",
  });
  await expect(page.getByTestId("new-map-ai-input")).toBeEditable();
  await expect(page.getByTestId("truth-map-social-chat")).toBeVisible();
});

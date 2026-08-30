import { expect, test } from "@playwright/test";

test("truth-map renders a current AGLC retailer only through the exact City of Calgary Parcel point", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/truth-map?qa=1&lat=51.11573032132341&lng=-114.20520943688113&zoom=15", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 30_000 });
  const storeHandle = await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => candidate.properties?.store_id === "CA:SOURCE:8eb9562d211703b5d4de4d57");
    if (!feature || feature.geometry.type !== "Point") return null;
    return {
      coordinates: feature.geometry.coordinates,
      licenseStatus: feature.properties?.license_status,
      operationalStatus: feature.properties?.operational_status,
      markerIcon: map?.getLayoutProperty("validated-cannabis-store-markers", "icon-image"),
    };
  }, { timeout: 30_000 });
  const store = await storeHandle.jsonValue() as {
    coordinates: [number, number];
    licenseStatus: string;
    operationalStatus: string;
    markerIcon: string;
  };
  expect(store.markerIcon).toBe("validated-cannabis-store-leaf");
  // MapLibre returns tile-projected geometry, so assert the persisted exact
  // municipal point to five decimal places rather than treating tile rounding
  // as a second source of truth.
  expect(store.coordinates[0]).toBeCloseTo(-114.20520943688113, 5);
  expect(store.coordinates[1]).toBeCloseTo(51.11573032132341, 5);
  expect(store.licenseStatus).toBe("UNKNOWN_STATUS");
  expect(store.operationalStatus).toBe("UNKNOWN_STATUS");
  await expect(page.getByTestId("new-map-ai-input")).toBeVisible();
  await expect(page.getByTestId("truth-map-social-chat")).toBeVisible();
});

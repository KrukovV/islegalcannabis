import { expect, test } from "@playwright/test";

const TRUTH_MAP_QA_ROUTE = "/truth-map?qa=1&lat=40.7033862&lng=-73.9893613&zoom=15";

test("truth-map reaches full local zoom without changing the existing map route", async ({ page }) => {
  // This is one serial visual route contract spanning the audited local
  // jurisdictions. MapLibre readiness plus viewport reconciliation is
  // intentionally awaited at each stop, so the suite-level bound must exceed
  // the sum of those bounded checks rather than masking a real timeout.
  test.setTimeout(120_000);
  await page.goto(TRUTH_MAP_QA_ROUTE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="truth-map-root"]', { timeout: 5_000, state: "attached" });
  await page.waitForFunction(() => Boolean(window.__TRUTH_MAP_QA__), { timeout: 20_000 });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 20_000 });

  const truthMap = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const camera = window.__TRUTH_MAP_QA__?.getCamera();
    return {
      camera,
      maxZoom: map?.getMaxZoom?.(),
      storeLevel: window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel(),
    };
  });

  expect(truthMap.maxZoom).toBe(15);
  expect(truthMap.camera?.zoom).toBeCloseTo(15, 5);
  expect(truthMap.camera?.lng).toBeCloseTo(-73.9893613, 5);
  expect(truthMap.camera?.lat).toBeCloseTo(40.7033862, 5);
  expect(truthMap.storeLevel).toBe("LOCAL");

  const storeToggle = page.getByTestId("truth-map-store-toggle");
  await expect(storeToggle).toHaveAttribute("aria-pressed", "true");
  await storeToggle.click();
  await expect(storeToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("truth-map-root")).toHaveAttribute("data-store-layer-enabled", "false");
  await page.waitForFunction(() => !window.__TRUTH_MAP_DEBUG__?.map?.getLayer("validated-cannabis-store-markers"), { timeout: 20_000 });
  await storeToggle.click();
  await expect(storeToggle).toHaveAttribute("aria-pressed", "true");
  await page.waitForFunction(() => window.__TRUTH_MAP_DEBUG__?.map?.getLayer("validated-cannabis-store-markers")?.type === "symbol", { timeout: 20_000 });

  await page.goto("/truth-map?qa=1&lat=40.7033862&lng=-73.9893613&zoom=5", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOW", { timeout: 20_000 });
  const lowZoomStoreState = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return {
      markers: map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }).length,
      candidates: map?.getCanvas().dataset.storeSpatialCandidates,
    };
  });
  expect(lowZoomStoreState.markers).toBe(0);
  expect(lowZoomStoreState.candidates).toBe("0");

  await page.goto("/truth-map?qa=1&lat=40.7033862&lng=-73.9893613&zoom=8", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "MEDIUM", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-clusters"] }).length || 0) > 0;
  }, { timeout: 20_000 });

  await page.goto("/truth-map?qa=1&lat=34.0522&lng=-118.2437&zoom=12", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.geo_id === "US-CA");
  }, { timeout: 20_000 });
  const californiaSource = await page.evaluate(() => {
    return window.__TRUTH_MAP_DEBUG__?.map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [];
  });
  expect(californiaSource.length).toBeGreaterThan(0);
  expect(californiaSource.every((feature) => feature.properties?.license_status === "ACTIVE")).toBe(true);
  expect(californiaSource.some((feature) => feature.properties?.operational_status === "UNKNOWN_STATUS")).toBe(true);
  const californiaPopupTarget = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => {
        if (candidate.geometry.type !== "Point") return false;
        const point = map.project(candidate.geometry.coordinates as [number, number]);
        return point.x > 470 && point.x < 820 && point.y > 100 && point.y < 570;
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(californiaPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: californiaPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");

  await page.goto("/truth-map?qa=1&lat=47.6062&lng=-122.3321&zoom=12", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.geo_id === "US-WA");
  }, { timeout: 20_000 });
  const washingtonFeatures = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .filter((feature) => feature.properties?.geo_id === "US-WA");
  });
  expect(washingtonFeatures.length).toBeGreaterThan(0);
  expect(washingtonFeatures.every((feature) => feature.properties?.license_status === "ACTIVE")).toBe(true);
  expect(washingtonFeatures.every((feature) => feature.properties?.operational_status === "UNKNOWN_STATUS")).toBe(true);

  await page.goto("/truth-map?qa=1&lat=45.5152&lng=-122.6784&zoom=12", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.geo_id === "US-OR");
  }, { timeout: 20_000 });
  const oregonFeatures = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .filter((feature) => feature.properties?.geo_id === "US-OR");
  });
  expect(oregonFeatures.length).toBeGreaterThan(0);
  expect(oregonFeatures.every((feature) => feature.properties?.license_status === "ACTIVE")).toBe(true);
  expect(oregonFeatures.every((feature) => feature.properties?.operational_status === "UNKNOWN_STATUS")).toBe(true);
  expect(oregonFeatures.some((feature) => String(feature.properties?.source_checked_at).startsWith("2026-08-14"))).toBe(true);
  const oregonPopupTarget = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => {
        if (candidate.geometry.type !== "Point") return false;
        const point = map.project(candidate.geometry.coordinates as [number, number]);
        return point.x > 470 && point.x < 820 && point.y > 100 && point.y < 570;
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(oregonPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: oregonPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");

  await page.goto("/truth-map?qa=1&lat=42.3601&lng=-71.0589&zoom=12", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.geo_id === "US-MA");
  }, { timeout: 20_000 });
  const massachusettsFeatures = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .filter((feature) => feature.properties?.geo_id === "US-MA");
  });
  expect(massachusettsFeatures.length).toBeGreaterThan(0);
  expect(massachusettsFeatures.every((feature) => feature.properties?.license_status === "ACTIVE")).toBe(true);
  expect(massachusettsFeatures.every((feature) => feature.properties?.operational_status === "UNKNOWN_STATUS")).toBe(true);
  expect(massachusettsFeatures.some((feature) => String(feature.properties?.source_checked_at).startsWith("2026-08-14"))).toBe(true);
  const massachusettsPopupTarget = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => {
        if (candidate.geometry.type !== "Point") return false;
        const point = map.project(candidate.geometry.coordinates as [number, number]);
        return point.x > 470 && point.x < 820 && point.y > 100 && point.y < 570;
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(massachusettsPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: massachusettsPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");

  await page.goto("/truth-map?qa=1&lat=39.2904&lng=-76.6122&zoom=12", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.geo_id === "US-MD");
  }, { timeout: 20_000 });
  const marylandFeatures = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .filter((feature) => feature.properties?.geo_id === "US-MD");
  });
  expect(marylandFeatures.length).toBeGreaterThan(0);
  expect(marylandFeatures.every((feature) => feature.properties?.license_status === "ACTIVE")).toBe(true);
  expect(marylandFeatures.every((feature) => feature.properties?.operational_status === "UNKNOWN_STATUS")).toBe(true);
  expect(marylandFeatures.every((feature) => feature.properties?.store_type === "ADULT_USE_RETAIL")).toBe(true);
  expect(marylandFeatures.some((feature) => String(feature.properties?.source_checked_at).startsWith("2026-08-14"))).toBe(true);
  const marylandPopupTarget = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => {
        if (candidate.geometry.type !== "Point") return false;
        const point = map.project(candidate.geometry.coordinates as [number, number]);
        return point.x > 470 && point.x < 820 && point.y > 100 && point.y < 570;
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(marylandPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: marylandPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");

  await page.goto("/truth-map?qa=1&lat=39.9526&lng=-75.1652&zoom=12", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.geo_id === "US-PA");
  }, { timeout: 20_000 });
  const pennsylvaniaFeatures = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .filter((feature) => feature.properties?.geo_id === "US-PA");
  });
  expect(pennsylvaniaFeatures.length).toBeGreaterThan(0);
  expect(pennsylvaniaFeatures.every((feature) => feature.properties?.license_status === "ACTIVE")).toBe(true);
  expect(pennsylvaniaFeatures.every((feature) => feature.properties?.operational_status === "ACTIVE")).toBe(true);
  expect(pennsylvaniaFeatures.every((feature) => feature.properties?.store_type === "MEDICAL_DISPENSARY")).toBe(true);
  expect(pennsylvaniaFeatures.some((feature) => String(feature.properties?.source_checked_at).startsWith("2026-08-14"))).toBe(true);
  const pennsylvaniaPopupTarget = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => {
        if (candidate.geometry.type !== "Point") return false;
        const point = map.project(candidate.geometry.coordinates as [number, number]);
        return point.x > 470 && point.x < 820 && point.y > 100 && point.y < 570;
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(pennsylvaniaPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: pennsylvaniaPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: confirmed active");

  await page.goto("/truth-map?qa=1&lat=39.1582&lng=-75.5244&zoom=12", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.geo_id === "US-DE");
  }, { timeout: 20_000 });
  const delawareFeatures = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .filter((feature) => feature.properties?.geo_id === "US-DE");
  });
  expect(delawareFeatures.length).toBeGreaterThan(0);
  expect(delawareFeatures.every((feature) => feature.properties?.license_status === "ACTIVE")).toBe(true);
  expect(delawareFeatures.every((feature) => feature.properties?.operational_status === "ACTIVE")).toBe(true);
  expect(delawareFeatures.every((feature) => feature.properties?.store_type === "ADULT_USE_RETAIL")).toBe(true);
  expect(delawareFeatures.some((feature) => feature.properties?.address === "800 Ogletown Rd")).toBe(false);
  expect(delawareFeatures.some((feature) => feature.properties?.address === "22982 Sussex Hwy")).toBe(false);
  const delawarePopupTarget = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .find((candidate) => {
        if (candidate.geometry.type !== "Point") return false;
        const point = map.project(candidate.geometry.coordinates as [number, number]);
        return point.x > 470 && point.x < 820 && point.y > 100 && point.y < 570;
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(delawarePopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: delawarePopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: confirmed active");

  await page.goto("/new-map?qa=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__NEW_MAP_DEBUG__?.map), { timeout: 20_000 });
  const existingMapMaxZoom = await page.evaluate(() => window.__NEW_MAP_DEBUG__?.map?.getMaxZoom?.());
  expect(existingMapMaxZoom).toBe(14);
});

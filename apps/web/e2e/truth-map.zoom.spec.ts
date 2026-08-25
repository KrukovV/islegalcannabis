import { expect, test, type Page } from "@playwright/test";

const TRUTH_MAP_QA_ROUTE = "/truth-map?qa=1&lat=40.7033862&lng=-73.9893613&zoom=15";
const MAP_READY_TIMEOUT = 45_000;

async function gotoReadyTruthMap(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="truth-map-root"]', { timeout: MAP_READY_TIMEOUT, state: "attached" });
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="truth-map-canvas"]')?.getAttribute("data-map-ready") === "1"
    && Boolean(window.__TRUTH_MAP_QA__)
    && Boolean(window.__TRUTH_MAP_DEBUG__?.map)
  ), undefined, { timeout: MAP_READY_TIMEOUT });
}

test("truth-map declutters global store counts and reaches full local zoom without changing the existing map route", async ({ page }) => {
  // This is one serial visual route contract spanning the audited local
  // jurisdictions. Each camera stop has its own 20-second readiness bound;
  // the whole journey therefore needs a larger finite budget than their sum.
  // This keeps a slow local style reload observable without turning a valid
  // later stop into a false suite timeout.
  test.setTimeout(360_000);
  await gotoReadyTruthMap(page, TRUTH_MAP_QA_ROUTE);
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 20_000 });

  const truthMap = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const camera = window.__TRUTH_MAP_QA__?.getCamera();
    return {
      camera,
      maxZoom: map?.getMaxZoom?.(),
      renderWorldCopies: map?.getRenderWorldCopies?.(),
      storeLevel: window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel(),
    };
  });

  expect(truthMap.maxZoom).toBe(15);
  expect(truthMap.renderWorldCopies).toBe(true);
  expect(truthMap.camera?.zoom).toBeCloseTo(15, 5);
  expect(truthMap.camera?.lng).toBeCloseTo(-73.9893613, 5);
  expect(truthMap.camera?.lat).toBeCloseTo(40.7033862, 5);
  expect(truthMap.storeLevel).toBe("LOCAL");

  // Truth Map intentionally retains the established MapLibre world-wrap
  // interaction. A horizontal pan across the antimeridian must remain
  // continuous rather than clamping the camera at the edge of one world.
  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=20&lng=170&zoom=3");
  await page.waitForFunction(() => Math.abs((window.__TRUTH_MAP_QA__?.getCamera()?.lng ?? 0) - 170) < 0.1, { timeout: 20_000 });
  const wrappedPan = await page.evaluate(async () => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map) throw new Error("truth_map_missing_for_wrapped_pan");
    const before = map.getCenter().lng;
    map.panBy([900, 0], { duration: 0 });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { before, after: map.getCenter().lng };
  });
  expect(wrappedPan.before).toBeGreaterThan(160);
  expect(wrappedPan.after).toBeLessThan(-90);

  const storeToggle = page.getByTestId("truth-map-store-toggle");
  await expect(storeToggle).toHaveAttribute("aria-pressed", "true");
  await storeToggle.click();
  await expect(storeToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("truth-map-root")).toHaveAttribute("data-store-layer-enabled", "false");
  await page.waitForFunction(() => !window.__TRUTH_MAP_DEBUG__?.map?.getLayer("validated-cannabis-store-markers"), { timeout: 20_000 });
  await storeToggle.click();
  await expect(storeToggle).toHaveAttribute("aria-pressed", "true");
  await page.waitForFunction(() => window.__TRUTH_MAP_DEBUG__?.map?.getLayer("validated-cannabis-store-markers")?.type === "symbol", { timeout: 20_000 });

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=20&lng=-30&zoom=1.5");
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOW", { timeout: 20_000 });
  await page.waitForFunction(() => Number(window.__TRUTH_MAP_QA__?.getStoreCountrySummaryCount() || "0") > 0, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-country-summaries")) return false;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-country-summaries"] }).length || 0) > 0;
  }, { timeout: 20_000 });
  const globalSummaryResponse = await page.request.get("/api/truth-map/stores/summary");
  expect(globalSummaryResponse.ok()).toBe(true);
  const summaryPayload = await globalSummaryResponse.json() as {
    meta: { geoCount: number; countryCount: number; visibleStores: number };
    rows: Array<{ geo_id: string; count: number; anchor_lng: number; anchor_lat: number }>;
    countryRows: Array<{ geo_id: string; count: number; anchor_lng: number; anchor_lat: number }>;
  };
  const globalStoreState = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const layers = map?.getStyle().layers || [];
    const countrySummaryIndex = layers.findIndex((layer) => layer.id === "validated-cannabis-store-country-summaries");
    const firstNativeLabelIndex = layers.findIndex((layer) => (
      layer.type === "symbol"
      && !layer.id.startsWith("validated-cannabis-store-")
      && layer.id !== "legal-territory-label"
    ));
    return {
      geoSummaryRendered: map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-geo-summaries"] }).length,
      countrySummaryRendered: map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-country-summaries"] }).length,
      countrySummaryCount: map?.getCanvas().dataset.storeCountrySummaryCount,
      countrySummaryMaxZoom: map?.getLayer("validated-cannabis-store-country-summaries")?.maxzoom,
      geoSummaryMinZoom: map?.getLayer("validated-cannabis-store-geo-summaries")?.minzoom,
      countrySummaryBeforeNativeLabels: countrySummaryIndex >= 0 && firstNativeLabelIndex > countrySummaryIndex,
    };
  });
  expect(Number(globalStoreState.countrySummaryCount)).toBe(summaryPayload.meta.countryCount);
  expect(summaryPayload.meta.countryCount).toBeLessThan(summaryPayload.meta.geoCount);
  expect(globalStoreState.geoSummaryRendered).toBe(0);
  expect(globalStoreState.countrySummaryRendered).toBe(summaryPayload.meta.countryCount);
  expect(globalStoreState.countrySummaryMaxZoom).toBe(4.2);
  expect(globalStoreState.geoSummaryMinZoom).toBe(4.2);
  expect(globalStoreState.countrySummaryBeforeNativeLabels).toBe(true);

  const greeceCountrySummary = summaryPayload.countryRows.find((row) => row.geo_id === "GR");
  const unitedStatesCountrySummary = summaryPayload.countryRows.find((row) => row.geo_id === "US");
  const netherlandsCountrySummary = summaryPayload.countryRows.find((row) => row.geo_id === "NL");
  if (!greeceCountrySummary || !unitedStatesCountrySummary || !netherlandsCountrySummary) {
    throw new Error("truth_map_country_summary_fixture_missing");
  }
  expect(netherlandsCountrySummary.count).toBe(135);

  // The exact affected examples remain present after separate camera changes.
  // Their stable symbol layout must not depend on unrelated country-label
  // collisions or arriving basemap tiles.
  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=38.5&lng=23.5&zoom=3.7");
  await page.waitForFunction(({ geo, count }) => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-country-summaries")) return false;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-country-summaries"] }) || [])
      .some((feature) => feature.properties?.geo_id === geo && Number(feature.properties?.count) === count);
  }, { geo: greeceCountrySummary.geo_id, count: greeceCountrySummary.count }, { timeout: 20_000 });

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=40&lng=-108&zoom=3.7");
  await page.waitForFunction(({ geo, count }) => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-country-summaries")) return false;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-country-summaries"] }) || [])
      .some((feature) => feature.properties?.geo_id === geo && Number(feature.properties?.count) === count);
  }, { geo: unitedStatesCountrySummary.geo_id, count: unitedStatesCountrySummary.count }, { timeout: 20_000 });

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=52.4&lng=4.9&zoom=3.7");
  await page.waitForFunction(({ geo, count }) => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-country-summaries")) return false;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-country-summaries"] }) || [])
      .some((feature) => feature.properties?.geo_id === geo && Number(feature.properties?.count) === count);
  }, { geo: netherlandsCountrySummary.geo_id, count: netherlandsCountrySummary.count }, { timeout: 20_000 });

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=40.7033862&lng=-73.9893613&zoom=5");
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOW", { timeout: 20_000 });
  await page.waitForFunction(() => Number(window.__TRUTH_MAP_QA__?.getStoreGeoSummaryCount() || "0") > 0, { timeout: 20_000 });
  const lowZoomStoreState = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return {
      markers: map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }).length,
      candidates: map?.getCanvas().dataset.storeSpatialCandidates,
      summaryCount: map?.getCanvas().dataset.storeGeoSummaryCount,
      summaryIcon: map?.getLayoutProperty("validated-cannabis-store-geo-summaries", "icon-image"),
      summaryIconAnchor: map?.getLayoutProperty("validated-cannabis-store-geo-summaries", "icon-anchor"),
      summaryCountAnchor: map?.getLayoutProperty("validated-cannabis-store-geo-summaries", "text-anchor"),
      summaryCountOffset: map?.getLayoutProperty("validated-cannabis-store-geo-summaries", "text-offset"),
      summaryCountHalo: map?.getPaintProperty("validated-cannabis-store-geo-summaries", "text-halo-width"),
      summaryMaxZoom: map?.getLayer("validated-cannabis-store-geo-summaries")?.maxzoom,
    };
  });
  expect(lowZoomStoreState.markers).toBe(0);
  expect(lowZoomStoreState.candidates).toBe("0");
  expect(Number(lowZoomStoreState.summaryCount)).toBe(summaryPayload.meta.geoCount);
  expect(summaryPayload.meta.visibleStores).toBeGreaterThan(0);
  expect(summaryPayload.rows.every((row) => (
    Number.isInteger(row.count)
    && row.count > 0
    && Number.isInteger(row.anchor_lng * 2)
    && Number.isInteger(row.anchor_lat * 2)
  ))).toBe(true);
  expect(lowZoomStoreState.summaryIcon).toBe("validated-cannabis-store-geo-summary-shop");
  expect(lowZoomStoreState.summaryIconAnchor).toBe("right");
  expect(lowZoomStoreState.summaryCountAnchor).toBe("left");
  expect(lowZoomStoreState.summaryCountOffset).toEqual([0.45, 0]);
  expect(lowZoomStoreState.summaryCountHalo).toBe(2);
  expect(lowZoomStoreState.summaryMaxZoom).toBe(5.8);

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=40.7033862&lng=-73.9893613&zoom=8");
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "MEDIUM", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-clusters")) return false;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-clusters"] }).length || 0) > 0;
  }, { timeout: 20_000 });
  const mediumZoomStoreState = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return {
      geo: map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-geo-summaries"] }).length || 0,
      country: map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-country-summaries"] }).length || 0,
    };
  });
  expect(mediumZoomStoreState.geo).toBe(0);
  expect(mediumZoomStoreState.country).toBe(0);

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=34.0522&lng=-118.2437&zoom=12");
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return false;
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
        return point.x > 470
          && point.x < 820
          && point.y > 100
          && point.y < 570
          && map.queryRenderedFeatures(point, { layers: ["validated-cannabis-store-markers"] })
            .some((rendered) => rendered.properties?.geo_id === "US-CA");
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(californiaPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: californiaPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=52.3758&lng=4.8737&zoom=13");
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return false;
    return map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] })
      .some((feature) => feature.properties?.geo_id === "NL" && feature.properties?.record_kind === "MUNICIPAL_TOLERATION_ADDRESS");
  }, { timeout: 20_000 });
  const netherlandsLeafPresentation = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return {
      icon: map?.getLayoutProperty("validated-cannabis-store-markers", "icon-image"),
      allowOverlap: map?.getLayoutProperty("validated-cannabis-store-markers", "icon-allow-overlap"),
      ignorePlacement: map?.getLayoutProperty("validated-cannabis-store-markers", "icon-ignore-placement"),
      padding: map?.getLayoutProperty("validated-cannabis-store-markers", "icon-padding"),
      runtimeTint: map?.getPaintProperty("validated-cannabis-store-markers", "icon-color") ?? null,
      hitboxType: map?.getLayer("validated-cannabis-store-marker-hitboxes")?.type,
      hitboxOpacity: map?.getPaintProperty("validated-cannabis-store-marker-hitboxes", "circle-opacity"),
    };
  });
  expect(netherlandsLeafPresentation).toEqual({
    icon: "validated-cannabis-store-leaf",
    allowOverlap: false,
    ignorePlacement: false,
    padding: 5,
    runtimeTint: null,
    hitboxType: "circle",
    hitboxOpacity: 0,
  });
  const netherlandsPopupTarget = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-marker-hitboxes"] })
      .find((candidate) => {
        if (candidate.properties?.geo_id !== "NL" || candidate.properties?.record_kind !== "MUNICIPAL_TOLERATION_ADDRESS" || candidate.geometry.type !== "Point") return false;
        const point = map.project(candidate.geometry.coordinates as [number, number]);
        return map.queryRenderedFeatures(point, { layers: ["validated-cannabis-store-marker-hitboxes"] })
          .some((rendered) => rendered.properties?.geo_id === "NL" && rendered.properties?.record_kind === "MUNICIPAL_TOLERATION_ADDRESS");
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(netherlandsPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: netherlandsPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Municipal tolerated coffeeshop address");
  await expect(page.getByTestId("store-popup")).toContainText("Province / region: Noord-Holland");
  await expect(page.getByTestId("store-popup")).toContainText("Individual permit, operator, hours and factual operating status: not published");

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=47.6062&lng=-122.3321&zoom=12");
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return false;
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

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=45.5152&lng=-122.6784&zoom=12");
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return false;
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
        return point.x > 470
          && point.x < 820
          && point.y > 100
          && point.y < 570
          && map.queryRenderedFeatures(point, { layers: ["validated-cannabis-store-markers"] })
            .some((rendered) => rendered.properties?.geo_id === "US-OR");
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(oregonPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: oregonPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=42.3601&lng=-71.0589&zoom=12");
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return false;
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
        return point.x > 470
          && point.x < 820
          && point.y > 100
          && point.y < 570
          && map.queryRenderedFeatures(point, { layers: ["validated-cannabis-store-markers"] })
            .some((rendered) => rendered.properties?.geo_id === "US-MA");
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(massachusettsPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: massachusettsPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=39.2904&lng=-76.6122&zoom=12");
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return false;
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
        return point.x > 470
          && point.x < 820
          && point.y > 100
          && point.y < 570
          && map.queryRenderedFeatures(point, { layers: ["validated-cannabis-store-markers"] })
            .some((rendered) => rendered.properties?.geo_id === "US-MD");
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(marylandPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: marylandPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: not separately published");

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=39.9526&lng=-75.1652&zoom=12");
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return false;
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
        return point.x > 470
          && point.x < 820
          && point.y > 100
          && point.y < 570
          && map.queryRenderedFeatures(point, { layers: ["validated-cannabis-store-markers"] })
            .some((rendered) => rendered.properties?.geo_id === "US-PA");
      });
    if (!feature || feature.geometry.type !== "Point") return null;
    const point = map.project(feature.geometry.coordinates as [number, number]);
    return { x: point.x, y: point.y };
  });
  expect(pennsylvaniaPopupTarget).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: pennsylvaniaPopupTarget! });
  await expect(page.getByTestId("store-popup")).toContainText("Operating status: confirmed active");

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=39.1582&lng=-75.5244&zoom=12");
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
        return point.x > 470
          && point.x < 820
          && point.y > 100
          && point.y < 570
          && map.queryRenderedFeatures(point, { layers: ["validated-cannabis-store-markers"] })
            .some((rendered) => rendered.properties?.geo_id === "US-DE");
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

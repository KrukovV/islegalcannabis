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

test("truth-map shares the stable city-label visibility ranges used by new-map", async ({ page }) => {
  test.setTimeout(90_000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  // Mongolia is sparse enough to expose labels being switched off during a
  // zoom. Both routes use createMap(), so the assertion fixes their shared
  // visibility policy rather than prescribing labels for one territory.
  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=46.8625&lng=103.8467&zoom=5.4");
  const labelBandState = await page.evaluate(async () => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map) throw new Error("truth_map_missing_for_native_label_bands");
    const isNativePlaceLabel = (id: string) => /place_city|place_town|place_villages|place_hamlet|place_suburbs?/i.test(id);
    const summarize = (layers: Array<{ id?: string; type?: string; minzoom?: number; maxzoom?: number }>) => layers
      .filter((layer) => layer.type === "symbol" && isNativePlaceLabel(String(layer.id || "")))
      .map((layer) => ({ id: String(layer.id), minzoom: layer.minzoom ?? 0, maxzoom: layer.maxzoom ?? 24 }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const activeBands = summarize(map.getStyle().layers || []);
    const stops: Array<{ zoom: number; activeLayerIds: string[]; renderedLabelCount: number }> = [];
    for (const zoom of [5.9, 6.4, 7.4, 8.4]) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        map.once("idle", finish);
        map.jumpTo({ center: [103.8467, 46.8625], zoom });
        window.setTimeout(finish, 5_000);
      });
      const activeLayerIds = activeBands
        .filter((layer) => layer.minzoom <= zoom && zoom < layer.maxzoom)
        .map((layer) => layer.id);
      stops.push({
        zoom: map.getZoom(),
        activeLayerIds,
        renderedLabelCount: map.queryRenderedFeatures({ layers: activeLayerIds }).length
      });
    }
    return { activeBands, stops };
  });

  expect(labelBandState.activeBands).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: expect.stringMatching(/place_city/i), minzoom: 5.8, maxzoom: 24 }),
    expect.objectContaining({ id: expect.stringMatching(/place_town|place_villages|place_hamlet|place_suburbs?/i), minzoom: 6.6, maxzoom: 24 })
  ]));
  expect(labelBandState.activeBands.every((layer) => (
    /place_city/i.test(layer.id)
      ? layer.minzoom === 5.8 && layer.maxzoom === 24
      : layer.minzoom === 6.6 && layer.maxzoom === 24
  ))).toBe(true);
  expect(labelBandState.stops.every((stop) => stop.activeLayerIds.length > 0)).toBe(true);
  expect(labelBandState.stops.every((stop) => stop.renderedLabelCount > 0)).toBe(true);
  expect(runtimeErrors).toEqual([]);
});

test("truth-map reloads local Store leaves after an in-place viewport move, including a wrapped world copy", async ({ page }) => {
  test.setTimeout(120_000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await gotoReadyTruthMap(page, TRUTH_MAP_QA_ROUTE);
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return false;
    return (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .some((feature) => feature.properties?.geo_id === "US-NY");
  }, undefined, { timeout: 20_000 });

  const initialQueryId = await page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map?.getCanvas().dataset.storeQueryId || "");
  const greeceResponse = page.waitForResponse((response) => {
    if (!response.url().includes("/api/truth-map/stores?")) return false;
    const url = new URL(response.url());
    return response.status() === 200
      && Number(url.searchParams.get("west")) > 22
      && Number(url.searchParams.get("east")) < 25;
  }, { timeout: 20_000 });
  await page.evaluate(async () => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map) throw new Error("truth_map_missing_for_viewport_move");
    await new Promise<void>((resolve) => {
      map.once("moveend", () => resolve());
      map.easeTo({ center: [23.593064, 38.462504], zoom: 13, duration: 250, essential: true });
    });
  });
  await greeceResponse;
  await page.waitForFunction((previousQueryId) => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return false;
    return map.getCanvas().dataset.storeQueryId !== previousQueryId
      && (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
        .some((feature) => feature.properties?.geo_id === "GR");
  }, initialQueryId, { timeout: 20_000 });

  const wrappedResponse = page.waitForResponse((response) => {
    if (!response.url().includes("/api/truth-map/stores?")) return false;
    const url = new URL(response.url());
    return response.status() === 200
      && Number(url.searchParams.get("west")) < -73
      && Number(url.searchParams.get("east")) < -73;
  }, { timeout: 20_000 });
  await page.evaluate(() => {
    window.__TRUTH_MAP_DEBUG__?.map?.jumpTo({ center: [286.0106387, 40.7033862], zoom: 13 });
  });
  await wrappedResponse;
  const wrappedState = await (await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-markers")) return null;
    const hasNewYorkLeaf = (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .some((feature) => feature.properties?.geo_id === "US-NY");
    const bounds = map.getBounds();
    return hasNewYorkLeaf && map.getCanvas().dataset.storeVisibilityLevel === "LOCAL"
      ? { west: bounds.getWest(), east: bounds.getEast(), center: map.getCenter().lng }
      : null;
  }, undefined, { timeout: 20_000 })).jsonValue() as { west: number; east: number; center: number };
  expect(wrappedState.west).toBeGreaterThan(180);
  expect(wrappedState.east).toBeGreaterThan(180);
  expect(wrappedState.center).toBeGreaterThan(180);
  expect(runtimeErrors).toEqual([]);
});

test("truth-map keeps the Canada aggregate through the medium hand-off and preserves clusters during a bounded north pan", async ({ page }) => {
  test.setTimeout(120_000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=44&lng=-80&zoom=5.7");
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-geo-summaries")) return false;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-geo-summaries"] }) || [])
      .some((feature) => feature.properties?.geo_id === "CA" && Number(feature.properties?.count) === 1825);
  }, undefined, { timeout: 20_000 });

  const canadaMediumResponse = page.waitForResponse((response) => {
    if (!response.url().includes("/api/truth-map/stores?")) return false;
    const url = new URL(response.url());
    return response.status() === 200 && Number(url.searchParams.get("zoom")) >= 5.8;
  }, { timeout: 20_000 });
  const bridgeState = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map) throw new Error("truth_map_missing_for_canada_store_bridge");
    map.jumpTo({ center: [-80, 44], zoom: 5.8 });
    return {
      fallbackVisible: map.getLayoutProperty("validated-cannabis-store-geo-summaries", "visibility"),
      canadaAggregateStillRendered: (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-geo-summaries"] }) || [])
        .some((feature) => feature.properties?.geo_id === "CA" && Number(feature.properties?.count) === 1825),
    };
  });
  expect(bridgeState.fallbackVisible).toBe("visible");
  expect(bridgeState.canadaAggregateStillRendered).toBe(true);
  await canadaMediumResponse;
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map) return false;
    return map.getCanvas().dataset.storeVisibilityLevel === "MEDIUM"
      && Number(map.getCanvas().dataset.storeSpatialCandidates || "0") > 0
      && (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-clusters"] }) || []).length > 0
      && map.getLayoutProperty("validated-cannabis-store-geo-summaries", "visibility") === "none";
  }, undefined, { timeout: 20_000 });

  const beforePanQueryId = await page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map?.getCanvas().dataset.storeQueryId || "");
  const panResponse = page.waitForResponse((response) => (
    response.url().includes("/api/truth-map/stores?") && response.status() === 200
  ), { timeout: 20_000 });
  const immediatePanClusterCount = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map) throw new Error("truth_map_missing_for_canada_store_pan");
    map.jumpTo({ center: [-80, 46], zoom: 5.8 });
    return (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-clusters"] }) || []).length;
  });
  expect(immediatePanClusterCount).toBeGreaterThan(0);
  await panResponse;
  await page.waitForFunction((previousQueryId) => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return Boolean(map
      && map.getCanvas().dataset.storeQueryId !== previousQueryId
      && (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-clusters"] }) || []).length > 0);
  }, beforePanQueryId, { timeout: 20_000 });
  expect(runtimeErrors).toEqual([]);
});

test("truth-map ZoomIn and ZoomOut stay responsive across the Store aggregate boundary", async ({ page }) => {
  test.setTimeout(120_000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  // Canada provides a dense, deterministic hand-off: at z=5.7 it has one
  // aggregate, then at z=6.7 it has viewport clusters. This exercises the
  // same MapLibre ZoomIn/ZoomOut path as the existing controls/gestures while
  // keeping the test focused on response and presentation continuity.
  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=44&lng=-80&zoom=5.7");
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return Boolean(map
      && map.getCanvas().dataset.storeVisibilityLevel === "LOW"
      && map.getLayoutProperty("validated-cannabis-store-geo-summaries", "visibility") === "visible"
      && (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-geo-summaries"] }) || [])
        .some((feature) => feature.properties?.geo_id === "CA" && Number(feature.properties?.count) === 1825));
  }, undefined, { timeout: 20_000 });

  const step = async (direction: "in" | "out", expectedLevel: "LOW" | "MEDIUM") => {
    const startedAt = Date.now();
    const cameraMs = await page.evaluate(async (requestedDirection) => {
      const map = window.__TRUTH_MAP_DEBUG__?.map;
      if (!map) throw new Error("truth_map_missing_for_zoom_response");
      const cameraStartedAt = Date.now();
      await new Promise<void>((resolve) => {
        map.once("zoomend", resolve);
        if (requestedDirection === "in") map.zoomIn({ duration: 0 });
        else map.zoomOut({ duration: 0 });
      });
      return Date.now() - cameraStartedAt;
    }, direction);
    await page.waitForFunction((level) => {
      const map = window.__TRUTH_MAP_DEBUG__?.map;
      if (!map || map.getCanvas().dataset.storeVisibilityLevel !== level) return false;
      if (level === "LOW") {
        return map.getLayoutProperty("validated-cannabis-store-geo-summaries", "visibility") === "visible"
          && (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-geo-summaries"] }) || [])
            .some((feature) => feature.properties?.geo_id === "CA" && Number(feature.properties?.count) === 1825);
      }
      return map.getLayoutProperty("validated-cannabis-store-geo-summaries", "visibility") === "none"
        && (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-clusters"] }) || []).length > 0;
    }, expectedLevel, { timeout: 20_000 });
    return {
      cameraMs,
      endToEndMs: Date.now() - startedAt,
      serverQueryMs: Number(await page.evaluate(() => (
        window.__TRUTH_MAP_DEBUG__?.map?.getCanvas().dataset.storeQueryDurationMs || "0"
      ))),
    };
  };

  const zoomIn = await step("in", "MEDIUM");
  const zoomOut = await step("out", "LOW");
  // Repeat the exact user-visible crossing rather than adding a separate
  // scheduler or geometry rule.  The response bound includes source update
  // and a rendered feature, not just the synchronous camera call.
  const repeated = [
    await step("in", "MEDIUM"),
    await step("out", "LOW"),
    await step("in", "MEDIUM"),
    await step("out", "LOW"),
  ];
  const allSteps = [zoomIn, zoomOut, ...repeated];
  const worstMs = Math.max(...allSteps.map((stepResult) => stepResult.endToEndMs));
  console.warn(`MAP_ZOOM_METRICS ${JSON.stringify({ zoomIn, zoomOut, repeated, worstMs })}`);
  // Camera movement must complete immediately; the first medium response is
  // allowed to render asynchronously, but never leaves a blank map because
  // the existing GEO aggregate bridge stays visible until clusters install.
  expect(allSteps.every((stepResult) => stepResult.cameraMs < 250), JSON.stringify({ zoomIn, zoomOut, repeated })).toBe(true);
  // The dev test server can compile basemap tiles in the same event loop, so
  // the browser end-to-end number is not a Store-query benchmark. It must
  // still settle well inside the interaction readiness window, while the
  // cache-backed Store handler itself remains bounded independently.
  expect(allSteps
    .filter((stepResult) => stepResult.serverQueryMs > 0)
    .every((stepResult) => stepResult.serverQueryMs < 2_500), JSON.stringify({ zoomIn, zoomOut, repeated })).toBe(true);
  expect(worstMs, JSON.stringify({ zoomIn, zoomOut, repeated })).toBeLessThan(8_000);
  expect(runtimeErrors).toEqual([]);
});

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
    const finalNativeGeometryIndex = layers.reduce((lastIndex, layer, index) => (
      layer.type !== "symbol"
      && !layer.id.startsWith("validated-cannabis-store-")
      && !layer.id.startsWith("social-map-activity-")
      && !layer.id.startsWith("legal-")
      && !layer.id.startsWith("us-states-")
        ? index
        : lastIndex
    ), -1);
    const firstNativeLabelIndex = layers.findIndex((layer, index) => index > finalNativeGeometryIndex && (
      layer.type === "symbol"
      && !layer.id.startsWith("validated-cannabis-store-")
      && !layer.id.startsWith("social-map-activity-")
      && !layer.id.startsWith("legal-")
    ));
    return {
      geoSummaryRendered: map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-geo-summaries"] }).length,
      countrySummaryRendered: map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-country-summaries"] }).length,
      countrySummaryCount: map?.getCanvas().dataset.storeCountrySummaryCount,
      countrySummaryMaxZoom: map?.getLayer("validated-cannabis-store-country-summaries")?.maxzoom,
      geoSummaryMinZoom: map?.getLayer("validated-cannabis-store-geo-summaries")?.minzoom,
      countrySummaryAboveNativeGeometry: countrySummaryIndex > finalNativeGeometryIndex,
      countrySummaryBeforeNativeLabels: countrySummaryIndex >= 0 && firstNativeLabelIndex > countrySummaryIndex,
    };
  });
  expect(Number(globalStoreState.countrySummaryCount)).toBe(summaryPayload.meta.countryCount);
  expect(summaryPayload.meta.countryCount).toBeLessThan(summaryPayload.meta.geoCount);
  expect(globalStoreState.geoSummaryRendered).toBe(0);
  expect(globalStoreState.countrySummaryRendered).toBe(summaryPayload.meta.countryCount);
  expect(globalStoreState.countrySummaryMaxZoom).toBe(4.2);
  expect(globalStoreState.geoSummaryMinZoom).toBe(4.2);
  expect(globalStoreState.countrySummaryAboveNativeGeometry).toBe(true);
  expect(globalStoreState.countrySummaryBeforeNativeLabels).toBe(true);

  const greeceCountrySummary = summaryPayload.countryRows.find((row) => row.geo_id === "GR");
  const unitedStatesCountrySummary = summaryPayload.countryRows.find((row) => row.geo_id === "US");
  const netherlandsCountrySummary = summaryPayload.countryRows.find((row) => row.geo_id === "NL");
  if (!greeceCountrySummary || !unitedStatesCountrySummary || !netherlandsCountrySummary) {
    throw new Error("truth_map_country_summary_fixture_missing");
  }
  // The Store Truth registry currently contains 140 visible Netherlands
  // records. Keep this precise audit fixture in sync with the current
  // immutable Store Truth projection; it is unrelated to cluster placement.
  expect(netherlandsCountrySummary.count).toBe(140);

  const canadaGeoSummary = summaryPayload.rows.find((row) => row.geo_id === "CA");
  if (!canadaGeoSummary) throw new Error("truth_map_canada_geo_summary_missing");
  // This is the public count a user sees before z=5.8. The transition below
  // must never make the underlying records disappear through a response cap.
  expect(canadaGeoSummary.count).toBe(1825);

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
  expect(lowZoomStoreState.summaryMaxZoom).toBe(24);

  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=44&lng=-80&zoom=5.7");
  await page.waitForFunction(({ geo, count }) => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.getLayer("validated-cannabis-store-geo-summaries")) return false;
    return (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-geo-summaries"] }) || [])
      .some((feature) => feature.properties?.geo_id === geo && Number(feature.properties?.count) === count);
  }, { geo: canadaGeoSummary.geo_id, count: canadaGeoSummary.count }, { timeout: 20_000 });

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
      clusterType: map?.getLayer("validated-cannabis-store-clusters")?.type,
      clusterIcon: map?.getLayoutProperty("validated-cannabis-store-clusters", "icon-image"),
      clusterText: map?.getLayoutProperty("validated-cannabis-store-clusters", "text-field"),
      clusterAllowOverlap: map?.getLayoutProperty("validated-cannabis-store-clusters", "icon-allow-overlap"),
      clusterTextAllowOverlap: map?.getLayoutProperty("validated-cannabis-store-clusters", "text-allow-overlap"),
      legacyClusterCountLayerPresent: Boolean(map?.getLayer("validated-cannabis-store-cluster-counts")),
    };
  });
  expect(mediumZoomStoreState.geo).toBe(0);
  expect(mediumZoomStoreState.country).toBe(0);
  expect(mediumZoomStoreState.clusterType).toBe("symbol");
  expect(mediumZoomStoreState.clusterIcon).toBe("validated-cannabis-store-geo-summary-shop");
  expect(mediumZoomStoreState.clusterText).toEqual(["to-string", ["get", "count"]]);
  expect(mediumZoomStoreState.clusterAllowOverlap).toBe(true);
  expect(mediumZoomStoreState.clusterTextAllowOverlap).toBe(true);
  expect(mediumZoomStoreState.legacyClusterCountLayerPresent).toBe(false);

  // A one-record cluster must transform into the corresponding local leaf at
  // the same coordinate. This protects the hand-off that previously made a
  // visible storefront jump to a grid centre and then disappear behind labels.
  await gotoReadyTruthMap(page, "/truth-map?qa=1&lat=38.4&lng=23.6&zoom=10.19");
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-clusters"] }) || [])
      .some((feature) => Number(feature.properties?.count) === 1);
  }, { timeout: 20_000 });
  const singletonClusterCoordinate = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-clusters"] }) || [])
      .find((candidate) => candidate.geometry.type === "Point" && Number(candidate.properties?.count) === 1);
    return feature?.geometry.type === "Point"
      ? feature.geometry.coordinates as [number, number]
      : null;
  });
  expect(singletonClusterCoordinate).not.toBeNull();
  if (!singletonClusterCoordinate) throw new Error("truth_map_singleton_cluster_missing");
  await page.evaluate((coordinate) => {
    window.__TRUTH_MAP_DEBUG__?.map?.jumpTo({ center: coordinate, zoom: 10.21 });
  }, singletonClusterCoordinate);
  await page.waitForFunction((coordinate) => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .some((feature) => feature.geometry.type === "Point"
        && Math.abs(feature.geometry.coordinates[0] - coordinate[0]) < 0.000001
        && Math.abs(feature.geometry.coordinates[1] - coordinate[1]) < 0.000001);
  }, singletonClusterCoordinate, { timeout: 20_000 });

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
      rotationAlignment: map?.getLayoutProperty("validated-cannabis-store-markers", "icon-rotation-alignment"),
      pitchAlignment: map?.getLayoutProperty("validated-cannabis-store-markers", "icon-pitch-alignment"),
      runtimeTint: map?.getPaintProperty("validated-cannabis-store-markers", "icon-color") ?? null,
      hitboxType: map?.getLayer("validated-cannabis-store-marker-hitboxes")?.type,
      hitboxOpacity: map?.getPaintProperty("validated-cannabis-store-marker-hitboxes", "circle-opacity"),
    };
  });
  expect(netherlandsLeafPresentation).toEqual({
    icon: "validated-cannabis-store-leaf",
    allowOverlap: true,
    ignorePlacement: true,
    padding: 0,
    rotationAlignment: "viewport",
    pitchAlignment: "viewport",
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

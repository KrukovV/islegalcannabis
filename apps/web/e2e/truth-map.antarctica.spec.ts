import { expect, test } from "@playwright/test";

test("truth-map keeps the established Antarctica animation alongside the editable audit controls", async ({ page }) => {
  test.setTimeout(110_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/truth-map?qa=1&lat=-77&lng=0&zoom=4", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("truth-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 55_000 });
  const animation = page.getByTestId("antarctic-ascii-overlay");
  await expect(animation).toHaveAttribute("data-ascii-state", "running", { timeout: 12_000 });
  await expect(animation).toHaveAttribute("data-renderer", "svg");
  await expect(animation).toHaveAttribute("data-map-interaction", "passthrough");
  await expect(animation).toHaveAttribute("data-svg-anchor-visible", "1");
  await expect(animation).toHaveCSS("pointer-events", "none");
  await expect(animation).toHaveAttribute("data-svg-story-count", "34");
  await expect(animation).toHaveAttribute("data-ascii-scenario", "walking-smoker");
  await expect(animation.locator('[data-svg-role="smoker"]')).toHaveCount(3);
  await expect(animation).toHaveAttribute("data-ascii-scenario", "antarctic-face-chorus", { timeout: 10_000 });
  await expect(animation.locator("[data-svg-animal]")).toHaveCount(6);
  await expect(page.getByTestId("new-map-ai-dock")).toBeVisible();

  const anchoredAtAntarctica = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const overlay = document.querySelector('[data-testid="antarctic-ascii-overlay"]');
    if (!map || !(overlay instanceof SVGSVGElement)) return null;
    const projected = map.project([0, -77]);
    return {
      expectedX: Number(projected.x.toFixed(2)),
      expectedY: Number((projected.y - 20).toFixed(2)),
      actualX: Number(overlay.dataset.svgAnchorX),
      actualY: Number(overlay.dataset.svgAnchorY)
    };
  });
  expect(anchoredAtAntarctica).not.toBeNull();
  expect(anchoredAtAntarctica?.actualX).toBeCloseTo(anchoredAtAntarctica?.expectedX ?? 0, 1);
  expect(anchoredAtAntarctica?.actualY).toBeCloseTo(anchoredAtAntarctica?.expectedY ?? 0, 1);

  const cameraBeforePointerInput = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map ? { center: map.getCenter().toArray(), zoom: map.getZoom() } : null;
  });
  expect(cameraBeforePointerInput).not.toBeNull();
  await page.mouse.move(640, 340);
  await page.mouse.down();
  await page.mouse.move(710, 340, { steps: 7 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map?.getCenter().lng ?? 0), { timeout: 10_000 })
    .not.toBeCloseTo(cameraBeforePointerInput?.center[0] ?? 0, 2);

  const zoomBeforeWheel = await page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map?.getZoom() ?? 0);
  await page.mouse.move(640, 340);
  await page.mouse.wheel(0, -800);
  await expect.poll(() => page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map?.getZoom() ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(zoomBeforeWheel + 0.1);

  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.jumpTo(2.35, 46.5, 5);
  });
  await expect(animation).toHaveAttribute("data-svg-anchor-visible", "0");
  await expect(animation).toHaveAttribute("data-ascii-state", "offscreen");
  await expect(animation).toHaveCSS("visibility", "hidden");
  await expect.poll(() => page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    if (!map?.isStyleLoaded()) return false;
    const labelLayerIds = (map.getStyle().layers || [])
      .filter((layer) => layer.type === "symbol" && Boolean(layer.layout?.["text-field"]))
      .map((layer) => layer.id);
    const rendered = map.queryRenderedFeatures();
    const labelsReady = rendered.some((feature) => labelLayerIds.includes(feature.layer.id));
    const landscapeReady = rendered.some((feature) => {
      const layer = map.getLayer(feature.layer.id);
      return layer?.type === "fill" || layer?.type === "line";
    });
    return labelsReady && landscapeReady;
  }), { timeout: 20_000 }).toBe(true);

  const mapState = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const overlay = document.querySelector('[data-testid="antarctic-ascii-overlay"]');
    if (!map || !(overlay instanceof SVGSVGElement)) return null;
    const projected = map.project([0, -77]);
    const layers = map.getStyle().layers || [];
    const nativeLabelLayers = layers
      .filter((layer) => layer.type === "symbol" && Boolean(layer.layout?.["text-field"]))
      .map((layer) => layer.id);
    const rendered = map.queryRenderedFeatures();
    return {
      center: map.getCenter().toArray(),
      zoom: map.getZoom(),
      styleLoaded: map.isStyleLoaded(),
      projectedX: Number(projected.x.toFixed(2)),
      projectedY: Number((projected.y - 20).toFixed(2)),
      actualX: Number(overlay.dataset.svgAnchorX),
      actualY: Number(overlay.dataset.svgAnchorY),
      nativeLabelLayers: nativeLabelLayers.length,
      renderedNativeLabels: rendered.filter((feature) => nativeLabelLayers.includes(feature.layer.id)).length,
      renderedFillOrLine: rendered.filter((feature) => {
        const layer = map.getLayer(feature.layer.id);
        return layer?.type === "fill" || layer?.type === "line";
      }).length
    };
  });
  expect(mapState).not.toBeNull();
  expect(mapState?.styleLoaded).toBe(true);
  expect(mapState?.center[0]).toBeCloseTo(2.35, 1);
  expect(mapState?.center[1]).toBeCloseTo(46.5, 1);
  expect(mapState?.zoom).toBeCloseTo(5, 1);
  expect(mapState?.actualX).toBeCloseTo(mapState?.projectedX ?? 0, 1);
  expect(mapState?.actualY).toBeCloseTo(mapState?.projectedY ?? 0, 1);
  expect(mapState?.nativeLabelLayers ?? 0).toBeGreaterThan(0);
  expect(mapState?.renderedNativeLabels ?? 0).toBeGreaterThan(0);
  expect(mapState?.renderedFillOrLine ?? 0).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map?.areTilesLoaded() ?? false), { timeout: 20_000 })
    .toBe(true);
  const terrainAtFrance = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return map && typeof map.getTerrain === "function" ? map.getTerrain() : null;
  });

  const francePoint = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.querySourceFeatures("legal-countries")
      .find((candidate) => candidate.properties?.geo === "FR");
    if (!map || !feature) return null;
    return map.project([
      Number(feature.properties?.labelAnchorLng),
      Number(feature.properties?.labelAnchorLat)
    ]);
  });
  expect(francePoint).not.toBeNull();
  if (!francePoint) throw new Error("truth_map_france_point_missing_after_antartica_zoom");
  await page.mouse.move(francePoint.x, francePoint.y);
  await expect.poll(() => page.locator("canvas.maplibregl-canvas").getAttribute("data-truth-map-hovered-geo"), { timeout: 10_000 }).toBe("FR");
  await page.mouse.click(francePoint.x, francePoint.y);
  const popup = page.locator('[data-popup-variant="truth-map"]');
  await expect(popup).toContainText("ISO2: FR", { timeout: 15_000 });
  await expect(page.getByTestId("new-map-ai-dock")).toBeVisible();
  await popup.getByTestId("viewport-country-popup-close").click();
  await expect(popup).toBeHidden();

  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.jumpTo(0, -77, 4);
  });
  await expect(animation).toHaveAttribute("data-svg-anchor-visible", "1", { timeout: 15_000 });
  await expect(animation).toHaveAttribute("data-ascii-state", "running");
  const returnState = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const overlay = document.querySelector('[data-testid="antarctic-ascii-overlay"]');
    if (!map || !(overlay instanceof SVGSVGElement)) return null;
    const projected = map.project([0, -77]);
    return {
      expectedX: Number(projected.x.toFixed(2)),
      expectedY: Number((projected.y - 20).toFixed(2)),
      actualX: Number(overlay.dataset.svgAnchorX),
      actualY: Number(overlay.dataset.svgAnchorY),
      styleLoaded: map.isStyleLoaded(),
      tilesLoaded: map.areTilesLoaded(),
      terrain: typeof map.getTerrain === "function" ? map.getTerrain() : null
    };
  });
  expect(returnState).not.toBeNull();
  expect(returnState?.actualX).toBeCloseTo(returnState?.expectedX ?? 0, 1);
  expect(returnState?.actualY).toBeCloseTo(returnState?.expectedY ?? 0, 1);
  expect(returnState?.styleLoaded).toBe(true);
  expect(returnState?.tilesLoaded).toBe(true);
  expect(returnState?.terrain).toEqual(terrainAtFrance);
  expect(pageErrors).toEqual([]);
});

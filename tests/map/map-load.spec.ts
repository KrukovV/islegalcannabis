import { expect, test, type Page } from "@playwright/test";

const MAP_ALIGNMENT_GEOS = ["CA", "RU", "FR", "IN", "KZ", "CN", "US"] as const;

type RuntimeGuard = {
  assertNoClientErrors: () => void;
  assertNoNetworkErrors: () => void;
};

function attachRuntimeGuards(page: Page): RuntimeGuard {
  const consoleErrors: string[] = [];
  const uncaughtErrors: string[] = [];
  const networkErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  page.on("pageerror", (err) => {
    uncaughtErrors.push(String(err?.message || err));
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    const isTile = url.includes("tiles.stadiamaps.com") || url.includes("openmaptiles");
    const isApi = /\/api\//.test(url);
    if (isTile || isApi) {
      networkErrors.push(`${status} ${url}`);
    }
  });

  return {
    assertNoClientErrors: () => {
      expect(
        [...consoleErrors, ...uncaughtErrors],
        `Console/page errors detected:\n${[...consoleErrors, ...uncaughtErrors].join("\n")}`
      ).toEqual([]);
    },
    assertNoNetworkErrors: () => {
      expect(networkErrors, `Tile/API network errors detected:\n${networkErrors.join("\n")}`).toEqual([]);
    }
  };
}

async function openMapAndWaitReady(page: Page) {
  await page.goto("/");
  await page.waitForSelector(".maplibregl-canvas", { state: "visible", timeout: 20000 });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __MAP__?: { isStyleLoaded?: () => boolean };
      __MAP_DEBUG__?: { queryVisibleCountryLabels?: () => Array<{ iso2: string; label: string }> };
    };
    return Boolean(runtime.__MAP__ && runtime.__MAP_DEBUG__);
  }, undefined, { timeout: 20000 });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __MAP__?: { isStyleLoaded?: () => boolean };
      __MAP_DEBUG__?: { queryVisibleCountryLabels?: () => Array<{ iso2: string; label: string }> };
    };
    return Boolean(runtime.__MAP__?.isStyleLoaded?.());
  }, undefined, { timeout: 30000 });
  await page.waitForFunction(() => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: { queryVisibleCountryLabels?: () => Array<{ label: string; layerId: string }> };
    }).__MAP_DEBUG__;
    const labels = debug?.queryVisibleCountryLabels?.() || [];
    return labels.filter((entry) => /place_country_/.test(entry.layerId)).length >= 8;
  }, undefined, { timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function getVisibleCountryLabels(page: Page) {
  return page.evaluate(() => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: { queryVisibleCountryLabels?: () => Array<{ label: string; layerId: string }> };
    }).__MAP_DEBUG__;
    return debug?.queryVisibleCountryLabels?.() || [];
  });
}

async function getTruthCoverageDiagnostics(page: Page) {
  return page.evaluate(() => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: {
        getTruthCoverageDiagnostics?: () => {
          truthCountryRowsTotal: number;
          mapPaintedCountryRows: number;
          mapUnpaintedTruthRows: number;
          officialCoveredTruthRows: number;
          officialCoveredUnpaintedRows: number;
          greenCount: number;
          yellowCount: number;
          redCount: number;
          greyCount: number;
          medicalLikeRowsTotal: number;
          medicalLikeRowsPaintedYellow: number;
          medicalLikeRowsNotYellow: number;
          officialCoveredMedicalLikeRowsNotYellow: number;
        } | null;
      };
    }).__MAP_DEBUG__;
    return debug?.getTruthCoverageDiagnostics?.() || null;
  });
}

async function getMapTruthStatus(page: Page, geo: string) {
  return page.evaluate((geoId) => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: {
        getMapTruthStatus?: (_geo: string) => {
          geo?: string;
          mapPaintStatus?: string;
          truthLevel?: string;
          unresolvedReason?: string | null;
        } | null;
      };
    }).__MAP_DEBUG__;
    return debug?.getMapTruthStatus?.(geoId) || null;
  }, geo.toUpperCase());
}

async function hoverProjectedGeo(page: Page, geo: string) {
  const popupClose = page.locator('.maplibregl-popup-close-button').first();
  if (await popupClose.isVisible().catch(() => false)) {
    await popupClose.click({ force: true });
    await page.waitForTimeout(120);
  }
  const point = await page.evaluate((geoId) => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: { projectGeo?: (_geo: string) => { x: number; y: number } | null };
    }).__MAP_DEBUG__;
    return debug?.projectGeo?.(geoId) || null;
  }, geo.toUpperCase());
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await page.waitForTimeout(160);
  return point!;
}

async function getRuntimeInteractionState(page: Page) {
  return page.evaluate(() => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: {
        geometrySource?: string;
        hoverHitCountryIso?: string | null;
        hoverRenderedCountryIso?: string | null;
        popupCountryIso?: string | null;
        selectedCountryIso?: () => string | null;
        lastPointerTarget?: () => string | null;
      };
    }).__MAP_DEBUG__;
    return {
      geometrySource: debug?.geometrySource || null,
      hoverHitCountryIso: debug?.hoverHitCountryIso || null,
      hoverRenderedCountryIso: debug?.hoverRenderedCountryIso || null,
      popupCountryIso: debug?.popupCountryIso || null,
      selectedCountryIso: debug?.selectedCountryIso?.() || null,
      lastPointerTarget: debug?.lastPointerTarget?.() || null
    };
  });
}

async function getInteractionRuntimeDiagnostics(page: Page) {
  return page.evaluate(() => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: {
        getRuntimeDriftDiagnostics?: () => {
          centerDeltaLat: number;
          centerDeltaLng: number;
          zoomDelta: number;
          popupCountryIso: string | null;
          driftResetCount: number;
          driftResetApplied: boolean;
          normalizedLeafletZoomTarget: number;
          leafletAppliedZoom: number;
        } | null;
      };
    }).__MAP_DEBUG__;
    return debug?.getRuntimeDriftDiagnostics?.() || null;
  });
}

async function getOverlayDiagnostics(page: Page) {
  return page.evaluate(() => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: {
        getInteractionOverlayDiagnostics?: () => {
          overlayFeatureCount: number;
          uniqueIsoCount: number;
          duplicateIsoCount: number;
          worldWrapCount: number;
          outOfCanonicalBoundsCount: number;
          createdLayerCount: number;
        } | null;
        getInteractionLayerDomSummary?: () => {
          interactiveCount: number;
          pathCount: number;
          pointPanePathCount: number;
          customPanePathCount: number;
        } | null;
      };
    }).__MAP_DEBUG__;
    return {
      overlay: debug?.getInteractionOverlayDiagnostics?.() || null,
      dom: debug?.getInteractionLayerDomSummary?.() || null
    };
  });
}

async function getInteractionFeatureSummary(page: Page) {
  return page.evaluate(() => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: {
        getInteractionFeatureSummary?: () => {
          geometryCounts?: Record<string, number>;
          featureCount: number;
          uniqueIsoCount: number;
        } | null;
      };
    }).__MAP_DEBUG__;
    return debug?.getInteractionFeatureSummary?.() || null;
  });
}

async function getCanonicalGeometryDiagnostics(page: Page, geo: string) {
  return page.evaluate((geoId) => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: {
        getCanonicalGeometryDiagnostics?: (_geo: string) => {
          canonical_geometry_hash: string | null;
          fill_source_hash: string | null;
          interaction_source_hash: string | null;
          render_source_hash: string | null;
          polygon_count: number;
          ring_count: number;
          wrapped_copy_count: number;
          source_mismatch_flag: number;
          wrap_mismatch_flag: number;
          topology_loss_flag: number;
          area_loss_ratio: number;
          fill_vs_interaction_area_delta: number;
        } | null;
      };
    }).__MAP_DEBUG__;
    return debug?.getCanonicalGeometryDiagnostics?.(geoId) || null;
  }, geo.toUpperCase());
}

async function getProjectedGeoPoint(page: Page, geo: string) {
  return page.evaluate((geoId) => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: { projectGeo?: (_geo: string) => { x: number; y: number; localX: number; localY: number } | null };
    }).__MAP_DEBUG__;
    return debug?.projectGeo?.(geoId) || null;
  }, geo.toUpperCase());
}

function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function panMap(page: Page) {
  const frame = page.locator("[data-testid='map-frame']");
  const box = await frame.boundingBox();
  if (!box) throw new Error("Map frame is not visible");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.49, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function zoomMap(page: Page) {
  const frame = page.locator("[data-testid='map-frame']");
  const box = await frame.boundingBox();
  if (!box) throw new Error("Map frame is not visible");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -60);
  await page.waitForTimeout(700);
}

async function zoomOutToMin(page: Page) {
  const zoomOut = page.locator(".maplibregl-ctrl-zoom-out");
  const before = await page.evaluate(() => {
    const runtime = window as Window & {
      __MAP__?: { getZoom?: () => number; getMinZoom?: () => number; setZoom?: (_zoom: number) => void };
    };
    const map = runtime.__MAP__;
    if (!map?.getZoom || !map?.getMinZoom || !map?.setZoom) return null;
    const zoom = map.getZoom();
    const minZoom = map.getMinZoom();
    map.setZoom(minZoom);
    return { zoom, minZoom };
  });
  await page.waitForTimeout(250);
  const enabled = await zoomOut.isEnabled().catch(() => false);
  return before && !enabled && before.zoom > before.minZoom ? 1 : 0;
}

async function wheelOutUntilMinWithoutPageScroll(page: Page) {
  const frame = page.locator("[data-testid='map-frame']");
  const box = await frame.boundingBox();
  if (!box) throw new Error("Map frame is not visible");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  const samples: Array<{ step: number; zoom: number | null; scrollY: number; zoomOutDisabled: boolean }> = [];
  for (let step = 1; step <= 18; step += 1) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(120);
    const sample = await page.evaluate((currentStep) => {
      const runtime = window as Window & {
        __MAP__?: { getZoom?: () => number | null };
      };
      const zoomOut = document.querySelector<HTMLButtonElement>(".maplibregl-ctrl-zoom-out");
      return {
        step: currentStep,
        zoom: runtime.__MAP__?.getZoom?.() ?? null,
        scrollY: window.scrollY,
        zoomOutDisabled: zoomOut?.disabled === true
      };
    }, step);
    samples.push(sample);
    if (sample.zoomOutDisabled) break;
  }
  await page.waitForTimeout(800);
  return samples;
}

async function openPopupForGeo(page: Page, geo: string) {
  const opened = await page.evaluate((geoId) => {
    const runtime = window as Window & {
      __MAP__?: { jumpTo?: (_opts: { center: [number, number]; zoom?: number }) => void; getZoom?: () => number };
      __MAP_DEBUG__?: {
        getGeoLngLat?: (_geo: string) => { lng: number; lat: number } | null;
        openPopupForGeo?: (_geo: string) => boolean;
      };
    };
    const point = runtime.__MAP_DEBUG__?.getGeoLngLat?.(geoId);
    if (!point || !runtime.__MAP__?.jumpTo) return false;
    const currentZoom = runtime.__MAP__.getZoom?.() || 2;
    runtime.__MAP__.jumpTo({ center: [point.lng, point.lat], zoom: Math.max(currentZoom, 2.4) });
    return runtime.__MAP_DEBUG__?.openPopupForGeo?.(geoId) || false;
  }, geo.toUpperCase());
  await page.waitForTimeout(600);

  if (!opened) return null;

  const point = await page.evaluate((geoId) => {
    const debug = (window as Window & {
      __MAP_DEBUG__?: { projectGeo?: (_geo: string) => { x: number; y: number } | null };
    }).__MAP_DEBUG__;
    return debug?.projectGeo?.(geoId) || null;
  }, geo.toUpperCase());
  return point || { x: 0, y: 0 };
}

test.describe("MapLibre map UI", () => {
  test("loads MapLibre map DOM, provider labels, and legend layout", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);

    await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
    await expect(page.locator("[data-testid='map-legend']")).toBeVisible();
    await expect(page.locator(".maplibregl-ctrl-top-right")).toBeVisible();
    await expect(page.locator("[data-testid='location-status-badge']")).toHaveCount(0);
    await expect(page.locator("[data-testid='me-debug']")).toHaveCount(0);
    await expect(page.locator("[data-testid='map-load-warning']")).toHaveCount(0);
    await expect(page.locator("[data-testid='map-frame']")).toHaveScreenshot("map-container.png", {
      animations: "disabled"
    });

    const labels = await getVisibleCountryLabels(page);
    expect(labels.some((entry) => /Russia/i.test(entry.label))).toBe(true);
    expect(labels.some((entry) => /China/i.test(entry.label))).toBe(true);
    expect(labels.some((entry) => /United States/i.test(entry.label) || /Canada/i.test(entry.label))).toBe(true);
    expect(labels.filter((entry) => /place_country_/.test(entry.layerId)).length).toBeGreaterThanOrEqual(8);
    expect(labels.every((entry) => /place_country_/.test(entry.layerId))).toBe(true);

    const truthCoverage = await getTruthCoverageDiagnostics(page);
    expect(truthCoverage).not.toBeNull();
    expect(truthCoverage!.truthCountryRowsTotal).toBeGreaterThanOrEqual(200);
    expect(truthCoverage!.mapPaintedCountryRows).toBeGreaterThanOrEqual(200);
    expect(truthCoverage!.mapUnpaintedTruthRows).toBe(0);
    expect(truthCoverage!.officialCoveredTruthRows).toBeGreaterThan(0);
    expect(truthCoverage!.officialCoveredUnpaintedRows).toBe(0);
    expect(truthCoverage!.greenCount).toBeGreaterThan(0);
    expect(truthCoverage!.yellowCount).toBeGreaterThan(0);
    expect(truthCoverage!.redCount).toBeGreaterThan(0);
    expect(truthCoverage!.greyCount).toBeGreaterThan(0);
    expect(truthCoverage!.medicalLikeRowsTotal).toBeGreaterThan(0);
    expect(truthCoverage!.medicalLikeRowsPaintedYellow).toBeGreaterThan(0);
    expect(truthCoverage!.medicalLikeRowsNotYellow).toBe(0);
    expect(truthCoverage!.officialCoveredMedicalLikeRowsNotYellow).toBe(0);

    const overlayDiagnostics = await getOverlayDiagnostics(page);
    expect(overlayDiagnostics.overlay).not.toBeNull();
    expect(overlayDiagnostics.overlay!.overlayFeatureCount).toBeGreaterThanOrEqual(180);
    expect(overlayDiagnostics.overlay!.overlayFeatureCount).toBeLessThanOrEqual(220);
    expect(overlayDiagnostics.overlay!.uniqueIsoCount).toBeGreaterThanOrEqual(180);
    expect(overlayDiagnostics.overlay!.uniqueIsoCount).toBeLessThanOrEqual(220);
    expect(overlayDiagnostics.overlay!.duplicateIsoCount).toBe(0);
    expect(overlayDiagnostics.overlay!.worldWrapCount).toBe(0);
    expect(overlayDiagnostics.overlay!.outOfCanonicalBoundsCount).toBe(0);
    expect(overlayDiagnostics.dom?.interactiveCount || 0).toBeGreaterThanOrEqual(180);
    expect(overlayDiagnostics.dom?.interactiveCount || 0).toBeLessThanOrEqual(280);
    const interactionFeatureSummary = await getInteractionFeatureSummary(page);
    expect(interactionFeatureSummary).not.toBeNull();
    expect(interactionFeatureSummary?.geometryCounts?.Point || 0).toBe(0);
    const canadaGeometry = await getCanonicalGeometryDiagnostics(page, "CA");
    expect(canadaGeometry).not.toBeNull();
    expect(canadaGeometry?.source_mismatch_flag).toBe(0);
    expect(canadaGeometry?.wrap_mismatch_flag).toBe(0);
    expect(canadaGeometry?.topology_loss_flag).toBe(0);
    expect(canadaGeometry?.polygon_count || 0).toBeGreaterThan(0);
    expect(canadaGeometry?.ring_count || 0).toBeGreaterThan(0);
    expect(canadaGeometry?.canonical_geometry_hash).toBe(canadaGeometry?.interaction_source_hash);
    expect(canadaGeometry?.fill_source_hash).toBe(canadaGeometry?.render_source_hash);

    const legendBox = await page.locator("[data-testid='map-legend']").boundingBox();
    const zoomBox = await page.locator(".maplibregl-ctrl-top-right").boundingBox();
    const frameBox = await page.locator("[data-testid='map-frame']").boundingBox();
    expect(legendBox).not.toBeNull();
    expect(zoomBox).not.toBeNull();
    expect(frameBox).not.toBeNull();
    expect(boxesOverlap(legendBox!, zoomBox!)).toBe(false);
    expect(legendBox!.y).toBeGreaterThan(frameBox!.y + frameBox!.height / 2);

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });

  test("keeps territory geos paintable on the live map even without country truth rows", async ({ page }) => {
    await openMapAndWaitReady(page);

    for (const geo of ["PR", "FK", "AQ", "NC"]) {
      const status = await getMapTruthStatus(page, geo);
      const geometryDiagnostics = await getCanonicalGeometryDiagnostics(page, geo);
      expect(status).not.toBeNull();
      expect(status?.mapPaintStatus).toBe("UNKNOWN");
      expect(status?.truthLevel).toBe("UNKNOWN");
      expect(geometryDiagnostics).not.toBeNull();
      expect((geometryDiagnostics?.polygon_count || 0) + (geometryDiagnostics?.source_feature_count || 0)).toBeGreaterThan(0);
    }
  });

  test("renders USA state legality fills on the MapLibre map with the shared palette", async ({ page }) => {
    test.slow();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='map-frame']", { timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.__MAP__), undefined, { timeout: 30000 });
    await page.waitForFunction(() => {
      const map = (window as Window & { __MAP__?: import("maplibre-gl").Map }).__MAP__;
      return Boolean(
        map?.getSource?.("ilc-state-choropleth") &&
        map?.getLayer?.("ilc-state-choropleth-fill") &&
        map?.isStyleLoaded?.()
      );
    }, undefined, { timeout: 30000 });
    await page.evaluate(() => {
      const map = (window as Window & { __MAP__?: import("maplibre-gl").Map }).__MAP__;
      map?.fitBounds?.(
        [
          [-125, 31],
          [-113, 43]
        ],
        { padding: 72, duration: 0, maxZoom: 4.2 }
      );
    });
    await page.waitForTimeout(1500);

    const renderedStates = await page.evaluate(() => {
      const map = (window as Window & { __MAP__?: import("maplibre-gl").Map }).__MAP__;
      if (!map) return null;
      const features = map.queryRenderedFeatures(undefined, {
        layers: ["ilc-state-choropleth-fill", "ilc-state-choropleth-line"]
      });
      const uniqueGeos = Array.from(
        new Set(
          features
            .map((feature) => String(feature.properties?.geo || "").toUpperCase())
            .filter((geo) => /^US-[A-Z]{2}$/.test(geo))
        )
      );
      const california = features.find((feature) => String(feature.properties?.geo || "").toUpperCase() === "US-CA");
      const texas = features.find((feature) => String(feature.properties?.geo || "").toUpperCase() === "US-TX");
      return {
        renderedCount: features.length,
        uniqueStateCount: uniqueGeos.length,
        californiaFillColor: String(california?.properties?.fillColor || ""),
        californiaPaintStatus: String(california?.properties?.mapPaintStatus || ""),
        texasFillColor: String(texas?.properties?.fillColor || ""),
        texasPaintStatus: String(texas?.properties?.mapPaintStatus || "")
      };
    });

    expect(renderedStates).not.toBeNull();
    expect(renderedStates?.renderedCount || 0).toBeGreaterThan(0);
    expect(renderedStates?.uniqueStateCount || 0).toBeGreaterThanOrEqual(5);
    expect(renderedStates?.californiaPaintStatus).toBe("LEGAL_OR_DECRIM");
    expect(renderedStates?.californiaFillColor).toBe("#7bcf9f");
    expect(renderedStates?.texasPaintStatus).toBe("LIMITED_OR_MEDICAL");
    expect(renderedStates?.texasFillColor).toBe("#f4c878");
  });

  test("routes hover to individual US states instead of the parent US polygon", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='map-frame']", { timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.__MAP__ && window.__MAP_DEBUG__), undefined, { timeout: 30000 });
    await page.waitForFunction(() => {
      const map = (window as Window & { __MAP__?: import("maplibre-gl").Map }).__MAP__;
      return Boolean(
        map?.getSource?.("ilc-state-choropleth") &&
        map?.getLayer?.("ilc-state-choropleth-fill") &&
        map?.isStyleLoaded?.()
      );
    }, undefined, { timeout: 30000 });
    await page.evaluate(() => {
      const map = (window as Window & { __MAP__?: import("maplibre-gl").Map }).__MAP__;
      map?.fitBounds?.(
        [
          [-125, 25],
          [-66, 50]
        ],
        { padding: 64, duration: 0, maxZoom: 4.4 }
      );
    });
    await page.waitForTimeout(1500);

    const texasScreenPoint = await page.evaluate(() => {
      const map = (window as Window & { __MAP__?: import("maplibre-gl").Map }).__MAP__;
      if (!map) return null;
      const features = map.queryRenderedFeatures(undefined, {
        layers: ["ilc-state-choropleth-fill", "ilc-state-choropleth-line"]
      });
      const texas = features.find((feature) => String(feature.properties?.geo || "").toUpperCase() === "US-TX");
      if (!texas) return null;
      const coords: Array<[number, number]> = [];
      const collect = (value: unknown) => {
        if (!Array.isArray(value)) return;
        if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
          coords.push([value[0], value[1]]);
          return;
        }
        value.forEach(collect);
      };
      collect(texas.geometry?.coordinates);
      if (coords.length === 0) return null;
      const lngs = coords.map((pair) => pair[0]);
      const lats = coords.map((pair) => pair[1]);
      const point = map.project([
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
        (Math.min(...lats) + Math.max(...lats)) / 2
      ]);
      return { x: Math.round(point.x), y: Math.round(point.y) };
    });

    expect(texasScreenPoint).not.toBeNull();
    const mapFrame = page.locator("[data-testid='map-frame']");
    const box = await mapFrame.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move((box?.x || 0) + (texasScreenPoint?.x || 0), (box?.y || 0) + (texasScreenPoint?.y || 0));
    await page.waitForTimeout(300);

    const hoverRuntime = await page.evaluate(() => {
      const runtime = (window as Window & { __MAP_DEBUG__?: Record<string, unknown> }).__MAP_DEBUG__;
      const diagnostics = (runtime?.getRuntimeDriftDiagnostics as (() => {
        hoverHitCountryIso?: string | null;
        hoverRenderedCountryIso?: string | null;
        syncReason?: string | null;
      }) | undefined)?.();
      const map = (window as Window & { __MAP__?: import("maplibre-gl").Map }).__MAP__;
      return {
        hoverHitCountryIso:
          (runtime?.hoveredCountryIso as (() => string | null) | undefined)?.() || diagnostics?.hoverHitCountryIso || null,
        hoverRenderedCountryIso: diagnostics?.hoverRenderedCountryIso || null,
        lastPointerTarget: (runtime?.lastPointerTarget as (() => string | null) | undefined)?.() || null,
        syncReason: diagnostics?.syncReason || null,
        hoverLineWidth: map?.getPaintProperty?.("ilc-state-choropleth-hover-line", "line-width") || null,
        hoverLineOpacity: map?.getPaintProperty?.("ilc-state-choropleth-hover-line", "line-opacity") || null
      };
    });

    expect(hoverRuntime.hoverHitCountryIso).toBe("US-TX");
    expect(hoverRuntime.hoverRenderedCountryIso).toBe("US-TX");
    expect(hoverRuntime.lastPointerTarget).toBe("maplibre:US-TX");
    expect(hoverRuntime.syncReason).not.toBe("render");
    expect(hoverRuntime.hoverLineWidth).toBe(1.15);
    expect(hoverRuntime.hoverLineOpacity).toBe(0.62);
  });

  test("keeps provider labels after pan and zoom without app label overlays or re-init", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);

    await expect(page.locator(".countryLabelMarker")).toHaveCount(0);
    await expect(page.locator("[data-testid='startup-label-overlay']")).toHaveCount(0);

    const labelsBefore = await getVisibleCountryLabels(page);
    expect(labelsBefore.filter((entry) => /Russia/i.test(entry.label))).toHaveLength(1);

    const initCount = await page.evaluate(() => {
      return (window as Window & { __MAP_INIT_COUNT__?: number }).__MAP_INIT_COUNT__ || 0;
    });
    expect(initCount).toBe(1);

    await panMap(page);
    await zoomMap(page);

    await expect(page.locator("[data-testid='map-frame']")).toHaveScreenshot("map-container-after-pan-zoom.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.04
    });

    const labelsAfter = await getVisibleCountryLabels(page);
    expect(labelsAfter.some((entry) => /Russia/i.test(entry.label))).toBe(true);
    expect(labelsAfter.some((entry) => /China/i.test(entry.label))).toBe(true);
    expect(labelsAfter.filter((entry) => /place_country_/.test(entry.layerId)).length).toBeGreaterThanOrEqual(8);
    expect(labelsAfter.every((entry) => /place_country_/.test(entry.layerId))).toBe(true);

    const initCountAfter = await page.evaluate(() => {
      return (window as Window & { __MAP_INIT_COUNT__?: number }).__MAP_INIT_COUNT__ || 0;
    });
    expect(initCountAfter).toBe(1);

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });

  test("allows zooming out to Antarctica and blocks minus only at full min zoom", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);

    const zoomOut = page.locator(".maplibregl-ctrl-zoom-out");
    await expect(zoomOut).toBeVisible();
    await expect(zoomOut).toBeEnabled();

    const clicks = await zoomOutToMin(page);
    expect(clicks).toBeGreaterThan(0);
    await expect(zoomOut).toBeDisabled();

    await expect(page.locator("[data-testid='map-frame']")).toHaveScreenshot("map-container-min-zoom-antarctica.png", {
      animations: "disabled"
    });

    const frame = page.locator("[data-testid='map-frame']");
    const frameBox = await frame.boundingBox();
    expect(frameBox).not.toBeNull();
    await page.mouse.move(frameBox!.x + frameBox!.width * 0.5, frameBox!.y + frameBox!.height * 0.5);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(400);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeGreaterThan(scrollBefore);

    const zoomValue = await page.evaluate(() => {
      return (window as Window & { __MAP__?: { getZoom?: () => number } }).__MAP__?.getZoom?.() ?? null;
    });
    expect(zoomValue).not.toBeNull();
    expect(Number(zoomValue)).toBeCloseTo(0.45, 2);

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });

  test("keeps wheel zoom-out on the map until min zoom before handing scroll back to the page", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    const samples = await wheelOutUntilMinWithoutPageScroll(page);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((sample) => sample.scrollY === 0)).toBe(true);

    const settled = await page.evaluate(() => {
      const runtime = window as Window & {
        __MAP__?: { getZoom?: () => number | null; getMinZoom?: () => number | null };
      };
      const zoomOut = document.querySelector<HTMLButtonElement>(".maplibregl-ctrl-zoom-out");
      return {
        zoom: runtime.__MAP__?.getZoom?.() ?? null,
        minZoom: runtime.__MAP__?.getMinZoom?.() ?? null,
        scrollY: window.scrollY,
        zoomOutDisabled: zoomOut?.disabled === true
      };
    });
    expect(settled.zoomOutDisabled).toBe(true);
    expect(settled.scrollY).toBe(0);
    expect(Number(settled.zoom)).toBeCloseTo(Number(settled.minZoom), 2);

    const frame = page.locator("[data-testid='map-frame']");
    const frameBox = await frame.boundingBox();
    expect(frameBox).not.toBeNull();
    await page.mouse.move(frameBox!.x + frameBox!.width * 0.5, frameBox!.y + frameBox!.height * 0.5);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(500);
    const scrollAfterHandoff = await page.evaluate(() => window.scrollY);
    expect(scrollAfterHandoff).toBeGreaterThan(0);

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });

  test("renders vector business overlays without app-owned country label layers", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);

    const overlayReady = await page.evaluate(() => {
      const map = (window as Window & {
        __MAP__?: { getLayer?: (_id: string) => unknown; getSource?: (_id: string) => unknown };
      }).__MAP__;
      return Boolean(
        map?.getSource?.("ilc-choropleth") &&
          map?.getLayer?.("ilc-choropleth-fill") &&
          map?.getLayer?.("place_country_major") &&
          !map?.getLayer?.("ilc-choropleth-hover-line") &&
          !map?.getLayer?.("ilc-choropleth-selected-line") &&
          !map?.getSource?.("ilc-country-labels") &&
          !map?.getLayer?.("ilc-country-label-major") &&
          !map?.getLayer?.("ilc-country-label-other")
      );
    });
    expect(overlayReady).toBe(true);

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });

  test("opens popup on rendered choropleth feature", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);

    const opened = await openPopupForGeo(page, "CX");
    expect(opened).not.toBeNull();

    const popupContent = page.locator(".maplibregl-popup-content").first();
    await expect(popupContent).toBeVisible();
    const text = (await popupContent.textContent())?.trim() || "";
    expect(text.length).toBeGreaterThan(0);

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });

  test("keeps interaction overlay drift near zero and popup anchors inside the visible frame", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);

    const frame = await page.locator("[data-testid='map-frame']").boundingBox();
    expect(frame).not.toBeNull();

    const initialDiagnostics = await getInteractionRuntimeDiagnostics(page);
    expect(initialDiagnostics).not.toBeNull();
    expect(Math.abs(initialDiagnostics!.zoomDelta)).toBeLessThanOrEqual(0.001);
    expect(initialDiagnostics!.normalizedLeafletZoomTarget - initialDiagnostics!.mapLibreZoom).toBeCloseTo(1, 3);
    expect(initialDiagnostics!.leafletAppliedZoom).toBeCloseTo(initialDiagnostics!.normalizedLeafletZoomTarget, 3);
    expect(Math.abs(initialDiagnostics!.centerDeltaLat)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(initialDiagnostics!.centerDeltaLng)).toBeLessThanOrEqual(0.35);
    const initialOverlayDiagnostics = await getOverlayDiagnostics(page);
    expect(initialOverlayDiagnostics.overlay?.duplicateIsoCount).toBe(0);
    expect(initialOverlayDiagnostics.overlay?.worldWrapCount).toBe(0);
    expect(initialOverlayDiagnostics.dom?.interactiveCount || 0).toBeLessThanOrEqual(280);

    for (const geo of MAP_ALIGNMENT_GEOS) {
      const point = await getProjectedGeoPoint(page, geo);
      expect(point, `Missing projected point for ${geo}`).not.toBeNull();
      expect(point!.localX, `Projected X for ${geo} should stay inside map viewport`).toBeGreaterThan(0);
      expect(point!.localX, `Projected X for ${geo} should stay inside map viewport`).toBeLessThan(frame!.width);
      expect(point!.localY, `Projected Y for ${geo} should stay inside map viewport`).toBeGreaterThan(0);
      expect(point!.localY, `Projected Y for ${geo} should stay inside map viewport`).toBeLessThan(frame!.height);
      await page.mouse.move(point!.x, point!.y);
      await page.waitForTimeout(120);
      const state = await getRuntimeInteractionState(page);
      expect(state.hoverHitCountryIso).toBe(geo);
      expect(state.hoverRenderedCountryIso).toBe(geo);
      expect(state.lastPointerTarget).toContain(`maplibre:${geo}`);
      const geometryDiagnostics = await getCanonicalGeometryDiagnostics(page, geo);
      expect(geometryDiagnostics, `Missing canonical geometry diagnostics for ${geo}`).not.toBeNull();
      expect(geometryDiagnostics?.source_mismatch_flag).toBe(0);
      expect(geometryDiagnostics?.wrap_mismatch_flag).toBe(0);
      expect(geometryDiagnostics?.topology_loss_flag).toBe(0);
      expect(geometryDiagnostics?.canonical_geometry_hash).toBe(geometryDiagnostics?.interaction_source_hash);
      expect(geometryDiagnostics?.fill_source_hash).toBe(geometryDiagnostics?.render_source_hash);
      expect(geometryDiagnostics?.area_loss_ratio || 0).toBeLessThanOrEqual(0.02);
    }

    const opened = await openPopupForGeo(page, "CA");
    expect(opened).not.toBeNull();
    await expect(page.locator(".maplibregl-popup-content").first()).toContainText("Canada");

    const popupDiagnostics = await getInteractionRuntimeDiagnostics(page);
    expect(popupDiagnostics?.popupCountryIso).toBe("CA");

    await panMap(page);
    await zoomMap(page);

    const afterMoveDiagnostics = await getInteractionRuntimeDiagnostics(page);
    expect(afterMoveDiagnostics).not.toBeNull();
    expect(Math.abs(afterMoveDiagnostics!.zoomDelta)).toBeLessThanOrEqual(0.001);
    expect(afterMoveDiagnostics!.normalizedLeafletZoomTarget - afterMoveDiagnostics!.mapLibreZoom).toBeCloseTo(1, 3);
    expect(afterMoveDiagnostics!.leafletAppliedZoom).toBeCloseTo(afterMoveDiagnostics!.normalizedLeafletZoomTarget, 3);
    expect(Math.abs(afterMoveDiagnostics!.centerDeltaLat)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(afterMoveDiagnostics!.centerDeltaLng)).toBeLessThanOrEqual(0.35);
    const afterMoveOverlayDiagnostics = await getOverlayDiagnostics(page);
    expect(afterMoveOverlayDiagnostics.overlay?.duplicateIsoCount).toBe(0);
    expect(afterMoveOverlayDiagnostics.overlay?.worldWrapCount).toBe(0);
    expect(afterMoveOverlayDiagnostics.dom?.interactiveCount || 0).toBeLessThanOrEqual(280);
    const popupAfterMove = await openPopupForGeo(page, "CA");
    expect(popupAfterMove).not.toBeNull();
    const afterMoveState = await getRuntimeInteractionState(page);
    expect(afterMoveState.popupCountryIso).toBe("CA");
    expect(afterMoveState.selectedCountryIso).toBe("CA");

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });

  test("uses the SSOT resolver name for CX popup header", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);

    const opened = await openPopupForGeo(page, "CX");
    expect(opened).not.toBeNull();

    const popupContent = page.locator(".maplibregl-popup-content").first();
    await expect(popupContent).toBeVisible();
    await expect(popupContent).toContainText("Christmas Island");
    await expect(popupContent).not.toHaveText(/^\s*CX\s*$/);
    await expect(popupContent).toContainText("ISO2: CX");

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });

  test("keeps hover and click aligned to MapLibre rendered countries for CA, RU, FR, IN, KZ, CN, and US", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);

    for (const geo of MAP_ALIGNMENT_GEOS) {
      const point = await hoverProjectedGeo(page, geo);
      const hoverState = await getRuntimeInteractionState(page);
      expect(hoverState.hoverHitCountryIso).toBe(geo);
      expect(hoverState.hoverRenderedCountryIso).toBe(geo);
      expect(hoverState.lastPointerTarget).toContain(geo);

      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(200);
      const clickedState = await getRuntimeInteractionState(page);
      expect(clickedState.popupCountryIso).toBe(geo);
      expect(clickedState.selectedCountryIso).toBe(geo);
      const geometryDiagnostics = await getCanonicalGeometryDiagnostics(page, geo);
      expect(geometryDiagnostics?.source_mismatch_flag).toBe(0);
      expect(geometryDiagnostics?.wrap_mismatch_flag).toBe(0);
      expect(geometryDiagnostics?.topology_loss_flag).toBe(0);
      expect(geometryDiagnostics?.canonical_geometry_hash).toBe(geometryDiagnostics?.interaction_source_hash);
      expect(geometryDiagnostics?.fill_source_hash).toBe(geometryDiagnostics?.render_source_hash);
      expect(geometryDiagnostics?.area_loss_ratio || 0).toBeLessThanOrEqual(0.02);
    }

    const overlayDiagnostics = await getOverlayDiagnostics(page);
    expect(overlayDiagnostics.overlay?.duplicateIsoCount).toBe(0);
    expect(overlayDiagnostics.overlay?.worldWrapCount).toBe(0);
    expect(overlayDiagnostics.dom?.interactiveCount || 0).toBeLessThanOrEqual(280);

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });

  test("keeps geojson geometry source by default and preserves Cuba hover mapping", async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await openMapAndWaitReady(page);

    const initialState = await getRuntimeInteractionState(page);
    expect(initialState.geometrySource).toBe("geojson");

    const cubaPoint = await hoverProjectedGeo(page, "CU");
    const cubaState = await getRuntimeInteractionState(page);
    expect(cubaState.geometrySource).toBe("geojson");
    expect(cubaState.hoverHitCountryIso).toBe("CU");
    expect(cubaState.hoverRenderedCountryIso).toBe("CU");

    await page.mouse.click(cubaPoint.x, cubaPoint.y);
    await page.waitForTimeout(200);
    const clickedState = await getRuntimeInteractionState(page);
    expect(clickedState.popupCountryIso).toBe("CU");
    expect(clickedState.selectedCountryIso).toBe("CU");

    guard.assertNoNetworkErrors();
    guard.assertNoClientErrors();
  });
});

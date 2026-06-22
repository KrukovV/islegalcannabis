import { expect, test, type Page } from "playwright/test";
import fs from "node:fs";
import path from "node:path";

type LayerId = "legal-fill" | "us-states-fill";

type RuntimeJurisdiction = {
  iso2?: string;
  geo?: string;
  type?: "country" | "state";
  parentCountry?: {
    code?: string;
    name: string;
  };
  coordinates?: {
    lng: number;
    lat: number;
  };
};

type MatrixResult = {
  geo: string;
  layer: LayerId;
  status: "captured" | "no-feature" | "no-popup";
  actualIso2?: string | null;
  sectionCount?: number;
  sectionHeadings?: string[];
  sectionSparse?: boolean;
  missingJurisdictionSection?: boolean;
  openMode?: "click" | "debug";
};

const POPUP_MATRIX_DIR = path.resolve(process.cwd(), "..", "..", "QA", "local", "popup-matrix");
const NEW_MAP_ROUTE = "/new-map?qa=1";
const COUNTRY_CLICK_LAYERS = ["legal-territory-label", "legal-territory-hitbox", "legal-point", "legal-fill"] as const;

const FEATURE_VIEW_BY_GEO: Record<string, { center: [number, number]; zoom: number }> = {
  FR: { center: [2.35, 46.4], zoom: 3.9 },
  JP: { center: [138.2, 37.5], zoom: 4.4 },
  IS: { center: [-18.6, 65.1], zoom: 4.5 },
  "US-CA": { center: [-119.5, 37.25], zoom: 5.4 }
};

function getLayerForGeo(geo: string): LayerId {
  return geo.startsWith("US-") ? "us-states-fill" : "legal-fill";
}

function getJurisdictionView(
  geo: string,
  coordinates?: RuntimeJurisdiction["coordinates"] | null
): { center: [number, number]; zoom: number } | null {
  if (coordinates && Number.isFinite(coordinates.lng) && Number.isFinite(coordinates.lat)) {
    return {
      center: [coordinates.lng, coordinates.lat],
      zoom: geo.startsWith("US-") ? 5.8 : 4
    };
  }
  return FEATURE_VIEW_BY_GEO[geo] || null;
}

function isCountryGeo(geo: string) {
  return /^[A-Z]{2}$/.test(String(geo || "").trim().toUpperCase());
}

async function ensureUsStatesLayerLoaded(page: Page) {
  await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getSource: (_id: string) => { setData: (_url: string) => void } | undefined;
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    const source = map?.getSource("us-states");
    if (!source) return;
    source.setData("/api/new-map/us-states");
  });
}

function waitForMapReady(page: Page) {
  return page.waitForFunction(() => {
    return document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1";
  }, { timeout: 20_000 });
}

async function ensureRuntimeMapReady(page: Page) {
  await waitForMapReady(page);
  await page.waitForFunction(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    return Boolean(map && typeof map.isStyleLoaded === "function" && map.isStyleLoaded());
  }, { timeout: 20_000 });
}

async function focusJurisdiction(page: Page, geo: string, coordinates?: RuntimeJurisdiction["coordinates"] | null) {
  const view = getJurisdictionView(geo, coordinates);
  if (!view) return;

  await page.evaluate(({ center, zoom }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          jumpTo: (_options: { center: [number, number]; zoom: number }) => void;
        } | null;
      };
    };
    host.__NEW_MAP_DEBUG__?.map?.jumpTo({ center, zoom });
  }, view);
  const isMatrixRun = process.env.NEW_MAP_POPUP_MATRIX_ALL === "1";
  await page.waitForTimeout(isMatrixRun ? 150 : 450);
}

async function setSelectedGeo(page: Page, geo: string) {
  const isMatrixRun = process.env.NEW_MAP_POPUP_MATRIX_ALL === "1";
  await page.evaluate((targetGeo) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        setSelectedGeo?: (_geo: string | null) => void;
      };
    };
    host.__NEW_MAP_DEBUG__?.setSelectedGeo?.(targetGeo);
  }, geo);
  await page.waitForTimeout(isMatrixRun ? 150 : 300);
}

async function waitForFeature(
  page: Page,
  geo: string,
  layerId: LayerId,
  preferredView: { center: [number, number]; zoom: number } | null,
  options?: { timeoutMs?: number }
) {
  const timeout = options?.timeoutMs ?? 10_000;
  const targetLayers = layerId === "legal-fill" ? COUNTRY_CLICK_LAYERS : [layerId];
  await page.waitForFunction(
    ({ targetIso, targetLayers, preferredView }) => {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: {
            getCanvas: () => HTMLCanvasElement;
            queryRenderedFeatures: (
              _point: [number, number],
              _options?: { layers?: string[] }
            ) => Array<{ properties?: Record<string, unknown>; id?: string | number }>;
          } | null;
        };
      };
      const map = host.__NEW_MAP_DEBUG__?.map;
      if (!map) return false;

      const rect = map.getCanvas().getBoundingClientRect();
      const searchWindows: Array<{ startX: number; endX: number; startY: number; endY: number; step: number }> = [];

      if (preferredView) {
        const projected = map.project({ lng: preferredView.center[0], lat: preferredView.center[1] });
        searchWindows.push({
          startX: Math.max(24, projected.x - 180),
          endX: Math.min(rect.width - 24, projected.x + 180),
          startY: Math.max(24, projected.y - 140),
          endY: Math.min(rect.height - 24, projected.y + 140),
          step: 12
        });
      }

      searchWindows.push({
        startX: 40,
        endX: rect.width - 40,
        startY: 40,
        endY: rect.height - 40,
        step: 24
      });

      for (const window of searchWindows) {
        for (let y = window.startY; y < window.endY; y += window.step) {
          for (let x = window.startX; x < window.endX; x += window.step) {
            let feature: { properties?: Record<string, unknown>; id?: string | number } | null = null;
            for (const targetLayer of targetLayers) {
              feature = map.queryRenderedFeatures([x, y], { layers: [targetLayer] })[0] ?? null;
              if (feature) break;
            }
            if (!feature) continue;
            const props = feature.properties || {};
            const candidates = [
              props.geo,
              props.iso2,
              props.iso_a2,
              props.ISO_A2,
              feature.id
            ]
              .map((value) => String(value || "").toUpperCase())
              .filter(Boolean);
            if (candidates.includes(targetIso)) {
              return true;
            }
          }
        }
      }

      return false;
    },
    { targetIso: geo, targetLayers, preferredView },
    { timeout }
  );
}

async function findFeaturePoint(
  page: Page,
  geo: string,
  layerId: LayerId,
  preferredView: { center: [number, number]; zoom: number } | null
) {
  return page.evaluate(({ targetIso, targetLayerId, preferredView }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
          queryRenderedFeatures: (
            _point: [number, number],
            _options?: { layers?: string[] }
          ) => Array<{ properties?: Record<string, unknown>; id?: string | number }>;
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) return null;

    const rect = map.getCanvas().getBoundingClientRect();
    const searchWindows: Array<{ startX: number; endX: number; startY: number; endY: number; step: number }> = [];
    const targetLayers = targetLayerId === "legal-fill" ? ["legal-territory-label", "legal-territory-hitbox", "legal-point", "legal-fill"] : [targetLayerId];

    if (preferredView) {
      const projected = map.project({ lng: preferredView.center[0], lat: preferredView.center[1] });
      searchWindows.push({
        startX: Math.max(24, projected.x - 180),
        endX: Math.min(rect.width - 24, projected.x + 180),
        startY: Math.max(24, projected.y - 140),
        endY: Math.min(rect.height - 24, projected.y + 140),
        step: 10
      });
    }

    searchWindows.push({
      startX: 40,
      endX: rect.width - 40,
      startY: 40,
      endY: rect.height - 40,
      step: 12
    });

    for (const window of searchWindows) {
      for (let y = window.startY; y < window.endY; y += window.step) {
        for (let x = window.startX; x < window.endX; x += window.step) {
          let feature: { properties?: Record<string, unknown>; id?: string | number } | null = null;
          for (const layer of targetLayers) {
            feature = map.queryRenderedFeatures([x, y], { layers: [layer] })[0] ?? null;
            if (feature) break;
          }
          if (!feature) continue;
          const props = feature.properties || {};
          const candidates = [
            props.geo,
            props.iso2,
            props.iso_a2,
            props.ISO_A2,
            feature.id
          ]
            .map((value) => String(value || "").toUpperCase())
            .filter(Boolean);
          if (candidates.includes(targetIso)) {
            return { x, y };
          }
        }
      }
    }

    return null;
  }, { targetIso: geo, targetLayerId: layerId, preferredView });
}

async function gatherPopupCoverage(page: Page) {
  const popup = page.locator('[data-testid="new-map-country-popup"]');
  if (!(await popup.isVisible().catch(() => false))) {
    return { sectionCount: 0, sectionHeadings: [] as string[] };
  }
  const sectionHeadings = await page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]');
    if (!popup) return [];
    return Array.from(popup.querySelectorAll("section"))
      .map((section) => {
        const heading = section.querySelector("div");
        return heading?.textContent?.trim() || "";
      })
      .filter((heading) => heading.length > 0);
  });
  return {
    sectionCount: sectionHeadings.length,
    sectionHeadings
  };
}

async function clickFeature(page: Page, geo: string, layerId: LayerId, preferredView: { center: [number, number]; zoom: number } | null) {
  const point = await findFeaturePoint(page, geo, layerId, preferredView);
  expect(point).not.toBeNull();
  if (!point) return;

  await page.evaluate(({ x, y, targetLayerId }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          unproject: (_point: [number, number]) => { lng: number; lat: number };
          queryRenderedFeatures: (
            _point: [number, number],
            _options?: { layers?: string[] }
          ) => Array<{ properties?: Record<string, unknown>; id?: string | number }>;
          fire: (_type: string, _event: Record<string, unknown>) => void;
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) return;
    const features = map.queryRenderedFeatures([x, y], { layers: [targetLayerId] });
    const lngLat = map.unproject([x, y]);
    map.fire("click", {
      point: { x, y },
      lngLat,
      features,
      originalEvent: { type: "click" }
    });
  }, { ...point, targetLayerId: layerId });
}

async function hoverFeature(page: Page, geo: string, layerId: LayerId, preferredView: { center: [number, number]; zoom: number } | null) {
  const point = await findFeaturePoint(page, geo, layerId, preferredView);
  expect(point).not.toBeNull();
  if (!point) throw new Error(`NO_FEATURE_POINT:${geo}:${layerId}`);

  const canvasOffset = await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
        } | null;
      };
    };
    const rect = host.__NEW_MAP_DEBUG__?.map?.getCanvas().getBoundingClientRect();
    return {
      left: rect?.left || 0,
      top: rect?.top || 0
    };
  });

  await page.mouse.move(canvasOffset.left + point.x, canvasOffset.top + point.y);
}

function getPopupLabel(page: Page) {
  return page.locator('[data-testid="new-map-country-popup"]');
}

async function loadRuntimeCardIndex(page: Page) {
  return page.evaluate(() =>
    fetch("/api/new-map/card-index", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`CARD_INDEX_FETCH_FAILED:${response.status}`);
        }
        return response.json();
      })
      .then((body) => body)
  );
}

test("new-map popup appears on country click", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);
  await waitForFeature(page, "FR", "legal-fill", FEATURE_VIEW_BY_GEO.FR);

  await focusJurisdiction(page, "FR");
  await clickFeature(page, "FR", "legal-fill", FEATURE_VIEW_BY_GEO.FR);
  await expect(getPopupLabel(page)).toContainText("ISO2: FR");
});

test("new-map popup closes from close button", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);
  await waitForFeature(page, "FR", "legal-fill", FEATURE_VIEW_BY_GEO.FR);

  await focusJurisdiction(page, "FR");
  await clickFeature(page, "FR", "legal-fill", FEATURE_VIEW_BY_GEO.FR);
  await expect(getPopupLabel(page)).toContainText("ISO2: FR");
  await page.getByRole("button", { name: "Close France panel" }).click();
  await expect(getPopupLabel(page)).toBeHidden();
});

test("new-map popup works across mainland and island countries", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);

  for (const iso of ["FR", "JP", "IS"]) {
    const preferredView = FEATURE_VIEW_BY_GEO[iso];
    await focusJurisdiction(page, iso);
    await waitForFeature(page, iso, "legal-fill", preferredView);
    await clickFeature(page, iso, "legal-fill", preferredView);
    await expect(getPopupLabel(page)).toContainText(`ISO2: ${iso}`);
    await page.locator('[data-testid="new-map-country-popup"] button[aria-label^="Close"]').first().click();
  }
});

test("new-map popup matrix renders all jurisdictions (opt-in, screenshots)", { timeout: 600000 }, async ({ page }) => {
  test.setTimeout(600000);
  if (process.env.NEW_MAP_POPUP_MATRIX_ALL !== "1") {
    test.skip();
  }

  fs.mkdirSync(POPUP_MATRIX_DIR, { recursive: true });
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);

  const cardIndex = (await loadRuntimeCardIndex(page)) as Record<string, RuntimeJurisdiction>;
  const geos = Array.from(
    new Set(
      Object.entries(cardIndex)
        .map(([geo, entry]) => {
          const normalizedGeo = String(geo || "").toUpperCase();
          const normalizedType = String(entry?.type || "").toLowerCase();
          if (normalizedGeo === "XK") return null;
          if (/^US-[A-Z]{2}$/.test(normalizedGeo) && normalizedType === "state") return normalizedGeo;
          if (/^[A-Z]{2}$/.test(normalizedGeo) && normalizedType === "country") return normalizedGeo;
          return null;
        })
        .filter((geo): geo is string => Boolean(geo))
    )
  ).sort();
  const matrixResults: MatrixResult[] = [];

  for (const geo of geos) {
    const entry = cardIndex[geo] || {};
    const layer = getLayerForGeo(geo);
    const preferredView = getJurisdictionView(geo, entry.coordinates || null);
    await focusJurisdiction(page, geo, entry.coordinates || null);
    if (geo.startsWith("US-")) {
      await ensureUsStatesLayerLoaded(page);
      await page.waitForTimeout(350);
    }
    if (preferredView) {
      const featureTimeout = process.env.NEW_MAP_POPUP_MATRIX_ALL === "1" ? 3_000 : 10_000;
      await waitForFeature(page, geo, layer, preferredView, { timeoutMs: featureTimeout }).catch(() => {});
    }

    const popupLocator = getPopupLabel(page);
    const point = await findFeaturePoint(page, geo, layer, preferredView);
    if (!point) {
      await setSelectedGeo(page, geo);
      const hasPopupAfterDebug = await popupLocator.isVisible({ timeout: 6_000 }).catch(() => false);
      if (hasPopupAfterDebug) {
      const popupText = await popupLocator.textContent();
        const actualIso2 = /ISO2:\s*([A-Z-]{2,3})/i.exec(popupText || "")?.[1]?.toUpperCase() || null;
        const coverage = await gatherPopupCoverage(page);
        const sectionCount = coverage.sectionCount || 0;
        const headings = coverage.sectionHeadings || [];
        const sectionSparse = isCountryGeo(geo) && sectionCount < 4;
        await page.screenshot({ path: path.join(POPUP_MATRIX_DIR, `${geo}-debug.png`), fullPage: false });
        matrixResults.push({
          geo,
          layer,
          status: "captured",
          actualIso2,
          sectionCount,
          sectionHeadings: headings,
          sectionSparse,
          openMode: "debug"
        });
        await popupLocator
          .locator('button[aria-label^="Close"]')
          .first()
          .click({ timeout: 1_000 })
          .catch(() => {});
        await page.waitForTimeout(200);
        continue;
      }
      matrixResults.push({ geo, layer, status: "no-feature" });
      await page.screenshot({ path: path.join(POPUP_MATRIX_DIR, `${geo}-no-feature.png`), fullPage: false });
      continue;
    }

    let openMode: MatrixResult["openMode"] = "click";
    await page.evaluate(({ x, y, targetLayerId }) => {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: {
            unproject: (_point: [number, number]) => { lng: number; lat: number };
            queryRenderedFeatures: (
              _point: [number, number],
              _options?: { layers?: string[] }
            ) => Array<{ properties?: Record<string, unknown>; id?: string | number }>;
            fire: (_type: string, _event: Record<string, unknown>) => void;
          } | null;
        };
      };
      const map = host.__NEW_MAP_DEBUG__?.map;
      if (!map) return;
      const features = map.queryRenderedFeatures([x, y], { layers: [targetLayerId] });
      const lngLat = map.unproject([x, y]);
      map.fire("click", {
        point: { x, y },
        lngLat,
        features,
        originalEvent: { type: "click" }
      });
    }, { ...point, targetLayerId: layer });

    const hasPopup = await popupLocator.isVisible({ timeout: 10_000 });
    if (!hasPopup) {
      await setSelectedGeo(page, geo);
      const hasPopupAfterDebug = await popupLocator.isVisible({ timeout: 6_000 }).catch(() => false);
      if (hasPopupAfterDebug) {
        openMode = "debug";
      } else {
        await setSelectedGeo(page, null);
        await page.waitForTimeout(150);
        await setSelectedGeo(page, geo);
        const hasPopupAfterReset = await popupLocator.isVisible({ timeout: 6_000 }).catch(() => false);
        if (hasPopupAfterReset) {
          openMode = "debug";
        }
      }
    }
    const popupVisible = await popupLocator.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!popupVisible) {
      matrixResults.push({ geo, layer, status: "no-popup" });
      await page.screenshot({ path: path.join(POPUP_MATRIX_DIR, `${geo}-no-popup.png`), fullPage: false });
      continue;
    }
    const popupText = await popupLocator.textContent();
    const actualIso2 = /ISO2:\s*([A-Z-]{2,3})/i.exec(popupText || "")?.[1]?.toUpperCase() || null;
    const coverage = await gatherPopupCoverage(page);
    const sectionCount = coverage.sectionCount || 0;
    const sectionHeadings = coverage.sectionHeadings || [];
    const hasJurisdictionSection = sectionHeadings.includes("Jurisdiction");
    const missingJurisdictionSection =
      Boolean((entry?.type === "country") && (entry as RuntimeJurisdiction & { parentCountry?: { name: string } }).parentCountry?.name && !hasJurisdictionSection);
    const sectionSparse = isCountryGeo(geo) && sectionCount < 4;
    await page.screenshot({ path: path.join(POPUP_MATRIX_DIR, `${geo}.png`), fullPage: false });
    matrixResults.push({
      geo,
      layer,
      status: "captured",
      actualIso2,
      sectionCount,
      sectionHeadings,
      sectionSparse,
      missingJurisdictionSection,
      openMode
    });

    await popupLocator
      .locator('button[aria-label^="Close"]')
      .first()
      .click({ timeout: 1_000 })
      .catch(() => {});
    await page.waitForTimeout(200);
  }

  const matrixReport = {
    generatedAt: new Date().toISOString(),
    total: geos.length,
    captured: matrixResults.filter((item) => item.status === "captured").length,
    noFeature: matrixResults.filter((item) => item.status === "no-feature").length,
    noPopup: matrixResults.filter((item) => item.status === "no-popup").length,
    sparsePopup: matrixResults.filter((item) => item.sectionSparse).length,
    missingJurisdictionSection: matrixResults.filter((item) => item.missingJurisdictionSection).length,
    results: matrixResults
  };

  fs.writeFileSync(path.join(POPUP_MATRIX_DIR, "manifest.json"), JSON.stringify(matrixReport, null, 2));
  if (process.env.NEW_MAP_POPUP_MATRIX_ENFORCE === "1") {
    expect(matrixReport.captured).toBe(geos.length);
    expect(matrixReport.sparsePopup).toBe(0);
    expect(matrixReport.missingJurisdictionSection).toBe(0);
  } else {
    expect(matrixReport.noFeature).toBeLessThan(geos.length / 2);
    expect(matrixReport.noPopup).toBeLessThan(geos.length);
  }
});

test("new-map desktop hover updates country feature-state", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);
  const preferredView = FEATURE_VIEW_BY_GEO.FR;

  await focusJurisdiction(page, "FR");
  await waitForFeature(page, "FR", "legal-fill", preferredView);

  const beforeSwitchCount = await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        hoverSwitchCount?: number;
      };
    };
    return host.__NEW_MAP_DEBUG__?.hoverSwitchCount || 0;
  });
  await hoverFeature(page, "FR", "legal-fill", preferredView);
  await page.waitForFunction(() => window.__NEW_MAP_DEBUG__?.hoveredId === "FR", { timeout: 5000 });
  const hoverState = await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        hoveredId?: string | null;
        hoverSwitchCount?: number;
        map?: {
          getCanvas: () => HTMLCanvasElement;
        } | null;
      };
    };
    return {
      hoveredId: host.__NEW_MAP_DEBUG__?.hoveredId || null,
      hoverSwitchCount: host.__NEW_MAP_DEBUG__?.hoverSwitchCount || 0,
      cursor: host.__NEW_MAP_DEBUG__?.map?.getCanvas().style.cursor || ""
    };
  });

  expect(hoverState.hoveredId).toBe("FR");
  expect(hoverState.hoverSwitchCount).toBeGreaterThanOrEqual(beforeSwitchCount);
  expect(hoverState.cursor).toBe("pointer");
});

test.skip("new-map usa states appear on zoom and popup works for California", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);

  const preferredView = FEATURE_VIEW_BY_GEO["US-CA"];
  await focusJurisdiction(page, "US-CA");
  await waitForFeature(page, "US-CA", "us-states-fill", preferredView);
  await clickFeature(page, "US-CA", "us-states-fill", preferredView);
  await expect(getPopupLabel(page)).toContainText("ISO2: US-CA");
});

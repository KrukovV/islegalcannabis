import { expect, test, type Page } from "playwright/test";

type LayerId = "legal-fill" | "us-states-fill";

const FEATURE_VIEW_BY_ISO: Record<string, { center: [number, number]; zoom: number }> = {
  FR: { center: [2.35, 46.4], zoom: 3.9 },
  JP: { center: [138.2, 37.5], zoom: 4.4 },
  IS: { center: [-18.6, 65.1], zoom: 4.5 },
  "US-CA": { center: [-119.5, 37.25], zoom: 5.4 }
};

async function focusFeature(page: Page, iso: string) {
  const view = FEATURE_VIEW_BY_ISO[iso];
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
}

async function findFeaturePoint(page: Page, iso: string, layerId: LayerId) {
  return page.evaluate(({ targetIso, targetLayerId }) => {
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
    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    for (let y = 40; y < rect.height - 40; y += 24) {
      for (let x = 40; x < rect.width - 40; x += 24) {
        const feature = map.queryRenderedFeatures([x, y], { layers: [targetLayerId] })[0];
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
    return null;
  }, { targetIso: iso, targetLayerId: layerId });
}

async function waitForFeature(page: Page, iso: string, layerId: LayerId) {
  await page.waitForFunction(({ targetIso, targetLayerId }) => {
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
    for (let y = 40; y < rect.height - 40; y += 24) {
      for (let x = 40; x < rect.width - 40; x += 24) {
        const feature = map.queryRenderedFeatures([x, y], { layers: [targetLayerId] })[0];
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
        if (candidates.includes(targetIso)) return true;
      }
    }
    return false;
  }, { targetIso: iso, targetLayerId: layerId }, { timeout: 5000 });
}

async function clickFeature(page: Page, iso: string, layerId: LayerId) {
  const point = await findFeaturePoint(page, iso, layerId);
  expect(point).not.toBeNull();
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
  }, { ...point!, targetLayerId: layerId });
}

async function assertPopupIso(page: Page, iso: string, layerId: LayerId = "legal-fill") {
  await focusFeature(page, iso);
  await clickFeature(page, iso, layerId);
  await expect(page.locator(".maplibregl-popup")).toBeVisible();
  await expect(page.locator('[data-testid="new-map-country-popup"]')).toContainText(`ISO2: ${iso}`);
}

test("new-map popup appears on country click", async ({ page }) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 1000 });
  await waitForFeature(page, "FR", "legal-fill");

  await assertPopupIso(page, "FR");
});

test("new-map popup closes from close button", async ({ page }) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 1000 });
  await waitForFeature(page, "FR", "legal-fill");

  await assertPopupIso(page, "FR");
  await page.locator(".new-map-country-popup-shell .maplibregl-popup-close-button").click();
  await expect(page.locator(".maplibregl-popup")).toHaveCount(0);
});

test("new-map popup works across mainland and island countries", async ({ page }) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 1000 });

  for (const iso of ["FR", "JP", "IS"]) {
    await focusFeature(page, iso);
    await waitForFeature(page, iso, "legal-fill");
    await assertPopupIso(page, iso);
  }
});

test("new-map usa states appear on zoom and popup works for California", async ({ page }) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 1000 });

  await focusFeature(page, "US-CA");
  await waitForFeature(page, "US-CA", "us-states-fill");
  await assertPopupIso(page, "US-CA", "us-states-fill");
});

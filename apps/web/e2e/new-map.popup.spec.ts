import { expect, test, type Page } from "playwright/test";

async function findCountryPoint(page: Page, iso: string) {
  return page.evaluate((targetIso) => {
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
        const feature = map.queryRenderedFeatures([x, y], { layers: ["legal-fill"] })[0];
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
  }, iso);
}

async function waitForCountryFeature(page: Page, iso: string) {
  await page.waitForFunction((targetIso) => {
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
        const feature = map.queryRenderedFeatures([x, y], { layers: ["legal-fill"] })[0];
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
  }, iso, { timeout: 5000 });
}

async function clickCountry(page: Page, iso: string) {
  const point = await findCountryPoint(page, iso);
  expect(point).not.toBeNull();
  await page.evaluate(({ x, y }) => {
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
    const features = map.queryRenderedFeatures([x, y], { layers: ["legal-fill"] });
    const lngLat = map.unproject([x, y]);
    map.fire("click", {
      point: { x, y },
      lngLat,
      features,
      originalEvent: { type: "click" }
    });
  }, point!);
}

async function assertPopupIso(page: Page, iso: string) {
  await clickCountry(page, iso);
  await expect(page.locator(".maplibregl-popup")).toBeVisible();
  await expect(page.locator('[data-testid="new-map-country-popup"]')).toContainText(`ISO2: ${iso}`);
}

test("new-map popup appears on country click", async ({ page }) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 1000 });
  await waitForCountryFeature(page, "FR");

  await assertPopupIso(page, "FR");
});

test("new-map popup closes from close button", async ({ page }) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 1000 });
  await waitForCountryFeature(page, "FR");

  await assertPopupIso(page, "FR");
  await page.locator(".new-map-country-popup-shell .maplibregl-popup-close-button").click();
  await expect(page.locator(".maplibregl-popup")).toHaveCount(0);
});

test("new-map popup works across mainland and island countries", async ({ page }) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 1000 });

  for (const iso of ["FR", "JP", "IS"]) {
    await waitForCountryFeature(page, iso);
    await assertPopupIso(page, iso);
  }
});

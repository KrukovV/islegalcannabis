import { expect, type Page } from "@playwright/test";

type LayerId = "legal-fill" | "us-states-fill";

type FeatureView = {
  center: [number, number];
  zoom: number;
  layerId: LayerId;
};

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const FEATURE_VIEW_BY_ISO: Record<string, FeatureView> = {
  FR: { center: [2.35, 46.4], zoom: 3.9, layerId: "legal-fill" },
  JP: { center: [138.2, 37.5], zoom: 4.4, layerId: "legal-fill" },
  IS: { center: [-18.6, 65.1], zoom: 4.5, layerId: "legal-fill" },
  "US-CA": { center: [-119.5, 37.25], zoom: 5.4, layerId: "us-states-fill" }
};

export async function waitForMapReady(page: Page) {
  await page.waitForSelector('[data-testid="new-map-root"]', { state: "attached", timeout: 10000 });
  await page.waitForSelector('[data-testid="new-map-surface"]', { state: "attached", timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1",
    undefined,
    { timeout: 30000 }
  );
  await page.waitForSelector(".maplibregl-canvas", { state: "visible", timeout: 10000 });
  await page.waitForSelector('[data-testid="new-map-ai-dock"]', { state: "visible", timeout: 10000 });
  await page.waitForFunction(
    () => {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: unknown;
        };
      };
      return Boolean(host.__NEW_MAP_DEBUG__?.map);
    },
    undefined,
    { timeout: 20000 }
  );
}

export async function readViewportMeta(page: Page) {
  return page.evaluate(() => {
    return document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";
  });
}

export async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
}

export async function getViewportBox(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  return box as Box;
}

export async function getVisualViewportFrame(page: Page) {
  return page.evaluate(() => {
    const viewport = window.visualViewport;
    return {
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
      left: viewport?.offsetLeft ?? 0,
      top: viewport?.offsetTop ?? 0
    };
  });
}

export function assertBoxInsideViewport(box: Box, viewport: { width: number; height: number; left: number; top: number }) {
  expect(box.x).toBeGreaterThanOrEqual(viewport.left);
  expect(box.y).toBeGreaterThanOrEqual(viewport.top);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.left + viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.top + viewport.height);
}

export function assertBoxesDoNotOverlap(first: Box, second: Box, gap = 0) {
  const separated =
    first.x + first.width + gap <= second.x ||
    second.x + second.width + gap <= first.x ||
    first.y + first.height + gap <= second.y ||
    second.y + second.height + gap <= first.y;
  expect(separated).toBeTruthy();
}

export async function getMapSnapshot(page: Page) {
  return page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCenter: () => { lng: number; lat: number };
          getZoom: () => number;
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) return null;
    const center = map.getCenter();
    return {
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom()
    };
  });
}

export async function focusFeature(page: Page, iso: string) {
  const view = FEATURE_VIEW_BY_ISO[iso];
  if (!view) throw new Error(`Missing feature view for ${iso}`);
  await page.evaluate(({ center, zoom }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          jumpTo: (_options: { center: [number, number]; zoom: number }) => void;
        } | null;
      };
    };
    host.__NEW_MAP_DEBUG__?.map?.jumpTo({ center, zoom });
  }, { center: view.center, zoom: view.zoom });
  await page.waitForTimeout(350);
}

async function findFeaturePoint(page: Page, iso: string, layerId?: LayerId) {
  const view = FEATURE_VIEW_BY_ISO[iso];
  if (!view) throw new Error(`Missing feature view for ${iso}`);
  const targetLayerId = layerId || view.layerId;
  return page.evaluate(({ targetIso, targetLayerId, preferredView }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
          project: (_lngLat: { lng: number; lat: number }) => { x: number; y: number };
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
    const projected = map.project({ lng: preferredView.center[0], lat: preferredView.center[1] });

    for (let y = Math.max(24, projected.y - 150); y < Math.min(rect.height - 24, projected.y + 150); y += 12) {
      for (let x = Math.max(24, projected.x - 190); x < Math.min(rect.width - 24, projected.x + 190); x += 12) {
        const feature = map.queryRenderedFeatures([x, y], { layers: [targetLayerId] })[0];
        if (!feature) continue;
        const properties = feature.properties || {};
        const candidates = [
          properties.geo,
          properties.iso2,
          properties.iso_a2,
          properties.ISO_A2,
          feature.id
        ]
          .map((value) => String(value || "").toUpperCase())
          .filter(Boolean);
        if (candidates.includes(targetIso)) {
          return { x: rect.left + x, y: rect.top + y };
        }
      }
    }
    return null;
  }, { targetIso: iso, targetLayerId, preferredView: view });
}

async function getProjectedFeaturePoint(page: Page, iso: string) {
  const view = FEATURE_VIEW_BY_ISO[iso];
  if (!view) throw new Error(`Missing feature view for ${iso}`);
  return page.evaluate(({ center }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
          project: (_lngLat: { lng: number; lat: number }) => { x: number; y: number };
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    const canvas = map?.getCanvas();
    if (!map || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const projected = map.project({ lng: center[0], lat: center[1] });
    return { x: rect.left + projected.x, y: rect.top + projected.y };
  }, { center: view.center });
}

async function getCountryPopupCandidatePoints(page: Page, iso: string, layerId?: LayerId) {
  await focusFeature(page, iso);
  let point = await findFeaturePoint(page, iso, layerId);
  for (let attempt = 0; !point && attempt < 12; attempt += 1) {
    await page.waitForTimeout(150);
    point = await findFeaturePoint(page, iso, layerId);
  }
  const projectedPoint = await getProjectedFeaturePoint(page, iso);
  const candidatePoints = [projectedPoint, point].filter(Boolean) as Array<{ x: number; y: number }>;
  expect(candidatePoints.length).toBeGreaterThan(0);
  return candidatePoints;
}

async function openCountryPopupFromCandidates(page: Page, iso: string, candidatePoints: Array<{ x: number; y: number }>) {
  const popup = page.getByTestId("new-map-country-popup");
  const touchFirst = await page.evaluate(
    () => navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)").matches
  );

  for (const candidate of candidatePoints) {
    const touchInteraction = async () => {
      await page.touchscreen.tap(candidate.x, candidate.y);
    };
    const mouseInteraction = async () => {
      await page.mouse.click(candidate.x, candidate.y);
    };
    const interactions = touchFirst ? [touchInteraction, mouseInteraction] : [mouseInteraction, touchInteraction];

    for (const interaction of interactions) {
      try {
        await interaction();
      } catch {
        continue;
      }
      try {
        await expect(popup).toContainText(`ISO2: ${iso}`, { timeout: 2500 });
        return candidate;
      } catch {
        continue;
      }
    }
  }

  await expect(popup).toContainText(`ISO2: ${iso}`, { timeout: 10000 });
  return candidatePoints[0];
}

export async function openCountryPopup(page: Page, iso: string, layerId?: LayerId) {
  return openCountryPopupFromCandidates(page, iso, await getCountryPopupCandidatePoints(page, iso, layerId));
}

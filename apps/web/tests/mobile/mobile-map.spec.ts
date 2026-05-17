import { expect, test } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  assertViewportScrollLocked,
  getMapSnapshot,
  openCountryPopup,
  saveMobileScreenshot,
  waitForMapReady
} from "./mobileTestUtils";

async function dragMapUntilMoved(page: Parameters<typeof getMapSnapshot>[0], initialSnapshot: Awaited<ReturnType<typeof getMapSnapshot>>) {
  const viewport = page.viewportSize() || { width: 390, height: 844 };
  const attempts = [
    {
      from: { x: Math.round(viewport.width * 0.52), y: Math.round(viewport.height * 0.64) },
      to: { x: Math.round(viewport.width * 0.28), y: Math.round(viewport.height * 0.46) }
    },
    {
      from: { x: Math.round(viewport.width * 0.58), y: Math.round(viewport.height * 0.58) },
      to: { x: Math.round(viewport.width * 0.24), y: Math.round(viewport.height * 0.42) }
    },
    {
      from: { x: Math.round(viewport.width * 0.5), y: Math.round(viewport.height * 0.54) },
      to: { x: Math.round(viewport.width * 0.18), y: Math.round(viewport.height * 0.36) }
    }
  ];

  for (const attempt of attempts) {
    await page.mouse.move(attempt.from.x, attempt.from.y);
    await page.mouse.down();
    await page.mouse.move(attempt.to.x, attempt.to.y, { steps: 16 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const nextSnapshot = await getMapSnapshot(page);
    if (JSON.stringify(nextSnapshot) !== JSON.stringify(initialSnapshot)) {
      return nextSnapshot;
    }
  }

  return getMapSnapshot(page);
}

async function getProjectedMapTapTarget(page: Parameters<typeof getMapSnapshot>[0], lng: number, lat: number) {
  const viewport = page.viewportSize() || { width: 390, height: 844 };
  return page.evaluate(({ targetLng, targetLat, viewportWidth, viewportHeight }) => {
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
    if (!map || !canvas) {
      return {
        x: Math.round(viewportWidth / 2),
        y: Math.round(viewportHeight / 2)
      };
    }
    const rect = canvas.getBoundingClientRect();
    const projected = map.project({ lng: targetLng, lat: targetLat });
    return {
      x: Math.round(rect.left + projected.x),
      y: Math.round(rect.top + projected.y)
    };
  }, { targetLng: lng, targetLat: lat, viewportWidth: viewport.width, viewportHeight: viewport.height });
}

async function doubleTapMapUntilZoomed(
  page: Parameters<typeof getMapSnapshot>[0],
  target: { x: number; y: number },
  baselineZoom: number
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.touchscreen.tap(target.x, target.y);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(target.x, target.y);

    const zoomed = await expect
      .poll(async () => (await getMapSnapshot(page))?.zoom ?? 0, { timeout: 5000 })
      .toBeGreaterThan(baselineZoom + 0.2)
      .then(() => true)
      .catch(() => false);

    if (zoomed) return;
    await page.waitForTimeout(200);
  }

  await expect
    .poll(async () => (await getMapSnapshot(page))?.zoom ?? 0, { timeout: 1 })
    .toBeGreaterThan(baselineZoom + 0.2);
}

test("mobile map keeps pan, tap, zoom, and rotate stable", async ({ page }, testInfo) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await saveMobileScreenshot(page, testInfo, "first-render");
  await assertNoHorizontalOverflow(page);
  await assertViewportScrollLocked(page);

  const mapBeforePan = await getMapSnapshot(page);
  expect(mapBeforePan).not.toBeNull();

  const mapAfterPan = await dragMapUntilMoved(page, mapBeforePan);
  expect(mapAfterPan).not.toEqual(mapBeforePan);
  await assertViewportScrollLocked(page);

  await openCountryPopup(page, "FR");
  await saveMobileScreenshot(page, testInfo, "country-open");
  await expect(page.getByTestId("new-map-country-popup")).toBeVisible();

  await page.getByRole("button", { name: "Close France panel" }).click();
  await expect(page.getByTestId("new-map-country-popup")).toBeHidden();

  await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          jumpTo: (_options: { center: [number, number]; zoom: number }) => void;
        } | null;
      };
    };
    host.__NEW_MAP_DEBUG__?.map?.jumpTo({
      center: [-28, 24],
      zoom: 2.2
    });
  });
  await page.waitForTimeout(150);

  const mapBeforeDoubleTap = await getMapSnapshot(page);
  expect(mapBeforeDoubleTap).not.toBeNull();
  const doubleTapTarget = await getProjectedMapTapTarget(page, -28, 24);

  await doubleTapMapUntilZoomed(page, doubleTapTarget, mapBeforeDoubleTap?.zoom || 0);

  const backgroundSample = await page.evaluate(() => ({
    root: getComputedStyle(document.querySelector('[data-testid="new-map-root"]') as Element).backgroundColor,
    surface: getComputedStyle(document.querySelector('[data-testid="new-map-surface"]') as Element).backgroundColor
  }));
  expect(backgroundSample.root).not.toBe("rgb(255, 255, 255)");
  expect(backgroundSample.surface).not.toBe("rgb(255, 255, 255)");

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await waitForMapReady(page);
  await assertNoHorizontalOverflow(page);
  await assertViewportScrollLocked(page);
  await saveMobileScreenshot(page, testInfo, "rotate-landscape");

  const canvasBox = await page.locator(".maplibregl-canvas").boundingBox();
  expect(canvasBox?.width || 0).toBeGreaterThan(300);
  expect(canvasBox?.height || 0).toBeGreaterThan(150);
});

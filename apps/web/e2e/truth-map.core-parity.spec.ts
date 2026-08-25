import { expect, test } from "@playwright/test";

const GPS_POINT = { latitude: 50.0755, longitude: 14.4378 };
const QA_ROUTE = "/truth-map?qa=1";

async function waitForTruthMapReady(page: import("@playwright/test").Page) {
  await page.waitForSelector('[data-testid="truth-map-root"]', { timeout: 5_000, state: "attached" });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="truth-map-canvas"]')?.getAttribute("data-map-ready") === "1",
    { timeout: 20_000 }
  );
  await page.waitForFunction(() => Boolean(window.__TRUTH_MAP_QA__?.getCamera), { timeout: 20_000 });
}

async function waitForGpsCenter(page: import("@playwright/test").Page) {
  await page.waitForFunction(({ lng, lat }) => {
    const center = window.__TRUTH_MAP_DEBUG__?.map?.getCenter();
    return Boolean(center && Math.abs(center.lng - lng) < 0.01 && Math.abs(center.lat - lat) < 0.01);
  }, { lng: GPS_POINT.longitude, lat: GPS_POINT.latitude }, { timeout: 10_000 });
}

async function waitForMapIdle(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return Boolean(map && !map.isMoving());
  }, { timeout: 15_000 });
}

async function clickGps(page: import("@playwright/test").Page) {
  await waitForMapIdle(page);
  const gps = page.getByRole("button", { name: /GPS/i });
  await expect(gps).toBeVisible();
  await expect(gps).toBeEnabled();
  // MapLibre may continue sub-pixel canvas layout work after an explicit camera
  // jump; the visible, enabled native button remains the user interaction target.
  await gps.click({ force: true });
}

test("truth-map retains new-map core GPS, hover, selection and popup-close behavior", async ({ page }) => {
  test.setTimeout(75_000);
  await page.addInitScript(() => {
    window.localStorage.setItem("geo", JSON.stringify({
      lat: 50.0755,
      lng: 14.4378,
      source: "gps",
      iso2: "CZ"
    }));
  });

  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForTruthMapReady(page);
  await page.waitForFunction(
    () => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755",
    { timeout: 10_000 }
  );

  const coreControls = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return {
      dragPan: map?.dragPan.isEnabled(),
      scrollZoom: map?.scrollZoom.isEnabled(),
      doubleClickZoom: map?.doubleClickZoom.isEnabled(),
      dragRotate: map?.dragRotate.isEnabled(),
      renderWorldCopies: map?.getRenderWorldCopies(),
      maxBounds: map?.getMaxBounds()?.toArray() ?? null
    };
  });
  expect(coreControls).toEqual({
    dragPan: true,
    scrollZoom: true,
    doubleClickZoom: true,
    dragRotate: false,
    renderWorldCopies: true,
    maxBounds: null
  });

  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.jumpTo(2.35, 46.5, 5);
  });
  await page.waitForFunction(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.querySourceFeatures("legal-countries")
      .find((candidate) => candidate.properties?.geo === "FR");
    return Boolean(map && feature && Number.isFinite(Number(feature.properties?.labelAnchorLng)) && Number.isFinite(Number(feature.properties?.labelAnchorLat)));
  }, { timeout: 20_000 });
  const point = await page.evaluate(() => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const feature = map?.querySourceFeatures("legal-countries")
      .find((candidate) => candidate.properties?.geo === "FR");
    if (!map || !feature) return null;
    return map.project([
      Number(feature.properties?.labelAnchorLng),
      Number(feature.properties?.labelAnchorLat)
    ]);
  });
  if (!point) throw new Error("truth_map_france_point_missing");
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => window.__TRUTH_MAP_DEBUG__?.map?.getCanvas().dataset.truthMapHoveredGeo === "FR", { timeout: 5_000 });
  await page.mouse.click(point.x, point.y);

  const popup = page.locator('[data-popup-variant="truth-map"]');
  await expect(popup).toBeVisible({ timeout: 10_000 });
  await expect(popup).toContainText("ISO2: FR");
  await popup.getByTestId("viewport-country-popup-close").click();
  await expect(popup).toBeHidden();
});

test("truth-map GPS click persists and recenters with the shared MapGeoDock behavior", async ({ page, context }) => {
  test.setTimeout(75_000);
  await context.setGeolocation(GPS_POINT);
  await context.grantPermissions(["geolocation"]);
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("truth-map-gps-test-seeded")) return;
    window.sessionStorage.setItem("truth-map-gps-test-seeded", "1");
    window.localStorage.setItem("geo", JSON.stringify({
      lat: 52.52,
      lng: 13.405,
      source: "ip",
      iso2: "DE"
    }));
  });
  await page.route("**/api/geo/resolve", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          source: "BROWSER",
          permission: "granted",
          iso: "CZ",
          region: null,
          provider: "test",
          confidence: "HIGH"
        }
      })
    });
  });

  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForTruthMapReady(page);
  await page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map?.jumpTo({ center: [-100, 35], zoom: 2.1 }));

  await clickGps(page);
  await page.waitForFunction(
    () => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755",
    { timeout: 10_000 }
  );
  await waitForGpsCenter(page);

  const storedAfterClick = await page.evaluate(() => JSON.parse(window.localStorage.getItem("geo") || "null"));
  expect(storedAfterClick).toMatchObject({
    lat: GPS_POINT.latitude,
    lng: GPS_POINT.longitude,
    source: "gps"
  });
  expect(storedAfterClick.iso2).not.toBe("DE");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForTruthMapReady(page);
  await page.waitForFunction(
    () => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755",
    { timeout: 10_000 }
  );
  await page.evaluate(() => window.__TRUTH_MAP_DEBUG__?.map?.jumpTo({ center: [-80, 30], zoom: 2.1 }));
  await clickGps(page);
  await waitForGpsCenter(page);
});

test("truth-map preserves shared mobile viewport bounds for the dock and rich popup", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    let snapshot = { width: 390, height: 560, offsetTop: 0, offsetLeft: 0, scale: 1 };
    const listeners = new Set<() => void>();
    const host = window as typeof window & {
      __MOBILE_QA_VISUAL_VIEWPORT__?: {
        get: () => typeof snapshot;
        subscribe: (_listener: () => void) => () => void;
      };
    };
    host.__MOBILE_QA_VISUAL_VIEWPORT__ = {
      get: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  });

  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForTruthMapReady(page);
  const root = page.getByTestId("truth-map-root");
  await expect(root).toHaveAttribute("data-keyboard-open", "1");
  await expect(root).toHaveAttribute("data-keyboard-offset", "284");
  await page.evaluate(async () => {
    await window.__TRUTH_MAP_QA__?.openGeo("FR");
  });
  const popup = page.locator('[data-popup-variant="truth-map"]');
  await expect(popup).toBeVisible({ timeout: 10_000 });
  const [popupBox, dockBox] = await Promise.all([popup.boundingBox(), page.getByTestId("new-map-ai-dock").boundingBox()]);
  expect(popupBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(dockBox!.y - 12);
});

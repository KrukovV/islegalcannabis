import { expect, test } from "playwright/test";

const GPS_POINT = { latitude: 50.0755, longitude: 14.4378 };
const MOVED_GPS_POINT = { latitude: 48.2082, longitude: 16.3738 };

async function waitForMapReady(page: import("playwright/test").Page) {
  await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 5000, state: "attached" });
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout: 5000, state: "attached" });
  await page.waitForFunction(() => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1", { timeout: 20000 });
}

async function waitForMapCenter(page: import("playwright/test").Page, point = GPS_POINT) {
  await page.waitForFunction(({ lng, lat }) => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    const center = map?.getCenter?.();
    return Boolean(center && Math.abs(center.lng - lng) < 0.01 && Math.abs(center.lat - lat) < 0.01);
  }, { lng: point.longitude, lat: point.latitude }, { timeout: 10000 });
}

async function waitForGpsCenter(page: import("playwright/test").Page) {
  await waitForMapCenter(page, GPS_POINT);
}

test("new-map restored gps marker survives reload", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("geo", JSON.stringify({
      lat: 50.0755,
      lng: 14.4378,
      source: "gps",
      iso2: "CZ"
    }));
  });

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755", { timeout: 5000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755", { timeout: 5000 });

  const markerPosition = await page.locator('[data-user-marker="1"]').getAttribute("data-user-marker-position");
  expect(markerPosition).toBe("14.4378,50.0755");
});

test("new-map GPS click places marker, persists location, and recenters on repeat click", async ({ page, context }) => {
  await context.setGeolocation(GPS_POINT);
  await context.grantPermissions(["geolocation"]);
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("gps-test-seeded")) return;
    window.sessionStorage.setItem("gps-test-seeded", "1");
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

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  await page.evaluate(() => {
    window.__NEW_MAP_DEBUG__?.map?.jumpTo({ center: [-100, 35], zoom: 2.1 });
  });

  await page.getByRole("button", { name: /GPS/i }).click();
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755", { timeout: 10000 });
  await waitForGpsCenter(page);

  const storedAfterClick = await page.evaluate(() => JSON.parse(window.localStorage.getItem("geo") || "null"));
  expect(storedAfterClick).toMatchObject({
    lat: GPS_POINT.latitude,
    lng: GPS_POINT.longitude,
    source: "gps"
  });
  expect(storedAfterClick.iso2).not.toBe("DE");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755", { timeout: 10000 });

  await page.evaluate(() => {
    window.__NEW_MAP_DEBUG__?.map?.jumpTo({ center: [-80, 30], zoom: 2.1 });
  });
  await page.getByRole("button", { name: /GPS/i }).click();
  await waitForGpsCenter(page);
});

test("new-map GPS click refreshes stale saved GPS instead of only recentering it", async ({ page, context }) => {
  await context.setGeolocation(GPS_POINT);
  await context.grantPermissions(["geolocation"]);
  await page.addInitScript(() => {
    window.localStorage.setItem("geo", JSON.stringify({
      lat: 48.8566,
      lng: 2.3522,
      source: "gps",
      iso2: "FR"
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

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "2.3522,48.8566", { timeout: 5000 });

  await page.getByRole("button", { name: /GPS/i }).click();
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755", { timeout: 10000 });
  await waitForGpsCenter(page);

  const storedAfterRefresh = await page.evaluate(() => JSON.parse(window.localStorage.getItem("geo") || "null"));
  expect(storedAfterRefresh).toMatchObject({
    lat: GPS_POINT.latitude,
    lng: GPS_POINT.longitude,
    source: "gps",
    iso2: "CZ"
  });
});

test("new-map repeated GPS click recenters immediately and still refreshes moved browser position", async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as typeof window & { __gpsTestPoint?: { lat: number; lng: number } };
    testWindow.__gpsTestPoint = { lat: 50.0755, lng: 14.4378 };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          window.setTimeout(() => {
            const point = testWindow.__gpsTestPoint || { lat: 50.0755, lng: 14.4378 };
            success({
              coords: {
                latitude: point.lat,
                longitude: point.lng,
                accuracy: 25,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null
              },
              timestamp: Date.now()
            });
          }, 20);
        }
      }
    });
  });
  await page.route("**/api/geo/resolve", async (route) => {
    const body = route.request().postDataJSON() as { lat?: number; lon?: number };
    const moved = Math.abs(Number(body?.lat || 0) - MOVED_GPS_POINT.latitude) < 0.01;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          source: "BROWSER",
          permission: "granted",
          iso: moved ? "AT" : "CZ",
          region: null,
          provider: "test",
          confidence: "HIGH"
        }
      })
    });
  });

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await page.getByRole("button", { name: /GPS/i }).click();
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755", { timeout: 10000 });
  await waitForGpsCenter(page);

  await page.evaluate(() => {
    const testWindow = window as typeof window & { __gpsTestPoint?: { lat: number; lng: number } };
    testWindow.__gpsTestPoint = { lat: 48.2082, lng: 16.3738 };
    window.__NEW_MAP_DEBUG__?.map?.jumpTo({ center: [-80, 30], zoom: 2.1 });
  });
  await page.getByRole("button", { name: /GPS/i }).click();
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "16.3738,48.2082", { timeout: 10000 });
  await waitForMapCenter(page, MOVED_GPS_POINT);

  const storedAfterMove = await page.evaluate(() => JSON.parse(window.localStorage.getItem("geo") || "null"));
  expect(storedAfterMove).toMatchObject({
    lat: MOVED_GPS_POINT.latitude,
    lng: MOVED_GPS_POINT.longitude,
    source: "gps",
    iso2: "AT"
  });
});

test("new-map GPS click replaces valid IP fallback after Safari-like first timeout", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("geo", JSON.stringify({
      lat: 48.8566,
      lng: 2.3522,
      source: "ip",
      iso2: "FR"
    }));
    let calls = 0;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback, error: PositionErrorCallback | null) {
          calls += 1;
          window.setTimeout(() => {
            if (calls === 1) {
              error?.({ code: 3, message: "simulated Safari timeout", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
              return;
            }
            success({
              coords: {
                latitude: 50.0755,
                longitude: 14.4378,
                accuracy: 25,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null
              },
              timestamp: Date.now()
            });
          }, 20);
        }
      }
    });
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
  await page.route("**/api/geo/loc", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          iso: "FR",
          iso2: "FR",
          country: "France",
          lat: 48.8566,
          lng: 2.3522,
          provider: "test"
        }
      })
    });
  });

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await expect(page.getByTestId("new-map-ai-dock")).toHaveAttribute("data-location-source", "ip");
  await expect(page.getByTestId("new-map-ai-geo-hint")).toContainText("IP: France");

  await page.getByRole("button", { name: /GPS/i }).click();
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755", { timeout: 10000 });
  await waitForGpsCenter(page);
  await expect(page.getByTestId("new-map-ai-dock")).toHaveAttribute("data-location-source", "gps");
  await expect(page.getByTestId("new-map-ai-geo-hint")).toContainText("GPS: CZ");

  const storedAfterGps = await page.evaluate(() => JSON.parse(window.localStorage.getItem("geo") || "null"));
  expect(storedAfterGps).toMatchObject({
    lat: GPS_POINT.latitude,
    lng: GPS_POINT.longitude,
    source: "gps",
    iso2: "CZ"
  });
});

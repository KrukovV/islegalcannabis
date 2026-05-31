import { expect, test } from "playwright/test";

const GPS_POINT = { latitude: 50.0755, longitude: 14.4378 };

async function waitForMapReady(page: import("playwright/test").Page) {
  await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 5000, state: "attached" });
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout: 5000, state: "attached" });
  await page.waitForFunction(() => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1", { timeout: 20000 });
}

async function waitForGpsCenter(page: import("playwright/test").Page) {
  await page.waitForFunction(({ lng, lat }) => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    const center = map?.getCenter?.();
    return Boolean(center && Math.abs(center.lng - lng) < 0.01 && Math.abs(center.lat - lat) < 0.01);
  }, { lng: GPS_POINT.longitude, lat: GPS_POINT.latitude }, { timeout: 10000 });
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

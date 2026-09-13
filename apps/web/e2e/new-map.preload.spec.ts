import { expect, test } from "@playwright/test";

const QA_ROUTE = "/new-map?qa=1";

test("new-map requests style and countries early without duplicates", async ({ page }) => {
  const tracked: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/new-map/basemap-style") || url.includes("/static/countries/countries.")) {
      tracked.push(url);
    }
  });

  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const browserTiming = await page.evaluate(() => ({
    routeStart: window.__NEW_MAP_TRACE__?.marks?.NM_T0_ROUTE_START ?? null,
    resources: performance
      .getEntriesByType("resource")
      .map((entry) => ({ url: entry.name, startTime: entry.startTime }))
      .filter((entry) => (
        entry.url.includes("/api/new-map/basemap-style") ||
        entry.url.includes("/static/countries/countries.")
      ))
  }));
  const countries = tracked.filter((url) => url.includes("/static/countries/countries."));
  const style = tracked.filter((url) => url.includes("/api/new-map/basemap-style"));
  const countryTimings = browserTiming.resources.filter((entry) => entry.url.includes("/static/countries/countries."));
  const styleTimings = browserTiming.resources.filter((entry) => entry.url.includes("/api/new-map/basemap-style"));

  expect(countries).toHaveLength(1);
  expect(style).toHaveLength(1);
  expect(countryTimings).toHaveLength(1);
  expect(styleTimings).toHaveLength(1);
  expect(browserTiming.routeStart).not.toBeNull();
  expect((countryTimings[0]?.startTime ?? Infinity) - (browserTiming.routeStart ?? 0)).toBeLessThan(500);
  expect((styleTimings[0]?.startTime ?? Infinity) - (browserTiming.routeStart ?? 0)).toBeLessThan(500);
});

test("new-map keeps optional cold-start payloads lazy", async ({ page }) => {
  const tracked: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("/static/countries/countries.") ||
      url.includes("/api/new-map/card-index") ||
      url.includes("/api/new-map/us-states")
    ) {
      tracked.push(url);
    }
  });

  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1";
  }, { timeout: 20000 });
  await page.waitForTimeout(1200);

  expect(tracked.filter((url) => url.includes("/static/countries/countries."))).toHaveLength(1);
  expect(tracked.filter((url) => url.includes("/api/new-map/card-index"))).toHaveLength(0);
  expect(tracked.filter((url) => url.includes("/api/new-map/us-states"))).toHaveLength(0);

  await page.evaluate(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    map?.jumpTo({ center: [-119.5, 37.25], zoom: 5.4 });
  });
  await expect.poll(() => tracked.filter((url) => url.includes("/api/new-map/us-states")).length, {
    timeout: 5000
  }).toBeGreaterThan(0);
});

import { expect, test } from "playwright/test";

const QA_ROUTE = "/new-map?qa=1";

test("new-map requests style and countries early without duplicates", async ({ page }) => {
  const tracked: Array<{ url: string; delta: number }> = [];
  const start = Date.now();
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/new-map/basemap-style") || url.includes("/static/countries/countries.")) {
      tracked.push({ url, delta: Date.now() - start });
    }
  });

  await page.goto(QA_ROUTE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const countries = tracked.filter((entry) => entry.url.includes("/static/countries/countries."));
  const style = tracked.filter((entry) => entry.url.includes("/api/new-map/basemap-style"));

  expect(countries).toHaveLength(1);
  expect(style).toHaveLength(1);
  expect(countries[0]?.delta ?? Infinity).toBeLessThan(500);
  expect(style[0]?.delta ?? Infinity).toBeLessThan(500);
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

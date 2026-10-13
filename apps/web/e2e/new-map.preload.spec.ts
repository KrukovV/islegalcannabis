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
  await page.waitForFunction(() => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1", undefined, { timeout: 20_000 });
  await page.waitForTimeout(1200);

  const countries = tracked.filter((url) => url.includes("/static/countries/countries."));
  const style = tracked.filter((url) => url.includes("/api/new-map/basemap-style"));

  // Both requests must have completed as part of the map-ready hand-off,
  // independent of server response time or WebKit Resource Timing omissions.
  expect(countries).toHaveLength(1);
  expect(style).toHaveLength(1);
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

  // The local QA hook is installed after the lazy hover/animation modules.
  // A ready legal canvas alone must not turn this camera action into a no-op.
  await page.waitForFunction(() => Boolean(window.__NEW_MAP_DEBUG__?.map), undefined, { timeout: 20_000 });
  const zoom = await page.evaluate(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    if (!map) throw new Error("new_map_qa_map_missing_for_state_zoom");
    map.jumpTo({ center: [-119.5, 37.25], zoom: 5.4 });
    return map.getZoom();
  });
  expect(zoom).toBeCloseTo(5.4, 5);
  await expect.poll(() => tracked.filter((url) => url.includes("/api/new-map/us-states")).length, {
    timeout: 5000
  }).toBeGreaterThan(0);
});

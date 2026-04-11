import { expect, test } from "playwright/test";

test("new-map requests style and countries early without duplicates", async ({ page }) => {
  const tracked: Array<{ url: string; delta: number }> = [];
  const start = Date.now();
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/new-map/basemap-style") || url.includes("/api/new-map/countries")) {
      tracked.push({ url, delta: Date.now() - start });
    }
  });

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const countries = tracked.filter((entry) => entry.url.includes("/api/new-map/countries"));
  const style = tracked.filter((entry) => entry.url.includes("/api/new-map/basemap-style"));

  expect(countries).toHaveLength(1);
  expect(style).toHaveLength(1);
  expect(countries[0]?.delta ?? Infinity).toBeLessThan(500);
  expect(style[0]?.delta ?? Infinity).toBeLessThan(500);
});

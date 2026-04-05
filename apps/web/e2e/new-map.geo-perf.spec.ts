import { expect, test } from "playwright/test";

test("new-map map loads fast without geo blocking", async ({ page }) => {
  const start = Date.now();
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 3000, state: "attached" });
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout: 3000, state: "attached" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 1000, state: "attached" });

  const duration = Date.now() - start;
  console.warn(`UI_NEW_MAP_CANVAS_MS=${duration}`);
  expect(duration).toBeLessThan(1000);
});

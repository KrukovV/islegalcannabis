import { expect, test } from "playwright/test";

test("new-map render and restored gps marker are visible", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("geo", JSON.stringify({
      lat: 50.0755,
      lng: 14.4378,
      source: "gps",
      iso2: "CZ"
    }));
  });

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 3000, state: "attached" });
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout: 3000, state: "attached" });
  await page.waitForFunction(() => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1", { timeout: 20000 });
  await page.waitForSelector('[data-user-marker="1"]', { timeout: 20000, state: "attached" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 3000, state: "attached" });
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout: 3000, state: "attached" });
  await page.waitForFunction(() => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1", { timeout: 20000 });
  await page.waitForSelector('[data-user-marker="1"]', { timeout: 20000, state: "attached" });

  const markerPosition = await page.locator('[data-user-marker="1"]').getAttribute("data-user-marker-position");
  expect(markerPosition).toBe("14.4378,50.0755");

  const placement = await page.evaluate(() => {
    const marker = document.querySelector('[data-user-marker="1"]');
    const surface = document.querySelector('[data-testid="new-map-surface"]');
    if (!(marker instanceof HTMLElement) || !(surface instanceof HTMLElement)) return null;
    const markerRect = marker.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    return {
      markerX: markerRect.left + markerRect.width / 2,
      markerY: markerRect.top + markerRect.height / 2,
      surfaceCenterX: surfaceRect.left + surfaceRect.width / 2,
      surfaceCenterY: surfaceRect.top + surfaceRect.height / 2
    };
  });

  expect(placement).not.toBeNull();
  expect(Math.abs(placement!.markerX - placement!.surfaceCenterX)).toBeLessThan(32);
  expect(Math.abs(placement!.markerY - placement!.surfaceCenterY)).toBeLessThan(32);
});

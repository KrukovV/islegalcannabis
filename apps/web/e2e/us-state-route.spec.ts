import { expect, test } from "playwright/test";

async function waitForMap(page: Parameters<typeof test>[0]["page"], path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 3000, state: "attached" });
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout: 3000, state: "attached" });
  await page.waitForSelector('[data-map-ready="1"]', { timeout: 20000 });
}

test("/c/us-ca starts as a state node with state marker and open panel", async ({ page }) => {
  await waitForMap(page, "/c/us-ca");

  await expect(page.getByTestId("new-map-seo-overlay")).toBeVisible();
  await expect(page.getByTestId("new-map-seo-overlay").getByRole("heading", { level: 1 })).toHaveText(
    "Is cannabis legal in California?"
  );

  const markerLabel = await page.locator('button[aria-label="Open info for California"]').first().getAttribute("aria-label");
  expect(markerLabel).toBe("Open info for California");

  const center = await page.evaluate(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    const point = map?.getCenter?.();
    return point ? { lng: point.lng, lat: point.lat } : null;
  });

  expect(center).not.toBeNull();
  expect(Math.abs(center!.lat - 36.7)).toBeLessThan(4);
  expect(Math.abs(center!.lng - -119.4)).toBeLessThan(6);
});

test("/c/usa click on California switches marker and panel to US-CA", async ({ page }) => {
  await waitForMap(page, "/c/usa");

  await page.locator('button[aria-label="Open info for California"]').click();
  await page.waitForTimeout(1000);

  await expect(page.getByTestId("new-map-seo-overlay").getByRole("heading", { level: 1 })).toHaveText(
    "Is cannabis legal in California?"
  );
  await expect(page.locator('button[aria-label="Open info for California"]').first()).toBeVisible();
});

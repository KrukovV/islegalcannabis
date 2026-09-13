import { expect, test } from "@playwright/test";

// `waitForMap` retains independent, fail-closed phase bounds below. Give the
// test runner enough outer lifetime to execute navigation plus the map-ready
// phase instead of truncating the 30-second readiness contract at 30 seconds
// total under a loaded serial smoke run.
test.describe.configure({ timeout: 65_000 });

async function waitForMap(page: Parameters<typeof test>[0]["page"], path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="public-map-root"]', { timeout: 20_000, state: "attached" });
  await page.waitForSelector('[data-testid="public-map-canvas"]', { timeout: 20_000, state: "attached" });
  await page.waitForSelector('[data-testid="public-map-canvas"][data-map-ready="1"]', { timeout: 30_000 });
}

test("/c/us-ca starts as a state document with one map-only state marker", async ({ page }) => {
  await waitForMap(page, "/c/us-ca");

  await expect(page.getByTestId("new-map-seo-overlay")).toHaveCount(0);
  await expect(page.getByTestId("new-map-country-popup")).toHaveCount(0);
  await expect(page.locator("article").getByRole("heading", { level: 1 })).toHaveText("Is cannabis legal in California?");
  await expect(page.locator('button[aria-label^="Open info for "]')).toHaveCount(1);
  await expect(page.locator('button[aria-label="Open info for California"]')).toHaveCount(1);

  const markerLabel = await page.locator('button[aria-label="Open info for California"]').first().getAttribute("aria-label");
  expect(markerLabel).toBe("Open info for California");

  const center = await page.getByTestId("public-map-canvas").locator(".maplibregl-canvas").evaluate((node) => {
    const value = node.getAttribute("data-truth-map-initial-camera");
    return value ? JSON.parse(value) as { lng: number; lat: number; zoom: number } : null;
  });

  expect(center).not.toBeNull();
  expect(Math.abs(center!.lat - 36.7)).toBeLessThan(4);
  expect(Math.abs(center!.lng - -119.4)).toBeLessThan(6);
});

test("/c/usa keeps exactly one map-only country marker for the route document", async ({ page }) => {
  await waitForMap(page, "/c/usa");

  await expect(page.getByTestId("new-map-seo-overlay")).toHaveCount(0);
  await expect(page.getByTestId("new-map-country-popup")).toHaveCount(0);
  await expect(page.locator("article").getByRole("heading", { level: 1 })).toHaveText("Is cannabis legal in United States?");
  await expect(page.locator('button[aria-label^="Open info for "]')).toHaveCount(1);
  await expect(page.locator('button[aria-label="Open info for United States"]')).toHaveCount(1);
  await expect(page.locator('button[aria-label="Open info for California"]')).toHaveCount(0);
});

import { expect, test } from "playwright/test";

test("new-map shell renders before geo finishes", async ({ page }) => {
  const start = Date.now();
  await page.route("https://ipapi.co/json/", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        country_name: "Czechia",
        country_code: "CZ",
        latitude: 50.0755,
        longitude: 14.4378
      })
    });
  });

  await page.route("https://ipwho.is/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        country: "Czechia",
        country_code: "CZ",
        latitude: 50.0755,
        longitude: 14.4378
      })
    });
  });

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 3000, state: "attached" });
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout: 3000, state: "attached" });
  await page.waitForSelector('[data-testid="new-map-ai-dock"]', { timeout: 3000, state: "attached" });

  const duration = Date.now() - start;
  console.warn(`UI_NEW_MAP_SHELL_MS=${duration}`);
  expect(duration).toBeLessThan(3000);

  await expect(page.getByPlaceholder("Ask about cannabis laws...")).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("new-map-ai-dock")).toBeVisible();
});

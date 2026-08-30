import { expect, test } from "@playwright/test";

test("local public root retains only the local AI dock beside the public Truth Map display core", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiRequests.push(request.url());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-map-root")).toBeAttached();
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  await expect(page.getByTestId("public-map-notice")).toBeVisible();
  await expect(page.getByTestId("antarctic-ascii-overlay")).toBeAttached();
  await expect(page.getByTestId("antarctic-ascii-overlay")).toHaveAttribute("data-ascii-state", "running", { timeout: 12_000 });
  await expect(page.getByTestId("new-map-ai-dock")).toBeVisible();
  await expect(page.getByTestId("truth-map-social-panel")).toHaveCount(0);
  await expect(page.getByTestId("truth-map-audit-notice")).toHaveCount(0);
  await expect.poll(() => apiRequests.some((url) => url.includes("/api/public-map/countries")), { timeout: 15_000 }).toBe(true);
  expect(apiRequests.some((url) => url.includes("/api/truth-map/") || url.includes("/api/social/") || url.includes("/api/dm/"))).toBe(false);
});

test("public GEO popup keeps its rich legal content and opens the SEO panel without a reload", async ({ page }) => {
  await page.goto("/?geo=US-CA", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  const popup = page.getByTestId("new-map-country-popup");
  await expect(popup).toBeVisible({ timeout: 30_000 });
  await expect(popup.getByTestId("truth-map-legal-evidence")).toBeVisible();
  await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("Current legal conclusion:");
  expect(await popup.locator("section").count()).toBeGreaterThanOrEqual(5);
  await expect(page.getByText("Audit preview only")).toHaveCount(0);

  const seoLink = popup.getByTestId("country-popup-seo-link");
  await expect(seoLink).toBeVisible();
  await expect(seoLink).toHaveAttribute("data-seo-content-link", "1");
  expect(await seoLink.evaluate((node) => getComputedStyle(node).textDecorationStyle)).toBe("dotted");
  const navigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  await seoLink.click();
  await expect(page.getByTestId("new-map-seo-overlay")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("new-map-seo-overlay")).toContainText("Law snapshot");
  await expect(page).toHaveURL(/\/c\/us-ca$/);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigationCount);
});

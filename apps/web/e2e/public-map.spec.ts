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

test("public Truth Map keeps Mongolia's SEO panel on the same current GREEN record and exposes its country info marker", async ({ page }) => {
  await page.goto("/?geo=MN", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });

  const popup = page.getByTestId("new-map-country-popup");
  await expect(popup).toBeVisible({ timeout: 30_000 });
  await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("Current legal conclusion: GREEN");
  const seoLink = popup.getByTestId("country-popup-seo-link");
  await seoLink.click();

  const panel = page.getByTestId("new-map-seo-overlay");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator("[data-category]")).toHaveAttribute("data-category", "LEGAL_OR_DECRIM");
  await expect(panel).toContainText("GREEN in Mongolia");
  await expect(panel).not.toContainText("RED in Mongolia");
  await expect(panel).not.toContainText("Medical cannabis is illegal.");
  await expect(panel).not.toContainText("Cannabis is illegal in Mongolia.");

  const marker = page.locator('[data-seo-marker="1"][data-seo-marker-geo="MN"]');
  await expect(marker).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => {
    const getBox = (selector: string) => document.querySelector(selector)?.getBoundingClientRect() || null;
    const overlaps = (first: DOMRect | null, second: DOMRect | null) => Boolean(
      first && second && first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
    );
    const markerBox = getBox('[data-seo-marker="1"][data-seo-marker-geo="MN"]');
    return markerBox
      ? !overlaps(markerBox, getBox('[data-testid="new-map-seo-overlay"]'))
        && !overlaps(markerBox, getBox('[data-testid="public-map-notice"]'))
      : false;
  }), { timeout: 10_000 }).toBe(true);
});

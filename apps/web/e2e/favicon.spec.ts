import { expect, test } from "@playwright/test";

test("favicon links are present on home", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const iconHref = await page.locator('link[rel="icon"]').first().getAttribute("href");
  expect(iconHref).toContain("favicon");

  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute("href", "/favicon.ico");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
});

test("home canonical exactly matches the sitemap root URL", async ({ page, request }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  await expect(canonical).toHaveAttribute("href", "https://www.islegal.info/");

  const sitemapResponse = await request.get("/sitemap.xml");
  expect(sitemapResponse.ok()).toBe(true);
  expect(await sitemapResponse.text()).toContain("<loc>https://www.islegal.info/</loc>");
});

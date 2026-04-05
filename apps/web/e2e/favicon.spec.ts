import { expect, test } from "playwright/test";

test("favicon links are present on home", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const iconHref = await page.locator('link[rel="icon"]').first().getAttribute("href");
  expect(iconHref).toContain("favicon");

  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute("href", "/favicon.ico");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
});

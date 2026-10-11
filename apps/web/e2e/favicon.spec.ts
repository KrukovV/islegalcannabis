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
  await expect(page.getByRole("link", { name: "Browse all jurisdictions" })).toHaveAttribute("href", "/jurisdictions");
});

test("jurisdiction directory exposes every sitemap GEO link in initial HTML", async ({ page, request }) => {
  const [directoryResponse, sitemapResponse] = await Promise.all([
    request.get("/jurisdictions"),
    request.get("/sitemap.xml")
  ]);
  expect(directoryResponse.ok()).toBe(true);
  expect(sitemapResponse.ok()).toBe(true);
  const html = await directoryResponse.text();
  const sitemapXml = await sitemapResponse.text();
  const sitemapPaths = [...sitemapXml.matchAll(/<loc>https:\/\/www\.islegal\.info([^<]*)<\/loc>/g)]
    .map((match) => match[1])
    .filter((path) => path !== "/" && path !== "/jurisdictions")
    .sort();
  const directoryPaths = [...html.matchAll(/<a\s[^>]*href="(\/(?:c\/|[a-z]{2}\/c\/)[^"]+)"/g)]
    .map((match) => match[1])
    .sort();
  expect(sitemapPaths).toHaveLength(310);
  expect(directoryPaths).toEqual(sitemapPaths);

  await page.goto("/jurisdictions", { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.islegal.info/jurisdictions");
  await expect(page.getByRole("heading", { name: "Countries and territories (238)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "U.S. states (50)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Available language editions (22)" })).toBeVisible();
  await expect(page.locator('a[href="/c/mng"]')).toHaveCount(1);
  await expect(page.locator('a[href="/c/us-tx"]')).toHaveCount(1);
  await expect(page.locator('a[href="/es/c/nld"]')).toHaveCount(1);
});

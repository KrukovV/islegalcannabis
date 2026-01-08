import { expect, test } from "playwright/test";
import fs from "node:fs";
import path from "node:path";

function reportsDir() {
  const root = path.resolve(process.cwd(), "..", "..");
  return path.join(root, "Reports");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

test("/check is mobile-safe at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/check?country=US&region=CA", { waitUntil: "networkidle" });

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasOverflow).toBeFalsy();

  await expect(page.getByTestId("sources")).toBeVisible();
  const sourceLinks = page.getByTestId("source-link");
  await expect(sourceLinks.first()).toBeVisible();
  const sourceText = await sourceLinks.first().innerText();
  expect(sourceText).not.toContain("https://");

  const warningCount = await page.getByTestId("warning").count();
  if (warningCount > 0) {
    await expect(page.getByTestId("warning")).toBeVisible();
  }

  const dir = reportsDir();
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `ui_check_360_${timestamp()}.png`),
    fullPage: true
  });
});

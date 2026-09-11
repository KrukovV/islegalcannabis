import { expect, test } from "@playwright/test";

test("truth-map keeps the established Antarctica animation alongside the editable audit controls", async ({ page }) => {
  await page.goto("/truth-map?qa=1&lat=-77&lng=0&zoom=4", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("truth-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  const animation = page.getByTestId("antarctic-ascii-overlay");
  await expect(animation).toHaveAttribute("data-ascii-state", "running", { timeout: 12_000 });
  await expect(animation).toHaveAttribute("data-renderer", "svg");
  await expect(animation).toHaveAttribute("data-svg-story-count", "34");
  await expect(animation).toHaveAttribute("data-ascii-scenario", "walking-smoker");
  await expect(animation.locator('[data-svg-role="smoker"]')).toHaveCount(3);
  await expect(animation).toHaveAttribute("data-ascii-scenario", "antarctic-face-chorus", { timeout: 10_000 });
  await expect(animation.locator("[data-svg-animal]")).toHaveCount(6);
  await expect(page.getByTestId("new-map-ai-dock")).toBeVisible();
});

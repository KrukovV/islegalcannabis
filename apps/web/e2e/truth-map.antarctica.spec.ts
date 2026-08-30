import { expect, test } from "@playwright/test";

test("truth-map keeps the established Antarctica animation alongside the editable audit controls", async ({ page }) => {
  await page.goto("/truth-map?qa=1&lat=-77&lng=0&zoom=4", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("truth-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  const animation = page.getByTestId("antarctic-ascii-overlay");
  await expect(animation).toHaveAttribute("data-ascii-state", "running", { timeout: 12_000 });
  await expect(animation).toHaveAttribute("data-ascii-scenario", /.+/);
  await expect(page.getByTestId("new-map-ai-dock")).toBeVisible();
});

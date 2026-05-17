import { expect, test } from "@playwright/test";
import {
  assertBoxesDoNotOverlap,
  getViewportBox,
  installVisualViewportMock,
  saveMobileScreenshot,
  seedAiConversation,
  setVisualViewportMock,
  waitForMapReady
} from "./mobileTestUtils";

test("mobile AI bar survives keyboard viewport changes without colliding with country info", async ({ page }, testInfo) => {
  await installVisualViewportMock(page);
  await seedAiConversation(page);
  await page.goto("/c/usa", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  await expect(page.getByTestId("new-map-ai-answer")).toBeVisible();
  await expect(page.getByTestId("new-map-seo-overlay")).toBeVisible();
  const originalViewportHeight = page.viewportSize()?.height || 844;

  const overlayBefore = await getViewportBox(page, '[data-testid="new-map-seo-overlay"]');
  const dockBefore = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  assertBoxesDoNotOverlap(overlayBefore, dockBefore);
  await saveMobileScreenshot(page, testInfo, "ai-open");

  await page.getByTestId("new-map-ai-input").click();
  await page.getByTestId("new-map-ai-input").fill("Can I cross a border with cannabis?");
  const keyboardViewportHeight = Math.max(220, originalViewportHeight - Math.min(320, Math.round(originalViewportHeight * 0.38)));
  await setVisualViewportMock(page, {
    height: keyboardViewportHeight,
    offsetTop: 0
  });
  await page.waitForTimeout(200);

  await expect(page.getByTestId("new-map-root")).toHaveAttribute("data-keyboard-open", "1");

  const overlayDuringKeyboard = await getViewportBox(page, '[data-testid="new-map-seo-overlay"]');
  const dockDuringKeyboard = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  assertBoxesDoNotOverlap(overlayDuringKeyboard, dockDuringKeyboard);
  expect(dockDuringKeyboard.y).toBeLessThan(dockBefore.y);
  await saveMobileScreenshot(page, testInfo, "keyboard-open");

  await setVisualViewportMock(page, {
    height: originalViewportHeight,
    offsetTop: 0
  });
  await page.waitForTimeout(200);

  await expect(page.getByTestId("new-map-root")).toHaveAttribute("data-keyboard-open", "0");
  const dockAfter = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  expect(Math.abs(dockAfter.y - dockBefore.y)).toBeLessThanOrEqual(4);
});

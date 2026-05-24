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

test("mobile AI bar survives keyboard viewport changes without colliding with country panel", async ({ page }, testInfo) => {
  await installVisualViewportMock(page);
  await seedAiConversation(page);
  await page.goto("/c/usa", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const overlayBefore = await getViewportBox(page, '[data-testid="new-map-seo-overlay"]');
  const dockBefore = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  assertBoxesDoNotOverlap(overlayBefore, dockBefore, 4);
  await expect(page.getByTestId("new-map-ai-answer")).toBeVisible();
  await saveMobileScreenshot(page, testInfo, "ai-open");

  const input = page.getByTestId("new-map-ai-input");
  if (await input.isDisabled()) {
    await expect(input).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("new-map-root")).toHaveAttribute("data-keyboard-open", "0");
    return;
  }

  const viewportHeight = page.viewportSize()?.height || 844;
  await input.click();
  await input.fill("Can I cross a border with cannabis?");
  await setVisualViewportMock(page, {
    height: Math.max(260, viewportHeight - Math.min(320, Math.round(viewportHeight * 0.38))),
    offsetTop: 0
  });
  await page.waitForTimeout(250);

  await expect(page.getByTestId("new-map-root")).toHaveAttribute("data-keyboard-open", "1");
  const overlayDuringKeyboard = await getViewportBox(page, '[data-testid="new-map-seo-overlay"]');
  const dockDuringKeyboard = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  assertBoxesDoNotOverlap(overlayDuringKeyboard, dockDuringKeyboard, 4);
  expect(dockDuringKeyboard.y + dockDuringKeyboard.height).toBeLessThan(dockBefore.y + dockBefore.height);
  await saveMobileScreenshot(page, testInfo, "keyboard-open");

  await setVisualViewportMock(page, { height: viewportHeight, offsetTop: 0 });
  await page.waitForTimeout(250);
  await expect(page.getByTestId("new-map-root")).toHaveAttribute("data-keyboard-open", "0");
});

import { expect, test } from "@playwright/test";
import {
  assertBoxInsideViewport,
  assertBoxesDoNotOverlap,
  assertNoHorizontalOverflow,
  getViewportBox,
  getVisualViewportFrame,
  openCountryPopup,
  saveMobileScreenshot,
  waitForMapReady
} from "./mobileTestUtils";

test("country route overlay fits viewport and stays clear of AI dock", async ({ page }, testInfo) => {
  await page.goto("/c/can", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const overlay = await getViewportBox(page, '[data-testid="new-map-seo-overlay"]');
  const dock = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  const viewport = await getVisualViewportFrame(page);
  assertBoxInsideViewport(overlay, viewport);
  assertBoxesDoNotOverlap(overlay, dock, 4);
  await assertNoHorizontalOverflow(page);
  await saveMobileScreenshot(page, testInfo, "country-route-overlay");
});

test("tap popup remains scrollable and does not collide with AI dock", async ({ page }, testInfo) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await openCountryPopup(page, "JP");

  const popup = page.getByTestId("new-map-country-popup");
  await expect(popup).toBeVisible();
  const popupBox = await getViewportBox(page, '[data-testid="new-map-country-popup"]');
  const dockBox = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  const viewport = await getVisualViewportFrame(page);
  assertBoxInsideViewport(popupBox, viewport);
  assertBoxesDoNotOverlap(popupBox, dockBox, 4);

  const popupScroll = await popup.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      overflowY: style.overflowY,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight
    };
  });
  expect(["auto", "scroll"]).toContain(popupScroll.overflowY);
  expect(popupScroll.clientHeight).toBeLessThanOrEqual(Math.ceil(popupBox.height));
  await assertNoHorizontalOverflow(page);
  await saveMobileScreenshot(page, testInfo, "tap-popup");
});

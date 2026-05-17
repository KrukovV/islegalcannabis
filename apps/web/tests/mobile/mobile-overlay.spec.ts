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

test("mobile seo overlay stays inside viewport and above the AI dock", async ({ page }, testInfo) => {
  await page.goto("/c/usa", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await expect(page.getByTestId("new-map-seo-overlay")).toBeVisible();

  const overlayBox = await getViewportBox(page, '[data-testid="new-map-seo-overlay"]');
  const aiDockBox = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  const viewport = await getVisualViewportFrame(page);

  assertBoxInsideViewport(overlayBox, viewport);
  assertBoxInsideViewport(aiDockBox, viewport);
  assertBoxesDoNotOverlap(overlayBox, aiDockBox);
  await assertNoHorizontalOverflow(page);

  const overlayScroll = await page.locator('[data-testid="new-map-seo-overlay"]').evaluate((node) => {
    const element = node as HTMLElement;
    element.scrollTop = element.scrollHeight;
    return {
      scrollTop: element.scrollTop,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    };
  });
  expect(overlayScroll.scrollTop).toBeGreaterThan(0);
  expect(overlayScroll.scrollWidth).toBeLessThanOrEqual(overlayScroll.clientWidth);

  const overlayOwnsTopmostPoint = await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="new-map-seo-overlay"]');
    if (!(overlay instanceof HTMLElement)) return false;
    const rect = overlay.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 24);
    return Boolean(target && overlay.contains(target));
  });
  expect(overlayOwnsTopmostPoint).toBeTruthy();
  await saveMobileScreenshot(page, testInfo, "seo-overlay");
});

test("mobile country popup avoids AI collisions and survives rotate", async ({ page }, testInfo) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  await openCountryPopup(page, "FR");
  const popupBox = await getViewportBox(page, '[data-testid="new-map-country-popup"]');
  const aiDockBox = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  const viewport = await getVisualViewportFrame(page);

  assertBoxInsideViewport(popupBox, viewport);
  assertBoxesDoNotOverlap(popupBox, aiDockBox);

  const popupOwnsTopmostPoint = await page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]');
    if (!(popup instanceof HTMLElement)) return false;
    const rect = popup.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 24);
    return Boolean(target && popup.contains(target));
  });
  expect(popupOwnsTopmostPoint).toBeTruthy();
  await saveMobileScreenshot(page, testInfo, "popup-portrait");

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]');
    const dock = document.querySelector('[data-testid="new-map-ai-dock"]');
    if (!(popup instanceof HTMLElement) || !(dock instanceof HTMLElement)) return false;
    const popupRect = popup.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const popupInsideViewport =
      popupRect.top >= 0 &&
      popupRect.left >= 0 &&
      popupRect.right <= viewportWidth &&
      popupRect.bottom <= viewportHeight;
    const separated = popupRect.bottom <= dockRect.top || dockRect.bottom <= popupRect.top;
    return popupInsideViewport && separated;
  }, undefined, { timeout: 2000 });

  const popupAfterRotate = await getViewportBox(page, '[data-testid="new-map-country-popup"]');
  const aiDockAfterRotate = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  const landscapeViewport = await getVisualViewportFrame(page);

  assertBoxInsideViewport(popupAfterRotate, landscapeViewport);
  assertBoxesDoNotOverlap(popupAfterRotate, aiDockAfterRotate);
  await assertNoHorizontalOverflow(page);
  await saveMobileScreenshot(page, testInfo, "popup-landscape");
});

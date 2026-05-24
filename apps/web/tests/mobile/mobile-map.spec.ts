import { expect, test } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  assertViewportScrollLocked,
  collectMapVisualState,
  dispatchTouchPan,
  openCountryPopup,
  saveMobileScreenshot,
  waitForMapReady,
  writeMobileJson
} from "./mobileTestUtils";

test("mobile map keeps pan zoom tap and golden visual layers stable", async ({ page }, testInfo) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await saveMobileScreenshot(page, testInfo, "first-render");

  const before = await collectMapVisualState(page);
  expect(before.css.rootBg).toBe("rgb(215, 220, 220)");
  expect(before.css.surfaceBg).toBe("rgb(215, 220, 220)");
  expect(before.css.canvasTouchAction).toBe("none");
  expect(before.forbidden).toEqual({
    antarcticaLayer: false,
    antarcticaSource: false,
    antarcticaEndpointStatus: 404
  });
  expect(JSON.stringify(before.paints.legalFill)).toContain("baseColor");
  expect(JSON.stringify(before.paints.usStatesFill)).toContain("baseColor");

  await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          zoomOut: (_options?: { duration?: number }) => void;
        } | null;
      };
    };
    host.__NEW_MAP_DEBUG__?.map?.zoomOut({ duration: 0 });
    host.__NEW_MAP_DEBUG__?.map?.zoomOut({ duration: 0 });
  });
  await page.waitForTimeout(500);
  await saveMobileScreenshot(page, testInfo, "zoomout");

  const viewport = page.viewportSize() || { width: 390, height: 844 };
  await dispatchTouchPan(page, { x: viewport.width * 0.68, y: viewport.height * 0.46 }, { x: viewport.width * 0.34, y: viewport.height * 0.46 });
  await page.waitForTimeout(500);
  await saveMobileScreenshot(page, testInfo, "pan-after-zoomout");

  await openCountryPopup(page, "FR");
  await expect(page.getByTestId("new-map-country-popup")).toBeVisible();
  await saveMobileScreenshot(page, testInfo, "country-open");

  const after = await collectMapVisualState(page);
  expect(after.css.rootBg).toBe(before.css.rootBg);
  expect(after.css.surfaceBg).toBe(before.css.surfaceBg);
  expect(after.forbidden).toEqual(before.forbidden);
  expect(after.bearing).toBe(0);
  expect(after.pitch).toBe(0);
  await assertNoHorizontalOverflow(page);
  await assertViewportScrollLocked(page);
  writeMobileJson(testInfo, "summary", { before, after });
});

import { expect, test } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  getViewportBox,
  openCountryPopup,
  readViewportMeta,
  waitForMapReady
} from "./mobileTestUtils";

test("mobile viewport contract exposes safe-area, touch-action, and 44px targets", async ({ page }) => {
  await page.goto("/c/usa", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const viewportMeta = await readViewportMeta(page);
  expect(viewportMeta).toContain("width=device-width");
  expect(viewportMeta).toContain("initial-scale=1");
  expect(viewportMeta).toContain("viewport-fit=cover");

  const viewportContract = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="new-map-root"]') as HTMLElement | null;
    const canvas = document.querySelector(".maplibregl-canvas") as HTMLElement | null;
    if (!root || !canvas) return null;
    const rootStyle = getComputedStyle(root);
    return {
      safeTop: rootStyle.getPropertyValue("--new-map-safe-top").trim(),
      safeBottom: rootStyle.getPropertyValue("--new-map-safe-bottom").trim(),
      touchAction: getComputedStyle(canvas).touchAction,
      rootHeight: Math.round(root.getBoundingClientRect().height),
      innerHeight: window.innerHeight
    };
  });

  expect(viewportContract).not.toBeNull();
  expect(viewportContract?.safeTop).not.toBe("");
  expect(viewportContract?.safeBottom).not.toBe("");
  expect(viewportContract?.touchAction).toBe("none");
  expect(Math.abs((viewportContract?.rootHeight || 0) - (viewportContract?.innerHeight || 0))).toBeLessThanOrEqual(4);

  const touchTargets = [
    '[data-testid="new-map-ai-submit"]',
    '[data-testid="new-map-ai-input"]',
    'button[aria-label="Close country info"]',
    'button[aria-label="Open info for United States"]'
  ];

  for (const selector of touchTargets) {
    const box = await getViewportBox(page, selector);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await assertNoHorizontalOverflow(page);
});

test("mobile popup route keeps horizontal overflow disabled after viewport changes", async ({ page }) => {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await openCountryPopup(page, "FR");
  await assertNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await assertNoHorizontalOverflow(page);
});

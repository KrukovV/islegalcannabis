import { expect, test, type TestInfo } from "@playwright/test";
import {
  assertBoxInsideViewport,
  assertBoxesDoNotOverlap,
  assertNoHorizontalOverflow,
  getMapSnapshot,
  getViewportBox,
  getVisualViewportFrame,
  openCountryPopup,
  readViewportMeta,
  waitForMapReady
} from "./mobileTestUtils";

const MAP_QA_ROUTE = "/new-map?qa=1";
const USA_QA_ROUTE = "/c/usa?qa=1";
const CHN_QA_ROUTE = "/c/chn?qa=1#law-distribution";
const IPAD_PRO_PROJECTS = new Set(["ipad-pro-chrome"]);

function skipUnlessProject(testInfo: TestInfo, projects: Set<string>) {
  test.skip(!projects.has(testInfo.project.name), "targeted regression coverage only");
}

test("device viewport contract keeps safe-area, touch-action, and 44px targets", async ({ page }) => {
  await page.goto(USA_QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await expect(page.getByTestId("new-map-seo-overlay")).toBeVisible();

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

test("device seo overlay stays inside viewport and above the AI dock", async ({ page }) => {
  await page.goto(USA_QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await expect(page.getByTestId("new-map-seo-overlay")).toBeVisible();

  const overlayBox = await getViewportBox(page, '[data-testid="new-map-seo-overlay"]');
  const aiDockBox = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  const viewport = await getVisualViewportFrame(page);

  assertBoxInsideViewport(overlayBox, viewport);
  assertBoxInsideViewport(aiDockBox, viewport);
  assertBoxesDoNotOverlap(overlayBox, aiDockBox);
  await assertNoHorizontalOverflow(page);
});

test("device popup stays inside viewport, avoids dock, and closes cleanly", async ({ page }) => {
  await page.goto(MAP_QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await openCountryPopup(page, "FR");

  const popupBox = await getViewportBox(page, '[data-testid="new-map-country-popup"]');
  const aiDockBox = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  const viewport = await getVisualViewportFrame(page);

  assertBoxInsideViewport(popupBox, viewport);
  assertBoxesDoNotOverlap(popupBox, aiDockBox);
  await assertNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Close France panel" }).click();
  await expect(page.getByTestId("new-map-country-popup")).toBeHidden();
});

test("device country route keeps vertical scroll usable without horizontal overflow", async ({ page }) => {
  await page.goto(CHN_QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const scrollState = await page.evaluate(async () => {
    const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    window.scrollTo(0, 0);
    await settle();
    const before = window.scrollY;
    window.scrollBy(0, 480);
    await settle();
    const afterDown = window.scrollY;
    window.scrollBy(0, -240);
    await settle();
    return {
      before,
      afterDown,
      afterUp: window.scrollY,
      bodyRouteLock: document.body.dataset.newMapRoute || "",
      bodyOverflow: getComputedStyle(document.body).overflow,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight
    };
  });

  expect(scrollState.bodyRouteLock).toBe("");
  expect(scrollState.bodyOverflow).not.toBe("hidden");
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.innerHeight + 200);
  expect(scrollState.afterDown).toBeGreaterThan(scrollState.before + 100);
  expect(scrollState.afterUp).toBeLessThan(scrollState.afterDown);
  await assertNoHorizontalOverflow(page);
});

test("ipad pro landscape keeps popup above dock and map alive", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, IPAD_PRO_PROJECTS);
  await page.goto(MAP_QA_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await openCountryPopup(page, "FR");

  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1",
    undefined,
    { timeout: 10000 }
  );
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
  }, undefined, { timeout: 5000 });

  const popupAfterRotate = await getViewportBox(page, '[data-testid="new-map-country-popup"]');
  const aiDockAfterRotate = await getViewportBox(page, '[data-testid="new-map-ai-dock"]');
  const viewport = await getVisualViewportFrame(page);
  const mapSnapshot = await getMapSnapshot(page);

  assertBoxInsideViewport(popupAfterRotate, viewport);
  assertBoxesDoNotOverlap(popupAfterRotate, aiDockAfterRotate);
  expect(mapSnapshot).not.toBeNull();
  await assertNoHorizontalOverflow(page);
});

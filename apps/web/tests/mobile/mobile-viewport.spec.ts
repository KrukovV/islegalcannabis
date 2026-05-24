import { expect, test, type TestInfo } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  collectMapVisualState,
  getViewportBox,
  readViewportMeta,
  saveMobileScreenshot,
  waitForMapReady,
  writeMobileJson
} from "./mobileTestUtils";

const LINK_STYLE_PROJECTS = new Set(["iphone-se-webkit", "iphone-12-mini-webkit"]);
const IPAD_PRO_PROJECTS = new Set(["ipad-pro-webkit", "ipad-pro-chrome"]);

function skipUnlessProject(testInfo: TestInfo, projects: Set<string>) {
  test.skip(!projects.has(testInfo.project.name), "targeted regression coverage only");
}

test("mobile viewport exposes safe-area, touch-action, and 44px targets", async ({ page }) => {
  await page.goto("/c/usa", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const viewportMeta = await readViewportMeta(page);
  expect(viewportMeta).toContain("width=device-width");
  expect(viewportMeta).toContain("initial-scale=1");
  expect(viewportMeta).toContain("viewport-fit=cover");

  const contract = await page.evaluate(() => {
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
  expect(contract).not.toBeNull();
  expect(contract?.safeTop).not.toBe("");
  expect(contract?.safeBottom).not.toBe("");
  expect(contract?.touchAction).toBe("none");
  expect(Math.abs((contract?.rootHeight || 0) - (contract?.innerHeight || 0))).toBeLessThanOrEqual(4);

  for (const selector of [
    '[data-testid="new-map-ai-submit"]',
    '[data-testid="new-map-ai-input"]',
    'button[aria-label="Close country info"]',
    'button[aria-label="Open info for United States"]'
  ]) {
    const box = await getViewportBox(page, selector);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await assertNoHorizontalOverflow(page);
});

test("country content and popup links keep dotted internal and solid external underlines", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, LINK_STYLE_PROJECTS);
  await page.goto("/c/mng#law-status-explanation", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const linkStyles = await page.evaluate(() => {
    const readLinkStyle = (selector: string) => {
      const node = document.querySelector(selector) as HTMLAnchorElement | null;
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        href: node.getAttribute("href") || "",
        text: node.textContent?.trim() || "",
        line: style.textDecorationLine,
        style: style.textDecorationStyle
      };
    };
    return {
      articleInternal: readLinkStyle('article a[href^="/c/"]'),
      articleExternal: readLinkStyle('article a[target="_blank"][href^="http"]'),
      panelInternal: readLinkStyle('[data-testid="new-map-seo-overlay"] a[href^="/c/"]'),
      panelExternal: readLinkStyle('[data-testid="new-map-seo-overlay"] a[target="_blank"][href^="http"]')
    };
  });

  expect(linkStyles.articleInternal?.line).toContain("underline");
  expect(linkStyles.articleInternal?.style).toBe("dotted");
  expect(linkStyles.articleExternal?.line).toContain("underline");
  expect(linkStyles.articleExternal?.style).toBe("solid");
  expect(linkStyles.panelInternal?.line).toContain("underline");
  expect(linkStyles.panelInternal?.style).toBe("dotted");
  expect(linkStyles.panelExternal?.line).toContain("underline");
  expect(linkStyles.panelExternal?.style).toBe("solid");
  await saveMobileScreenshot(page, testInfo, "link-underlines");
  await assertNoHorizontalOverflow(page);
});

test("ipad pro keeps original Antarctica color and no supplemental geometry layer", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, IPAD_PRO_PROJECTS);
  await page.goto("/c/bra", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          jumpTo: (_options: { center: [number, number]; zoom: number; bearing: number; pitch: number }) => void;
        } | null;
      };
    };
    host.__NEW_MAP_DEBUG__?.map?.jumpTo({ center: [20, -72], zoom: 1.05, bearing: 0, pitch: 0 });
  });
  await page.waitForTimeout(1200);
  await saveMobileScreenshot(page, testInfo, "ipad-pro-antarctica-visible");

  const state = await collectMapVisualState(page);
  expect(state.forbidden).toEqual({
    antarcticaLayer: false,
    antarcticaSource: false,
    antarcticaEndpointStatus: 404
  });
  expect(state.aqRendered.length).toBeGreaterThan(0);
  expect(state.aqRendered.every((feature) => feature.baseColor === "#c5ccd3" && feature.hoverColor === "#d4dae0")).toBeTruthy();
  expect(state.css.rootBg).toBe("rgb(215, 220, 220)");
  expect(state.css.surfaceBg).toBe("rgb(215, 220, 220)");
  expect(state.css.horizontalOverflowPx).toBeLessThanOrEqual(1);
  writeMobileJson(testInfo, "ipad-pro-antarctica-state", state);
});

import { expect, test, type TestInfo } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  getViewportBox,
  openCountryPopup,
  readViewportMeta,
  waitForMapReady
} from "./mobileTestUtils";

const LINK_STYLE_PROJECTS = new Set(["iphone-se-webkit", "iphone-12-mini-webkit"]);
const TABLET_ARTIFACT_PROJECTS = new Set(["iphone-12-mini-webkit"]);

function skipUnlessProject(testInfo: TestInfo, projects: Set<string>) {
  test.skip(!projects.has(testInfo.project.name), "targeted regression coverage only");
}

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

test("mobile country route keeps document scroll usable after hash navigation", async ({ page }) => {
  await page.goto("/c/chn#law-distribution", { waitUntil: "domcontentloaded" });
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

test("runtime country source excludes Antarctica fill artifact", async ({ page }) => {
  const response = await page.request.get("/api/new-map/countries");
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    features?: Array<{ properties?: { geo?: string } }>;
  };
  expect(payload.features?.some((feature) => feature.properties?.geo === "AQ")).toBe(false);
});

test("country content links use dotted internal and solid external underlines", async ({ page }, testInfo) => {
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
      internal: readLinkStyle('article a[href^="/c/"]'),
      external: readLinkStyle('article a[target="_blank"][href^="http"]')
    };
  });

  expect(linkStyles.internal?.line).toContain("underline");
  expect(linkStyles.internal?.style).toBe("dotted");
  expect(linkStyles.external?.line).toContain("underline");
  expect(linkStyles.external?.style).toBe("solid");
  await assertNoHorizontalOverflow(page);
});

test("mobile popup links use dotted internal and solid external underlines", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, LINK_STYLE_PROJECTS);
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await openCountryPopup(page, "FR");

  const linkStyles = await page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]');
    const readLinkStyle = (node: Element | null) => {
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        href: node.getAttribute("href") || "",
        text: node.textContent?.trim() || "",
        line: style.textDecorationLine,
        style: style.textDecorationStyle,
        marginLeft: style.marginLeft
      };
    };
    return {
      internal: readLinkStyle(popup?.querySelector('a[href^="/c/"]') || null),
      external: readLinkStyle(popup?.querySelector('a[target="_blank"][href^="http"]') || null)
    };
  });

  expect(linkStyles.internal?.line).toContain("underline");
  expect(linkStyles.internal?.style).toBe("dotted");
  expect(linkStyles.external?.line).toContain("underline");
  expect(linkStyles.external?.style).toBe("solid");
  await assertNoHorizontalOverflow(page);
});

test("tablet map masks Antarctica basemap artifact", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, TABLET_ARTIFACT_PROJECTS);
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await page.waitForTimeout(250);

  const maskState = await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
          getLayer: (_id: string) => unknown;
          queryRenderedFeatures: (
            _point: [number, number]
          ) => Array<{ layer?: { id?: string }; properties?: Record<string, unknown> }>;
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    const point: [number, number] = [Math.round(rect.width * 0.5), Math.round(rect.height * 0.92)];
    const features = map.queryRenderedFeatures(point);
    return {
      hasMaskLayer: Boolean(map.getLayer("new-map-antarctica-mask")),
      topLayer: features[0]?.layer?.id || "",
      labels: features
        .map((feature) => String(feature.properties?.name_en || feature.properties?.name || ""))
        .filter(Boolean)
    };
  });

  expect(maskState?.hasMaskLayer).toBe(true);
  expect(maskState?.topLayer).toBe("new-map-antarctica-mask");
  expect(maskState?.labels.some((label) => /antarctica/i.test(label))).toBe(false);
  await assertNoHorizontalOverflow(page);
});

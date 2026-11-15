import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { STATIC_TRUTH_MAP_COUNTRIES_URL } from "../src/truth-map/staticTruthMapUrls";
import { getStaticTruthMapAsset } from "../src/truth-map/staticTruthMap";

const completeCountries = getStaticTruthMapAsset("countries");
const completeCountryFeatureCount = JSON.parse(completeCountries.json).features.length;
const completeCountrySha256 = createHash("sha256").update(completeCountries.json).digest("hex");

async function capturePublicMap(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Object.prototype, "cancelPendingTileRequestsWhileZooming", {
      configurable: true,
      set(value: boolean) {
        Object.defineProperty(this, "cancelPendingTileRequestsWhileZooming", { value, writable: true, configurable: true });
        if (typeof this.project === "function" && typeof this.getCanvas === "function") {
          Object.assign(window, { __PUBLIC_SEO_MAP__: this });
        }
      }
    });
  });
}

async function clickSwissFeature(page: Page) {
  await page.evaluate(() => {
    const map = (window as unknown as { __PUBLIC_SEO_MAP__: import("maplibre-gl").Map }).__PUBLIC_SEO_MAP__;
    map.jumpTo({ center: [8.3, 46.8], zoom: 5 });
  });
  await expect.poll(() => page.evaluate(() => {
    const map = (window as unknown as { __PUBLIC_SEO_MAP__: import("maplibre-gl").Map }).__PUBLIC_SEO_MAP__;
    return map.queryRenderedFeatures(map.project([8.3, 46.8]), { layers: ["legal-fill"] }).some(f => f.properties?.geo === "CH");
  })).toBe(true);
  await page.locator("canvas.maplibregl-canvas").first().click({ position: await page.evaluate(() => {
    const map = (window as unknown as { __PUBLIC_SEO_MAP__: import("maplibre-gl").Map }).__PUBLIC_SEO_MAP__;
    const point = map.project([8.3, 46.8]);
    return { x: point.x, y: point.y };
  }) });
}

for (const width of [375, 1440]) {
  test(`public SEO country navigation replaces an already open country document at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await capturePublicMap(page);
    await page.goto("/c/fra", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText("France");
    await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
    await clickSwissFeature(page);
    const popup = page.getByTestId("new-map-country-popup");
    await expect(popup).toContainText("ISO2: CH", { timeout: 20_000 });
    await popup.getByTestId("country-popup-seo-link").click();
    const panel = page.getByTestId("new-map-seo-overlay");
    await expect(panel).toContainText("GREEN in Switzerland");
    const action = panel.getByRole("link", { name: /Action: sale or distribution/i }).first();
    await expect(action).toHaveAttribute("href", "/c/che#law-recreational");
    await action.click();
    await expect(page).toHaveURL(/\/c\/che#law-recreational$/);
    await expect(page.locator("h1")).toContainText("Switzerland", { timeout: 20_000 });
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.islegal.info/c/che");
    await expect(page.getByTestId("country-page-current-legal-evidence")).toContainText("Current legal conclusion: GREEN");
    await expect(page.locator("#law-recreational")).toBeInViewport();
    await expect(panel).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
    await expect(popup).toHaveCount(0);
    expect(await page.evaluate(() => performance.getEntriesByType("resource")
      .filter(resource => resource.name.includes("/api/new-map/card-entry")).length)).toBe(0);
    const cardRequests: string[] = [];
    page.on("request", request => {
      if (request.resourceType() === "fetch" && request.url().includes("/api/new-map/card-entry")) cardRequests.push(request.url());
    });
    await page.locator('[data-seo-marker="1"][data-seo-marker-geo="CH"]').click();
    await expect(panel).toContainText("GREEN in Switzerland", { timeout: 20_000 });
    expect(cardRequests).toEqual([expect.stringContaining("/api/new-map/card-entry?geo=CH")]);
    await expect(popup).toHaveCount(0);
    await panel.getByRole("button", { name: "Close country info" }).click();
    await expect(panel).toHaveCount(0);
    await expect(popup).toHaveCount(0);
  });

  test(`public SEO close preserves the popup and info marker at ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await capturePublicMap(page);
    await page.goto("/?geo=CH", { waitUntil: "domcontentloaded" });
    const popup = page.getByTestId("new-map-country-popup");
    await expect(popup).toContainText("ISO2: CH", { timeout: 30_000 });
    const sections = await popup.locator("section").count();
    const documents: string[] = [];
    page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
    const marker = page.locator('[data-seo-marker="1"][data-seo-marker-geo="CH"]');
    const panel = page.getByTestId("new-map-seo-overlay");
    await popup.getByTestId("country-popup-seo-link").click();
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await panel.getByRole("button", { name: "Close country info" }).click();
    await expect(panel).toHaveCount(0);
    await expect(popup).toContainText("ISO2: CH");
    expect(await popup.locator("section").count()).toBe(sections);
    await expect(marker).toBeVisible();
    if (width === 1440) {
      await marker.click();
      await expect(panel).toBeVisible();
      await marker.click();
      await expect(panel).toHaveCount(0);
      await expect(popup).toContainText("ISO2: CH");
      expect(await popup.locator("section").count()).toBe(sections);
    }
    await popup.getByTestId("viewport-country-popup-close").click();
    await expect(popup).toHaveCount(0);
    await expect(marker).toBeVisible();
    if (width === 375) {
      // Expose the marker's lower edge below the full-height mobile SEO panel.
      // Move only the real map camera; keep the accepted panel layout intact.
      await page.evaluate(() => {
        const map = (window as unknown as { __PUBLIC_SEO_MAP__: import("maplibre-gl").Map }).__PUBLIC_SEO_MAP__;
        const point = map.project([8.3, 46.8]);
        map.panBy([point.x - 187.5, point.y - 896], { duration: 0 });
      });
    }
    const clickPosition = width === 375 ? { x: 22, y: 40 } : undefined;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await marker.click({ position: clickPosition });
      await expect(panel).toBeVisible({ timeout: 20_000 });
      await marker.click({ position: clickPosition });
      await expect(panel).toHaveCount(0);
      await expect(popup).toHaveCount(0);
      await expect(marker).toBeVisible();
    }
    if (width === 1440) {
      await page.evaluate(() => {
        const map = (window as unknown as { __PUBLIC_SEO_MAP__: import("maplibre-gl").Map }).__PUBLIC_SEO_MAP__;
        map.jumpTo({ center: [2.35, 46.5], zoom: 4 });
      });
      await expect.poll(() => page.evaluate(() => {
        const map = (window as unknown as { __PUBLIC_SEO_MAP__: import("maplibre-gl").Map }).__PUBLIC_SEO_MAP__;
        return map.queryRenderedFeatures(map.project([2.35, 46.5]), { layers: ["legal-fill"] }).some(f => f.properties?.geo === "FR");
      })).toBe(true);
      await page.locator("canvas.maplibregl-canvas").first().click({ position: { x: 720, y: 450 } });
      await expect(popup).toContainText("ISO2: FR", { timeout: 20_000 });
      await page.evaluate(() => {
        const map = (window as unknown as { __PUBLIC_SEO_MAP__: import("maplibre-gl").Map }).__PUBLIC_SEO_MAP__;
        const rect = document.querySelector('[data-seo-marker="1"]')!.getBoundingClientRect();
        map.panBy([rect.x + rect.width / 2 - 50, rect.bottom - 896], { duration: 0 });
      });
      const camera = () => page.evaluate(() => {
        const map = (window as unknown as { __PUBLIC_SEO_MAP__: import("maplibre-gl").Map }).__PUBLIC_SEO_MAP__;
        const center = map.getCenter();
        return [center.lng, center.lat, map.getZoom()];
      });
      const before = await camera();
      for (let cycle = 0; cycle < 2; cycle += 1) {
        await marker.click({ position: { x: 22, y: 40 } });
        await expect(panel).toContainText("GREEN in Switzerland");
        await expect(popup).toContainText("ISO2: FR");
        await marker.click({ position: { x: 22, y: 40 } });
        await expect(panel).toHaveCount(0);
        await expect(popup).toContainText("ISO2: FR");
        expect(await camera()).toEqual(before);
      }
    }
    expect(documents).toEqual([]);
  });
}

test("public SEO related-country links use the destination GEO instead of the previous marker", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?geo=CH", { waitUntil: "domcontentloaded" });
  const popup = page.getByTestId("new-map-country-popup");
  await expect(popup).toContainText("ISO2: CH", { timeout: 30_000 });
  await popup.getByTestId("country-popup-seo-link").click();
  const related = page.getByTestId("new-map-seo-overlay").locator('a[href^="/c/"]:not([href*="#"])').first();
  await expect(related).toBeVisible({ timeout: 20_000 });
  const href = (await related.getAttribute("href"))!;
  const name = (await related.innerText()).split(" / ")[0];
  const target = await (await page.request.get(`/api/new-map/country-page?code=${href.split("/").pop()}`)).json();
  expect(target.geo_code).not.toBe("CH");
  await related.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.locator("h1")).toContainText(name);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://www.islegal.info${href}`);
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  const feature = JSON.parse(completeCountries.json).features.find((item: { properties: { geo: string } }) => item.properties.geo === target.geo_code);
  expect(feature).toBeTruthy();
  const camera = await page.locator("canvas.maplibregl-canvas").first().evaluate(canvas => JSON.parse((canvas as HTMLElement).dataset.truthMapInitialCamera || "{}"));
  expect(camera.lng).toBeCloseTo(Number(feature.properties.labelAnchorLng), 4);
  expect(camera.lat).toBeCloseTo(Number(feature.properties.labelAnchorLat), 4);
  await expect(page.locator('[data-seo-marker-geo="CH"]')).toHaveCount(0);
});

test("public first-fill timing waits for the complete legal source to render", async ({ page }) => {
  const devMode = (await (await page.request.get("/api/build-meta")).json()).devMode === true;
  const workerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/new-map/maplibre-worker")) workerRequests.push(request.url());
  });
  // Production keeps the inline worker even when the former HTTP URL fails.
  // Turbopack development uses the untransformed SDK worker.
  if (!devMode) await page.route("**/api/new-map/maplibre-worker**", (route) => route.abort());
  let releaseCountries: () => void = () => {};
  const countriesGate = new Promise<void>((resolve) => { releaseCountries = resolve; });
  await page.route(`**${STATIC_TRUTH_MAP_COUNTRIES_URL}`, async (route) => {
    await countriesGate;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const trace = (window as unknown as { __NEW_MAP_TRACE__?: { marks?: Record<string, number> } }).__NEW_MAP_TRACE__;
      return typeof trace?.marks?.NM_T2_STYLE_READY === "number";
    });
    // A pending complete collection must never publish a first-fill marker.
    await page.waitForTimeout(300);
    const firstFill = await page.evaluate(() =>
      (window as unknown as { __NEW_MAP_TRACE__?: { marks?: Record<string, number> } }).__NEW_MAP_TRACE__?.marks?.NM_T7_FIRST_FILL_RENDERED
    );
    expect(firstFill).toBeUndefined();
    releaseCountries();
    await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
    expect(await page.evaluate(() =>
      (window as unknown as { __NEW_MAP_TRACE__?: { marks?: Record<string, number> } }).__NEW_MAP_TRACE__?.marks?.NM_T7_FIRST_FILL_RENDERED
    )).toBeGreaterThan(0);
    await page.unroute(`**${STATIC_TRUTH_MAP_COUNTRIES_URL}`);
    let attempts = 0;
    await page.route(`**${STATIC_TRUTH_MAP_COUNTRIES_URL}`, (route) => ++attempts === 1 ? route.abort() : route.continue());
    const fallbackRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith(STATIC_TRUTH_MAP_COUNTRIES_URL)) fallbackRequests.push(request.url());
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
    expect(fallbackRequests).toHaveLength(2);
    expect(attempts).toBe(2);
    if (devMode) expect(workerRequests.length).toBeGreaterThan(0);
    else expect(workerRequests).toHaveLength(0);
    await page.unroute(`**${STATIC_TRUTH_MAP_COUNTRIES_URL}`);
    let failedAttempts = 0;
    await page.route(`**${STATIC_TRUTH_MAP_COUNTRIES_URL}`, (route) => {
      failedAttempts += 1;
      return route.fulfill({ status: 503, body: "temporarily unavailable" });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/503/)).toBeVisible();
    await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "0");
    expect(failedAttempts).toBe(2);
  } finally {
    releaseCountries();
  }
});

test("local public root retains only the local AI dock beside the public Truth Map display core", async ({ page }) => {
  await page.addInitScript(() => {
    const posts: string[] = [];
    const hashes: Promise<string>[] = [];
    Object.assign(window, { __PUBLIC_LEGAL_WORKER_POSTS__: posts, __PUBLIC_LEGAL_WORKER_HASHES__: hashes });
    const originalPost = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      const update = message as { type?: string; data?: { source?: string; request?: { url?: string }; data?: { features?: unknown[] } } };
      if (update.type === "LD" && update.data?.source === "legal-countries" && (update.data.request?.url || update.data.data?.features?.length)) {
        posts.push(update.data.request?.url || `collection:${update.data.data?.features?.length}`);
        if (update.data.data?.features?.length) {
          hashes.push(crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(update.data.data)))
            .then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")));
        }
      }
      return originalPost.call(this, message, Array.isArray(options) ? { transfer: options } : options);
    };
  });
  const descriptorRequests: string[] = [];
  const apiRequests: string[] = [];
  const staticMapRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/vector/carto.streets/v1/tiles.json")) descriptorRequests.push(request.url());
    if (request.url().includes("/api/")) apiRequests.push(request.url());
    if (request.url().includes("/static/truth-map/")) staticMapRequests.push(request.url());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-map-root")).toBeAttached();
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  // The head fetch overlaps SDK loading; its complete collection is submitted once.
  expect(await page.evaluate(() =>
    (window as unknown as { __PUBLIC_LEGAL_WORKER_POSTS__: string[] }).__PUBLIC_LEGAL_WORKER_POSTS__
  )).toEqual([`collection:${completeCountryFeatureCount}`]);
  expect(await page.evaluate(() => Promise.all(
    (window as unknown as { __PUBLIC_LEGAL_WORKER_HASHES__: Promise<string>[] }).__PUBLIC_LEGAL_WORKER_HASHES__
  ))).toEqual([completeCountrySha256]);
  await expect(page.getByTestId("public-map-notice")).toBeVisible();
  await expect(page.getByTestId("antarctic-ascii-overlay")).toBeAttached();
  // The decorative scene is mounted but remains scheduled when Antarctica is
  // outside the camera; polar visibility is verified separately below.
  await expect(page.getByTestId("antarctic-ascii-overlay")).toHaveAttribute("data-ascii-state", /scheduled|running/);
  await expect(page.getByTestId("new-map-ai-dock")).toBeVisible();
  await expect(page.getByTestId("truth-map-social-panel")).toHaveCount(0);
  await expect(page.getByTestId("truth-map-audit-notice")).toHaveCount(0);
  expect(apiRequests.filter((url) => url.includes("/api/public-map/countries"))).toHaveLength(0);
  expect(apiRequests.filter((url) => url.includes("/api/new-map/basemap-style"))).toHaveLength(0);
  expect(descriptorRequests).toHaveLength(0);
  await expect(page.locator(".maplibregl-ctrl-attrib-button")).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-attrib-inner")).toContainText("OpenFreeMap");
  await expect(page.locator(".maplibregl-ctrl-attrib-inner")).toContainText("OpenStreetMap");
  expect(apiRequests.filter((url) => url.includes("/api/new-map/card-index"))).toHaveLength(0);
  expect(staticMapRequests.filter((url) => url.includes("/countries."))).toHaveLength(1);
  expect(staticMapRequests.filter((url) => url.includes("/us-states."))).toHaveLength(0);
  expect(await page.evaluate(() =>
    (window as unknown as { __PUBLIC_TRUTH_MAP_COUNTRIES_PREFETCH__?: { url: string } }).__PUBLIC_TRUTH_MAP_COUNTRIES_PREFETCH__?.url
  )).toBe(STATIC_TRUTH_MAP_COUNTRIES_URL);
  expect(apiRequests.some((url) => url.includes("/api/new-map/countries?inline=1"))).toBe(false);
  expect(apiRequests.some((url) => url.includes("/api/truth-map/") || url.includes("/api/social/") || url.includes("/api/dm/"))).toBe(false);
  // Expanded native credits and the directory link remain separately usable
  // in portrait, landscape and desktop layouts, including after a resize.
  const attribution = page.locator(".maplibregl-ctrl-attrib");
  const toggle = attribution.locator("summary");
  const credits = attribution.locator(".maplibregl-ctrl-attrib-inner");
  const directory = page.getByRole("link", { name: "Browse all jurisdictions", exact: true });
  for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    if (!await attribution.evaluate((element) => element.hasAttribute("open"))) await toggle.click();
    await expect(credits).toBeVisible();
    const linkBox = await directory.boundingBox();
    const creditsBox = await attribution.boundingBox();
    if (!linkBox || !creditsBox) throw new Error("public_map_controls_missing");
    expect(linkBox.y + linkBox.height <= creditsBox.y || creditsBox.y + creditsBox.height <= linkBox.y
      || linkBox.x + linkBox.width <= creditsBox.x || creditsBox.x + creditsBox.width <= linkBox.x,
    `Directory overlaps expanded native attribution at ${viewport.width}x${viewport.height}`).toBe(true);
    await directory.click({ trial: true });
    await toggle.click();
    await expect(credits).toBeHidden();
  }
});

test("public Antarctica scene runs when the continent is in view @opt-in-visual-audit", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?qa=1&lat=-77&lng=0&zoom=4", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  await expect(page.getByTestId("antarctic-ascii-overlay")).toHaveAttribute("data-ascii-state", "running", { timeout: 75_000 });
  if (process.env.ANTARCTICA_RECEIPT_PATH) {
    await page.screenshot({ path: process.env.ANTARCTICA_RECEIPT_PATH });
  }
});

test("public GEO popup keeps its rich legal content and opens the SEO panel without a reload", async ({ page }) => {
  const startedAt = Date.now();
  const phase = (name: string) => console.warn(`UI_PUBLIC_SEO_PHASE ${JSON.stringify({ name, elapsedMs: Date.now() - startedAt })}`);
  await page.goto("/?geo=US-CA", { waitUntil: "domcontentloaded" });
  phase("document-ready");
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
  phase("map-ready");
  const popup = page.getByTestId("new-map-country-popup");
  await expect(popup).toBeVisible({ timeout: 30_000 });
  phase("popup-visible");
  await expect(popup.getByTestId("truth-map-legal-evidence")).toBeVisible();
  await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("Current legal conclusion:");
  expect(await popup.locator("section").count()).toBeGreaterThanOrEqual(5);
  await expect(page.getByText("Audit preview only")).toHaveCount(0);

  const seoLink = popup.getByTestId("country-popup-seo-link");
  await expect(seoLink).toBeVisible();
  await expect(seoLink).toHaveAttribute("data-seo-content-link", "1");
  expect(await seoLink.evaluate((node) => getComputedStyle(node).textDecorationStyle)).toBe("dotted");
  const navigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  phase("before-seo-click");
  await seoLink.click();
  phase("after-seo-click");
  await expect(page.getByTestId("new-map-seo-overlay")).toBeVisible({ timeout: 30_000 });
  phase("seo-overlay-visible");
  await expect(page.getByTestId("new-map-seo-overlay")).toContainText("Law snapshot");
  await expect(page).toHaveURL(/\/c\/us-ca$/);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigationCount);
});

test("public query camera accepts one real legal-feature click immediately after ready", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?lat=57&lng=-105&zoom=4", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 45_000 });
  const canvas = page.locator(".maplibregl-canvas").first();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
  const popup = page.getByTestId("new-map-country-popup");
  await expect(popup).toBeVisible({ timeout: 15_000 });
  await expect(popup).toContainText("Canada");
  await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("Current legal conclusion:");
});

test("public Truth Map keeps Mongolia's SEO panel on the same current GREEN record and exposes its country info marker", async ({ page }) => {
  await page.goto("/?geo=MN", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-map-canvas")).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });

  const popup = page.getByTestId("new-map-country-popup");
  await expect(popup).toBeVisible({ timeout: 30_000 });
  await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("Current legal conclusion: GREEN");
  const seoLink = popup.getByTestId("country-popup-seo-link");
  await seoLink.click();

  const panel = page.getByTestId("new-map-seo-overlay");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator("[data-category]")).toHaveAttribute("data-category", "LEGAL_OR_DECRIM");
  await expect(panel).toContainText("GREEN in Mongolia");
  const authoritativeEvidence = panel.getByTestId("truth-map-seo-legal-evidence");
  await expect(authoritativeEvidence).toContainText("Current legal conclusion: GREEN");
  await expect(authoritativeEvidence).toContainText("Current reconciliation rationale");
  await expect(authoritativeEvidence.getByRole("link", { name: /Legalinfo Mongolia/i })).toHaveCount(2);
  await expect(panel).not.toContainText("RED in Mongolia");
  await expect(panel).not.toContainText("Medical cannabis is illegal.");
  await expect(panel).not.toContainText("Cannabis is illegal in Mongolia.");

  const marker = page.locator('[data-seo-marker="1"][data-seo-marker-geo="MN"]');
  await expect(marker).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => {
    const getBox = (selector: string) => document.querySelector(selector)?.getBoundingClientRect() || null;
    const overlaps = (first: DOMRect | null, second: DOMRect | null) => Boolean(
      first && second && first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
    );
    const markerBox = getBox('[data-seo-marker="1"][data-seo-marker-geo="MN"]');
    return markerBox
      ? !overlaps(markerBox, getBox('[data-testid="new-map-seo-overlay"]'))
        && !overlaps(markerBox, getBox('[data-testid="public-map-notice"]'))
      : false;
  }), { timeout: 10_000 }).toBe(true);
});

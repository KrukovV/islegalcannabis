import { expect, test } from "@playwright/test";

const TRUTH_MAP_QA_ROUTE = "/truth-map?qa=1&lat=40.72&lng=-73.99&zoom=12";
const FORBIDDEN_QUERY_KEYS = new Set([
  "latitude", "longitude", "lat", "lng", "lon", "accuracy", "gps", "location", "coordinates", "position", "west", "east", "south", "north", "bbox",
]);

test("truth-map Social Chat stays isolated and sends only privacy-safe MAP requests", async ({ page }) => {
  test.setTimeout(90_000);
  const runtimeErrors: string[] = [];
  const socialRequests: Array<{ path: string; queryKeys: string[] }> = [];
  const socialMapStatuses: number[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/social/")) return;
    socialRequests.push({ path: url.pathname, queryKeys: [...url.searchParams.keys()].sort() });
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/social/map") socialMapStatuses.push(response.status());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(TRUTH_MAP_QA_ROUTE, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("new-map-ai-dock")).toBeVisible();
  await expect(page.getByTestId("new-map-ai-input")).toBeVisible();
  await expect(page.getByTestId("new-map-ai-input")).toHaveAttribute(
    "placeholder",
    /Ask about cannabis|AI assistant temporarily unavailable/,
  );
  await expect(page.getByTestId("truth-map-social-chat")).toBeVisible();
  await expect(page.getByTestId("truth-map-social-chat")).toHaveAttribute("data-social-panel-state", "expanded");
  await expect(page.getByTestId("truth-map-social-chat")).toHaveAttribute("data-social-hydrated", "true", { timeout: 20_000 });
  await expect(page.getByTestId("new-map-ai-input")).toBeEditable({ timeout: 20_000 });
  await page.waitForFunction(() => Boolean(window.__TRUTH_MAP_QA__), { timeout: 20_000 });
  await page.evaluate(() => window.__TRUTH_MAP_QA__?.jumpTo(-73.99, 40.72, 12));
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getStoreVisibilityLevel() === "LOCAL", { timeout: 40_000 });

  const socialState = await page.evaluate(() => ({
    chatStatus: document.querySelector('[data-testid="truth-map-social-chat"]')?.getAttribute("data-social-chat-status"),
    mapLevel: window.__TRUTH_MAP_QA__?.getSocialVisibilityLevel(),
  }));
  expect(["ACTIVE", "DISABLED"]).toContain(socialState.chatStatus);
  if (socialState.chatStatus === "ACTIVE") {
    await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getSocialVisibilityLevel() === "DISCUSSION", { timeout: 40_000 });
    expect(socialMapStatuses).toContain(200);
    const socialLayer = await page.evaluate(() => {
      const map = window.__TRUTH_MAP_DEBUG__?.map;
      const layer = map?.getLayer("social-map-activity-cells");
      return {
        type: layer?.type,
        icon: map?.getLayoutProperty("social-map-activity-cells", "icon-image"),
        iconReady: map?.hasImage("social-map-activity-chat-bubble") ?? false,
        storeIconReady: map?.hasImage("validated-cannabis-store-leaf") ?? false,
      };
    });
    expect(socialLayer).toEqual({
      type: "symbol",
      icon: "social-map-activity-chat-bubble",
      iconReady: true,
      storeIconReady: true,
    });
  }
  for (const request of socialRequests) {
    expect(request.path.startsWith("/api/social/")).toBe(true);
    expect(request.queryKeys.some((key) => FORBIDDEN_QUERY_KEYS.has(key.toLowerCase()))).toBe(false);
  }
  expect(runtimeErrors.filter((message) => /layer .* does not exist|cannot be queried for features/i.test(message))).toEqual([]);
});

test("existing map stays free of the truth-map Social layer", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/new-map?qa=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__NEW_MAP_DEBUG__?.map), { timeout: 45_000 });
  await expect(page.getByTestId("truth-map-social-chat")).toHaveCount(0);
  const existingMapLayers = await page.evaluate(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    return {
      social: map?.getLayer("social-map-activity-cells"),
      stores: map?.getLayer("validated-cannabis-store-markers"),
    };
  });
  expect(existingMapLayers.social).toBeUndefined();
  expect(existingMapLayers.stores).toBeUndefined();
});

test("truth-map keeps the AI assistant primary and Social compact by default", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto("/truth-map?lat=40.72&lng=-73.99&zoom=12", { waitUntil: "domcontentloaded" });
  const aiDock = page.getByTestId("new-map-ai-dock");
  const social = page.getByTestId("truth-map-social-chat");
  await expect(aiDock).toBeVisible();
  await expect(page.getByTestId("new-map-ai-input")).toBeVisible();
  await expect(page.getByTestId("new-map-ai-input")).toHaveAttribute(
    "placeholder",
    /Ask about cannabis|AI assistant temporarily unavailable/,
  );
  await expect(social).toHaveAttribute("data-social-panel-state", "collapsed");
  await expect(social).toHaveAttribute("data-social-hydrated", "true", { timeout: 20_000 });
  await expect(page.getByTestId("new-map-ai-input")).toBeEditable({ timeout: 20_000 });
  await expect(page.getByTestId("truth-map-social-toggle")).toBeVisible();

  await page.getByTestId("truth-map-social-toggle").click();
  await expect(social).toHaveAttribute("data-social-panel-state", "expanded");
  await expect(page.getByText("Choose a pseudonym", { exact: true })).toBeVisible();
  const [aiBox, socialBox] = await Promise.all([aiDock.boundingBox(), social.boundingBox()]);
  expect(aiBox).not.toBeNull();
  expect(socialBox).not.toBeNull();
  const overlaps = Boolean(aiBox && socialBox
    && aiBox.x < socialBox.x + socialBox.width
    && aiBox.x + aiBox.width > socialBox.x
    && aiBox.y < socialBox.y + socialBox.height
    && aiBox.y + aiBox.height > socialBox.y);
  expect(overlaps).toBe(false);

  const canvas = page.getByTestId("truth-map-canvas");
  const canvasBox = await canvas.boundingBox();
  if (canvasBox) await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.waitForTimeout(250);
  expect(runtimeErrors.filter((message) => /layer .* does not exist|cannot be queried for features/i.test(message))).toEqual([]);
});

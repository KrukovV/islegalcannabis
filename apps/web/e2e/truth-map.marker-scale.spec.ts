import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const STORE_ICON_SIZE_AT_LOCAL_ZOOM = ["interpolate", ["linear"], ["zoom"], 9, 1.02, 12, 1.17, 15, 1.35];
const SOCIAL_ICON_SIZE_AT_LOCAL_ZOOM = [
  "interpolate", ["linear"], ["zoom"],
  9, ["interpolate", ["linear"], ["get", "activeDiscussionCount"], 1, 1.08, 10, 1.18, 100, 1.28],
  12, ["interpolate", ["linear"], ["get", "activeDiscussionCount"], 1, 1.22, 10, 1.32, 100, 1.42],
  15, ["interpolate", ["linear"], ["get", "activeDiscussionCount"], 1, 1.45, 10, 1.55, 100, 1.65],
];
const SOCIAL_COUNT_TEXT_SIZE_AT_LOCAL_ZOOM = ["interpolate", ["linear"], ["zoom"], 9, 12, 12, 13, 15, 14];
const QA_SOCIAL_CELL = "qa-marker-scale-visual-only";
const QA_SCREENSHOT_PATH = path.join(os.tmpdir(), "islegal-truth-map-full-zoom-marker-scale.png");

test("truth-map full local zoom renders a social bubble no smaller than the enlarged store leaf", async ({ page }) => {
  test.setTimeout(60_000);
  const runtimeErrors: string[] = [];
  const socialMapRequestZooms: string[] = [];
  const socialMapResponseStatuses: number[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/social/map") socialMapRequestZooms.push(String(url.searchParams.get("zoom")));
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/social/map") socialMapResponseStatuses.push(response.status());
  });

  await page.goto("/truth-map?qa=1&lat=40.7033862&lng=-73.9893613&zoom=15", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__TRUTH_MAP_DEBUG__?.map?.getLayer("validated-cannabis-store-markers")), { timeout: 20_000 });
  await page.waitForFunction(() => Boolean(window.__TRUTH_MAP_DEBUG__?.map?.getLayer("social-map-activity-cells")), { timeout: 20_000 });
  await page.waitForTimeout(800);
  expect(socialMapRequestZooms).toContain("14");
  expect(socialMapRequestZooms).not.toContain("15");
  expect(socialMapResponseStatuses).not.toContain(400);

  const markerScale = await page.evaluate((qaCell) => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    const socialSource = map?.getSource("social-map-activity") as { setData?: (_data: GeoJSON.FeatureCollection) => void } | undefined;
    if (!map || !socialSource?.setData) return null;
    const occupiedStorePoints = (map.queryRenderedFeatures({ layers: ["validated-cannabis-store-markers"] }) || [])
      .flatMap((feature) => feature.geometry.type === "Point"
        ? [map.project(feature.geometry.coordinates as [number, number])]
        : []);
    const socialScreenPoint = [[640, 160], [760, 210], [720, 420], [540, 470]]
      .find(([x, y]) => occupiedStorePoints.every((point) => Math.hypot(point.x - x, point.y - y) > 96)) || [640, 160];
    const socialCoordinate = map.unproject(socialScreenPoint).toArray();
    // A canvas-only fixture permits a direct visual comparison without creating
    // a discussion, a location record, or any persisted Social state.
    socialSource.setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Point", coordinates: socialCoordinate },
        properties: { kind: "social_activity", geoCell: qaCell, activeDiscussionCount: 1, geoResolution: 8 },
      }],
    });
    return {
      zoom: map.getZoom(),
      storeIconSize: map.getLayoutProperty("validated-cannabis-store-markers", "icon-size"),
      socialIconSize: map.getLayoutProperty("social-map-activity-cells", "icon-size"),
      socialTextSize: map.getLayoutProperty("social-map-activity-counts", "text-size"),
      socialPoint: map.project(socialCoordinate),
    };
  }, QA_SOCIAL_CELL);

  expect(markerScale).not.toBeNull();
  expect(markerScale?.zoom).toBeCloseTo(15, 5);
  expect(markerScale?.storeIconSize).toEqual(STORE_ICON_SIZE_AT_LOCAL_ZOOM);
  expect(markerScale?.socialIconSize).toEqual(SOCIAL_ICON_SIZE_AT_LOCAL_ZOOM);
  expect(markerScale?.socialTextSize).toEqual(SOCIAL_COUNT_TEXT_SIZE_AT_LOCAL_ZOOM);
  expect(markerScale?.socialPoint.x).toBeGreaterThan(440);
  expect(markerScale?.socialPoint.x).toBeLessThan(870);
  expect(markerScale?.socialPoint.y).toBeGreaterThan(70);
  expect(markerScale?.socialPoint.y).toBeLessThan(580);
  await page.waitForFunction((qaCell) => {
    const map = window.__TRUTH_MAP_DEBUG__?.map;
    return (map?.queryRenderedFeatures({ layers: ["social-map-activity-cells"] }) || [])
      .some((feature) => feature.properties?.geoCell === qaCell);
  }, QA_SOCIAL_CELL, { timeout: 20_000 });

  await page.screenshot({ path: QA_SCREENSHOT_PATH });
  expect(fs.statSync(QA_SCREENSHOT_PATH).size).toBeGreaterThan(0);
  expect(runtimeErrors.filter((message) => /layer .* does not exist|cannot be queried for features/i.test(message))).toEqual([]);
});

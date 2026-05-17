import { expect, test } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  installPerfObservers,
  measurePopupCloseLatency,
  measurePopupOpenLatency,
  measurePopupRouteLatency,
  savePerfScreenshot,
  waitForMapReady,
  writePerfJson
} from "./perfTestUtils";

test("perf popup open, route, and close stay responsive", async ({ page }, testInfo) => {
  await installPerfObservers(page);
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);

  const popupOpenLatency = await measurePopupOpenLatency(page, "FR");
  await savePerfScreenshot(page, testInfo, "popup-open");

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  const popupRouteLatency = await measurePopupRouteLatency(page, "FR");
  await savePerfScreenshot(page, testInfo, "popup-route");

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  const popupCloseLatency = await measurePopupCloseLatency(page, "FR");
  await assertNoHorizontalOverflow(page);

  writePerfJson(testInfo, "summary", {
    route: "/new-map",
    project: testInfo.project.name,
    popupOpenLatency,
    popupRouteLatency,
    popupCloseLatency
  });

  expect(popupOpenLatency).toBeLessThan(2000);
  expect(popupRouteLatency).toBeLessThan(3000);
  expect(popupCloseLatency).toBeLessThan(1000);
});

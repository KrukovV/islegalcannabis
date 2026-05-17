import { expect, test } from "@playwright/test";
import {
  assertTraceOrdering,
  collectNewMapPerf,
  installPerfObservers,
  measureFirstPanLatency,
  savePerfScreenshot,
  writePerfJson
} from "./perfTestUtils";

test("perf new-map reaches interactive map runtime without white flashes", async ({ page }, testInfo) => {
  await installPerfObservers(page);
  const summary = await collectNewMapPerf(page);
  const firstPanLatency = await measureFirstPanLatency(page);
  await savePerfScreenshot(page, testInfo, "map-interactive");
  writePerfJson(testInfo, "timings", {
    route: "/new-map",
    project: testInfo.project.name,
    firstPanLatency,
    ...summary
  });

  assertTraceOrdering(summary.trace);
  expect(summary.trace?.aiReady).not.toBeNull();
  expect(summary.trace?.idleComplete || 0).toBeLessThan(9000);
  expect(summary.vitals.cls).toBeLessThan(0.1);
  expect(firstPanLatency).toBeLessThan(1500);
});

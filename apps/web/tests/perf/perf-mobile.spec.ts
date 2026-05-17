import { expect, test } from "@playwright/test";
import {
  collectNewMapPerf,
  installPerfObservers,
  isMobilePerfProject,
  measureWarmReloadMapReady,
  savePerfScreenshot,
  writePerfJson
} from "./perfTestUtils";

test("perf mobile compares cold and warm live map startup", async ({ page }, testInfo) => {
  test.skip(!isMobilePerfProject(testInfo.project.name));

  await installPerfObservers(page);
  const cold = await collectNewMapPerf(page);
  const warmMapReadyMs = await measureWarmReloadMapReady(page);
  const warmVitals = await page.evaluate(() => {
    const host = window as Window & {
      __PERF_QA__?: {
        fcp: number;
        lcp: number;
        cls: number;
        inp: number;
        longTaskEnd: number;
      };
    };
    return host.__PERF_QA__ || null;
  });
  await savePerfScreenshot(page, testInfo, "warm-render");
  writePerfJson(testInfo, "summary", {
    route: "/new-map",
    project: testInfo.project.name,
    cold,
    warm: {
      mapReadyMs: warmMapReadyMs,
      vitals: warmVitals
    }
  });

  expect(cold.trace?.idleComplete || 0).toBeLessThan(9000);
  expect(cold.vitals.lcp).toBeLessThan(6000);
  expect(warmMapReadyMs).toBeLessThan(8000);
});

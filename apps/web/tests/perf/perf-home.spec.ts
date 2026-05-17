import { expect, test } from "@playwright/test";
import {
  collectHomePerf,
  installPerfObservers,
  isMobilePerfProject,
  savePerfScreenshot,
  writePerfJson
} from "./perfTestUtils";

test("perf home keeps first render and AI dock stable", async ({ page }, testInfo) => {
  await installPerfObservers(page);
  const summary = await collectHomePerf(page, "/");
  await savePerfScreenshot(page, testInfo, "first-render");
  writePerfJson(testInfo, "summary", {
    route: "/",
    project: testInfo.project.name,
    ...summary
  });

  const lcpBudget = isMobilePerfProject(testInfo.project.name) ? 5000 : 4500;
  const fcpBudget = isMobilePerfProject(testInfo.project.name) ? 3500 : 3000;

  expect(summary.vitals.cls).toBeLessThan(0.1);
  expect(summary.vitals.fcp).toBeGreaterThan(0);
  expect(summary.vitals.fcp).toBeLessThan(fcpBudget);
  expect(summary.vitals.lcp).toBeGreaterThan(0);
  expect(summary.vitals.lcp).toBeLessThan(lcpBudget);
});

import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import { mobileArtifactPath, saveMobileScreenshot, waitForMapReady, writeMobileJson } from "./mobileTestUtils";

const execFileAsync = promisify(execFile);

async function runLighthouseAudit(targetUrl: string, outputPath: string) {
  await execFileAsync(
    "npx",
    [
      "-y",
      "lighthouse",
      targetUrl,
      "--quiet",
      "--output=json",
      `--output-path=${outputPath}`,
      "--only-categories=performance,accessibility",
      "--form-factor=mobile",
      "--screenEmulation.mobile",
      "--screenEmulation.width=360",
      "--screenEmulation.height=800",
      "--screenEmulation.deviceScaleFactor=3",
      "--throttling-method=provided",
      "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage"
    ],
    {
      cwd: process.cwd(),
      env: process.env
    }
  );
}

test("mobile performance budget stays green on android chrome", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || !testInfo.project.name.startsWith("android-chrome"));
  test.setTimeout(180000);

  await page.addInitScript(() => {
    const metrics = {
      cls: 0,
      lcp: 0
    };

    const host = window as Window & {
      __MOBILE_QA_WEB_VITALS__?: typeof metrics;
    };
    host.__MOBILE_QA_WEB_VITALS__ = metrics;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput) {
          metrics.cls += Number(entry.value || 0);
        }
      }
    }).observe({ type: "layout-shift", buffered: true });

    new PerformanceObserver((list) => {
      const entries = list.getEntries() as Array<PerformanceEntry & { renderTime?: number; loadTime?: number; startTime?: number }>;
      const lastEntry = entries[entries.length - 1];
      if (!lastEntry) return;
      metrics.lcp = Math.max(
        metrics.lcp,
        Number(lastEntry.renderTime || lastEntry.loadTime || lastEntry.startTime || 0)
      );
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForMapReady(page);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await saveMobileScreenshot(page, testInfo, "perf-first-render");

  const runtimeVitals = await page.evaluate(() => {
    const host = window as Window & {
      __MOBILE_QA_WEB_VITALS__?: {
        cls: number;
        lcp: number;
      };
    };
    return host.__MOBILE_QA_WEB_VITALS__ || null;
  });

  expect(runtimeVitals).not.toBeNull();
  expect(Number(runtimeVitals?.cls || 0)).toBeLessThan(0.1);
  expect(Number(runtimeVitals?.lcp || 0)).toBeLessThan(5000);
  await writeMobileJson(testInfo, "web-vitals", runtimeVitals);
  await page.close();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const lighthousePath = mobileArtifactPath(testInfo, "lighthouse", "json");
  const lighthouseWarmupPath = mobileArtifactPath(testInfo, "lighthouse-warmup", "json");
  const targetUrl = `${testInfo.project.use.baseURL || "http://127.0.0.1:3000"}/new-map`;

  // Warm the dedicated Lighthouse Chrome process once to reduce local provided-throttling variance.
  await runLighthouseAudit(targetUrl, lighthouseWarmupPath);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await runLighthouseAudit(targetUrl, lighthousePath);

  const lighthouseReport = JSON.parse(fs.readFileSync(lighthousePath, "utf8")) as {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, { numericValue?: number | null }>;
  };

  const performanceScore = Number(lighthouseReport.categories?.performance?.score || 0);
  const accessibilityScore = Number(lighthouseReport.categories?.accessibility?.score || 0);
  const cls = Number(lighthouseReport.audits?.["cumulative-layout-shift"]?.numericValue || 0);
  const lcp = Number(lighthouseReport.audits?.["largest-contentful-paint"]?.numericValue || 0);

  await writeMobileJson(testInfo, "lighthouse-summary", {
    performanceScore,
    accessibilityScore,
    cls,
    lcp
  });

  expect(performanceScore).toBeGreaterThanOrEqual(0.85);
  expect(accessibilityScore).toBeGreaterThanOrEqual(0.9);
  expect(cls).toBeLessThan(0.1);
  expect(lcp).toBeLessThan(4000);
});

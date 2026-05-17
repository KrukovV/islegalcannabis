import { expect, type Page, type TestInfo } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  assertNoHorizontalOverflow,
  getCountryPopupCandidatePoints,
  getMapSnapshot,
  openCountryPopup,
  openCountryPopupFromCandidates,
  waitForMapReady
} from "../mobile/mobileTestUtils";

type PerfTraceSummary = {
  routeStart: number | null;
  mapConstructor: number | null;
  styleReady: number | null;
  firstTile: number | null;
  countriesReady: number | null;
  firstFill: number | null;
  labelsVisible: number | null;
  idleComplete: number | null;
  aiReady: number | null;
};

type PerfVitals = {
  fcp: number;
  lcp: number;
  cls: number;
  inp: number;
  longTaskEnd: number;
  ttiCandidate: number;
};

type PerfResourceSummary = {
  count: number;
  firstStart: number | null;
  firstResponseEnd: number | null;
  maxResponseEnd: number | null;
  totalTransferSize: number;
  totalEncodedBodySize: number;
};

function findRepoRoot() {
  let current = process.cwd();
  while (true) {
    if (
      fs.existsSync(path.join(current, "CONTINUITY.md")) &&
      fs.existsSync(path.join(current, "tools", "pass_cycle.sh"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

const PERF_QA_ROOT = path.join(findRepoRoot(), "QA", "perf");
const PERF_QA_MODE = process.env.PERF_QA_MODE || "adhoc";

function joinPath(...segments: string[]) {
  return segments
    .map((segment, index) => {
      if (index === 0) return segment.replace(/\/+$/g, "");
      return segment.replace(/^\/+|\/+$/g, "");
    })
    .filter(Boolean)
    .join("/");
}

function sanitizeSegment(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "artifact";
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function perfArtifactDir(testInfo: TestInfo) {
  const dirPath = joinPath(PERF_QA_ROOT, PERF_QA_MODE, sanitizeSegment(testInfo.project.name));
  ensureDir(dirPath);
  return dirPath;
}

export function isMobilePerfProject(projectName: string) {
  return /(iphone|ipad|pixel|galaxy)/i.test(projectName);
}

export function isDesktopPerfProject(projectName: string) {
  return /^desktop-/i.test(projectName);
}

export function isChromiumPerfProject(projectName: string) {
  return /(chrome)/i.test(projectName);
}

export function perfArtifactPath(testInfo: TestInfo, label: string, extension: string) {
  return joinPath(
    perfArtifactDir(testInfo),
    `${sanitizeSegment(testInfo.title)}-${sanitizeSegment(label)}.${extension.replace(/^\./, "")}`
  );
}

export async function savePerfScreenshot(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: perfArtifactPath(testInfo, label, "png"),
    fullPage: false
  });
}

export function writePerfJson(testInfo: TestInfo, label: string, payload: unknown) {
  fs.writeFileSync(
    perfArtifactPath(testInfo, label, "json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

export async function installPerfObservers(page: Page) {
  await page.addInitScript(() => {
    const host = window as Window & {
      __PERF_QA__?: {
        fcp: number;
        lcp: number;
        cls: number;
        inp: number;
        longTaskEnd: number;
      };
    };
    host.__PERF_QA__ = {
      fcp: 0,
      lcp: 0,
      cls: 0,
      inp: 0,
      longTaskEnd: 0
    };

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            host.__PERF_QA__!.fcp = Math.max(host.__PERF_QA__!.fcp, Number(entry.startTime || 0));
          }
        }
      }).observe({ type: "paint", buffered: true });
    } catch {
      // ignore unsupported paint observer
    }

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput) {
            host.__PERF_QA__!.cls += Number(entry.value || 0);
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // ignore unsupported cls observer
    }

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries() as Array<PerformanceEntry & { renderTime?: number; loadTime?: number; startTime?: number }>;
        const lastEntry = entries[entries.length - 1];
        if (!lastEntry) return;
        host.__PERF_QA__!.lcp = Math.max(
          host.__PERF_QA__!.lcp,
          Number(lastEntry.renderTime || lastEntry.loadTime || lastEntry.startTime || 0)
        );
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // ignore unsupported lcp observer
    }

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { duration?: number }>) {
          host.__PERF_QA__!.inp = Math.max(host.__PERF_QA__!.inp, Number(entry.duration || 0));
        }
      }).observe({ type: "event", buffered: true } as PerformanceObserverInit);
    } catch {
      // ignore unsupported inp observer
    }

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { duration?: number; startTime?: number }>) {
          host.__PERF_QA__!.longTaskEnd = Math.max(
            host.__PERF_QA__!.longTaskEnd,
            Number(entry.startTime || 0) + Number(entry.duration || 0)
          );
        }
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // ignore unsupported longtask observer
    }
  });
}

export async function readPerfVitals(page: Page): Promise<PerfVitals> {
  const metrics = await page.evaluate(() => {
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

  const fcp = Number(metrics?.fcp || 0);
  const lcp = Number(metrics?.lcp || 0);
  const cls = Number(metrics?.cls || 0);
  const inp = Number(metrics?.inp || 0);
  const longTaskEnd = Number(metrics?.longTaskEnd || 0);
  return {
    fcp,
    lcp,
    cls,
    inp,
    longTaskEnd,
    ttiCandidate: Math.max(fcp, lcp, longTaskEnd)
  };
}

export async function readTraceSummary(page: Page): Promise<PerfTraceSummary | null> {
  return page.evaluate(() => {
    const host = window as Window & {
      __NEW_MAP_TRACE__?: {
        t0?: number;
        marks?: Record<string, number>;
      };
    };
    const trace = host.__NEW_MAP_TRACE__;
    if (!trace?.marks) return null;
    const t0 = Number(trace.t0 || 0);
    const readMark = (name: string) => {
      const value = trace.marks?.[name];
      return typeof value === "number" ? Math.round(value - t0) : null;
    };
    return {
      routeStart: readMark("NM_T0_ROUTE_START"),
      mapConstructor: readMark("NM_T1_MAP_CONSTRUCTOR"),
      styleReady: readMark("NM_T2_STYLE_READY"),
      firstTile: readMark("NM_T3_FIRST_TILE"),
      countriesReady: readMark("NM_T4_COUNTRIES_READY"),
      firstFill: readMark("NM_T5_FIRST_FILL") ?? readMark("NM_T5_FILL_RENDERED") ?? readMark("NM_T7_FIRST_FILL_RENDERED"),
      labelsVisible: readMark("NM_T6_LABELS_VISIBLE"),
      idleComplete: readMark("NM_T7_IDLE_COMPLETE") ?? readMark("NM_T8_IDLE_FIRST"),
      aiReady: readMark("NM_T11_AI_READY")
    };
  });
}

export function assertTraceOrdering(summary: PerfTraceSummary | null) {
  expect(summary).not.toBeNull();
  const required = {
    routeStart: summary?.routeStart,
    mapConstructor: summary?.mapConstructor,
    styleReady: summary?.styleReady,
    firstTile: summary?.firstTile,
    countriesReady: summary?.countriesReady,
    firstFill: summary?.firstFill,
    labelsVisible: summary?.labelsVisible,
    idleComplete: summary?.idleComplete
  };
  for (const value of Object.values(required)) {
    expect(typeof value === "number" && Number.isFinite(value)).toBeTruthy();
  }
  expect(required.mapConstructor || 0).toBeGreaterThanOrEqual(required.routeStart || 0);
  expect(required.styleReady || 0).toBeGreaterThanOrEqual(required.mapConstructor || 0);
  expect(required.firstTile || 0).toBeGreaterThanOrEqual(required.styleReady || 0);
  expect(required.countriesReady || 0).toBeGreaterThanOrEqual(required.styleReady || 0);
  expect(required.firstFill || 0).toBeGreaterThanOrEqual(required.countriesReady || 0);
  expect(required.labelsVisible || 0).toBeGreaterThanOrEqual(required.styleReady || 0);
  expect((required.idleComplete || 0) + 2).toBeGreaterThanOrEqual(required.firstFill || 0);
  expect((required.idleComplete || 0) + 2).toBeGreaterThanOrEqual(required.labelsVisible || 0);
}

export async function readNavigationSummary(page: Page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];

    const summarizeResources = (matcher: RegExp): PerfResourceSummary => {
      const matches = resources.filter((entry) => matcher.test(entry.name));
      if (!matches.length) {
        return {
          count: 0,
          firstStart: null,
          firstResponseEnd: null,
          maxResponseEnd: null,
          totalTransferSize: 0,
          totalEncodedBodySize: 0
        };
      }
      return {
        count: matches.length,
        firstStart: Math.round(Math.min(...matches.map((entry) => entry.startTime))),
        firstResponseEnd: Math.round(Math.min(...matches.map((entry) => entry.responseEnd))),
        maxResponseEnd: Math.round(Math.max(...matches.map((entry) => entry.responseEnd))),
        totalTransferSize: matches.reduce((sum, entry) => sum + Number(entry.transferSize || 0), 0),
        totalEncodedBodySize: matches.reduce((sum, entry) => sum + Number(entry.encodedBodySize || 0), 0)
      };
    };

    return {
      navigation: navigation
        ? {
            dns: Math.round(navigation.domainLookupEnd - navigation.domainLookupStart),
            tls:
              navigation.secureConnectionStart > 0
                ? Math.round(navigation.connectEnd - navigation.secureConnectionStart)
                : 0,
            ttfb: Math.round(navigation.responseStart - navigation.requestStart),
            htmlDownload: Math.round(navigation.responseEnd - navigation.responseStart),
            domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
            loadEventEnd: Math.round(navigation.loadEventEnd),
            transferSize: Number(navigation.transferSize || 0),
            encodedBodySize: Number(navigation.encodedBodySize || 0)
          }
        : null,
      resources: {
        js: summarizeResources(/\/_next\/static\/.*\.js(\?|$)/),
        countries: summarizeResources(/\/api\/new-map\/countries(\?|$)/),
        basemapStyle: summarizeResources(/\/api\/new-map\/basemap-style(\?|$)/),
        basemapSource: summarizeResources(/\/api\/new-map\/basemap-source(\?|$)/),
        basemapTiles: summarizeResources(/\/api\/new-map\/basemap-tile\//)
      }
    };
  });
}

export async function waitForAiDock(page: Page) {
  await page.waitForSelector('[data-testid="new-map-ai-dock"]', { state: "visible", timeout: 20000 });
}

export async function measureSelectorVisibleLatency(page: Page, selector: string) {
  const start = await page.evaluate(() => performance.now());
  await page.waitForSelector(selector, { state: "visible", timeout: 20000 });
  const end = await page.evaluate(() => performance.now());
  return Math.round(end - start);
}

export async function assertNoWhiteFlash(page: Page) {
  const backgroundSample = await page.evaluate(() => ({
    root: getComputedStyle(document.querySelector('[data-testid="new-map-root"]') as Element).backgroundColor,
    surface: getComputedStyle(document.querySelector('[data-testid="new-map-surface"]') as Element).backgroundColor
  }));
  expect(backgroundSample.root).not.toBe("rgb(255, 255, 255)");
  expect(backgroundSample.surface).not.toBe("rgb(255, 255, 255)");
}

export async function measureFirstPanLatency(page: Page) {
  const viewport = page.viewportSize() || { width: 390, height: 844 };
  const before = await getMapSnapshot(page);
  expect(before).not.toBeNull();
  const attempts = [
    {
      from: { x: Math.round(viewport.width * 0.52), y: Math.round(viewport.height * 0.64) },
      to: { x: Math.round(viewport.width * 0.28), y: Math.round(viewport.height * 0.46) }
    },
    {
      from: { x: Math.round(viewport.width * 0.58), y: Math.round(viewport.height * 0.58) },
      to: { x: Math.round(viewport.width * 0.24), y: Math.round(viewport.height * 0.42) }
    },
    {
      from: { x: Math.round(viewport.width * 0.5), y: Math.round(viewport.height * 0.54) },
      to: { x: Math.round(viewport.width * 0.18), y: Math.round(viewport.height * 0.36) }
    }
  ];

  let moved = false;
  let latency = 0;
  for (const attempt of attempts) {
    const start = await page.evaluate(() => performance.now());
    const moveEventPromise = page.evaluate(() => {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: {
            once: (_event: "move", _listener: () => void) => void;
          } | null;
        };
      };
      const map = host.__NEW_MAP_DEBUG__?.map;
      if (!map) return Promise.resolve(0);
      return new Promise<number>((resolve) => {
        let resolved = false;
        const done = (value: number) => {
          if (resolved) return;
          resolved = true;
          resolve(value);
        };
        map.once("move", () => done(performance.now()));
        window.setTimeout(() => done(0), 2000);
      });
    });
    await page.mouse.move(attempt.from.x, attempt.from.y);
    await page.mouse.down();
    await page.mouse.move(attempt.to.x, attempt.to.y, { steps: 16 });
    await page.mouse.up();
    const moveEventAt = await moveEventPromise;
    await page.waitForTimeout(50);
    const nextSnapshot = await getMapSnapshot(page);
    if (JSON.stringify(nextSnapshot) !== JSON.stringify(before)) {
      const end = moveEventAt || await page.evaluate(() => performance.now());
      latency = Math.round(end - start);
      moved = true;
      break;
    }
  }

  expect(moved).toBeTruthy();
  return latency;
}

export async function measurePopupOpenLatency(page: Page, iso: string) {
  const candidatePoints = await getCountryPopupCandidatePoints(page, iso);
  const start = await page.evaluate(() => performance.now());
  await openCountryPopupFromCandidates(page, iso, candidatePoints);
  const end = await page.evaluate(() => performance.now());
  return Math.round(end - start);
}

export async function measurePopupRouteLatency(page: Page, iso: string) {
  await openCountryPopup(page, iso);
  const start = await page.evaluate(() => performance.now());
  await page.locator('[data-testid="new-map-country-popup"] a').last().click();
  await expect(page.getByTestId("new-map-seo-overlay")).toBeVisible();
  await expect(page).toHaveURL(/\/c\//);
  const end = await page.evaluate(() => performance.now());
  return Math.round(end - start);
}

export async function measurePopupCloseLatency(page: Page, iso: string) {
  await openCountryPopup(page, iso);
  const start = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: /Close France panel/i }).click();
  await expect(page.getByTestId("new-map-country-popup")).toBeHidden();
  const end = await page.evaluate(() => performance.now());
  return Math.round(end - start);
}

export async function collectHomePerf(page: Page, pathName: string) {
  await page.goto(pathName, { waitUntil: "domcontentloaded" });
  await waitForAiDock(page);
  await waitForMapReady(page);
  await assertNoHorizontalOverflow(page);
  const vitals = await readPerfVitals(page);
  const navigation = await readNavigationSummary(page);
  return {
    vitals,
    navigation
  };
}

export async function collectNewMapPerf(page: Page) {
  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await waitForAiDock(page);
  await waitForMapReady(page);
  await assertNoHorizontalOverflow(page);
  await assertNoWhiteFlash(page);
  const trace = await readTraceSummary(page);
  const vitals = await readPerfVitals(page);
  const navigation = await readNavigationSummary(page);
  return {
    trace,
    vitals,
    navigation
  };
}

export async function measureWarmReloadMapReady(page: Page) {
  const start = await page.evaluate(() => performance.now());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAiDock(page);
  await waitForMapReady(page);
  const end = await page.evaluate(() => performance.now());
  return Math.round(end - start);
}

export {
  assertNoHorizontalOverflow,
  openCountryPopup,
  waitForMapReady
};

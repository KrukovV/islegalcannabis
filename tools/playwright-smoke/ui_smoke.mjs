#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "@playwright/test";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "Reports", "ui_smoke.txt");
const BASE_URL = "http://127.0.0.1:3000";
const RUN_ID = process.env.RUN_ID || `ui-smoke-${Date.now()}`;
const REQUIRE_WEBKIT = String(process.env.UI_SMOKE_WEBKIT || "1") !== "0";

async function auditBrowser(browserName, isMobile) {
  const browserType = browserName === "webkit" ? webkit : chromium;
  const slot = await acquireProjectProcessSlot(`playwright:${browserName}:ui-smoke:${isMobile ? "mobile" : "desktop"}`);
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext(
    isMobile
      ? {
          viewport: { width: 390, height: 844 },
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
        }
      : { viewport: { width: 1440, height: 900 } }
  );
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='map-placeholder']", { timeout: 20000 });
    await page.waitForSelector("[data-testid='runtime-stamp']", { timeout: 20000 });
    await page.waitForFunction(async () => {
      const badge = document.querySelector("[data-testid='runtime-parity-badge']");
      if (!badge) return false;
      const state = badge.getAttribute("data-runtime-actual");
      return state === "1" || state === "0";
    }, undefined, { timeout: 30000 });
    return await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const placeholder = document.querySelector("[data-testid='map-placeholder']");
      const badge = document.querySelector("[data-testid='runtime-parity-badge']");
      const runtimeStamp = document.querySelector("[data-testid='runtime-stamp']");
      const legacyRuntimeNodes = Array.from(document.querySelectorAll("[data-map-runtime], [data-testid]")).filter((node) => {
        const runtime = node.getAttribute("data-map-runtime") || "";
        const testId = node.getAttribute("data-testid") || "";
        return runtime !== "" || testId === "map-frame";
      });
      const visibleRuntime = runtimeStamp
        ? {
            buildId: runtimeStamp.getAttribute("data-build-id") || "",
            commit: runtimeStamp.getAttribute("data-commit") || "",
            builtAt: runtimeStamp.getAttribute("data-built-at") || "",
            datasetHash: runtimeStamp.getAttribute("data-dataset-hash") || "",
            finalSnapshotId: runtimeStamp.getAttribute("data-final-snapshot-id") || "",
            snapshotBuiltAt: runtimeStamp.getAttribute("data-snapshot-built-at") || "",
            runtimeMode: runtimeStamp.getAttribute("data-runtime-mode") || "",
            mapRuntime: runtimeStamp.getAttribute("data-map-runtime") || "",
            expectedOrigin: runtimeStamp.getAttribute("data-expected-origin") || "",
            origin: window.location.origin
          }
        : null;
      return {
        placeholderPresent: Boolean(placeholder),
        placeholderLinkPresent: Boolean(document.querySelector("[data-testid='map-placeholder-link']")),
        runtimeBadgeActual: badge?.getAttribute("data-runtime-actual") || null,
        runtimeStampPresent: Boolean(document.querySelector("[data-testid='runtime-stamp']")),
        visibleRuntime,
        mapFrameCount: document.querySelectorAll("[data-testid='map-frame']").length,
        canvasCount: document.querySelectorAll("canvas").length,
        legacyRuntimeNodeCount: legacyRuntimeNodes.length,
        fullScreenHomeOk:
          Math.abs(window.innerWidth - root.clientWidth) <= 2 &&
          Math.abs(window.innerHeight - body.clientHeight) <= 2,
        singleScreenOk: body.scrollHeight <= window.innerHeight + 4,
        documentScrollOk: root.scrollWidth <= window.innerWidth + 4,
        visibleStamp: document.querySelector("[data-testid='build-stamp']")?.textContent?.trim() || ""
      };
    });
  } finally {
    await context.close();
    await browser.close();
    await slot.release();
  }
}

function browserKey(browserName, isMobile) {
  return `${browserName}_${isMobile ? "mobile" : "desktop"}`.toUpperCase();
}

const checks = [
  ["chromium", false],
  ["chromium", true],
  ...(REQUIRE_WEBKIT ? [["webkit", false], ["webkit", true]] : [])
];

const results = [];
let failed = false;

for (const [browserName, isMobile] of checks) {
  try {
    const result = await auditBrowser(browserName, isMobile);
    const apiResponse = await fetch(`${BASE_URL}/api/build-meta`, { cache: "no-store" });
    const apiMeta = apiResponse.ok ? await apiResponse.json() : null;
    const parityMatches = Boolean(
      apiMeta &&
      result.visibleRuntime &&
      result.visibleRuntime.origin === String(apiMeta.origin || "") &&
      result.visibleRuntime.buildId === String(apiMeta.buildId || "") &&
      result.visibleRuntime.commit === String(apiMeta.commit || "") &&
      result.visibleRuntime.builtAt === String(apiMeta.builtAt || "") &&
      result.visibleRuntime.datasetHash === String(apiMeta.datasetHash || "") &&
      result.visibleRuntime.finalSnapshotId === String(apiMeta.finalSnapshotId || "") &&
      result.visibleRuntime.snapshotBuiltAt === String(apiMeta.snapshotBuiltAt || "") &&
      result.visibleRuntime.runtimeMode === String(apiMeta.runtimeMode || "") &&
      result.visibleRuntime.mapRuntime === String(apiMeta.mapRuntime || "") &&
      result.visibleRuntime.expectedOrigin === String(apiMeta.expectedOrigin || "")
    );
    results.push({ browserName, isMobile, parityMatches, apiMeta, ...result });
  } catch (error) {
    failed = true;
    results.push({
      browserName,
      isMobile,
      parityMatches: false,
      apiMeta: null,
      error: error instanceof Error ? error.message : String(error),
      placeholderPresent: false,
      placeholderLinkPresent: false,
      runtimeBadgeActual: "0",
      runtimeStampPresent: false,
      mapFrameCount: -1,
      canvasCount: -1,
      legacyRuntimeNodeCount: -1,
      fullScreenHomeOk: false,
      singleScreenOk: false,
      documentScrollOk: false,
      visibleStamp: ""
    });
  }
}

const okCount = results.filter((entry) => entry.placeholderPresent && entry.parityMatches).length;
const failCount = results.length - okCount;
const lines = [
  `RUN_ID=${RUN_ID}`,
  `UI_SMOKE_OK=${failed || failCount > 0 ? 0 : 1}`,
  `SMOKE_OK=${okCount}`,
  `SMOKE_FAIL=${failCount}`,
  `SMOKE_TOTAL=${results.length}`,
  `FULL_SCREEN_HOME_OK=${results.every((entry) => entry.fullScreenHomeOk) ? 1 : 0}`,
  `FULL_SCREEN_HOME_MOBILE_OK=${results.filter((entry) => entry.isMobile).every((entry) => entry.fullScreenHomeOk) ? 1 : 0}`,
  `HOME_SINGLE_SCREEN_OK=${results.every((entry) => entry.singleScreenOk) ? 1 : 0}`,
  `HOME_DOCUMENT_SCROLL_OK=${results.every((entry) => entry.documentScrollOk) ? 1 : 0}`,
  `MAP_RUNTIME_REMOVED=${results.every((entry) => entry.placeholderPresent && entry.mapFrameCount === 0 && entry.legacyRuntimeNodeCount === 1) ? 1 : 0}`,
  `MAP_PLACEHOLDER_ACTIVE=${results.every((entry) => entry.placeholderPresent && entry.placeholderLinkPresent) ? 1 : 0}`,
  `RUNTIME_PARITY_OK=${results.every((entry) => entry.parityMatches) ? 1 : 0}`
];

for (const entry of results) {
  const key = browserKey(entry.browserName, entry.isMobile);
  lines.push(`FULL_SCREEN_HOME_${key}_OK=${entry.fullScreenHomeOk ? 1 : 0}`);
  lines.push(`HOME_DOCUMENT_SCROLL_${key}_OK=${entry.documentScrollOk ? 1 : 0}`);
  lines.push(`PLACEHOLDER_${key}_OK=${entry.placeholderPresent ? 1 : 0}`);
}

const webkitEntries = results.filter((entry) => entry.browserName === "webkit");
lines.push(`UI_SMOKE_WEBKIT_OK=${webkitEntries.length === 0 || webkitEntries.every((entry) => entry.placeholderPresent && entry.parityMatches) ? 1 : 0}`);
lines.push(
  `UI_SMOKE_DETAILS=${JSON.stringify(
    results.map(({ browserName, isMobile, error, ...rest }) => ({ browserName, isMobile, error: error || null, ...rest }))
  )}`
);

await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
await fs.writeFile(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${lines.join("\n")}\n`);
process.exit(failed || failCount > 0 ? 1 : 0);

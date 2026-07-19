#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "@playwright/test";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";

const ROOT = process.cwd();
const BASE_URL = "http://127.0.0.1:3000";
const browserName = process.env.BROWSER || "webkit";
const headless = !["0", "false", "no"].includes(
  String(process.env.HEADLESS ?? "1").toLowerCase(),
);
const screenshotBeforePath =
  process.env.SCREENSHOT_BEFORE_PATH ||
  path.join(ROOT, "Artifacts", `${browserName}-wiki-truth-before.jpg`);
const screenshotAfterPath =
  process.env.SCREENSHOT_AFTER_PATH ||
  path.join(ROOT, "Artifacts", `${browserName}-wiki-truth-after.jpg`);
const jsonPath =
  process.env.JSON_PATH ||
  path.join(ROOT, "Artifacts", `${browserName}-wiki-truth.json`);

async function safeScreenshot(page, screenshotPath) {
  if (browserName === "chromium" && headless) {
    return "skipped:chromium-headless-screenshot-disabled";
  }
  try {
    await page.screenshot({
      path: screenshotPath,
      type: "jpeg",
      quality: 70,
      fullPage: false,
    });
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : String(error || "unknown_screenshot_error");
  }
}

function browserTypeFor(name) {
  return name === "webkit" ? webkit : chromium;
}

const slot = await acquireProjectProcessSlot(
  `playwright:${browserName}:wiki-truth-live-probe`,
);
const browser = await browserTypeFor(browserName).launch({ headless });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

try {
  await page.goto(`${BASE_URL}/wiki-truth`, { waitUntil: "domcontentloaded" });
  const screenshotBeforeError = await safeScreenshot(
    page,
    screenshotBeforePath,
  );
  await page.waitForSelector("[data-testid='wiki-truth-summary']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='cannabis-law-matrix-307']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='cannabis-law-color-table']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='wiki-truth-table']", {
    timeout: 30000,
    state: "attached",
  });
  await page.waitForSelector("[data-testid='wiki-truth-diagnostics']", {
    timeout: 30000,
    state: "attached",
  });
  const screenshotAfterError = await safeScreenshot(page, screenshotAfterPath);

  const details = await page.evaluate(async () => {
    const metaResponse = await fetch("/api/build-meta", { cache: "no-store" });
    const buildMeta = metaResponse.ok ? await metaResponse.json() : null;
    return {
      origin: window.location.origin,
      href: window.location.href,
      title: document.title,
      summaryPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-summary']"),
      ),
      cannabisMatrixPresent: Boolean(
        document.querySelector("[data-testid='cannabis-law-matrix-307']"),
      ),
      cannabisColorTablePresent: Boolean(
        document.querySelector("[data-testid='cannabis-law-color-table']"),
      ),
      tablePresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-table']"),
      ),
      diagnosticsPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-diagnostics']"),
      ),
      recentChangesPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-recent-changes']"),
      ),
      rowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-table'] tbody tr",
      ).length,
      cannabisMatrixRowCount: document.querySelectorAll(
        "[data-testid='cannabis-law-matrix-307'] tbody tr",
      ).length,
      cannabisColorRowCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr",
      ).length,
      cannabisColorDifferenceCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-color-diff='1']",
      ).length,
      cannabisOfficialGreyCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-official-color='UNKNOWN']",
      ).length,
      cannabisColorReauditResolvedCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-reaudit-result='COLOR_RESOLVED']",
      ).length,
      cannabisColorReauditRetainedGreyCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-reaudit-result='HONEST_GREY_RETAINED']",
      ).length,
      cannabisOfficialUrlGeoCount: Number(
        document
          .querySelector("[data-testid='cannabis-law-matrix-307']")
          ?.getAttribute("data-official-url-geos") || 0,
      ),
      buildMeta,
    };
  });

  const pass = Boolean(
    details.origin === BASE_URL &&
    details.summaryPresent &&
    details.cannabisMatrixPresent &&
    details.cannabisColorTablePresent &&
    details.tablePresent &&
    details.diagnosticsPresent &&
    details.recentChangesPresent &&
    details.rowCount > 0 &&
    details.cannabisMatrixRowCount === 307 &&
    details.cannabisColorRowCount === 307 &&
    details.cannabisOfficialGreyCount === 5 &&
    details.cannabisColorReauditResolvedCount === 34 &&
    details.cannabisColorReauditRetainedGreyCount === 5 &&
    details.cannabisOfficialUrlGeoCount === 307 &&
    details.buildMeta?.expectedOrigin === BASE_URL,
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    browserName,
    headless,
    pass,
    screenshotBeforeError,
    screenshotAfterError,
    ...details,
    screenshotBeforePath: path.relative(ROOT, screenshotBeforePath),
    screenshotAfterPath: path.relative(ROOT, screenshotAfterPath),
  };

  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2));

  console.log(`WIKI_TRUTH_LIVE_OK=${pass ? 1 : 0}`);
  console.log(`WIKI_TRUTH_ROW_COUNT=${details.rowCount}`);
  console.log(
    `WIKI_TRUTH_CANNABIS_MATRIX_ROW_COUNT=${details.cannabisMatrixRowCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_COLOR_ROW_COUNT=${details.cannabisColorRowCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_COLOR_DIFFERENCE_COUNT=${details.cannabisColorDifferenceCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_OFFICIAL_GREY_COUNT=${details.cannabisOfficialGreyCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_COLOR_REAUDIT_RESOLVED=${details.cannabisColorReauditResolvedCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_COLOR_REAUDIT_RETAINED_GREY=${details.cannabisColorReauditRetainedGreyCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_OFFICIAL_URL_GEOS=${details.cannabisOfficialUrlGeoCount}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_PARITY=${details.buildMeta?.expectedOrigin === BASE_URL ? 1 : 0}`,
  );
  process.exit(pass ? 0 : 1);
} finally {
  await context.close();
  await browser.close();
  await slot.release();
}

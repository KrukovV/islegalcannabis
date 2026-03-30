#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "@playwright/test";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";

const ROOT = process.cwd();
const BASE_URL = "http://127.0.0.1:3000";
const browserName = process.env.BROWSER || "webkit";
const headless = !["0", "false", "no"].includes(String(process.env.HEADLESS ?? "1").toLowerCase());
const screenshotBeforePath =
  process.env.SCREENSHOT_BEFORE_PATH || path.join(ROOT, "Artifacts", `${browserName}-wiki-truth-before.png`);
const screenshotAfterPath =
  process.env.SCREENSHOT_AFTER_PATH || path.join(ROOT, "Artifacts", `${browserName}-wiki-truth-after.png`);
const jsonPath = process.env.JSON_PATH || path.join(ROOT, "Artifacts", `${browserName}-wiki-truth.json`);

function browserTypeFor(name) {
  return name === "webkit" ? webkit : chromium;
}

const slot = await acquireProjectProcessSlot(`playwright:${browserName}:wiki-truth-live-probe`);
const browser = await browserTypeFor(browserName).launch({ headless });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(`${BASE_URL}/wiki-truth`, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: screenshotBeforePath, fullPage: true });
  await page.waitForSelector("[data-testid='wiki-truth-summary']", { timeout: 30000 });
  await page.waitForSelector("[data-testid='wiki-truth-table']", { timeout: 30000 });
  await page.waitForSelector("[data-testid='wiki-truth-diagnostics']", { timeout: 30000 });
  await page.screenshot({ path: screenshotAfterPath, fullPage: true });

  const details = await page.evaluate(async () => {
    const metaResponse = await fetch("/api/build-meta", { cache: "no-store" });
    const buildMeta = metaResponse.ok ? await metaResponse.json() : null;
    return {
      origin: window.location.origin,
      href: window.location.href,
      title: document.title,
      summaryPresent: Boolean(document.querySelector("[data-testid='wiki-truth-summary']")),
      tablePresent: Boolean(document.querySelector("[data-testid='wiki-truth-table']")),
      diagnosticsPresent: Boolean(document.querySelector("[data-testid='wiki-truth-diagnostics']")),
      recentChangesPresent: Boolean(document.querySelector("[data-testid='wiki-truth-recent-changes']")),
      rowCount: document.querySelectorAll("[data-testid='wiki-truth-table'] tbody tr").length,
      buildMeta
    };
  });

  const pass = Boolean(
    details.origin === BASE_URL &&
      details.summaryPresent &&
      details.tablePresent &&
      details.diagnosticsPresent &&
      details.recentChangesPresent &&
      details.rowCount > 0 &&
      details.buildMeta?.expectedOrigin === BASE_URL
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    browserName,
    headless,
    pass,
    ...details,
    screenshotBeforePath: path.relative(ROOT, screenshotBeforePath),
    screenshotAfterPath: path.relative(ROOT, screenshotAfterPath)
  };

  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2));

  console.log(`WIKI_TRUTH_LIVE_OK=${pass ? 1 : 0}`);
  console.log(`WIKI_TRUTH_ROW_COUNT=${details.rowCount}`);
  console.log(`WIKI_TRUTH_RUNTIME_PARITY=${details.buildMeta?.expectedOrigin === BASE_URL ? 1 : 0}`);
  process.exit(pass ? 0 : 1);
} finally {
  await context.close();
  await browser.close();
  await slot.release();
}

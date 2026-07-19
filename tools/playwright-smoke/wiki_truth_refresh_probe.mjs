#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "@playwright/test";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";

const browserName = process.env.BROWSER || "chromium";
const browserType = browserName === "webkit" ? webkit : chromium;
const artifactPath = path.join(
  process.cwd(),
  "Artifacts",
  `${browserName}-wiki-truth-refresh.json`,
);
const slot = await acquireProjectProcessSlot(
  `playwright:${browserName}:wiki-truth-refresh-probe`,
);
const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
let buildMetaRequestCount = 0;
const browserErrors = [];
page.on("request", (request) => {
  if (request.url().includes("/api/build-meta")) buildMetaRequestCount += 1;
});
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});

try {
  await page.addInitScript(() => {
    const pendingKey = "build-watcher-pending-stamp";
    const activeKey = "build-watcher-active-stamp";
    const pending = sessionStorage.getItem(pendingKey);
    if (location.href.includes("__runtime_refresh=") && pending) {
      sessionStorage.setItem(activeKey, pending);
    } else {
      sessionStorage.setItem(activeKey, "FORCED_STALE_RUNTIME_STAMP");
    }
  });
  await page.goto("http://127.0.0.1:3000/wiki-truth", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("[data-testid='cannabis-law-color-table']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='build-update-banner']", {
    timeout: 15000,
  });

  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.resourceType() === "document")
      documentRequests += 1;
  });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.getByRole("button", { name: "Обновить" }).click(),
  ]);
  await page.waitForFunction(
    () =>
      !sessionStorage.getItem("build-watcher-pending-stamp") &&
      !location.href.includes("__runtime_refresh=") &&
      !document.querySelector("[data-testid='build-update-banner']"),
    { timeout: 30000 },
  );

  const result = await page.evaluate(() => ({
    href: location.href,
    pending: sessionStorage.getItem("build-watcher-pending-stamp"),
    active: sessionStorage.getItem("build-watcher-active-stamp"),
    bannerPresent: Boolean(
      document.querySelector("[data-testid='build-update-banner']"),
    ),
    navigationType:
      performance.getEntriesByType("navigation")[0]?.toJSON().type || null,
  }));
  const pass =
    documentRequests === 1 &&
    result.navigationType === "reload" &&
    !result.pending &&
    !result.bannerPresent &&
    !result.href.includes("__runtime_refresh=");
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(
    artifactPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      browserName,
      pass,
      documentRequests,
      ...result,
    }, null, 2),
  );
  console.log(`WIKI_TRUTH_REFRESH_OK=${pass ? 1 : 0}`);
  console.log(`WIKI_TRUTH_REFRESH_DOCUMENT_REQUESTS=${documentRequests}`);
  console.log(
    `WIKI_TRUTH_REFRESH_BANNER_PRESENT=${result.bannerPresent ? 1 : 0}`,
  );
  console.log(`WIKI_TRUTH_REFRESH_NAVIGATION_TYPE=${result.navigationType}`);
  console.log(
    `WIKI_TRUTH_REFRESH_PARAM_PRESENT=${result.href.includes("__runtime_refresh=") ? 1 : 0}`,
  );
  if (!pass) throw new Error("WIKI_TRUTH_REFRESH_FAILED");
} catch (error) {
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(
    artifactPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      browserName,
      pass: false,
      error: error instanceof Error ? error.message : String(error),
      buildMetaRequestCount,
      browserErrors,
      activeStamp: await page.evaluate(() =>
        sessionStorage.getItem("build-watcher-active-stamp"),
      ).catch(() => null),
      runtimeDom: await page.evaluate(() => {
        const node = document.querySelector("[data-testid='runtime-stamp']");
        return node
          ? Object.fromEntries(
              [...node.attributes].map((attribute) => [
                attribute.name,
                attribute.value,
              ]),
            )
          : null;
      }).catch(() => null),
    }, null, 2),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  await slot.release();
}

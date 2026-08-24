#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "../playwright_runtime.mjs";
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
    const initializedKey = "wiki-truth-refresh-probe-initialized";
    const pending = sessionStorage.getItem(pendingKey);
    if (location.href.includes("__runtime_refresh=") && pending) {
      sessionStorage.setItem(activeKey, pending);
    } else if (!sessionStorage.getItem(initializedKey)) {
      sessionStorage.setItem(activeKey, "FORCED_STALE_RUNTIME_STAMP");
      sessionStorage.setItem(initializedKey, "1");
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
  const waitForCurrentStatus = async () => {
    const deadline = Date.now() + 30000;
    let lastBanner = "CHECKING";
    while (Date.now() < deadline) {
      lastBanner = await page.evaluate(() => {
        return (
          document
            .querySelector("[data-testid='build-update-banner']")
            ?.getAttribute("data-freshness-status") || "MISSING"
        );
      });
      const pending = await page.evaluate(() =>
        sessionStorage.getItem("build-watcher-pending-stamp"),
      );
      const href = page.url();
      if (
        !pending &&
        !href.includes("__runtime_refresh=") &&
        lastBanner === "CURRENT"
      ) {
        return true;
      }
      await page.waitForTimeout(200);
    }
    throw new Error(`build-update banner status was ${lastBanner}`);
  };
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.getByRole("button", { name: "Обновить" }).click(),
  ]);
  await page.waitForTimeout(500);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.getByRole("button", { name: "Обновить" }).click(),
  ]);

  await waitForCurrentStatus();

  const updateReloadDocumentRequests = 2;
  await page.waitForSelector(
    "[data-testid='build-update-banner'][data-freshness-status='CURRENT']",
    { timeout: 30000 },
  );

  const result = await page.evaluate(() => ({
    href: location.href,
    pending: sessionStorage.getItem("build-watcher-pending-stamp"),
    active: sessionStorage.getItem("build-watcher-active-stamp"),
    bannerPresent: Boolean(
      document.querySelector("[data-testid='build-update-banner']"),
    ),
    freshnessStatus: document
      .querySelector("[data-testid='build-update-banner']")
      ?.getAttribute("data-freshness-status") || null,
    navigationType:
      performance.getEntriesByType("navigation")[0]?.toJSON().type || null,
  }));
  const pass =
    documentRequests >= 2 &&
    result.navigationType === "reload" &&
    !result.pending &&
    result.bannerPresent &&
    result.freshnessStatus === "CURRENT" &&
    !result.href.includes("__runtime_refresh=");
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(
    artifactPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      browserName,
      pass,
      documentRequests,
      updateReloadDocumentRequests,
      currentReloadDocumentRequests:
        documentRequests - updateReloadDocumentRequests,
      ...result,
    }, null, 2),
  );
  console.log(`WIKI_TRUTH_REFRESH_OK=${pass ? 1 : 0}`);
  console.log(`WIKI_TRUTH_REFRESH_DOCUMENT_REQUESTS=${documentRequests}`);
  console.log(
    `WIKI_TRUTH_UPDATE_RELOAD_DOCUMENT_REQUESTS=${updateReloadDocumentRequests}`,
  );
  console.log(
    `WIKI_TRUTH_CURRENT_RELOAD_DOCUMENT_REQUESTS=${documentRequests - updateReloadDocumentRequests}`,
  );
  console.log(
    `WIKI_TRUTH_REFRESH_BANNER_PRESENT=${result.bannerPresent ? 1 : 0}`,
  );
  console.log(`WIKI_TRUTH_REFRESH_FRESHNESS_STATUS=${result.freshnessStatus}`);
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
      href: await page.url(),
      pendingStamp: await page.evaluate(() =>
        sessionStorage.getItem("build-watcher-pending-stamp"),
      ).catch(() => null),
      pendingReloadCount: await page.evaluate(() =>
        sessionStorage.getItem("build-watcher-pending-reload-count"),
      ).catch(() => null),
      initializedStamp: await page.evaluate(() =>
        sessionStorage.getItem("wiki-truth-refresh-probe-initialized"),
      ).catch(() => null),
      activeStamp: await page.evaluate(() =>
        sessionStorage.getItem("build-watcher-active-stamp"),
      ).catch(() => null),
      freshnessStatus: await page.evaluate(() =>
        document
          .querySelector("[data-testid='build-update-banner']")
          ?.getAttribute("data-freshness-status") || null,
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

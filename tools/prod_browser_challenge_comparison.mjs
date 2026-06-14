#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";
import {
  decideJsReplBrowserMode,
  rate,
  resolveBrowserExecutionPath,
  reuseMetrics
} from "./runtime/prodBrowserTransport.mjs";
import {
  buildVercelBypassHeaders,
  redactVercelBypassSecret,
  sanitizeVercelEvidenceHeaders
} from "./vercel_bypass.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const target = process.env.PROD_AUDIT_TARGET || "https://www.islegal.info";
const operationCount = Math.max(1, Number(process.env.PROD_BROWSER_COMPARISON_RUNS || 10));
const runId = process.env.PROD_BROWSER_COMPARISON_RUN_ID || new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const reportRoot = path.join(repoRoot, "Reports", "ProdAudit", "browser-comparison", runId);
const reportMdPath = path.join(repoRoot, "Reports", "ProdAudit", "browser-comparison.md");
const headless = process.env.PROD_BROWSER_COMPARISON_HEADLESS === "0" ? false : true;
const matrix = (process.env.PROD_BROWSER_COMPARISON_MATRIX || "XK,GF,GL,PR,HK,MO,TW,PS")
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);

function sanitize(value) {
  return redactVercelBypassSecret(String(value ?? ""), secret);
}

function hasChallenge(text) {
  return /Security Checkpoint|Could not verify your browser|Code 21|Failed to verify your browser/i.test(text || "");
}

function withPath(pathname, search = "") {
  const url = new URL(target);
  url.pathname = pathname;
  url.search = search;
  url.hash = "";
  return url.toString();
}

function contextOptions() {
  return {
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    ...(secret ? { extraHTTPHeaders: buildVercelBypassHeaders(secret, "true") } : {})
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function responseEvidence(response) {
  if (!response) {
    return {
      status: null,
      x_vercel_mitigated: "",
      x_vercel_id: "",
      location: "",
      headers_object: {}
    };
  }
  const headers = response.headers();
  const sanitizedHeaders = sanitizeVercelEvidenceHeaders(headers, secret);
  return {
    status: response.status(),
    x_vercel_mitigated: sanitizedHeaders["x-vercel-mitigated"] || "",
    x_vercel_id: sanitizedHeaders["x-vercel-id"] || "",
    location: sanitizedHeaders.location || "",
    headers_object: sanitizedHeaders
  };
}

async function waitForMapReady(page, timeout = 45000) {
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1",
    null,
    { timeout }
  );
  await page.waitForSelector(".maplibregl-canvas", { timeout });
}

async function readRuntimeCardIndex(page) {
  return await page.evaluate(async () => {
    const response = await fetch("/api/new-map/card-index", {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) throw new Error(`CARD_INDEX_FETCH_FAILED:${response.status}`);
    return response.json();
  });
}

function zoomForGeo(geo) {
  if (["MO", "GI"].includes(geo)) return 10;
  if (["HK"].includes(geo)) return 9;
  if (["XK"].includes(geo)) return 7;
  if (["FO", "GP", "MQ", "RE"].includes(geo)) return 7.5;
  return 5.8;
}

async function clearPopup(page) {
  const closeButton = page.locator('[data-testid="new-map-country-popup"] button[aria-label^="Close"]').first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click().catch(() => undefined);
    await page.waitForTimeout(150);
  }
}

async function jumpToGeo(page, geo, entry) {
  const lng = Number(entry?.coordinates?.lng);
  const lat = Number(entry?.coordinates?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error("NO_COORDINATES");
  const zoom = zoomForGeo(geo);
  await page.evaluate(
    async ({ lng, lat, zoom }) => {
      const qa = window.__NEW_MAP_QA__;
      if (qa?.jumpTo) {
        await qa.jumpTo(lng, lat, zoom);
        return;
      }
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) throw new Error("NO_MAP_DEBUG_HANDLE");
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve();
        };
        const timeoutId = window.setTimeout(finish, 1500);
        map.once("idle", finish);
        map.jumpTo({ center: [lng, lat], zoom, pitch: 0, bearing: 0 });
      });
    },
    { lng, lat, zoom }
  );
  await page.waitForTimeout(350);
}

async function waitForFeaturePoint(page, geo, entry) {
  const layerIds = geo.startsWith("US-")
    ? ["us-states-fill"]
    : ["legal-territory-label", "legal-territory-hitbox", "legal-point", "legal-fill"];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const point = await page.evaluate(
      ({ targetGeo, targetLayerIds, lng, lat }) => {
        const map = window.__NEW_MAP_DEBUG__?.map;
        if (!map) return null;
        const canvas = map.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const projected = map.project({ lng, lat });
        const windows = [
          {
            startX: Math.max(16, projected.x - 260),
            endX: Math.min(rect.width - 16, projected.x + 260),
            startY: Math.max(16, projected.y - 220),
            endY: Math.min(rect.height - 16, projected.y + 220),
            step: 10
          },
          {
            startX: 32,
            endX: rect.width - 32,
            startY: 32,
            endY: rect.height - 32,
            step: 20
          }
        ];
        for (const area of windows) {
          for (let y = area.startY; y < area.endY; y += area.step) {
            for (let x = area.startX; x < area.endX; x += area.step) {
              for (const layerId of targetLayerIds) {
                if (!map.getLayer(layerId)) continue;
                const features = map.queryRenderedFeatures([x, y], { layers: [layerId] });
                const hit = features.find((feature) => String(feature.properties?.geo || "").toUpperCase() === targetGeo);
                if (hit) {
                  return {
                    x: rect.left + x,
                    y: rect.top + y,
                    canvas_x: x,
                    canvas_y: y,
                    layer_id: layerId
                  };
                }
              }
            }
          }
        }
        return null;
      },
      {
        targetGeo: geo,
        targetLayerIds: layerIds,
        lng: Number(entry.coordinates.lng),
        lat: Number(entry.coordinates.lat)
      }
    );
    if (point) return point;
    await page.waitForTimeout(250);
  }
  return null;
}

async function captureNavigationOperation({ page, id, group, url, waitMap, screenshotPath }) {
  const startedAt = Date.now();
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((error) => ({ error }));
  const responseInfo = response?.error ? { status: null, error: response.error.message || String(response.error) } : await responseEvidence(response);
  const skipMapWait = responseInfo.status === 403 || responseInfo.x_vercel_mitigated === "challenge";
  const mapReady = waitMap && !skipMapWait
    ? await waitForMapReady(page).then(() => true).catch(() => false)
    : false;
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const challengeDetected =
    hasChallenge(`${title}\n${bodyText}`) ||
    responseInfo.x_vercel_mitigated === "challenge" ||
    responseInfo.status === 403;
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
  const screenshotBytes = await fs.stat(screenshotPath).then((stat) => stat.size).catch(() => 0);
  const okStatus = Number(responseInfo.status || 0) >= 200 && Number(responseInfo.status || 0) < 400;
  return {
    id,
    group,
    type: "navigation",
    url: sanitize(page.url()),
    response: responseInfo,
    title,
    body_sample: sanitize(bodyText.slice(0, 240)),
    map_ready: mapReady,
    challenge_detected: challengeDetected,
    success: okStatus && !challengeDetected && (!waitMap || mapReady),
    status: challengeDetected ? "CHALLENGE" : okStatus && (!waitMap || mapReady) ? "PASS" : "FAIL",
    screenshot: path.relative(repoRoot, screenshotPath),
    screenshot_bytes: screenshotBytes,
    elapsed_ms: Date.now() - startedAt
  };
}

async function captureCurrentPageChallengeState({ page, id, group, screenshotPath, reason }) {
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const challengeDetected = hasChallenge(`${title}\n${bodyText}`);
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
  return {
    id,
    group,
    type: "blocked_state",
    reason,
    url: sanitize(page.url()),
    title,
    body_sample: sanitize(bodyText.slice(0, 240)),
    challenge_detected: challengeDetected,
    success: false,
    status: challengeDetected ? "CHALLENGE" : "FAIL",
    screenshot: path.relative(repoRoot, screenshotPath),
    screenshot_bytes: await fs.stat(screenshotPath).then((stat) => stat.size).catch(() => 0),
    elapsed_ms: 0
  };
}

async function capturePopupOperation({ page, cardIndex, geo, id, group, screenshotPath }) {
  const startedAt = Date.now();
  const entry = cardIndex?.[geo];
  if (!entry) {
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
    return {
      id,
      group,
      geo,
      type: "popup",
      challenge_detected: false,
      success: false,
      status: "FAIL",
      reason: "CARD_MISSING",
      screenshot: path.relative(repoRoot, screenshotPath),
      screenshot_bytes: await fs.stat(screenshotPath).then((stat) => stat.size).catch(() => 0),
      elapsed_ms: Date.now() - startedAt
    };
  }
  await clearPopup(page);
  await jumpToGeo(page, geo, entry);
  const point = await waitForFeaturePoint(page, geo, entry);
  if (!point) {
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
    return {
      id,
      group,
      geo,
      type: "popup",
      challenge_detected: false,
      success: false,
      status: "FAIL",
      reason: "FEATURE_NOT_RENDERED",
      screenshot: path.relative(repoRoot, screenshotPath),
      screenshot_bytes: await fs.stat(screenshotPath).then((stat) => stat.size).catch(() => 0),
      elapsed_ms: Date.now() - startedAt
    };
  }
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(
    (targetGeo) => window.__NEW_MAP_DEBUG__?.selectedId === targetGeo,
    geo,
    { timeout: 8000 }
  ).catch(() => undefined);
  const popup = page.locator('[data-testid="new-map-country-popup"]').first();
  const popupVisible = await popup.isVisible({ timeout: 12000 }).catch(() => false);
  const popupText = popupVisible ? await popup.innerText().catch(() => "") : "";
  const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  const challengeDetected = hasChallenge(bodyText);
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
  const success = popupVisible && popupText.includes(`ISO2: ${geo}`) && !challengeDetected;
  return {
    id,
    group,
    geo,
    type: "popup",
    challenge_detected: challengeDetected,
    success,
    status: challengeDetected ? "CHALLENGE" : success ? "PASS" : "FAIL",
    reason: success ? "OK" : "POPUP_NOT_VISIBLE_OR_WRONG_GEO",
    popup_visible: popupVisible,
    popup_text_sample: sanitize(popupText.slice(0, 240)),
    point,
    screenshot: path.relative(repoRoot, screenshotPath),
    screenshot_bytes: await fs.stat(screenshotPath).then((stat) => stat.size).catch(() => 0),
    elapsed_ms: Date.now() - startedAt
  };
}

function summarizeGroup({ id, label, operations, browserReused, contextReused, sessionReused, transport }) {
  const successCount = operations.filter((operation) => operation.status === "PASS").length;
  const challengeCount = operations.filter((operation) => operation.status === "CHALLENGE").length;
  const metrics = reuseMetrics({
    browserReused,
    contextReused,
    sessionReused,
    operationCount: operations.length,
    successCount,
    challengeCount
  });
  return {
    id,
    label,
    transport,
    js_repl_executed: Boolean(transport.js_repl_executed),
    transport_reason: transport.transport_reason || transport.fallback_reason || transport.reason || "",
    operation_count: operations.length,
    success_count: successCount,
    challenge_count: challengeCount,
    success_rate: rate(successCount, operations.length),
    challenge_rate: rate(challengeCount, operations.length),
    ...metrics,
    operations
  };
}

async function runGroupA() {
  const slot = await acquireProjectProcessSlot("playwright:prod-browser-comparison-a");
  const operations = [];
  try {
    for (let index = 1; index <= operationCount; index += 1) {
      const opDir = path.join(reportRoot, "group-a", `run-${String(index).padStart(2, "0")}`);
      await ensureDir(opDir);
      const browser = await chromium.launch({ headless });
      const context = await browser.newContext(contextOptions());
      try {
        const page = await context.newPage();
        operations.push(await captureNavigationOperation({
          page,
          id: `A-${String(index).padStart(2, "0")}`,
          group: "A",
          url: withPath("/new-map", `?qa=1&comparison=A&run=${index}`),
          waitMap: true,
          screenshotPath: path.join(opDir, "new-map.png")
        }));
      } finally {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      }
    }
  } finally {
    slot.release();
  }
  return summarizeGroup({
    id: "A",
    label: "current_runner_new_browser_per_operation",
    operations,
    browserReused: false,
    contextReused: false,
    sessionReused: false,
    transport: {
      selected_path: "playwright_runner",
      js_repl_executed: false,
      reason: "BASELINE_CURRENT_RUNNER"
    }
  });
}

async function runGroupB(browserTransport) {
  const slot = await acquireProjectProcessSlot("playwright:prod-browser-comparison-b");
  const operations = [];
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext(contextOptions());
  try {
    const page = await context.newPage();
    const groupDir = path.join(reportRoot, "group-b");
    await ensureDir(groupDir);
    operations.push(await captureNavigationOperation({
      page,
      id: "B-01",
      group: "B",
      url: withPath("/", "?comparison=B&run=1"),
      waitMap: false,
      screenshotPath: path.join(groupDir, "op-01-homepage.png")
    }));
    if (operations.length < operationCount) {
      operations.push(await captureNavigationOperation({
        page,
        id: "B-02",
        group: "B",
        url: withPath("/new-map", "?qa=1&comparison=B&run=2"),
        waitMap: true,
        screenshotPath: path.join(groupDir, "op-02-new-map.png")
      }));
    }

    const appReady = operations.some((operation) => operation.id === "B-02" && operation.status === "PASS");
    const cardIndex = appReady ? await readRuntimeCardIndex(page).catch(() => null) : null;
    for (let index = 3; index <= operationCount; index += 1) {
      const geo = matrix[(index - 3) % matrix.length] || "XK";
      const screenshotPath = path.join(groupDir, `op-${String(index).padStart(2, "0")}-${geo}.png`);
      if (!appReady || !cardIndex) {
        operations.push(await captureCurrentPageChallengeState({
          page,
          id: `B-${String(index).padStart(2, "0")}`,
          group: "B",
          screenshotPath,
          reason: appReady ? "CARD_INDEX_UNAVAILABLE" : "APP_NOT_READY"
        }));
        continue;
      }
      operations.push(await capturePopupOperation({
        page,
        cardIndex,
        geo,
        id: `B-${String(index).padStart(2, "0")}`,
        group: "B",
        screenshotPath
      }));
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    slot.release();
  }
  return summarizeGroup({
    id: "B",
    label: browserTransport.js_repl_executed
      ? "js_repl_one_browser_one_context_one_page"
      : "persistent_browser_one_browser_one_context_one_page",
    operations,
    browserReused: true,
    contextReused: true,
    sessionReused: true,
    transport: {
      ...browserTransport,
      transport_reason: browserTransport.js_repl_executed ? "JS_REPL_READY" : browserTransport.fallback_reason
    }
  });
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>")).join(" | ")} |`)
  ].join("\n");
}

function renderReport(summary) {
  const groupRows = [summary.group_a, summary.group_b].map((group) => [
    group.id,
    group.label,
    group.transport.selected_path || group.transport.selected_path,
    group.BROWSER_REUSE_EFFECT,
    group.CONTEXT_REUSE_EFFECT,
    group.SESSION_REUSE_EFFECT,
    `${group.SUCCESS_COUNT}/${group.OPERATION_COUNT}`,
    `${group.CHALLENGE_COUNT}/${group.OPERATION_COUNT}`,
    group.SUCCESS_RATE,
    group.CHALLENGE_RATE
  ]);
  const operationRows = [...summary.group_a.operations, ...summary.group_b.operations].map((operation) => [
    operation.id,
    operation.group,
    operation.type,
    operation.geo || "-",
    operation.status,
    operation.challenge_detected ? 1 : 0,
    operation.success ? 1 : 0,
    operation.response?.status ?? "-",
    operation.screenshot
  ]);
  return [
    "# Production Browser Challenge Comparison",
    "",
    `Generated: ${summary.generated_at}`,
    `Run: ${summary.run_id}`,
    `Target: ${summary.target}`,
    `JS_REPL_STATUS=${summary.JS_REPL_STATUS}`,
    `JS_REPL_BROWSER_MODE=${summary.JS_REPL_BROWSER_MODE}`,
    `JS_REPL_BROWSER_MODE_REASON=${summary.js_repl_decision.reason}`,
    `STATISTICALLY_SIGNIFICANT=${summary.js_repl_decision.statistically_significant ? 1 : 0}`,
    `P_VALUE=${summary.js_repl_decision.p_value ?? "UNCONFIRMED"}`,
    "",
    "## Groups",
    "",
    markdownTable(
      ["GROUP", "LABEL", "PATH", "BROWSER_REUSE_EFFECT", "CONTEXT_REUSE_EFFECT", "SESSION_REUSE_EFFECT", "SUCCESS", "CHALLENGE", "SUCCESS_RATE", "CHALLENGE_RATE"],
      groupRows
    ),
    "",
    "## Operations",
    "",
    markdownTable(["ID", "GROUP", "TYPE", "GEO", "STATUS", "CHALLENGE", "SUCCESS", "HTTP", "SCREENSHOT"], operationRows),
    ""
  ].join("\n");
}

async function main() {
  await ensureDir(reportRoot);
  const browserTransport = await resolveBrowserExecutionPath({ repoRoot });
  const groupA = await runGroupA();
  const groupB = await runGroupB(browserTransport);
  const jsReplDecision = decideJsReplBrowserMode({ groupA, groupB });
  const summary = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    target,
    secret_present: Boolean(secret),
    operation_count: operationCount,
    headless,
    browser_transport: browserTransport,
    JS_REPL_STATUS: browserTransport.JS_REPL_STATUS,
    JS_REPL_BROWSER_MODE: jsReplDecision.mode,
    js_repl_decision: jsReplDecision,
    group_a: groupA,
    group_b: groupB,
    reports: {
      json: path.relative(repoRoot, path.join(reportRoot, "summary.json")),
      markdown: path.relative(repoRoot, reportMdPath)
    }
  };
  await fs.writeFile(path.join(reportRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(repoRoot, "Reports", "ProdAudit", "browser-comparison-latest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(reportMdPath, `${renderReport(summary)}\n`, "utf8");

  console.log(`PROD_BROWSER_COMPARISON_RUN=${runId}`);
  console.log(`GROUP_A_SUCCESS_COUNT=${groupA.SUCCESS_COUNT}`);
  console.log(`GROUP_A_CHALLENGE_COUNT=${groupA.CHALLENGE_COUNT}`);
  console.log(`GROUP_A_CHALLENGE_RATE=${groupA.CHALLENGE_RATE}`);
  console.log(`GROUP_B_SUCCESS_COUNT=${groupB.SUCCESS_COUNT}`);
  console.log(`GROUP_B_CHALLENGE_COUNT=${groupB.CHALLENGE_COUNT}`);
  console.log(`GROUP_B_CHALLENGE_RATE=${groupB.CHALLENGE_RATE}`);
  console.log(`BROWSER_EXECUTION_PATH=${browserTransport.selected_path}`);
  console.log(`JS_REPL_STATUS=${browserTransport.JS_REPL_STATUS}`);
  console.log(`JS_REPL_BROWSER_MODE=${summary.JS_REPL_BROWSER_MODE}`);
  console.log(`REPORT=${summary.reports.json}`);
  if (summary.JS_REPL_BROWSER_MODE === "UNCONFIRMED") process.exitCode = 2;
}

await main().catch(async (error) => {
  await ensureDir(reportRoot);
  await fs.writeFile(path.join(reportRoot, "error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(error.message || error);
  process.exit(1);
});

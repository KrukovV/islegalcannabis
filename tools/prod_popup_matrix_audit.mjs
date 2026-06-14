#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";
import { resolveBrowserExecutionPath, reuseMetrics } from "./runtime/prodBrowserTransport.mjs";
import {
  VERCEL_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  redactVercelBypassSecret,
  sanitizeVercelEvidenceHeaders
} from "./vercel_bypass.mjs";
import {
  buildVercelBypassHeaders,
  installVercelChallengeRecorder,
  warmVercelBypass
} from "./lib/vercel-bypass.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const target = process.env.PROD_POPUP_TARGET || process.env.PROD_AUDIT_TARGET || "https://www.islegal.info";
const runId = process.env.PROD_POPUP_RUN_ID || new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const reportRoot = path.join(repoRoot, "Reports", "ProdAudit", "popup-matrix", runId);
const repeatabilityDir = path.join(repoRoot, "artifacts", "prod-repeatability", runId);
const browserName = String(process.env.PROD_POPUP_BROWSER || "chromium").toLowerCase();
const headless = process.env.PROD_POPUP_HEADLESS === "0" ? false : true;
const accessMode = String(process.env.PROD_POPUP_ACCESS_MODE || "cookie_warmup").toLowerCase();
const runnerMode = String(process.env.RUNNER_MODE || "LONG_LIVED").trim().toUpperCase();
const matrix = (process.env.PROD_POPUP_MATRIX || "XK,GF,GL,PR,HK,MO,TW,PS,EH,NC,FO,GP,MQ,RE,GI")
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);

function sanitize(value) {
  return redactVercelBypassSecret(String(value ?? ""), secret);
}

function hasAccessBlock(text) {
  return /Security Checkpoint|Could not verify your browser|Code 21|Failed to verify your browser/i.test(text || "");
}

function buildNavigationUrl(input) {
  const url = new URL(`${input}/new-map?qa=1`);
  if (secret && accessMode === "query_cookie") {
    url.searchParams.set(VERCEL_BYPASS_HEADER, secret);
    url.searchParams.set(VERCEL_SET_BYPASS_COOKIE_HEADER, "true");
  } else if (secret && accessMode === "query") {
    url.searchParams.set(VERCEL_BYPASS_HEADER, secret);
  }
  return url.toString();
}

function hostOf(input) {
  try {
    return new URL(input).host.toLowerCase();
  } catch {
    return "";
  }
}

function contextHeaders() {
  if (!secret || accessMode === "cookie_warmup" || accessMode === "query" || accessMode === "query_cookie") return {};
  if (accessMode === "header_only") return { [VERCEL_BYPASS_HEADER]: secret };
  return buildVercelBypassHeaders({ secret });
}

async function sha256File(filePath) {
  const data = await fs.readFile(filePath).catch(() => null);
  if (!data) return "";
  return `sha256:${crypto.createHash("sha256").update(data).digest("hex")}`;
}

async function writeRepeatabilityArtifact(summary) {
  await ensureDir(repeatabilityDir);
  const screenshotHashes = {};
  for (const [name, relativePath] of Object.entries(summary.screenshots || summary.screenshot_paths || {})) {
    if (!relativePath) continue;
    screenshotHashes[name] = await sha256File(path.join(repoRoot, relativePath));
  }
  await fs.writeFile(
    path.join(repeatabilityDir, "prod_popup_matrix_audit.json"),
    `${JSON.stringify({
      ...summary,
      measurements: {
        warmup_ms: summary.bypass?.warmup_ms ?? null,
        navigation_ms: summary.navigation?.domcontentloaded_ms ?? null,
        card_index_source: summary.card_index?.source || "",
        card_index_ms: summary.card_index?.duration_ms ?? null,
        challenge_count: summary.network?.challenge_count ?? 0,
        api_fallback_count: summary.card_index?.fallback_api_used ? 1 : 0,
        screenshot_hashes: screenshotHashes
      }
    }, null, 2)}\n`,
    "utf8"
  );
}

function serializeCookies(cookies = []) {
  return cookies.map((cookie) => ({
    name: String(cookie?.name || ""),
    domain: String(cookie?.domain || ""),
    path: String(cookie?.path || ""),
    secure: Boolean(cookie?.secure),
    httpOnly: Boolean(cookie?.httpOnly),
    sameSite: String(cookie?.sameSite || ""),
    expires: Number(cookie?.expires || 0) || 0,
    value_length: String(cookie?.value || "").length
  }));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function responseEvidence(response) {
  if (!response) {
    return {
      status: null,
      location: "",
      x_vercel_mitigated: "",
      x_vercel_id: "",
      headers_object: {}
    };
  }
  const headersObject = typeof response.headers === "function" ? response.headers() : {};
  const sanitizedHeadersObject = sanitizeVercelEvidenceHeaders(headersObject, secret);
  return {
    status: response.status(),
    location: sanitizedHeadersObject.location || "",
    x_vercel_mitigated: sanitizedHeadersObject["x-vercel-mitigated"] || "",
    x_vercel_id: sanitizedHeadersObject["x-vercel-id"] || "",
    headers_object: sanitizedHeadersObject
  };
}

async function waitForMapReady(page, timeout = 60000) {
  await page.waitForFunction(
    () => Boolean(window.__NEW_MAP_QA__ || window.__NEW_MAP_DEBUG__?.map) &&
      Boolean(document.querySelector('[data-testid="new-map-surface"][data-map-ready="1"]')) &&
      Boolean(document.querySelector(".maplibregl-canvas")),
    null,
    { timeout }
  );
}

async function readMapHandleState(page) {
  return await page.evaluate(() => ({
    href: window.location.href,
    qa_param: new URLSearchParams(window.location.search).get("qa"),
    has_qa: Boolean(window.__NEW_MAP_QA__),
    qa_keys: Object.keys(window.__NEW_MAP_QA__ || {}),
    has_debug: Boolean(window.__NEW_MAP_DEBUG__),
    has_debug_map: Boolean(window.__NEW_MAP_DEBUG__?.map),
    debug_keys: Object.keys(window.__NEW_MAP_DEBUG__ || {}),
    surface_ready: document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") || "",
    canvas_present: Boolean(document.querySelector(".maplibregl-canvas"))
  })).catch((error) => ({
    error: String(error?.message || error || "MAP_HANDLE_STATE_UNAVAILABLE")
  }));
}

async function readRuntimeCardIndex(page) {
  return await page.evaluate(async () => {
    const endpoints = [
      { url: "/new-map-card-index.json", init: { credentials: "same-origin" } },
      { url: "/api/new-map/card-index", init: { cache: "no-store", credentials: "same-origin" } }
    ];
    let lastStatus = "";
    let primaryStatus = null;
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint.url, endpoint.init);
      lastStatus = `${endpoint.url}:${response.status}`;
      if (endpoint.url === "/new-map-card-index.json") primaryStatus = response.status;
      if (response.ok) {
        return {
          data: await response.json(),
          primary_url: "/new-map-card-index.json",
          primary_status: primaryStatus,
          source: endpoint.url === "/new-map-card-index.json" ? "static" : "api",
          fallback_api_used: endpoint.url === "/api/new-map/card-index"
        };
      }
    }
    throw new Error(`CARD_INDEX_FETCH_FAILED:${lastStatus}`);
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
  await waitForMapReady(page, 30000);
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
  ).catch(async (error) => {
    await ensureDir(path.join(reportRoot, geo));
    const state = await readMapHandleState(page);
    await fs.writeFile(
      path.join(reportRoot, geo, "map-handle-state.json"),
      `${JSON.stringify({ geo, state, error: String(error?.message || error || "JUMP_FAILED") }, null, 2)}\n`,
      "utf8"
    ).catch(() => undefined);
    throw error;
  });
  await page.waitForTimeout(350);
}

async function waitForFeaturePoint(page, geo, entry) {
  const layerIds = geo.startsWith("US-")
    ? ["us-states-fill"]
    : ["legal-territory-label", "legal-territory-hitbox", "legal-point", "legal-fill"];
  for (let attempt = 0; attempt < 30; attempt += 1) {
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
            step: 8
          },
          {
            startX: 32,
            endX: rect.width - 32,
            startY: 32,
            endY: rect.height - 32,
            step: 18
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
                    layer_id: layerId,
                    feature_id: String(hit.id || hit.properties?.geo || targetGeo)
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
  const fallback = await page.evaluate(async ({ lng, lat }) => {
    const qa = window.__NEW_MAP_QA__;
    const canvas = document.querySelector(".maplibregl-canvas");
    const rect = canvas?.getBoundingClientRect();
    const box = qa?.getCanvasBox ? qa.getCanvasBox() : rect ? { width: rect.width, height: rect.height } : null;
    if (!rect || !box) return null;
    return {
      x: rect.left + Math.round(box.width / 2),
      y: rect.top + Math.round(box.height / 2),
      canvas_x: Math.round(box.width / 2),
      canvas_y: Math.round(box.height / 2),
      layer_id: "qa-center-fallback",
      feature_id: ""
    };
  }, {
    lng: Number(entry.coordinates.lng),
    lat: Number(entry.coordinates.lat)
  });
  return fallback;
}

async function clickFeature(page, point) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
}

async function auditGeo(page, cardIndex, geo) {
  const geoDir = path.join(reportRoot, geo);
  await ensureDir(geoDir);
  const entry = cardIndex[geo];
  if (!entry) {
    return {
      geo,
      status: "FAIL",
      feature_exists: false,
      card_exists: false,
      popup_visible: false,
      reason: "CARD_MISSING"
    };
  }
  await clearPopup(page);
  await jumpToGeo(page, geo, entry);
  const point = await waitForFeaturePoint(page, geo, entry);
  if (!point) {
    await page.screenshot({ path: path.join(geoDir, "country.png"), fullPage: false }).catch(() => undefined);
    return {
      geo,
      status: "FAIL",
      feature_exists: false,
      card_exists: true,
      popup_visible: false,
      reason: "FEATURE_NOT_RENDERED"
    };
  }
  await clickFeature(page, point);
  const selectedMatched = await page.waitForFunction(
    (targetGeo) => window.__NEW_MAP_DEBUG__?.selectedId === targetGeo,
    geo,
    { timeout: 8000 }
  ).then(() => true).catch(() => false);
  await page.screenshot({ path: path.join(geoDir, "country.png"), fullPage: false }).catch(() => undefined);
  if (!selectedMatched) {
    const trace = await page.evaluate(() => window.__NEW_MAP_DEBUG__?.popupTrace || null).catch(() => null);
    await fs.writeFile(path.join(geoDir, "trace.json"), `${JSON.stringify({ geo, point, trace }, null, 2)}\n`, "utf8");
    return {
      geo,
      status: "FAIL",
      feature_exists: true,
      card_exists: true,
      popup_visible: false,
      point,
      trace,
      reason: "SELECTION_NOT_CONFIRMED"
    };
  }
  const popup = page.locator('[data-testid="new-map-country-popup"]').first();
  await page.waitForFunction(
    (targetGeo) => {
      const popupNode = document.querySelector('[data-testid="new-map-country-popup"]');
      return Boolean(popupNode?.textContent?.includes(`ISO2: ${targetGeo}`));
    },
    geo,
    { timeout: 12000 }
  ).catch(() => false);
  const popupVisible = await popup.isVisible({ timeout: 12000 }).catch(() => false);
  const popupHtml = popupVisible ? await popup.evaluate((node) => node.outerHTML).catch(() => "") : "";
  const popupText = popupVisible ? await popup.innerText().catch(() => "") : "";
  const trace = await page.evaluate(() => window.__NEW_MAP_DEBUG__?.popupTrace || null).catch(() => null);
  await fs.writeFile(path.join(geoDir, "popup-html.txt"), popupHtml || "", "utf8");
  await fs.writeFile(path.join(geoDir, "trace.json"), `${JSON.stringify({ geo, point, trace }, null, 2)}\n`, "utf8");
  await page.screenshot({ path: path.join(geoDir, "popup.png"), fullPage: false }).catch(() => undefined);
  const pass = popupVisible && popupText.includes(`ISO2: ${geo}`);
  return {
    geo,
    status: pass ? "PASS" : "FAIL",
    feature_exists: true,
    card_exists: true,
    popup_visible: popupVisible,
    popup_text_sample: sanitize(popupText.slice(0, 240)),
    point,
    trace,
    reason: pass ? "" : "POPUP_NOT_VISIBLE_OR_WRONG_GEO",
    screenshots: {
      country: path.relative(repoRoot, path.join(geoDir, "country.png")),
      popup: path.relative(repoRoot, path.join(geoDir, "popup.png")),
      html: path.relative(repoRoot, path.join(geoDir, "popup-html.txt"))
    }
  };
}

async function main() {
  if (runnerMode !== "LONG_LIVED") {
    throw new Error(`RUNNER_MODE_UNSUPPORTED:${runnerMode}`);
  }
  if (!secret) {
    throw new Error("VERCEL_SECRET_MISSING");
  }
  await ensureDir(reportRoot);
  await ensureDir(repeatabilityDir);
  const browserTransport = await resolveBrowserExecutionPath({ repoRoot });
  const slot = await acquireProjectProcessSlot("playwright:prod-popup-matrix-audit");
  const browserType = browserName === "webkit" ? webkit : browserName === "firefox" ? firefox : chromium;
  const launchOptions = browserName === "chrome" ? { headless, channel: "chrome" } : { headless };
  const contextHeaderSnapshot = contextHeaders();
  const contextOptionsSnapshot = {
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    bypass_mode: accessMode,
    extraHTTPHeaders: Object.keys(contextHeaderSnapshot)
  };
  const browser = await browserType.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    ...(Object.keys(contextHeaderSnapshot).length ? { extraHTTPHeaders: contextHeaderSnapshot } : {})
  });
  try {
    const page = await context.newPage();
    const recorder = installVercelChallengeRecorder(page, { baseUrl: target, secret });
    const bypass = accessMode === "cookie_warmup"
      ? await warmVercelBypass(context, target, { secret })
      : { mode: accessMode, fulfilled_by: accessMode, skipped: true, warmup_status: null, warmup_ms: 0, challenge_detected: false };
    const navigationUrl = buildNavigationUrl(target);
    const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => "UNRECORDED");
    const navigationStartedAt = Date.now();
    const response = await page.goto(navigationUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const navigationMs = Date.now() - navigationStartedAt;
    const responseInfo = await responseEvidence(response);
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const cookiesAfterNavigation = serializeCookies(await context.cookies().catch(() => []));
    const network = recorder.summary();
    const challengeDetected =
      bypass.challenge_detected ||
      hasAccessBlock(bodyText) ||
      responseInfo.x_vercel_mitigated === "challenge" ||
      responseInfo.status === 403 ||
      network.challenge_count > 0;
    if (challengeDetected) {
      await page.screenshot({ path: path.join(reportRoot, "challenge.png"), fullPage: false }).catch(() => undefined);
      const metrics = reuseMetrics({
        browserReused: true,
        contextReused: true,
        sessionReused: true,
        operationCount: 1,
        successCount: 0,
        challengeCount: 1
      });
      const summary = {
        run_id: runId,
        target,
        host: hostOf(target),
        navigation_url: navigationUrl,
        browser: browserName,
        headless,
        runner_mode: runnerMode,
        access_mode: accessMode,
        bypass,
        browser_args: launchOptions,
        context_options: contextOptionsSnapshot,
        user_agent: userAgent,
        cookies_after_navigation: cookiesAfterNavigation,
        navigation: {
          path: "/new-map",
          status: responseInfo.status,
          domcontentloaded_ms: navigationMs
        },
        network,
        browser_transport: browserTransport,
        JS_REPL_STATUS: browserTransport.JS_REPL_STATUS,
        browser_execution_path: browserTransport.selected_path,
        ...metrics,
        status: "CHALLENGE_RUN",
        challenge_detected: true,
        nav_response: responseInfo,
        body_sample: sanitize(bodyText.slice(0, 500)),
        matrix,
        screenshot_paths: {
          challenge: path.relative(repoRoot, path.join(reportRoot, "challenge.png"))
        },
        PASS: false
      };
      await fs.writeFile(path.join(reportRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      await writeRepeatabilityArtifact(summary);
      console.log(`PROD_POPUP_MATRIX_RUN=${runId}`);
      console.log(`BROWSER_EXECUTION_PATH=${browserTransport.selected_path}`);
      console.log(`JS_REPL_STATUS=${browserTransport.JS_REPL_STATUS}`);
      console.log(`JS_REPL_BROWSER_MODE=${browserTransport.JS_REPL_BROWSER_MODE}`);
      console.log("STATUS=CHALLENGE_RUN");
      console.log(`SUCCESS_COUNT=${summary.SUCCESS_COUNT}`);
      console.log(`CHALLENGE_COUNT=${summary.CHALLENGE_COUNT}`);
      console.log(`CHALLENGE_RATE=${summary.CHALLENGE_RATE}`);
      console.log(`REPORT=${path.relative(repoRoot, path.join(reportRoot, "summary.json"))}`);
      process.exitCode = 2;
      return;
    }
    await waitForMapReady(page);
    await page.screenshot({ path: path.join(reportRoot, "new-map.png"), fullPage: false }).catch(() => undefined);
    const cardIndexStartedAt = Date.now();
    const cardIndexResult = await readRuntimeCardIndex(page);
    const cardIndexDurationMs = Date.now() - cardIndexStartedAt;
    const cardIndex = cardIndexResult.data;
    const rows = [];
    for (const geo of matrix) {
      rows.push(await auditGeo(page, cardIndex, geo));
      await page.waitForTimeout(300);
    }
    const pass = rows.every((row) => row.status === "PASS");
    const metrics = reuseMetrics({
      browserReused: true,
      contextReused: true,
      sessionReused: true,
      operationCount: matrix.length,
      successCount: rows.filter((row) => row.status === "PASS").length,
      challengeCount: 0
    });
    const summary = {
      run_id: runId,
      target,
      host: hostOf(target),
      navigation_url: navigationUrl,
      browser: browserName,
      headless,
      runner_mode: runnerMode,
      access_mode: accessMode,
      bypass,
      browser_args: launchOptions,
      context_options: contextOptionsSnapshot,
      user_agent: userAgent,
      cookies_after_navigation: cookiesAfterNavigation,
      navigation: {
        path: "/new-map",
        status: responseInfo.status,
        domcontentloaded_ms: navigationMs
      },
      card_index: {
        primary_url: cardIndexResult.primary_url,
        primary_status: cardIndexResult.primary_status,
        source: cardIndexResult.source,
        fallback_api_used: cardIndexResult.fallback_api_used,
        duration_ms: cardIndexDurationMs
      },
      network: recorder.summary(),
      browser_transport: browserTransport,
      JS_REPL_STATUS: browserTransport.JS_REPL_STATUS,
      browser_execution_path: browserTransport.selected_path,
      ...metrics,
      status: pass ? "PASS" : "FAIL",
      challenge_detected: false,
      nav_response: responseInfo,
      matrix_count: matrix.length,
      pass_count: rows.filter((row) => row.status === "PASS").length,
      fail_count: rows.filter((row) => row.status !== "PASS").length,
      PASS: pass,
      rows,
      screenshots: {
        new_map: path.relative(repoRoot, path.join(reportRoot, "new-map.png"))
      }
    };
    await fs.writeFile(path.join(reportRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    await writeRepeatabilityArtifact(summary);
    console.log(`PROD_POPUP_MATRIX_RUN=${runId}`);
    console.log(`BROWSER_EXECUTION_PATH=${browserTransport.selected_path}`);
    console.log(`JS_REPL_STATUS=${browserTransport.JS_REPL_STATUS}`);
    console.log(`JS_REPL_BROWSER_MODE=${browserTransport.JS_REPL_BROWSER_MODE}`);
    console.log(`STATUS=${summary.status}`);
    console.log(`PASS_COUNT=${summary.pass_count}/${summary.matrix_count}`);
    console.log(`SUCCESS_RATE=${summary.SUCCESS_RATE}`);
    console.log(`CHALLENGE_RATE=${summary.CHALLENGE_RATE}`);
    console.log(`REPORT=${path.relative(repoRoot, path.join(reportRoot, "summary.json"))}`);
    if (!pass) process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    slot.release();
  }
}

await main().catch(async (error) => {
  await ensureDir(reportRoot);
  await fs.writeFile(path.join(reportRoot, "error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(error.message || error);
  process.exit(1);
});

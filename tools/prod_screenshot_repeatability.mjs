#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";
import {
  buildVercelBypassCookieSeedUrl,
  buildVercelBypassHeaders,
  diffVercelBypassCookies,
  redactVercelBypassSecret
} from "./vercel_bypass.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportRoot = path.join(repoRoot, "Reports", "ProdAudit");
const repeatabilityRoot = path.join(reportRoot, "repeatability");
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const target = process.env.PROD_AUDIT_TARGET || "https://www.islegal.info";
const runCount = Math.max(1, Number(process.env.PROD_REPEATABILITY_RUNS || 3));
const countryGeo = String(process.env.PROD_REPEATABILITY_COUNTRY_GEO || "AL").toUpperCase();
const runId = process.env.PROD_REPEATABILITY_RUN_ID || new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const batchDir = path.join(repeatabilityRoot, runId);
const runDelayMs = Math.max(0, Number(process.env.PROD_REPEATABILITY_RUN_DELAY_MS || 15000));
const seedDiagnosticEnabled = process.env.PROD_REPEATABILITY_SEED_DIAGNOSTIC === "1";
const headerMode = String(process.env.PROD_REPEATABILITY_HEADER_MODE || "global").toLowerCase();
const fullUiOnly = process.env.PROD_REPEATABILITY_FULL_UI_ONLY === "1";
const baseBatchId = String(process.env.PROD_REPEATABILITY_BASE_BATCH || "");
const minHomeScreenshotBytes = Number(process.env.PROD_REPEATABILITY_MIN_HOME_BYTES || 5000);
const minMapScreenshotBytes = Number(process.env.PROD_REPEATABILITY_MIN_MAP_BYTES || 10000);
const minFullUiScreenshotBytes = Number(process.env.PROD_REPEATABILITY_MIN_FULL_UI_BYTES || 10000);

function sanitize(value) {
  return redactVercelBypassSecret(String(value ?? ""), secret);
}

function hasAccessBlock(text) {
  return /Security Checkpoint|Could not verify your browser|Code 21|Failed to verify your browser/i.test(text || "");
}

function cookieNameFromSetCookie(value) {
  return String(value || "").split(";", 1)[0].split("=", 1)[0].trim();
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyScreenshotEvidence(sourceRelativePath, targetPath) {
  if (!sourceRelativePath) return false;
  const sourcePath = path.join(repoRoot, sourceRelativePath);
  await fs.copyFile(sourcePath, targetPath);
  return true;
}

async function responseEvidence(response) {
  if (!response) {
    return {
      status: null,
      location: "",
      x_vercel_mitigated: "",
      x_vercel_id: "",
      set_cookie_names: [],
      headers_array: [],
      headers_object: {}
    };
  }
  const headersArray = await Promise.resolve(
    typeof response.headersArray === "function" ? response.headersArray() : []
  ).catch(() => []);
  const headersObject = typeof response.headers === "function"
    ? response.headers()
    : {};
  return {
    status: response.status(),
    location: headersObject.location || "",
    x_vercel_mitigated: headersObject["x-vercel-mitigated"] || "",
    x_vercel_id: headersObject["x-vercel-id"] || "",
    set_cookie_names: headersArray
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => cookieNameFromSetCookie(header.value))
      .filter(Boolean),
    headers_array: headersArray,
    headers_object: headersObject
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

async function captureRoute(page, url, screenshotPath, options = {}) {
  const minBytes = Number(options.minBytes ?? minHomeScreenshotBytes);
  const startedAt = Date.now();
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  const responseInfo = await responseEvidence(response);
  const skipMapWait = responseInfo.status === 403 || responseInfo.x_vercel_mitigated === "challenge";
  const mapReady = skipMapWait ? false : await waitForMapReady(page, 45000).then(() => true).catch(() => false);
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const hasRoot = await page.locator('[data-testid="new-map-root"]').count().catch(() => 0);
  const hasSurface = await page.locator('[data-testid="new-map-surface"]').count().catch(() => 0);
  const hasReady = await page.locator('[data-testid="new-map-surface"][data-map-ready="1"]').count().catch(() => 0);
  const hasCanvas = await page.locator(".maplibregl-canvas").count().catch(() => 0);
  const hasAiDock = await page.locator('[data-testid="new-map-ai-dock"]').count().catch(() => 0);
  const hasAiInput = await page.locator('[data-testid="new-map-ai-input"]').count().catch(() => 0);
  const challengeDetected =
    hasAccessBlock(`${title}\n${bodyText}`) ||
    responseInfo.x_vercel_mitigated === "challenge";

  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
  const screenshotBytes = await fs.stat(screenshotPath).then((stat) => stat.size).catch(() => 0);

  return {
    url: sanitize(page.url()),
    title,
    body_sample: sanitize(bodyText.slice(0, 240)),
    has_root: hasRoot > 0,
    has_surface: hasSurface > 0,
    has_ready: hasReady > 0,
    has_canvas: hasCanvas > 0,
    has_ai_dock: hasAiDock > 0,
    has_ai_input: hasAiInput > 0,
    ready_waited: mapReady,
    challenge_detected: challengeDetected,
    elapsed_ms: Date.now() - startedAt,
    screenshot: path.relative(repoRoot, screenshotPath),
    screenshot_bytes: screenshotBytes,
    captured:
      !challengeDetected &&
      title === "Is cannabis legal?" &&
      hasRoot > 0 &&
      hasSurface > 0 &&
      (mapReady || hasReady > 0) &&
      hasCanvas > 0 &&
      screenshotBytes >= minBytes,
    response: responseInfo
  };
}

async function seedDiagnostic(context, url) {
  const seedUrl = buildVercelBypassCookieSeedUrl(url);
  const before = await context.cookies(url).catch(() => []);
  const response = await context.request.get(seedUrl, {
    headers: buildVercelBypassHeaders(secret, "true"),
    maxRedirects: 0,
    timeout: 45000
  });
  const body = await response.text().catch(() => "");
  const after = await context.cookies(url).catch(() => []);
  const seededCookies = diffVercelBypassCookies(before, after);
  const responseInfo = await responseEvidence(response);
  const cookieNames = seededCookies.map((cookie) => cookie.name).filter(Boolean);
  return {
    seed_url: seedUrl,
    cookie_seeded: response.status() >= 200 && response.status() < 400,
    cookie_detected: seededCookies.length > 0,
    cookie_count: seededCookies.length,
    cookie_name: cookieNames[0] || "",
    cookie_names: cookieNames,
    seed_cookie_observed: seededCookies.length > 0,
    seed_status: response.status(),
    seed_mitigated: responseInfo.x_vercel_mitigated,
    seed_vercel_id: responseInfo.x_vercel_id,
    seed_set_cookie_names: responseInfo.set_cookie_names,
    challenge_detected:
      hasAccessBlock(body) ||
      responseInfo.x_vercel_mitigated === "challenge",
    body_sample: sanitize(body.slice(0, 240)),
    response: responseInfo
  };
}

function chooseCountry(cardIndex) {
  const fallbacks = [countryGeo, "AL", "XK", "DE", "CA", "FR"];
  for (const geo of fallbacks) {
    const entry = cardIndex?.[geo];
    if (entry?.coordinates && Number.isFinite(Number(entry.coordinates.lng)) && Number.isFinite(Number(entry.coordinates.lat))) {
      return { geo, entry };
    }
  }
  const first = Object.entries(cardIndex || {}).find(([, entry]) =>
    entry?.coordinates && Number.isFinite(Number(entry.coordinates.lng)) && Number.isFinite(Number(entry.coordinates.lat))
  );
  if (!first) return { geo: "", entry: null };
  return { geo: first[0], entry: first[1] };
}

async function readRuntimeCardIndex(page) {
  return await page.evaluate(async () => {
    const response = await fetch("/api/new-map/card-index", {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) {
      throw new Error(`CARD_INDEX_FETCH_FAILED:${response.status}`);
    }
    return response.json();
  });
}

async function jumpToGeo(page, entry) {
  const lng = Number(entry?.coordinates?.lng);
  const lat = Number(entry?.coordinates?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error("NO_COORDINATES");
  }
  const zoom = Number(entry?.zoom || 5.5);
  await page.evaluate(
    async ({ lng, lat, zoom }) => {
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
    : ["legal-fill", "legal-territory-hitbox", "legal-point", "legal-territory-label"];
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
            step: 10
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
                for (const feature of features) {
                  const props = feature.properties || {};
                  const candidates = [props.geo, props.iso2, props.iso_a2, props.ISO_A2, feature.id]
                    .map((value) => String(value || "").toUpperCase())
                    .filter(Boolean);
                  if (!candidates.includes(targetGeo)) continue;
                  return {
                    x,
                    y,
                    layerId,
                    properties: {
                      geo: String(props.geo || feature.id || ""),
                      displayName: String(props.displayName || props.name_en || props.name || ""),
                      mapCategory: String(props.mapCategory || "")
                    }
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
    await page.waitForTimeout(300);
  }
  return null;
}

async function clickFeature(page, point) {
  const canvas = page.locator(".maplibregl-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("NO_MAP_CANVAS_BOUNDS");
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

async function captureFullUi(page, batchFullDir, existingHome = null, existingNewMap = null) {
  const stepDir = path.join(batchFullDir, "full-ui");
  await ensureDir(stepDir);

  const home = existingHome
    ? {
        ...existingHome,
        screenshot: path.relative(repoRoot, path.join(stepDir, "step-1-homepage.png"))
      }
    : await captureRoute(page, target, path.join(stepDir, "step-1-homepage.png"));
  if (existingHome) {
    await copyScreenshotEvidence(existingHome.screenshot, path.join(stepDir, "step-1-homepage.png")).catch(() => undefined);
  }

  const newMap = existingNewMap
    ? {
        ...existingNewMap,
        screenshot: path.relative(repoRoot, path.join(stepDir, "step-2-new-map.png"))
      }
    : await captureRoute(page, `${target}/new-map?qa=1`, path.join(stepDir, "step-2-new-map.png"));
  if (existingNewMap) {
    await copyScreenshotEvidence(existingNewMap.screenshot, path.join(stepDir, "step-2-new-map.png")).catch(() => undefined);
  }

  if (!home.captured || !newMap.captured) {
    return {
      pass: false,
      home,
      new_map: newMap,
      country_geo: "",
      country_visible: false,
      popup_visible: false,
      popup_text: "",
      ai_panel_visible: false,
      screenshots: {
        step_1: home.screenshot,
        step_2: newMap.screenshot
      },
      reason: home.captured ? "NEW_MAP_NOT_CAPTURED" : "HOME_NOT_CAPTURED"
    };
  }

  const cardIndex = await readRuntimeCardIndex(page).catch(() => null);
  if (!cardIndex) {
    return {
      pass: false,
      home,
      new_map: newMap,
      country_geo: "",
      country_visible: false,
      popup_visible: false,
      popup_text: "",
      ai_panel_visible: false,
      screenshots: {
        step_1: home.screenshot,
        step_2: newMap.screenshot
      },
      reason: "RUNTIME_CARD_INDEX_UNAVAILABLE"
    };
  }
  const chosen = chooseCountry(cardIndex);
  if (!chosen.entry) {
    return {
      pass: false,
      home,
      new_map: newMap,
      country_geo: "",
      country_visible: false,
      popup_visible: false,
      popup_text: "",
      ai_panel_visible: false,
      screenshots: {
        step_1: home.screenshot,
        step_2: newMap.screenshot
      },
      reason: "NO_COUNTRY_ENTRY"
    };
  }

  await jumpToGeo(page, chosen.entry);
  const point = await waitForFeaturePoint(page, chosen.geo, chosen.entry);
  if (!point) {
    await page.screenshot({ path: path.join(stepDir, "step-3-country-click.png"), fullPage: false }).catch(() => undefined);
    return {
      pass: false,
      home,
      new_map: newMap,
      country_geo: chosen.geo,
      country_visible: false,
      popup_visible: false,
      popup_text: "",
      ai_panel_visible: false,
      screenshots: {
        step_1: home.screenshot,
        step_2: newMap.screenshot,
        step_3: path.relative(repoRoot, path.join(stepDir, "step-3-country-click.png"))
      },
      reason: "FEATURE_NOT_RENDERED"
    };
  }

  await clickFeature(page, point);
  await page.waitForFunction(
    (geo) => window.__NEW_MAP_DEBUG__?.selectedId === geo,
    chosen.geo,
    { timeout: 5000 }
  ).catch(() => undefined);
  const selectedDebugId = await page.evaluate(() => String(window.__NEW_MAP_DEBUG__?.selectedId || "")).catch(() => "");
  const countryClickShot = path.join(stepDir, "step-3-country-click.png");
  await page.screenshot({ path: countryClickShot, fullPage: false }).catch(() => undefined);
  const popup = page.locator('[data-testid="new-map-country-popup"]').first();
  const popupVisible = await popup.isVisible().catch(() => false);
  let popupText = "";
  if (popupVisible) {
    await page.waitForFunction(
      (geo) => {
        const popupNode = document.querySelector('[data-testid="new-map-country-popup"]');
        return Boolean(popupNode?.textContent?.includes(`ISO2: ${geo}`));
      },
      chosen.geo,
      { timeout: 20000 }
    ).catch(() => undefined);
    popupText = await popup.innerText().catch(() => "");
  }
  const popupShot = path.join(stepDir, "step-4-popup.png");
  await page.screenshot({ path: popupShot, fullPage: false }).catch(() => undefined);
  const aiPanelVisible = await page.locator('[data-testid="new-map-ai-dock"]').isVisible().catch(() => false);
  const aiShot = path.join(stepDir, "step-5-ai-panel.png");
  await page.screenshot({ path: aiShot, fullPage: false }).catch(() => undefined);

  const countryClickBytes = await fs.stat(countryClickShot).then((stat) => stat.size).catch(() => 0);
  const popupBytes = await fs.stat(popupShot).then((stat) => stat.size).catch(() => 0);
  const aiBytes = await fs.stat(aiShot).then((stat) => stat.size).catch(() => 0);

  return {
    pass:
      home.captured &&
      newMap.captured &&
      popupVisible &&
      popupText.includes(`ISO2: ${chosen.geo}`) &&
      aiPanelVisible &&
      countryClickBytes >= minFullUiScreenshotBytes &&
      popupBytes >= minFullUiScreenshotBytes &&
      aiBytes >= minFullUiScreenshotBytes &&
      !hasAccessBlock(`${popupText}`),
    home,
    new_map: newMap,
    country_geo: chosen.geo,
    country_visible: true,
    click_layer: point.layerId || "",
    selected_debug_id: selectedDebugId,
    card_index_prefetch_injected: true,
    popup_visible: popupVisible,
    popup_text: sanitize(popupText),
    ai_panel_visible: aiPanelVisible,
    screenshots: {
      step_1: home.screenshot,
      step_2: newMap.screenshot,
      step_3: path.relative(repoRoot, countryClickShot),
      step_4: path.relative(repoRoot, popupShot),
      step_5: path.relative(repoRoot, aiShot)
    },
    reason: popupVisible && aiPanelVisible ? "OK" : "FULL_UI_INCOMPLETE"
  };
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>")).join(" | ")} |`)
  ].join("\n");
}

function rowState(result) {
  return result === true ? "PASS" : result === false ? "FAIL" : result || "-";
}

function skippedSeedDiagnostic() {
  return {
    skipped: true,
    reason: "HEADER_ONLY_KNOWN_GOOD_FLOW",
    seed_url: "",
    cookie_seeded: false,
    cookie_detected: false,
    cookie_count: 0,
    cookie_name: "",
    cookie_names: [],
    seed_cookie_observed: false,
    seed_status: null,
    seed_mitigated: "",
    seed_vercel_id: "",
    seed_set_cookie_names: [],
    challenge_detected: false,
    body_sample: "",
    response: null
  };
}

function isFirstPartyUrl(input) {
  try {
    return new URL(input).origin === new URL(target).origin;
  } catch {
    return false;
  }
}

async function createAuditContext(browser) {
  const contextOptions = {
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1
  };
  if (secret && headerMode === "global") {
    contextOptions.extraHTTPHeaders = buildVercelBypassHeaders(secret, "true");
  }
  const context = await browser.newContext(contextOptions);
  if (secret && headerMode === "document") {
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (isFirstPartyUrl(request.url()) && request.resourceType() === "document") {
        await route.continue({
          headers: {
            ...request.headers(),
            ...buildVercelBypassHeaders(secret, "true")
          }
        });
        return;
      }
      await route.continue();
    });
  }
  return context;
}

function renderReport(summary) {
  const rows = [
    ...summary.runs.map((run) => [
      run.run_id,
      run.status,
      run.home.captured ? "PASS" : "FAIL",
      run.new_map.captured ? "PASS" : "FAIL",
      "-",
      "-",
      "-"
    ]),
    summary.full_ui
      ? [
          "FULL-UI",
          summary.full_ui.pass ? "PASS" : "FAIL",
          summary.full_ui.home.captured ? "PASS" : "FAIL",
          summary.full_ui.new_map.captured ? "PASS" : "FAIL",
          rowState(summary.full_ui.popup_visible),
          rowState(summary.full_ui.country_visible),
          rowState(summary.full_ui.ai_panel_visible)
        ]
      : [
          "FULL-UI",
          "SKIPPED",
          "-",
          "-",
          "-",
          "-",
          "-"
        ]
  ];

  return [
    "# Production Screenshot Repeatability",
    "",
    `Generated: ${summary.generated_at}`,
    `Target: ${summary.target}`,
    `Batch: ${summary.batch_id}`,
    `Base batch: ${summary.base_batch_id || summary.batch_id}`,
    "",
    "## Outcome",
    "",
    `SUCCESS_COUNT=${summary.success_count}`,
    `CHALLENGE_COUNT=${summary.challenge_count}`,
    `FULL_UI_CHALLENGE=${summary.full_ui_challenge_detected ? 1 : 0}`,
    `BASE_SCREENSHOT_REPEATABILITY=${summary.base_screenshot_repeatability ? "YES" : "NO"}`,
    `REPEATABLE_PROD_SCREENSHOTS=${summary.repeatable_prod_screenshots ? "YES" : "NO"}`,
    `FULL_UI_CAPTURED=${summary.full_ui?.pass ? 1 : 0}`,
    `COOKIE_DIAGNOSTIC_ONLY=1`,
    `SEED_DIAGNOSTIC_ENABLED=${summary.seed_diagnostic_enabled ? 1 : 0}`,
    `HEADER_MODE=${summary.header_mode}`,
    `RUN_DELAY_MS=${summary.run_delay_ms}`,
    `FULL_UI_ONLY=${summary.full_ui_only ? 1 : 0}`,
    "",
    "## Runs",
    "",
    markdownTable(["RUN_ID", "STATUS", "HOME", "MAP", "POPUP", "COUNTRY", "AI_PANEL"], rows),
    "",
    "## Batch History",
    "",
    markdownTable(
      ["BATCH", "HEADER_MODE", "SEED", "DELAY_MS", "SUCCESS", "CHALLENGE", "FULL_UI_CHALLENGE", "BASE_3OF3", "FULL_UI", "REPEATABLE"],
      (summary.history || []).map((entry) => [
        entry.batch_id,
        entry.header_mode || "",
        entry.seed_diagnostic_enabled ? 1 : 0,
        entry.run_delay_ms ?? "",
        `${entry.success_count}/${entry.run_count}`,
        entry.challenge_count,
        entry.full_ui_challenge_detected ? 1 : 0,
        entry.base_screenshot_repeatability ? "YES" : "NO",
        entry.full_ui_pass ? "PASS" : entry.full_ui_present ? "FAIL" : "-",
        entry.repeatable_prod_screenshots ? "YES" : "NO"
      ])
    ),
    "",
    "## Notes",
    "",
    "- Cookie evidence is diagnostic only and does not gate screenshot capture.",
    "- Base screenshot repeatability passes only when the homepage and /new-map screenshots are captured 3/3 times.",
    "- Full repeatability passes only when base 3/3 and the country popup plus AI panel screenshots are captured without a Vercel challenge.",
    ""
  ].join("\n");
}

async function inferBatchHistoryEntry(batchId) {
  const batchPath = path.join(repeatabilityRoot, batchId);
  const entries = await fs.readdir(batchPath, { withFileTypes: true }).catch(() => []);
  const runs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("run-")) continue;
    const responsePath = path.join(batchPath, entry.name, "response.json");
    const parsed = await fs.readFile(responsePath, "utf8")
      .then((text) => JSON.parse(text))
      .catch(() => null);
    if (parsed?.run_id) runs.push(parsed);
  }
  if (!runs.length) return null;
  const successCount = runs.filter((run) => run.HOME_PAGE_CAPTURED === 1 && run.NEW_MAP_CAPTURED === 1 && run.status === "PASS").length;
  const challengeCount = runs.filter((run) => run.status === "CHALLENGE").length;
  const fullUiDir = path.join(batchPath, "full-ui");
  const fullUiPresent = await fs.stat(fullUiDir).then((stat) => stat.isDirectory()).catch(() => false);
  return {
    batch_id: batchId,
    header_mode: runs[0]?.header_mode || "",
    seed_diagnostic_enabled: runs.some((run) => run.seed?.skipped === false),
    run_delay_ms: "",
    success_count: successCount,
    run_count: runs.length,
    challenge_count: challengeCount,
    base_screenshot_repeatability: successCount === runs.length && runs.length > 0,
    full_ui_present: fullUiPresent,
    full_ui_pass: false,
    full_ui_challenge_detected: false,
    repeatable_prod_screenshots: false
  };
}

async function readBatchRuns(batchId) {
  const batchPath = path.join(repeatabilityRoot, batchId);
  const entries = await fs.readdir(batchPath, { withFileTypes: true }).catch(() => []);
  const runs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("run-")) continue;
    const responsePath = path.join(batchPath, entry.name, "response.json");
    const parsed = await fs.readFile(responsePath, "utf8")
      .then((text) => JSON.parse(text))
      .catch(() => null);
    if (parsed?.run_id) runs.push(parsed);
  }
  return runs.sort((a, b) => String(a.run_id).localeCompare(String(b.run_id)));
}

async function loadBatchHistory(currentSummary) {
  const history = [];
  const entries = await fs.readdir(repeatabilityRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const summaryPath = path.join(repeatabilityRoot, entry.name, "summary.json");
    const parsed = await fs.readFile(summaryPath, "utf8")
      .then((text) => JSON.parse(text))
      .catch(() => null);
    if (!parsed?.batch_id) {
      const inferred = await inferBatchHistoryEntry(entry.name);
      if (inferred) history.push(inferred);
      continue;
    }
    history.push({
      batch_id: parsed.batch_id,
      header_mode: parsed.header_mode || "",
      seed_diagnostic_enabled: Boolean(parsed.seed_diagnostic_enabled),
      run_delay_ms: parsed.run_delay_ms ?? "",
      success_count: parsed.success_count ?? 0,
      run_count: parsed.run_count ?? 0,
      challenge_count: parsed.challenge_count ?? 0,
      base_screenshot_repeatability: Boolean(parsed.base_screenshot_repeatability),
      full_ui_present: Boolean(parsed.full_ui),
      full_ui_pass: Boolean(parsed.full_ui?.pass),
      full_ui_challenge_detected: Boolean(parsed.full_ui_challenge_detected),
      repeatable_prod_screenshots: Boolean(parsed.repeatable_prod_screenshots)
    });
  }
  history.push({
    batch_id: currentSummary.batch_id,
    header_mode: currentSummary.header_mode || "",
    seed_diagnostic_enabled: Boolean(currentSummary.seed_diagnostic_enabled),
    run_delay_ms: currentSummary.run_delay_ms ?? "",
    success_count: currentSummary.success_count ?? 0,
    run_count: currentSummary.run_count ?? 0,
    challenge_count: currentSummary.challenge_count ?? 0,
    base_screenshot_repeatability: Boolean(currentSummary.base_screenshot_repeatability),
    full_ui_present: Boolean(currentSummary.full_ui),
    full_ui_pass: Boolean(currentSummary.full_ui?.pass),
    full_ui_challenge_detected: Boolean(currentSummary.full_ui_challenge_detected),
    repeatable_prod_screenshots: Boolean(currentSummary.repeatable_prod_screenshots)
  });
  return history
    .filter((entry, index, array) => array.findIndex((candidate) => candidate.batch_id === entry.batch_id) === index)
    .sort((a, b) => String(a.batch_id).localeCompare(String(b.batch_id)));
}

async function runRepeatabilityBatch() {
  await ensureDir(batchDir);
  const slot = await acquireProjectProcessSlot("playwright:prod-screenshot-repeatability");
  const browser = await chromium.launch({ headless: true });
  const runs = fullUiOnly ? await readBatchRuns(baseBatchId) : [];
  let fullUi = null;
  try {
    if (fullUiOnly) {
      const baseRepeatable =
        runs.length === 3 &&
        runs.every((run) => run.HOME_PAGE_CAPTURED === 1 && run.NEW_MAP_CAPTURED === 1 && run.status === "PASS");
      if (!baseRepeatable) {
        throw new Error(`BASE_BATCH_NOT_REPEATABLE:${baseBatchId || "missing"}`);
      }
      const context = await createAuditContext(browser);
      try {
        const page = await context.newPage();
        fullUi = await captureFullUi(page, batchDir).catch((error) => ({
          pass: false,
          country_geo: "",
          country_visible: false,
          popup_visible: false,
          popup_text: "",
          ai_panel_visible: false,
          screenshots: {},
          reason: `FULL_UI_ERROR:${error.message || error.name || "UNKNOWN"}`
        }));
      } finally {
        await context.close().catch(() => {});
      }
    }

    for (let index = 1; !fullUiOnly && index <= runCount; index += 1) {
      const runLabel = `run-${String(index).padStart(2, "0")}`;
      const runDir = path.join(batchDir, runLabel);
      await ensureDir(runDir);
      const context = await createAuditContext(browser);
      try {
        const seed = seedDiagnosticEnabled ? await seedDiagnostic(context, target) : skippedSeedDiagnostic();
        const page = await context.newPage();
        const home = await captureRoute(page, target, path.join(runDir, "screenshot-home.png"), { minBytes: minHomeScreenshotBytes });
        const newMap = await captureRoute(page, `${target}/new-map?qa=1`, path.join(runDir, "screenshot-new-map.png"), { minBytes: minMapScreenshotBytes });
        const cookiesAfter = await context.cookies(target).catch(() => []);
        const responsePayload = {
          run_id: runLabel,
          target,
          batch_id: runId,
          cookie_diagnostic_only: true,
          access_mode: seedDiagnosticEnabled ? `header_${headerMode}_with_seed_diagnostic` : `header_${headerMode}_known_good_flow`,
          header_mode: headerMode,
          seed,
          cookies_after_navigation: cookiesAfter.map((cookie) => cookie.name).filter(Boolean),
          bypass_cookie_present_after_navigation: cookiesAfter.some((cookie) =>
            ["__vercel_bypass", "_vercel_jwt"].includes(cookie.name) ||
            /vercel/i.test(cookie.name) && /(bypass|protection|jwt|auth)/i.test(cookie.name)
          ),
          home,
          new_map: newMap,
          HOME_PAGE_CAPTURED: home.captured ? 1 : 0,
          NEW_MAP_CAPTURED: newMap.captured ? 1 : 0,
          challenge_detected: Boolean(seed.challenge_detected || home.challenge_detected || newMap.challenge_detected),
          status:
            home.captured && newMap.captured && !seed.challenge_detected && !home.challenge_detected && !newMap.challenge_detected
              ? "PASS"
              : seed.challenge_detected || home.challenge_detected || newMap.challenge_detected
                ? "CHALLENGE"
                : "FAIL",
          timestamp: new Date().toISOString()
        };
        const headersPayload = {
          run_id: runLabel,
          access_mode: seedDiagnosticEnabled ? `header_${headerMode}_with_seed_diagnostic` : `header_${headerMode}_known_good_flow`,
          header_mode: headerMode,
          seed: {
            response: seed.response,
            seed_url: seed.seed_url,
            cookie_detected: seed.cookie_detected,
            cookie_count: seed.cookie_count,
            seed_set_cookie_names: seed.seed_set_cookie_names
          },
          home: {
            response: home.response
          },
          new_map: {
            response: newMap.response
          }
        };
        await fs.writeFile(path.join(runDir, "response.json"), `${JSON.stringify(responsePayload, null, 2)}\n`, "utf8");
        await fs.writeFile(path.join(runDir, "headers.json"), `${JSON.stringify(headersPayload, null, 2)}\n`, "utf8");
        runs.push(responsePayload);
        const baseRunsRepeatable =
          index === runCount &&
          runs.length === runCount &&
          runs.every((run) => run.HOME_PAGE_CAPTURED === 1 && run.NEW_MAP_CAPTURED === 1 && run.status === "PASS");
        if (baseRunsRepeatable) {
          fullUi = await captureFullUi(page, batchDir, home, newMap).catch((error) => ({
            pass: false,
            home,
            new_map: newMap,
            country_geo: "",
            country_visible: false,
            popup_visible: false,
            popup_text: "",
            ai_panel_visible: false,
            screenshots: {
              step_1: home.screenshot,
              step_2: newMap.screenshot
            },
            reason: `FULL_UI_ERROR:${error.message || error.name || "UNKNOWN"}`
          }));
        }
      } finally {
        await context.close().catch(() => {});
      }
      if (index < runCount) {
        await new Promise((resolve) => setTimeout(resolve, runDelayMs));
      }
    }

    const successCount = runs.filter((run) => run.HOME_PAGE_CAPTURED === 1 && run.NEW_MAP_CAPTURED === 1 && run.status === "PASS").length;
    const challengeCount = runs.filter((run) => run.status === "CHALLENGE").length;
    const repeatable = successCount === runCount;
    const fullUiChallengeDetected = Boolean(
      fullUi?.home?.challenge_detected ||
      fullUi?.new_map?.challenge_detected ||
      /VERCEL_SECURITY_CHECKPOINT|Security Checkpoint/i.test(`${fullUi?.reason || ""}`)
    );

    const summary = {
      generated_at: new Date().toISOString(),
      batch_id: runId,
      base_batch_id: fullUiOnly ? baseBatchId : runId,
      full_ui_only: fullUiOnly,
      target,
      secret_present: Boolean(secret),
      secret_source: secret ? "process_env:VERCEL_AUTOMATION_BYPASS_SECRET" : "missing",
      run_count: runs.length,
      run_delay_ms: runDelayMs,
      seed_diagnostic_enabled: seedDiagnosticEnabled,
      header_mode: headerMode,
      success_count: successCount,
      challenge_count: challengeCount,
      base_screenshot_repeatability: repeatable,
      full_ui_challenge_detected: fullUiChallengeDetected,
      repeatable_prod_screenshots: repeatable && Boolean(fullUi?.pass),
      runs,
      full_ui: fullUi,
      report_dir: path.relative(repoRoot, batchDir)
    };
    summary.history = await loadBatchHistory(summary);

    await fs.writeFile(path.join(batchDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(reportRoot, "repeatability.md"), `${renderReport(summary)}\n`, "utf8");
    await fs.writeFile(path.join(repeatabilityRoot, "latest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    console.log(`RUN_ID=${runId}`);
    console.log(`SUCCESS_COUNT=${successCount}`);
    console.log(`CHALLENGE_COUNT=${challengeCount}`);
    console.log(`REPEATABLE_PROD_SCREENSHOTS=${summary.repeatable_prod_screenshots ? "YES" : "NO"}`);
    console.log(`REPEATABILITY_REPORT=${path.join("Reports", "ProdAudit", "repeatability.md")}`);
  } finally {
    await browser.close().catch(() => {});
    slot.release();
  }
}

await runRepeatabilityBatch().catch(async (error) => {
  await ensureDir(batchDir);
  await fs.writeFile(path.join(batchDir, "error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(error.message || error);
  process.exit(1);
});

#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";
import { resolveBrowserExecutionPath, reuseMetrics } from "./runtime/prodBrowserTransport.mjs";
import {
  buildVercelBypassHeaders,
  diffVercelBypassCookies,
  normalizeBypassCookieMode,
  redactVercelBypassSecret,
  sanitizeVercelEvidenceHeaders
} from "./vercel_bypass.mjs";
import { warmVercelBypass } from "./lib/vercel-bypass.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();
const runId = process.env.PROD_ACCESS_RUN_ID || new Date().toISOString().replace(/[-:.]/g, "").replace("T", "").slice(0, 14);
const reportDir = path.join(repoRoot, "Reports", "ProdAudit", runId);
const headless = process.env.PROD_ACCESS_HEADLESS === "0" ? false : true;
const browserName = String(process.env.PROD_ACCESS_BROWSER || "chromium").trim().toLowerCase();
const fullUiRuns = Math.max(1, Number(process.env.PROD_ACCESS_FULL_UI_RUNS || 3));
const stopOnFirstFailure = process.env.PROD_ACCESS_STOP_ON_FIRST_FAILURE === "0" ? false : true;
const attemptBudget = Number(process.env.PROD_ACCESS_ATTEMPT_BUDGET || process.env.ATTEMPT_BUDGET || 1) || 0;
const attemptHypothesis = String(process.env.PROD_ACCESS_HYPOTHESIS || process.env.HYPOTHESIS || "").trim();
const bypassCookieMode = normalizeBypassCookieMode(process.env.PROD_ACCESS_BYPASS_COOKIE_MODE || "true");
const cardIndexProxyMode = String(process.env.PROD_ACCESS_CARD_INDEX_PROXY || "context_request").trim().toLowerCase();
const firstPartyHeaderFallback = process.env.PROD_ACCESS_HEADER_FALLBACK === "1";
const readinessArtifactInput =
  process.env.PROD_ACCESS_READINESS_ARTIFACT ||
  path.join("Reports", "ProdAudit", "prod-attempt-readiness.json");
const readinessMaxAgeMs = Math.max(
  60_000,
  Number(process.env.PROD_ACCESS_READINESS_MAX_AGE_MS || 30 * 60 * 1000) || 30 * 60 * 1000
);
const headerOnlyBaselinePath =
  process.env.PROD_ACCESS_HEADER_ONLY_BASELINE ||
  path.join("Reports", "ProdAudit", "repeatability", "latest.json");
const currentDeploymentUrl =
  process.env.PROD_ACCESS_CURRENT_DEPLOYMENT_URL ||
  "https://islegalcannabis-oil8ip1ga-krukovvs-projects.vercel.app";
const immutableDeploymentUrl =
  process.env.PROD_ACCESS_IMMUTABLE_URL ||
  "https://islegalcannabis-hf34nd7ox-krukovvs-projects.vercel.app";
const targetAliases = {
  www: { id: "www", label: "www.islegal.info", url: "https://www.islegal.info" },
  apex: { id: "apex", label: "islegal.info", url: "https://islegal.info" },
  production: { id: "production", label: "current production deployment", url: currentDeploymentUrl },
  immutable: { id: "immutable", label: "immutable deployment", url: immutableDeploymentUrl }
};
const targetAlias = String(process.env.PROD_ACCESS_TARGET_NAME || "www").trim().toLowerCase();
const lockedTargetInput =
  process.env.PROD_ACCESS_TARGET_URL ||
  process.env.PROD_AUDIT_TARGET ||
  targetAliases[targetAlias]?.url ||
  targetAliases.www.url;
const territoryMatrix = [
  "XK",
  "GF",
  "GL",
  "PR",
  "TW",
  "HK",
  "MO",
  "PS",
  "EH",
  "NC",
  "FO",
  "GP",
  "MQ",
  "RE",
  "GI"
];
const priorityPopupGeos = ["XK", "GF"];
const popupTraceControlGeos = ["AL"];
const popupTraceRequiredFields = [
  "COUNTRY_REQUESTED",
  "FEATURE_FOUND",
  "FEATURE_CLICKED",
  "SELECTED_ISO",
  "SELECTED_DEBUG_ID",
  "CARD_FOUND",
  "POPUP_MODEL_CREATED",
  "POPUP_RENDERED",
  "POPUP_VISIBLE",
  "SCREENSHOT_SAVED"
];
const popupTraceBooleanSteps = [
  "FEATURE_FOUND",
  "FEATURE_CLICKED",
  "CARD_FOUND",
  "POPUP_MODEL_CREATED",
  "POPUP_RENDERED",
  "POPUP_VISIBLE",
  "SCREENSHOT_SAVED"
];
const trickyTerritories = new Set(["GF", "HK", "MO", "GI", "FO", "GP", "MQ", "RE"]);
const popupCampaignPool = ["XK", "GF", "TW", "HK", "MO", "PS", "EH", "PR", "GL", "NC", "GI", "RE"];
const mapStabilityRegions = [
  { id: "europe", label: "Europe", center: [14.5, 49.8], zoom: 4.1 },
  { id: "north-america", label: "North America", center: [-98.5, 39.5], zoom: 3.6 },
  { id: "asia", label: "Asia", center: [103.8, 34.0], zoom: 3.4 }
];
const geolocationProbe = {
  latitude: 40.7128,
  longitude: -74.006,
  expected_iso: "US",
  label: "New York City"
};
const screenshotMinimumBytes = 10_000;

function sanitize(value) {
  return redactVercelBypassSecret(String(value ?? ""), secret);
}

function hasAccessBlock(text) {
  return /Security Checkpoint|Could not verify your browser|Code 21|Failed to verify your browser|We're verifying your browser|Контрольная точка безопасности/i.test(text || "");
}

function normalizeOrigin(input) {
  const url = new URL(input);
  return url.origin;
}

function normalizeUrl(input) {
  const url = new URL(input);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function joinUrl(base, relativePath) {
  return new URL(relativePath, `${normalizeUrl(base)}/`).toString();
}

function zoomForGeo(geo, attempt = 0) {
  const base =
    geo === "MO" || geo === "GI" ? 11.5 :
    geo === "HK" ? 9.5 :
    geo === "XK" ? 7.0 :
    geo === "GF" ? 6.2 :
    ["FO", "GP", "MQ", "RE", "NC"].includes(geo) ? 8.0 :
    geo === "TW" ? 6.0 :
    geo === "PR" ? 6.4 :
    geo === "PS" ? 7.2 :
    5.8;
  return base + attempt * 1.2;
}

function screenshotRelative(filePath) {
  return path.relative(repoRoot, filePath);
}

function hostName(input) {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isFirstPartyUrl(input, lockedTarget) {
  const host = hostName(input);
  return host === hostName(lockedTarget.url);
}

function transportLabel() {
  return firstPartyHeaderFallback
    ? "PLAYWRIGHT_EXTRA_HTTP_HEADERS_PLUS_COOKIE_SEED"
    : "CONTEXT_REQUEST_COOKIE_WARMUP";
}

function buildLockedTarget() {
  const origin = normalizeOrigin(lockedTargetInput);
  const alias = targetAliases[targetAlias];
  const host = hostName(origin);
  const knownAlias = Object.values(targetAliases).find((entry) => hostName(entry.url) === host);
  return {
    id: alias?.id || knownAlias?.id || "locked",
    label: alias?.label || knownAlias?.label || host || "locked production host",
    url: origin
  };
}

function contextExtraHeaders() {
  if (!secret || !firstPartyHeaderFallback) return {};
  return buildVercelBypassHeaders(secret, bypassCookieMode);
}

function isCardIndexUrl(input) {
  try {
    const url = new URL(input);
    return url.pathname === "/api/new-map/card-index";
  } catch {
    return false;
  }
}

function fulfillableHeaders(headers = {}) {
  const blocked = new Set(["content-encoding", "content-length", "transfer-encoding"]);
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([name]) => !blocked.has(String(name).toLowerCase()))
      .map(([name, value]) => [name, String(value ?? "")])
  );
}

async function installFirstPartyBypassRoute(context, lockedTarget, routeEvents = []) {
  if (!secret) return false;
  if (!firstPartyHeaderFallback && cardIndexProxyMode === "off") return false;
  const lockedHost = hostName(lockedTarget.url);
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (hostName(request.url()) !== lockedHost) {
      await route.continue();
      return;
    }
    if (cardIndexProxyMode !== "off" && isCardIndexUrl(request.url())) {
      const startedAt = Date.now();
      const headers = buildVercelBypassHeaders(secret, bypassCookieMode);
      const response = await context.request.get(request.url(), {
        headers,
        timeout: 45000,
        maxRedirects: 0
      });
      const responseHeaders = typeof response.headers === "function" ? response.headers() : {};
      routeEvents.push({
        url: sanitize(request.url()),
        status: response.status(),
        resource_type: request.resourceType(),
        fulfilled_by: "context_request_proxy",
        proxy_mode: cardIndexProxyMode,
        request_bypass_header_present: true,
        request_set_bypass_cookie_header_present: true,
        request_vercel_header_names: Object.keys(headers).sort(),
        headers: sanitizeVercelEvidenceHeaders(responseHeaders, secret),
        duration_ms: Date.now() - startedAt
      });
      await route.fulfill({
        status: response.status(),
        headers: fulfillableHeaders(responseHeaders),
        body: await response.body()
      });
      return;
    }
    if (!firstPartyHeaderFallback) {
      await route.continue();
      return;
    }
    await route.continue({
      headers: {
        ...request.headers(),
        ...buildVercelBypassHeaders(secret, bypassCookieMode)
      }
    });
  });
  return true;
}

function browserLaunchConfig() {
  if (browserName === "webkit") {
    return { browserType: webkit, launchOptions: { headless }, browserLabel: "webkit" };
  }
  if (browserName === "firefox") {
    return { browserType: firefox, launchOptions: { headless }, browserLabel: "firefox" };
  }
  if (browserName === "chrome") {
    return { browserType: chromium, launchOptions: { headless, channel: "chrome" }, browserLabel: "chrome" };
  }
  return { browserType: chromium, launchOptions: { headless }, browserLabel: "chromium" };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copyIfPresent(sourcePath, targetPath) {
  await ensureDir(path.dirname(targetPath));
  await fs.copyFile(sourcePath, targetPath);
}

async function readJson(filePath) {
  return await fs.readFile(filePath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => null);
}

async function fileExists(filePath) {
  return await fs.stat(filePath).then((stat) => stat.isFile()).catch(() => false);
}

async function fileStat(filePath) {
  return await fs.stat(filePath).catch(() => null);
}

async function pngInfo(relativeOrAbsolutePath) {
  const fullPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(repoRoot, relativeOrAbsolutePath);
  const stat = await fileStat(fullPath);
  if (!stat?.isFile()) {
    return {
      exists: false,
      bytes: 0,
      png: false,
      width: null,
      height: null
    };
  }
  const handle = await fs.open(fullPath, "r").catch(() => null);
  if (!handle) {
    return {
      exists: true,
      bytes: stat.size,
      png: false,
      width: null,
      height: null
    };
  }
  try {
    const buffer = Buffer.alloc(24);
    await handle.read(buffer, 0, buffer.length, 0);
    const png =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
    return {
      exists: true,
      bytes: stat.size,
      png,
      width: png ? buffer.readUInt32BE(16) : null,
      height: png ? buffer.readUInt32BE(20) : null
    };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function resolveRepoPath(input) {
  return path.isAbsolute(input) ? input : path.join(repoRoot, input);
}

function hashText(value) {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function selectCampaignGeos(cardIndex, rows, limit = 4) {
  const passed = new Set(
    (rows || [])
      .filter((row) => row.status === "PASS" && row.popup_visible)
      .map((row) => String(row.geo || "").toUpperCase())
  );
  const offset = popupCampaignPool.length ? hashText(runId) % popupCampaignPool.length : 0;
  return popupCampaignPool
    .slice(offset)
    .concat(popupCampaignPool.slice(0, offset))
    .filter((geo) => passed.has(geo))
    .filter((geo) => String(cardIndex?.[geo]?.pageHref || "").startsWith("/c/"))
    .slice(0, limit);
}

function headerValue(headers, name) {
  const lower = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === lower);
  return entry?.[1] || "";
}

function isChallengeNetworkEvent(event) {
  return (
    Number(event?.status || 0) === 403 ||
    String(headerValue(event?.headers || {}, "x-vercel-mitigated")).toLowerCase() === "challenge"
  );
}

function challengeBucket(event) {
  const url = String(event?.url || "");
  const type = String(event?.resource_type || "").toLowerCase();
  if (/\/api\/new-map\/card-index\b/.test(url)) return "CARD_INDEX";
  if (/glyph/i.test(url)) return "GLYPHS";
  if (/sprite/i.test(url)) return "SPRITES";
  if (/basemap|tile|tiles/i.test(url)) return "TILES";
  if (/\/api\//.test(url)) return "API";
  if (/\/_next\/static\/chunks\/.*\.js\b/.test(url) || type === "script") return "JS_CHUNK";
  if (type === "document") return "HTML";
  return "OTHER";
}

function summarizeSubresourceChallenges(events) {
  const challenged = (events || []).filter(isChallengeNetworkEvent);
  const buckets = {};
  for (const event of challenged) {
    const bucket = challengeBucket(event);
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  return {
    FIRST_SUBRESOURCE_CHALLENGE: challenged[0]?.url || "",
    FIRST_CHALLENGE_URL: challenged[0]?.url || "",
    FIRST_CHALLENGE_MS: challenged[0]?.elapsed_since_seed_ms ?? null,
    CHALLENGE_COUNT: challenged.length,
    CHALLENGED_URLS: challenged.map((event) => event.url).filter(Boolean),
    CHALLENGED_TYPES: Object.keys(buckets),
    CHALLENGE_BUCKETS: buckets
  };
}

function readinessArtifactPath() {
  return resolveRepoPath(readinessArtifactInput);
}

function parseTimeMs(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function validateReadinessArtifact(payload) {
  if (!payload) {
    return {
      ok: false,
      reason: "PROD_READINESS_MISSING"
    };
  }
  if (attemptBudget !== 1) {
    return {
      ok: false,
      reason: "ATTEMPT_BUDGET_INVALID",
      details: { attempt_budget: attemptBudget }
    };
  }
  if (!attemptHypothesis) {
    return {
      ok: false,
      reason: "HYPOTHESIS_MISSING"
    };
  }
  if (payload.hypothesis !== attemptHypothesis) {
    return {
      ok: false,
      reason: "HYPOTHESIS_MISMATCH",
      details: {
        expected: attemptHypothesis,
        actual: payload.hypothesis || ""
      }
    };
  }
  const generatedMs = parseTimeMs(payload.generated_at);
  const ageMs = Date.now() - generatedMs;
  if (!generatedMs || ageMs > readinessMaxAgeMs) {
    return {
      ok: false,
      reason: "PROD_READINESS_STALE",
      details: {
        generated_at: payload.generated_at || "",
        age_ms: ageMs,
        max_age_ms: readinessMaxAgeMs
      }
    };
  }
  if (payload.attempt_budget !== 1 || payload.prod_run_allowed !== true || payload.status !== "PASS") {
    return {
      ok: false,
      reason: "PROD_READINESS_NOT_PASS",
      details: {
        status: payload.status || "",
        prod_run_allowed: Boolean(payload.prod_run_allowed),
        attempt_budget: payload.attempt_budget
      }
    };
  }
  if (!payload.local_replay?.pass || !payload.local_replay?.kosovo_popup || !payload.local_replay?.french_guiana_popup || payload.local_replay?.territory_matrix_pass !== true) {
    return {
      ok: false,
      reason: "LOCAL_REPLAY_NOT_PROVEN",
      details: payload.local_replay || {}
    };
  }
  return {
    ok: true,
    reason: "OK",
    details: {
      generated_at: payload.generated_at,
      readiness_artifact: screenshotRelative(readinessArtifactPath()),
      local_replay_summary: payload.local_replay.summary_path || ""
    }
  };
}

async function readProdAttemptReadiness() {
  const artifactPath = readinessArtifactPath();
  const payload = await readJson(artifactPath);
  return {
    path: artifactPath,
    payload,
    validation: validateReadinessArtifact(payload)
  };
}

async function appendChallengeHistory(entry) {
  const historyPath = path.join(repoRoot, "Reports", "ProdAudit", "challenge-history.json");
  const current = await readJson(historyPath);
  const runs = Array.isArray(current?.runs)
    ? current.runs
    : Array.isArray(current)
      ? current
      : [];
  runs.push({
    timestamp: new Date().toISOString(),
    run_id: runId,
    hypothesis: attemptHypothesis || "",
    attempt_budget: attemptBudget,
    seed_status: entry.seed_status ?? null,
    mitigated: entry.mitigated || "",
    browser: entry.browser || browserName,
    host: entry.host || "",
    app_code_reached: entry.app_code_reached || "NO",
    status: entry.status || "",
    stop_reason: entry.stop_reason || "",
    seed_request_count: Number(entry.seed_request_count || 0),
    report_dir: screenshotRelative(reportDir)
  });
  await writeJson(historyPath, {
    generated_at: new Date().toISOString(),
    runs
  });
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

async function responseEvidence(response) {
  if (!response) {
    return {
      status: null,
      location: "",
      x_vercel_mitigated: "",
      x_vercel_id: "",
      headers_object: {},
      headers_array: []
    };
  }
  const headersObject = typeof response.headers === "function" ? response.headers() : {};
  const headersArray = await Promise.resolve(
    typeof response.headersArray === "function" ? response.headersArray() : []
  ).catch(() => []);
  return {
    status: response.status(),
    location: sanitizeVercelEvidenceHeaders(headersObject, secret).location || "",
    x_vercel_mitigated: sanitizeVercelEvidenceHeaders(headersObject, secret)["x-vercel-mitigated"] || "",
    x_vercel_id: sanitizeVercelEvidenceHeaders(headersObject, secret)["x-vercel-id"] || "",
    headers_object: sanitizeVercelEvidenceHeaders(headersObject, secret),
    headers_array: headersArray.map((header) => ({
      name: header.name,
      value: sanitizeVercelEvidenceHeaders({ [header.name]: header.value }, secret)[header.name]
    }))
  };
}

function responseInfoIsChallenge(responseInfo) {
  return (
    Number(responseInfo?.status || 0) === 403 ||
    String(responseInfo?.x_vercel_mitigated || "").toLowerCase() === "challenge"
  );
}

async function waitForMapReady(page, timeout = 60000) {
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout });
  await page.waitForFunction(
    () =>
      Boolean(window.__NEW_MAP_QA__ || window.__NEW_MAP_DEBUG__?.map) &&
      document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1" &&
      Boolean(document.querySelector(".maplibregl-canvas")),
    null,
    { timeout }
  );
}

async function waitForMapControl(page, timeout = 30000) {
  await page.waitForFunction(
    () => Boolean(window.__NEW_MAP_QA__?.jumpTo || window.__NEW_MAP_DEBUG__?.map),
    null,
    { timeout }
  );
}

async function captureRoute(page, url, screenshotPath, options = {}) {
  const startedAt = Date.now();
  const requireMapReady = options.requireMapReady !== false;
  const waitForAppShell = options.waitForAppShell !== false;
  const routeId = String(options.routeId || "route");
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const domcontentloadedAt = Date.now();
  const responseInfo = await responseEvidence(response);
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const title = await page.title().catch(() => "");
  const challengeDetected =
    responseInfo.status === 403 ||
    responseInfo.x_vercel_mitigated === "challenge" ||
    hasAccessBlock(`${title}\n${bodyText}`);
  const mapReady = !challengeDetected && requireMapReady
    ? await waitForMapReady(page, 60000).then(() => true).catch(() => false)
    : false;
  const mapReadyAt = Date.now();
  if (!challengeDetected && !requireMapReady && waitForAppShell) {
    await page
      .waitForSelector(".maplibregl-canvas", { timeout: 8000 })
      .catch(() => undefined);
  }
  const hasRoot = await page.locator('[data-testid="new-map-root"]').count().catch(() => 0);
  const hasSurface = await page.locator('[data-testid="new-map-surface"]').count().catch(() => 0);
  const hasCanvas = await page.locator(".maplibregl-canvas").count().catch(() => 0);
  const hasPopup = await page.locator('[data-testid="new-map-country-popup"]').count().catch(() => 0);
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
  const screenshotBytes = await fs.stat(screenshotPath).then((stat) => stat.size).catch(() => 0);
  return {
    route_id: routeId,
    url: sanitize(page.url()),
    title,
    body_sample: sanitize(bodyText.slice(0, 320)),
    challenge_detected: challengeDetected,
    map_ready: mapReady,
    has_root: hasRoot > 0,
    has_surface: hasSurface > 0,
    has_canvas: hasCanvas > 0,
    has_popup: hasPopup > 0,
    screenshot: screenshotRelative(screenshotPath),
    screenshot_bytes: screenshotBytes,
    app_code_reached:
      !challengeDetected &&
      responseInfo.status !== null &&
      responseInfo.status < 400 &&
      (mapReady || (hasRoot > 0 && hasSurface > 0 && (hasCanvas > 0 || !requireMapReady))),
    response: responseInfo,
    timings: {
      start_epoch_ms: startedAt,
      domcontentloaded_ms: domcontentloadedAt - startedAt,
      map_ready_ms: mapReady ? mapReadyAt - startedAt : null,
      total_ms: Date.now() - startedAt
    }
  };
}

async function readRuntimeCardIndex(page) {
  return await page.evaluate(async () => {
    const embedded = window.__NEW_MAP_CARD_INDEX__;
    if (embedded && typeof embedded === "object" && Object.keys(embedded).length > 0) {
      return embedded;
    }
    const endpoints = [
      { url: "/new-map-card-index.json", init: { credentials: "same-origin" } },
      { url: "/api/new-map/card-index", init: { cache: "no-store", credentials: "same-origin" } }
    ];
    let lastStatus = "";
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint.url, endpoint.init);
      lastStatus = `${endpoint.url}:${response.status}`;
      if (response.ok) return response.json();
    }
    throw new Error(`CARD_INDEX_FETCH_FAILED:${lastStatus}`);
  });
}

async function clearPopup(page) {
  const closeButton = page.locator('[data-testid="new-map-country-popup"] button[aria-label^="Close"]').first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click().catch(() => undefined);
    await page.waitForTimeout(150);
  }
}

async function jumpToGeo(page, geo, entry, attempt = 0) {
  const lng = Number(entry?.coordinates?.lng);
  const lat = Number(entry?.coordinates?.lat);
  const zoom = zoomForGeo(geo, attempt);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error(`NO_COORDINATES:${geo}`);
  await waitForMapControl(page, 30000);
  await page.evaluate(
    async ({ lngValue, latValue, zoomValue }) => {
      const qa = window.__NEW_MAP_QA__;
      if (qa?.jumpTo) {
        await qa.jumpTo(lngValue, latValue, zoomValue);
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
        map.jumpTo({ center: [lngValue, latValue], zoom: zoomValue, pitch: 0, bearing: 0 });
      });
    },
    { lngValue: lng, latValue: lat, zoomValue: zoom }
  );
  await page.waitForTimeout(350);
}

async function findFeaturePoint(page, geo, entry) {
  const layerIds = geo.startsWith("US-")
    ? ["us-states-fill"]
    : ["legal-territory-label", "legal-territory-hitbox", "legal-point", "legal-fill"];
  return await page.evaluate(
    ({ targetGeo, targetLayerIds, lng, lat }) => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return null;
      const canvas = map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const featureIds = (feature) => {
        const props = feature?.properties || {};
        return [props.geo, props.iso2, props.iso_a2, props.ISO_A2, feature?.id]
          .map((value) => String(value || "").toUpperCase())
          .filter(Boolean);
      };
      const firstAppFeatureAtPoint = (x, y) => {
        for (const layerId of targetLayerIds) {
          if (!map.getLayer(layerId)) continue;
          const features = map.queryRenderedFeatures([x, y], { layers: [layerId] }) || [];
          const feature = features.find((candidate) => featureIds(candidate).includes(targetGeo)) || features[0] || null;
          if (!feature) continue;
          return { feature, layerId };
        }
        return null;
      };
      const windows = [];
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        const projected = map.project({ lng, lat });
        windows.push({
          startX: Math.max(16, projected.x - 260),
          endX: Math.min(rect.width - 16, projected.x + 260),
          startY: Math.max(16, projected.y - 220),
          endY: Math.min(rect.height - 16, projected.y + 220),
          step: 8
        });
      }
      windows.push({
        startX: 20,
        endX: rect.width - 20,
        startY: 20,
        endY: rect.height - 20,
        step: 18
      });
      for (const area of windows) {
        for (let y = area.startY; y < area.endY; y += area.step) {
          for (let x = area.startX; x < area.endX; x += area.step) {
            const selected = firstAppFeatureAtPoint(x, y);
            if (selected && featureIds(selected.feature).includes(targetGeo)) {
              return {
                x: rect.left + x,
                y: rect.top + y,
                canvas_x: x,
                canvas_y: y,
                layer_id: selected.layerId,
                method: "app-selection-feature",
                feature_id: String(selected.feature.id || selected.feature.properties?.geo || targetGeo)
              };
            }
          }
        }
      }
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      const projected = map.project({ lng, lat });
      const selected = firstAppFeatureAtPoint(projected.x, projected.y);
      if (!selected || !featureIds(selected.feature).includes(targetGeo)) return null;
      return {
        x: rect.left + Math.round(projected.x),
        y: rect.top + Math.round(projected.y),
        canvas_x: Math.round(projected.x),
        canvas_y: Math.round(projected.y),
        layer_id: selected.layerId,
        method: "projected-app-selection-feature",
        feature_id: String(selected.feature.id || selected.feature.properties?.geo || targetGeo)
      };
    },
    {
      targetGeo: geo,
      targetLayerIds: layerIds,
      lng: Number(entry?.coordinates?.lng),
      lat: Number(entry?.coordinates?.lat)
    }
  );
}

async function waitForFeaturePoint(page, geo, entry, timeout = 5000) {
  const startedAt = Date.now();
  let lastPoint = null;
  while (Date.now() - startedAt < timeout) {
    lastPoint = await findFeaturePoint(page, geo, entry).catch(() => null);
    if (lastPoint) return lastPoint;
    await page.waitForTimeout(150);
  }
  return lastPoint;
}

async function projectedCoordinatePoint(page, geo, entry) {
  const lng = Number(entry?.coordinates?.lng);
  const lat = Number(entry?.coordinates?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return await page.evaluate(
    ({ targetGeo, lngValue, latValue }) => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return null;
      const canvas = map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const projected = map.project({ lng: lngValue, lat: latValue });
      if (projected.x < 0 || projected.y < 0 || projected.x > rect.width || projected.y > rect.height) return null;
      return {
        x: rect.left + Math.round(projected.x),
        y: rect.top + Math.round(projected.y),
        canvas_x: Math.round(projected.x),
        canvas_y: Math.round(projected.y),
        layer_id: "",
        method: "projected-coordinate-fallback",
        feature_id: targetGeo,
        feature_found: false
      };
    },
    {
      targetGeo: geo,
      lngValue: lng,
      latValue: lat
    }
  );
}

async function restoreMapControl(page) {
  try {
    await waitForMapReady(page, 5000);
    await waitForMapControl(page, 5000);
    return true;
  } catch {
    return false;
  }
}

async function clickFeatureAndConfirm(page, geo, point) {
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
    [3, 0],
    [-3, 0]
  ];
  for (const [offsetX, offsetY] of offsets) {
    await page.mouse.move(point.x + offsetX, point.y + offsetY);
    await page.mouse.click(point.x + offsetX, point.y + offsetY);
    const selected = await page.waitForFunction(
      (targetGeo) => {
        const selectedId = String(window.__NEW_MAP_DEBUG__?.selectedId || "").toUpperCase();
        if (selectedId === targetGeo) return true;
        const popup = document.querySelector('[data-testid="new-map-country-popup"]');
        return Boolean(popup?.textContent?.includes(`ISO2: ${targetGeo}`));
      },
      geo,
      { timeout: 1600 }
    ).then(() => true).catch(() => false);
    if (selected) return true;
  }
  return false;
}

async function readClickState(page) {
  return await page.evaluate(() => {
    const debug = window.__NEW_MAP_DEBUG__ || {};
    const trace = debug.popupTrace || {};
    const selectedIso = String(debug.selectedId || trace.GEO_ID || trace.DEBUG_ID || "").toUpperCase();
    return {
      click_received: Boolean(trace.CLICK_RECEIVED || selectedIso),
      selected_iso: selectedIso
    };
  }).catch(() => ({
    click_received: false,
    selected_iso: ""
  }));
}

async function readPopup(page, geo) {
  await page.waitForFunction(
    (targetGeo) => {
      const popup = document.querySelector('[data-testid="new-map-country-popup"]');
      return Boolean(popup?.textContent?.includes(`ISO2: ${targetGeo}`));
    },
    geo,
    { timeout: 4000 }
  ).catch(() => false);
  const popup = page.locator('[data-testid="new-map-country-popup"]').first();
  const popupVisible = await popup.isVisible({ timeout: 4000 }).catch(() => false);
  const popupText = popupVisible ? await popup.innerText().catch(() => "") : "";
  return {
    popup_visible: popupVisible,
    popup_text_sample: sanitize(popupText.slice(0, 320)),
    popup_matches_geo: popupVisible && popupText.includes(`ISO2: ${geo}`)
  };
}

async function readPopupTrace(page, geo, options = {}) {
  const requestedGeo = String(geo || "").trim().toUpperCase();
  return await page.evaluate(
    ({
      targetGeo,
      cardExists,
      featureFound,
      featureClicked,
      screenshotSaved,
      screenshotPath,
      point
    }) => {
      const debug = window.__NEW_MAP_DEBUG__ || {};
      const trace = debug.popupTrace || {};
      const popup = document.querySelector('[data-testid="new-map-country-popup"]');
      const popupText = popup?.textContent || "";
      const rect = popup?.getBoundingClientRect?.() || null;
      const style = popup ? window.getComputedStyle(popup) : null;
      const selectedIso = String(debug.selectedId || trace.GEO_ID || trace.DEBUG_ID || "").trim().toUpperCase();
      const selectedDebugId = String(trace.DEBUG_ID || debug.selectedId || "").trim().toUpperCase();
      const traceGeo = String(trace.GEO_ID || trace.DEBUG_ID || trace.CARD_INDEX_KEY || "").trim().toUpperCase();
      const traceMatchesRequested =
        traceGeo === targetGeo ||
        selectedIso === targetGeo ||
        popupText.includes(`ISO2: ${targetGeo}`);
      const popupVisible = Boolean(
        popup &&
        rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        style?.display !== "none" &&
        style?.visibility !== "hidden" &&
        Number(style?.opacity || "1") !== 0
      );
      return {
        id: targetGeo,
        geo: targetGeo,
        COUNTRY_REQUESTED: targetGeo,
        FEATURE_FOUND: Boolean(featureFound),
        FEATURE_CLICKED: Boolean(
          featureClicked ||
          (traceMatchesRequested && trace.CLICK_RECEIVED) ||
          selectedIso === targetGeo ||
          popupText.includes(`ISO2: ${targetGeo}`)
        ),
        SELECTED_ISO: selectedIso,
        SELECTED_DEBUG_ID: selectedDebugId,
        CARD_FOUND: Boolean(cardExists || (traceMatchesRequested && trace.CARD_INDEX_HIT)),
        POPUP_MODEL_CREATED: Boolean(traceMatchesRequested && trace.POPUP_DATA_FOUND),
        POPUP_RENDERED: Boolean((traceMatchesRequested && trace.POPUP_RENDERED) || popupVisible),
        POPUP_VISIBLE: popupVisible,
        SCREENSHOT_SAVED: Boolean(screenshotSaved),
        SCREENSHOT_PATH: screenshotPath || "",
        CARD_KEY: traceMatchesRequested ? String(trace.CARD_INDEX_KEY || "") : "",
        CLICK_LAYER: traceMatchesRequested ? String(trace.CLICK_LAYER || "") : "",
        FEATURE_ID: traceMatchesRequested ? String(trace.FEATURE_ID || "") : "",
        POPUP_STATE: {
          selected_id: String(debug.selectedId || ""),
          trace_geo: traceGeo,
          trace_matches_requested: traceMatchesRequested,
          popup_text_has_iso: popupText.includes(`ISO2: ${targetGeo}`),
          popup_text_sample: popupText.slice(0, 320)
        },
        POPUP_VISIBILITY: {
          popup_count: document.querySelectorAll('[data-testid="new-map-country-popup"]').length,
          visible: popupVisible,
          bbox: rect
            ? {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            : null
        },
        POINT: point || null,
        RAW_POPUP_TRACE: traceMatchesRequested ? trace : {}
      };
    },
    {
      targetGeo: requestedGeo,
      cardExists: Boolean(options.cardExists),
      featureFound: Boolean(options.featureFound),
      featureClicked: Boolean(options.featureClicked),
      screenshotSaved: Boolean(options.screenshotSaved),
      screenshotPath: options.screenshotPath || "",
      point: options.point || null
    }
  ).catch(() => ({
    id: requestedGeo,
    geo: requestedGeo,
    COUNTRY_REQUESTED: requestedGeo,
    FEATURE_FOUND: Boolean(options.featureFound),
    FEATURE_CLICKED: Boolean(options.featureClicked),
    SELECTED_ISO: "",
    SELECTED_DEBUG_ID: "",
    CARD_FOUND: Boolean(options.cardExists),
    POPUP_MODEL_CREATED: false,
    POPUP_RENDERED: false,
    POPUP_VISIBLE: false,
    SCREENSHOT_SAVED: Boolean(options.screenshotSaved),
    SCREENSHOT_PATH: options.screenshotPath || "",
    CARD_KEY: "",
    CLICK_LAYER: "",
    FEATURE_ID: "",
    POPUP_STATE: {
      selected_id: "",
      trace_geo: "",
      trace_matches_requested: false,
      popup_text_has_iso: false,
      popup_text_sample: ""
    },
    POPUP_VISIBILITY: {
      popup_count: 0,
      visible: false,
      bbox: null
    },
    POINT: options.point || null,
    RAW_POPUP_TRACE: {}
  }));
}

function popupTraceIsComplete(trace) {
  return popupTraceBooleanSteps.every((field) => Boolean(trace?.[field]));
}

function popupAuditErrorReason(error) {
  const message = String(error?.message || error || "");
  if (/waitForFunction: Timeout|NO_MAP_DEBUG_HANDLE|MAP_CONTROL_UNAVAILABLE/i.test(message)) {
    return "MAP_CONTROL_UNAVAILABLE";
  }
  if (/NO_COORDINATES:[A-Z0-9-]+/i.test(message)) {
    return message.match(/NO_COORDINATES:[A-Z0-9-]+/i)?.[0] || "NO_COORDINATES";
  }
  return sanitize(message.slice(0, 160)) || "POPUP_AUDIT_ERROR";
}

function firstDivergingPopupStep(controlTrace, targetTrace) {
  if (!controlTrace || !targetTrace) return "UNCONFIRMED";
  for (const field of popupTraceBooleanSteps) {
    if (Boolean(controlTrace[field]) !== Boolean(targetTrace[field])) return field;
  }
  return "NONE";
}

function collectPopupTraceRows(cycle) {
  if (!cycle) return [];
  return [
    ...(cycle.deep_trace_controls || []),
    ...(cycle.territory_matrix || [])
  ].map((row) => row.popup_trace).filter(Boolean);
}

function buildPopupTraceComparison(rows) {
  const byGeo = Object.fromEntries(rows.map((row) => [row.geo, row]));
  const control = byGeo.AL || null;
  return {
    control: "AL",
    kosovo: {
      compared_to: "AL",
      first_diverging_step: firstDivergingPopupStep(control, byGeo.XK || null)
    },
    french_guiana: {
      compared_to: "AL",
      first_diverging_step: firstDivergingPopupStep(control, byGeo.GF || null)
    }
  };
}

async function writeValidation(geoDir, payload) {
  await writeJson(path.join(geoDir, "validation.json"), payload);
}

async function writePopupTrace(geoDir, trace) {
  await writeJson(path.join(geoDir, "popup-trace.json"), trace);
}

async function auditGeo(page, geo, entry, cycleDir, options = {}) {
  const geoDir = path.join(cycleDir, options.groupDir || "territory", geo);
  await ensureDir(geoDir);
  let lastPoint = null;
  let lastClickReceived = false;
  let lastSelectedIso = "";
  let lastScreenshotPath = "";
  let lastFailureReason = "POPUP_NOT_VISIBLE_OR_WRONG_GEO";
  let lastPopupTrace = null;
  let mapControlRecovered = false;
  if (!entry) {
    const popupTrace = await readPopupTrace(page, geo, {
      cardExists: false,
      featureFound: false,
      featureClicked: false,
      screenshotSaved: false,
      screenshotPath: ""
    });
    const failure = {
      id: geo,
      geo,
      role: options.role || "territory",
      status: "FAIL",
      card_exists: false,
      feature_exists: false,
      click_received: false,
      selected_iso: "",
      popup_visible: false,
      popup_matches_geo: false,
      screenshot_path: "",
      reason: "CARD_MISSING",
      error: "CARD_MISSING",
      popup_trace_path: screenshotRelative(path.join(geoDir, "popup-trace.json")),
      popup_trace: popupTrace
    };
    await writePopupTrace(geoDir, popupTrace);
    await writeValidation(geoDir, failure);
    return failure;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clearPopup(page);
    try {
      await jumpToGeo(page, geo, entry, attempt);
    } catch (error) {
      lastFailureReason = popupAuditErrorReason(error);
      const sharedRecoveryState = options.recoveryState || null;
      const recoveryAlreadyAttempted = Boolean(mapControlRecovered || sharedRecoveryState?.attempted);
      if (lastFailureReason === "MAP_CONTROL_UNAVAILABLE" && !recoveryAlreadyAttempted) {
        mapControlRecovered = true;
        if (sharedRecoveryState) sharedRecoveryState.attempted = true;
        const recovered = await restoreMapControl(page);
        if (recovered) continue;
        lastFailureReason = "MAP_CONTROL_RECOVERY_FAILED";
      } else if (lastFailureReason === "MAP_CONTROL_UNAVAILABLE" && recoveryAlreadyAttempted) {
        lastFailureReason = "MAP_CONTROL_RECOVERY_SKIPPED";
      }
      lastPopupTrace = await readPopupTrace(page, geo, {
        cardExists: true,
        featureFound: false,
        featureClicked: false,
        screenshotSaved: false,
        screenshotPath: "",
        point: null
      });
      break;
    }
    let point = await waitForFeaturePoint(page, geo, entry).catch((error) => {
      lastFailureReason = popupAuditErrorReason(error);
      return null;
    });
    if (!point) {
      point = trickyTerritories.has(geo)
        ? await projectedCoordinatePoint(page, geo, entry).catch(() => null)
        : null;
    }
    if (!point) {
      if (lastFailureReason === "POPUP_NOT_VISIBLE_OR_WRONG_GEO") {
        lastFailureReason = "FEATURE_POINT_NOT_FOUND";
      }
      lastPopupTrace = await readPopupTrace(page, geo, {
        cardExists: true,
        featureFound: false,
        featureClicked: false,
        screenshotSaved: false,
        screenshotPath: "",
        point: null
      });
      continue;
    }
    lastPoint = point;
    const featureFound = point.feature_found !== false;
    const clickStartedAt = Date.now();
    const clickReceived = await clickFeatureAndConfirm(page, geo, point).catch((error) => {
      lastFailureReason = popupAuditErrorReason(error);
      return false;
    });
    const clickState = await readClickState(page);
    lastClickReceived = Boolean(clickState.click_received || clickReceived);
    lastSelectedIso = clickState.selected_iso || "";
    const countryPath = path.join(geoDir, `country-attempt-${attempt + 1}.png`);
    await page.screenshot({ path: countryPath, fullPage: false }).catch(() => undefined);
    lastScreenshotPath = countryPath;
    const popup = await readPopup(page, geo);
    const clickToPopupMs = Date.now() - clickStartedAt;
    if (clickReceived && popup.popup_matches_geo) {
      const popupPath = path.join(geoDir, "popup.png");
      await page.screenshot({ path: popupPath, fullPage: false }).catch(() => undefined);
      const popupTrace = await readPopupTrace(page, geo, {
        cardExists: true,
        featureFound,
        featureClicked: clickState.click_received || clickReceived,
        screenshotSaved: true,
        screenshotPath: screenshotRelative(popupPath),
        point
      });
      const validation = {
        id: geo,
        geo,
        role: options.role || "territory",
        status: "PASS",
        card_exists: true,
        feature_exists: true,
        click_received: clickState.click_received || true,
        selected_iso: clickState.selected_iso || geo,
        popup_visible: true,
        popup_matches_geo: true,
        attempt: attempt + 1,
        point,
        click_to_popup_ms: clickToPopupMs,
        CLICK_TO_POPUP_MS: clickToPopupMs,
        screenshot_path: screenshotRelative(popupPath),
        error: "",
        popup_trace_path: screenshotRelative(path.join(geoDir, "popup-trace.json")),
        popup_trace: popupTrace,
        screenshots: {
          popup: screenshotRelative(popupPath),
          country: screenshotRelative(countryPath)
        }
      };
      await fs.writeFile(path.join(geoDir, "popup.txt"), popup.popup_text_sample || "", "utf8");
      await writePopupTrace(geoDir, popupTrace);
      await writeValidation(geoDir, validation);
      return validation;
    }
    const reason = popup.popup_visible ? "WRONG_POPUP_GEO" : "POPUP_NOT_VISIBLE";
    const popupTrace = await readPopupTrace(page, geo, {
      cardExists: true,
      featureFound,
      featureClicked: clickState.click_received || clickReceived,
      screenshotSaved: true,
      screenshotPath: screenshotRelative(countryPath),
      point
    });
    const validation = {
      id: geo,
      geo,
      role: options.role || "territory",
      status: "FAIL",
      card_exists: true,
      feature_exists: true,
      click_received: clickState.click_received || clickReceived,
      selected_iso: clickState.selected_iso || "",
      popup_visible: popup.popup_visible,
      popup_matches_geo: popup.popup_matches_geo,
      attempt: attempt + 1,
      point,
      click_to_popup_ms: clickToPopupMs,
      CLICK_TO_POPUP_MS: clickToPopupMs,
      screenshot_path: screenshotRelative(countryPath),
      error: reason,
      popup_trace_path: screenshotRelative(path.join(geoDir, "popup-trace.json")),
      popup_trace: popupTrace,
      screenshots: {
        country: screenshotRelative(countryPath)
      },
      reason
    };
    lastPopupTrace = popupTrace;
    lastFailureReason = validation.reason;
    await writePopupTrace(geoDir, popupTrace);
    await writeValidation(geoDir, validation);
  }
  const popupTrace = lastPopupTrace || await readPopupTrace(page, geo, {
    cardExists: true,
    featureFound: Boolean(lastPoint),
    featureClicked: lastClickReceived,
    screenshotSaved: Boolean(lastScreenshotPath),
    screenshotPath: lastScreenshotPath ? screenshotRelative(lastScreenshotPath) : "",
    point: lastPoint
  });
  const failure = {
    id: geo,
    geo,
    role: options.role || "territory",
    status: "FAIL",
    card_exists: true,
    feature_exists: true,
    click_received: lastClickReceived,
    selected_iso: lastSelectedIso,
    popup_visible: false,
    popup_matches_geo: false,
    point: lastPoint,
    screenshot_path: lastScreenshotPath ? screenshotRelative(lastScreenshotPath) : "",
    raw_failure_reason: lastFailureReason,
    reason: trickyTerritories.has(geo) && lastFailureReason !== "FEATURE_POINT_NOT_FOUND"
      ? "TRICKY_TERRITORY_CLICK_UNCONFIRMED"
      : lastFailureReason,
    error: trickyTerritories.has(geo) && lastFailureReason !== "FEATURE_POINT_NOT_FOUND"
      ? "TRICKY_TERRITORY_CLICK_UNCONFIRMED"
      : lastFailureReason,
    popup_trace_path: screenshotRelative(path.join(geoDir, "popup-trace.json")),
    popup_trace: popupTrace
  };
  await writePopupTrace(geoDir, popupTrace);
  await writeValidation(geoDir, failure);
  return failure;
}

async function seedBypass(context, targetUrl) {
  const before = await context.cookies(targetUrl).catch(() => []);
  const warmup = await warmVercelBypass(context, targetUrl, {
    secret,
    sameSiteNone: bypassCookieMode === "samesitenone",
    timeoutMs: 45000
  });
  const after = await context.cookies(targetUrl).catch(() => []);
  const bypassCookies = diffVercelBypassCookies(before, after);
  return {
    mode: "context_request_cookie_warmup",
    fulfilled_by: "context_request_cookie_warmup",
    target_url: sanitize(targetUrl),
    seed_url: sanitize(warmup.seed_url),
    request_headers: ["x-vercel-protection-bypass", "x-vercel-set-bypass-cookie"],
    cookie_mode: bypassCookieMode,
    redirect_policy: "maxRedirects=0",
    warmup_ms: warmup.warmup_ms,
    cookies_before: before.map((cookie) => cookie.name),
    cookies_after: after.map((cookie) => cookie.name),
    cookies_before_serialized: serializeCookies(before),
    cookies_after_serialized: serializeCookies(after),
    bypass_cookies: bypassCookies.map((cookie) => cookie.name),
    bypass_cookie_detected: bypassCookies.length > 0,
    bypass_cookie_absence_documented: bypassCookies.length === 0,
    challenge_detected: Boolean(warmup.challenge_detected),
    challenge_html: sanitize(warmup.challenge_html || ""),
    body_sample: sanitize(warmup.body_sample || ""),
    response: warmup.response
  };
}

function buildAccessRow(lockedTarget, seed, firstCycle) {
  const seedSummary = { ...seed };
  if (typeof seedSummary.challenge_html === "string" && seedSummary.challenge_html.length > 0) {
    seedSummary.challenge_html_present = true;
    seedSummary.challenge_html_bytes = Buffer.byteLength(seedSummary.challenge_html);
    seedSummary.challenge_html = screenshotRelative(path.join(reportDir, "challenge.html"));
  }
  return {
    id: lockedTarget.id,
    label: lockedTarget.label,
    url: lockedTarget.url,
    host: hostName(lockedTarget.url),
    seed_request_count: 1,
    seed_http_status: seed?.response?.status ?? null,
    seed_challenge: Boolean(seed?.challenge_detected),
    seed_headers: seed?.response?.headers_object || {},
    seed: seedSummary,
    http_status: firstCycle?.home?.response?.status ?? null,
    challenge: Boolean(seed?.challenge_detected || firstCycle?.home?.challenge_detected || firstCycle?.new_map?.challenge_detected),
    app_code_reached: Boolean(firstCycle?.home?.app_code_reached && firstCycle?.new_map?.app_code_reached),
    screenshot: firstCycle?.home?.screenshot || "",
    title: firstCycle?.home?.title || "",
    body_sample: firstCycle?.home?.body_sample || ""
  };
}

async function waitForMapIdle(page, timeoutMs = 8000) {
  return await page.evaluate(
    ({ timeout }) => new Promise((resolve) => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) {
        resolve({ ok: false, reason: "NO_MAP_DEBUG_HANDLE" });
        return;
      }
      const startedAt = Date.now();
      let settled = false;
      const finish = (ok, reason) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve({
          ok,
          reason,
          elapsed_ms: Date.now() - startedAt,
          tiles_loaded: typeof map.areTilesLoaded === "function" ? map.areTilesLoaded() : null
        });
      };
      const timeoutId = window.setTimeout(() => finish(false, "MAP_IDLE_TIMEOUT"), timeout);
      if (typeof map.areTilesLoaded === "function" && map.areTilesLoaded()) {
        finish(true, "TILES_ALREADY_LOADED");
        return;
      }
      map.once("idle", () => finish(true, "IDLE"));
    }),
    { timeout: timeoutMs }
  ).catch((error) => ({
    ok: false,
    reason: sanitize(error?.message || error || "MAP_IDLE_ERROR"),
    elapsed_ms: null,
    tiles_loaded: null
  }));
}

async function readLabelMetrics(page) {
  return await page.evaluate(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    if (!map) {
      return {
        COUNTRY_LABEL_MS: null,
        CITY_LABEL_MS: null,
        VILLAGE_LABEL_MS: null,
        LANDSCAPE_LABEL_MS: null,
        label_counts: {},
        label_layers: []
      };
    }
    const layers = map.getStyle()?.layers || [];
    const labelLayers = layers
      .filter((layer) => /symbol/i.test(layer.type || "") || /label|place|settlement|poi/i.test(layer.id || ""))
      .map((layer) => layer.id);
    const countFor = (matcher) => {
      let count = 0;
      for (const layerId of labelLayers.filter(matcher)) {
        if (!map.getLayer(layerId)) continue;
        try {
          count += (map.queryRenderedFeatures({ layers: [layerId] }) || []).length;
        } catch {
          // Ignore style-layer query failures.
        }
      }
      return count;
    };
    const countryLabels = countFor((layerId) => /country|territory/i.test(layerId));
    const cityLabels = countFor((layerId) => /city|place|settlement/i.test(layerId));
    const villageLabels = countFor((layerId) => /village|hamlet|town/i.test(layerId));
    const landscapeLabels = countFor((layerId) => /natural|landscape|mountain|water|park|poi/i.test(layerId));
    return {
      COUNTRY_LABEL_MS: countryLabels > 0 ? 0 : null,
      CITY_LABEL_MS: cityLabels > 0 ? 0 : null,
      VILLAGE_LABEL_MS: villageLabels > 0 ? 0 : null,
      LANDSCAPE_LABEL_MS: landscapeLabels > 0 ? 0 : null,
      label_counts: {
        countries: countryLabels,
        cities: cityLabels,
        villages: villageLabels,
        landscape: landscapeLabels
      },
      label_layers: labelLayers.slice(0, 40)
    };
  }).catch((error) => ({
    COUNTRY_LABEL_MS: null,
    CITY_LABEL_MS: null,
    VILLAGE_LABEL_MS: null,
    LANDSCAPE_LABEL_MS: null,
    label_counts: {},
    label_layers: [],
    error: sanitize(error?.message || error || "LABEL_METRICS_ERROR")
  }));
}

async function runMapStabilityProbe(page, cycleDir) {
  const probeDir = path.join(cycleDir, "map-stability");
  await ensureDir(probeDir);
  const rows = [];
  for (const region of mapStabilityRegions) {
    const regionStartedAt = Date.now();
    await page.evaluate(
      ({ center, zoom }) => {
        const map = window.__NEW_MAP_DEBUG__?.map;
        if (!map) throw new Error("NO_MAP_DEBUG_HANDLE");
        map.jumpTo({ center, zoom, pitch: 0, bearing: 0 });
      },
      { center: region.center, zoom: region.zoom }
    ).catch(() => undefined);
    const firstTile = await waitForMapIdle(page, 10000);
    const beforePath = path.join(probeDir, `${region.id}-before.png`);
    await page.screenshot({ path: beforePath, fullPage: false }).catch(() => undefined);
    for (let index = 0; index < 5; index += 1) {
      await page.evaluate(() => {
        const map = window.__NEW_MAP_DEBUG__?.map;
        if (!map) throw new Error("NO_MAP_DEBUG_HANDLE");
        map.zoomIn({ duration: 0 });
      }).catch(() => undefined);
      await waitForMapIdle(page, 6000);
    }
    const afterZoomInPath = path.join(probeDir, `${region.id}-after-zoom-in.png`);
    await page.screenshot({ path: afterZoomInPath, fullPage: false }).catch(() => undefined);
    for (let index = 0; index < 5; index += 1) {
      await page.evaluate(() => {
        const map = window.__NEW_MAP_DEBUG__?.map;
        if (!map) throw new Error("NO_MAP_DEBUG_HANDLE");
        map.zoomOut({ duration: 0 });
      }).catch(() => undefined);
      await waitForMapIdle(page, 6000);
    }
    const afterZoomOutPath = path.join(probeDir, `${region.id}-after-zoom-out.png`);
    await page.screenshot({ path: afterZoomOutPath, fullPage: false }).catch(() => undefined);
    const labels = await readLabelMetrics(page);
    const fullRenderMs = Date.now() - regionStartedAt;
    rows.push({
      region: region.id,
      label: region.label,
      SCREENSHOT_BEFORE: screenshotRelative(beforePath),
      SCREENSHOT_AFTER: screenshotRelative(afterZoomOutPath),
      SCREENSHOT_AFTER_ZOOM_IN: screenshotRelative(afterZoomInPath),
      FIRST_TILE_MS: firstTile.elapsed_ms,
      FULL_RENDER_MS: fullRenderMs,
      LABEL_READY_MS: labels.COUNTRY_LABEL_MS !== null || labels.CITY_LABEL_MS !== null ? 0 : null,
      ...labels,
      RESULT: firstTile.ok ? "PASS" : "FAIL",
      issue: firstTile.ok ? "" : firstTile.reason
    });
  }
  const payload = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    pass: rows.every((row) => row.RESULT === "PASS"),
    rows
  };
  await writeJson(path.join(probeDir, "map-stability.json"), payload);
  return payload;
}

async function runGeolocationProbe(page, cycleDir) {
  const probeDir = path.join(cycleDir, "geolocation");
  await ensureDir(probeDir);
  const startedAt = Date.now();
  const screenshotPath = path.join(probeDir, "geolocation.png");
  let clickStatus = "PASS";
  let error = "";
  const geoResponsePromise = page.waitForResponse(
    (response) => {
      try {
        return new URL(response.url()).pathname === "/api/geo/resolve";
      } catch {
        return false;
      }
    },
    { timeout: 45000 }
  ).then((response) => responseEvidence(response)).catch(() => null);
  await page.locator('button[aria-label^="GPS"]').first().click({ timeout: 10000 }).catch((caught) => {
    clickStatus = "FAIL";
    error = sanitize(caught?.message || caught || "GPS_BUTTON_CLICK_FAILED");
  });
  const geoStateHandle = await page.waitForFunction(
    () => {
      const raw = window.localStorage.getItem("geo");
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.source === "gps") return parsed;
      } catch {
        return null;
      }
      return null;
    },
    null,
    { timeout: 35000 }
  ).catch(() => null);
  const geoResponse = await geoResponsePromise;
  const geoState = geoStateHandle ? await geoStateHandle.jsonValue().catch(() => null) : null;
  const hintText = await page.locator('[data-testid="new-map-ai-geo-hint"]').first().innerText({ timeout: 5000 }).catch(() => "");
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
  const countryMatch = String(geoState?.iso2 || "").toUpperCase();
  const challengeDetected = responseInfoIsChallenge(geoResponse);
  const payload = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    GEOLOCATION_MS: Date.now() - startedAt,
    EXPECTED_COUNTRY: geolocationProbe.expected_iso,
    COUNTRY_MATCH: countryMatch,
    label: geolocationProbe.label,
    coordinates: {
      latitude: geolocationProbe.latitude,
      longitude: geolocationProbe.longitude
    },
    geo_state: geoState || null,
    hint_text: sanitize(hintText),
    SCREENSHOT: screenshotRelative(screenshotPath),
    response: geoResponse,
    challenge_detected: challengeDetected,
    RESULT: clickStatus === "PASS" && !challengeDetected && countryMatch === geolocationProbe.expected_iso ? "PASS" : "FAIL",
    error: error || (challengeDetected ? "GEOLOCATION_CHALLENGE" : (countryMatch === geolocationProbe.expected_iso ? "" : "COUNTRY_MATCH_FAILED"))
  };
  await writeJson(path.join(probeDir, "geolocation.json"), payload);
  return payload;
}

async function auditSeoPages(page, targetUrl, cardIndex, territoryRows, cycleDir) {
  const seoDir = path.join(cycleDir, "seo-flow");
  await ensureDir(seoDir);
  const selected = selectCampaignGeos(cardIndex, territoryRows, 4);
  const rows = [];
  let challengeDetected = false;
  for (const geo of selected) {
    const entry = cardIndex[geo] || {};
    const pageHref = String(entry.pageHref || "");
    const seoUrl = joinUrl(targetUrl, pageHref);
    const startedAt = Date.now();
    const screenshotPath = path.join(seoDir, `${geo.toLowerCase()}.png`);
    let responseInfo = null;
    let title = "";
    let description = "";
    let body = "";
    let routeError = "";
    try {
      const response = await page.goto(seoUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      responseInfo = await responseEvidence(response);
      await page.waitForSelector("h1", { timeout: 15000 }).catch(() => undefined);
      title = await page.title().catch(() => "");
      description = await page.locator('meta[name="description"]').first().getAttribute("content").catch(() => "");
      body = await page.locator("body").innerText({ timeout: 8000 }).catch(() => "");
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
    } catch (caught) {
      routeError = sanitize(caught?.message || caught || "SEO_PAGE_ERROR");
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
    }
    const name = String(entry.displayName || geo);
    const issues = [];
    if (!responseInfo || Number(responseInfo.status || 0) >= 400) issues.push("SEO_HTTP_NOT_OK");
    if (!title) issues.push("TITLE_MISSING");
    if (!description) issues.push("DESCRIPTION_MISSING");
    if (!body.includes(name.split(" / ")[0])) issues.push("COUNTRY_NAME_MISSING");
    if (!/Status|law|Legal|Cannabis|Why/i.test(body)) issues.push("STATUS_OR_KNOWLEDGE_LAYER_MISSING");
    if (routeError) issues.push(routeError);
    const rowChallenge = responseInfoIsChallenge(responseInfo);
    if (rowChallenge) issues.push("SEO_CHALLENGE");
    rows.push({
      geo,
      url: sanitize(seoUrl),
      SEO_PAGE_OPEN: issues.includes("SEO_HTTP_NOT_OK") ? "NO" : "YES",
      SEO_PAGE_MS: Date.now() - startedAt,
      TITLE: title,
      DESCRIPTION: description,
      STATUS: /Status|law|Legal/i.test(body) ? "PRESENT" : "MISSING",
      KNOWLEDGE_LAYER: /Why|Facts|sources|summary|Cannabis/i.test(body) ? "PRESENT" : "MISSING",
      COUNTRY_NAME: body.includes(name.split(" / ")[0]) ? "PRESENT" : "MISSING",
      SCREENSHOT: screenshotRelative(screenshotPath),
      response: responseInfo,
      challenge_detected: rowChallenge,
      issues,
      RESULT: issues.length === 0 ? "PASS" : "FAIL"
    });
    if (rowChallenge) {
      challengeDetected = true;
      break;
    }
  }
  const payload = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    selected_geos: selected,
    challenge_detected: challengeDetected,
    pass: rows.length >= 4 && rows.every((row) => row.RESULT === "PASS"),
    rows
  };
  await writeJson(path.join(seoDir, "seo-flow.json"), payload);
  return payload;
}

async function buildScreenshotAnalysis(artifacts, representativeCycle, territoryRows) {
  const rows = [];
  const add = async ({ id, relativePath, expected, actual, pass }) => {
    if (!relativePath) return;
    const png = await pngInfo(relativePath);
    const issues = [];
    if (!png.exists) issues.push("SCREENSHOT_MISSING");
    if (!png.png) issues.push("SCREENSHOT_NOT_PNG");
    if (png.bytes < screenshotMinimumBytes) issues.push("SCREENSHOT_TOO_SMALL");
    if (!pass) issues.push("RUNTIME_EXPECTATION_FAILED");
    rows.push({
      SCREENSHOT_ID: id,
      PATH: relativePath,
      EXPECTED: expected,
      ACTUAL: {
        ...actual,
        png
      },
      ISSUES_FOUND: issues,
      RESULT: issues.length === 0 ? "PASS" : "FAIL"
    });
  };

  await add({
    id: "homepage.png",
    relativePath: artifacts.homepage,
    expected: ["homepage route loads", "Vercel challenge absent", "app shell reached"],
    actual: {
      app_code_reached: Boolean(representativeCycle?.home?.app_code_reached),
      challenge_detected: Boolean(representativeCycle?.home?.challenge_detected),
      title: representativeCycle?.home?.title || ""
    },
    pass: Boolean(representativeCycle?.home?.app_code_reached && !representativeCycle?.home?.challenge_detected)
  });
  await add({
    id: "new-map.png",
    relativePath: artifacts.new_map,
    expected: ["new-map route loads", "map ready", "canvas visible"],
    actual: {
      app_code_reached: Boolean(representativeCycle?.new_map?.app_code_reached),
      map_ready: Boolean(representativeCycle?.new_map?.map_ready),
      has_canvas: Boolean(representativeCycle?.new_map?.has_canvas)
    },
    pass: Boolean(representativeCycle?.new_map?.app_code_reached && representativeCycle?.new_map?.map_ready)
  });
  await add({
    id: "kosovo-popup.png",
    relativePath: artifacts.kosovo_popup,
    expected: ["Kosovo click received", "Kosovo popup visible"],
    actual: {
      status: representativeCycle?.kosovo?.status || "",
      popup_visible: Boolean(representativeCycle?.kosovo?.popup_visible),
      selected_iso: representativeCycle?.kosovo?.selected_iso || ""
    },
    pass: representativeCycle?.kosovo?.status === "PASS"
  });
  await add({
    id: "french-guiana-popup.png",
    relativePath: artifacts.french_guiana_popup,
    expected: ["French Guiana click received", "French Guiana popup visible"],
    actual: {
      status: representativeCycle?.french_guiana?.status || "",
      popup_visible: Boolean(representativeCycle?.french_guiana?.popup_visible),
      selected_iso: representativeCycle?.french_guiana?.selected_iso || ""
    },
    pass: representativeCycle?.french_guiana?.status === "PASS"
  });
  for (const row of territoryRows || []) {
    await add({
      id: `${row.geo}-country.png`,
      relativePath: row.screenshots?.country || "",
      expected: [`${row.geo} country click screenshot saved`],
      actual: {
        status: row.status,
        click_received: Boolean(row.click_received),
        selected_iso: row.selected_iso || ""
      },
      pass: row.status === "PASS" && Boolean(row.click_received)
    });
    await add({
      id: `${row.geo}-popup.png`,
      relativePath: row.screenshots?.popup || "",
      expected: [`${row.geo} popup visible`, `${row.geo} popup screenshot saved`],
      actual: {
        status: row.status,
        popup_visible: Boolean(row.popup_visible),
        popup_matches_geo: Boolean(row.popup_matches_geo)
      },
      pass: row.status === "PASS" && Boolean(row.popup_visible)
    });
  }
  return {
    generated_at: new Date().toISOString(),
    run_id: runId,
    pass: rows.length > 0 && rows.every((row) => row.RESULT === "PASS"),
    rows
  };
}

async function runFullUiCycle(page, targetUrl, cycleIndex) {
  const cycleId = `run-${String(cycleIndex).padStart(2, "0")}`;
  const cycleDir = path.join(reportDir, "runs", cycleId);
  await ensureDir(cycleDir);
  const home = await captureRoute(page, targetUrl, path.join(cycleDir, "homepage.png"), {
    requireMapReady: false,
    routeId: "homepage"
  });
  if (home.challenge_detected) {
    return {
      cycle_id: cycleId,
      pass: false,
      challenge_detected: true,
      stop_on_challenge: true,
      home,
      new_map: null,
      kosovo: null,
      french_guiana: null,
      territory_matrix_pass: false,
      territory_matrix: [],
      reason: "HOMEPAGE_CHALLENGE"
    };
  }
  if (!home.app_code_reached) {
    return {
      cycle_id: cycleId,
      pass: false,
      challenge_detected: false,
      stop_on_challenge: false,
      home,
      new_map: null,
      kosovo: null,
      french_guiana: null,
      territory_matrix_pass: false,
      territory_matrix: [],
      reason: "HOME_APP_CODE_NOT_REACHED"
    };
  }

  const newMapUrl = joinUrl(targetUrl, "/new-map?qa=1");
  const newMap = await captureRoute(page, newMapUrl, path.join(cycleDir, "new-map.png"), {
    requireMapReady: true,
    routeId: "new-map"
  });
  if (newMap.challenge_detected) {
    return {
      cycle_id: cycleId,
      pass: false,
      challenge_detected: true,
      stop_on_challenge: true,
      home,
      new_map: newMap,
      kosovo: null,
      french_guiana: null,
      territory_matrix_pass: false,
      territory_matrix: [],
      reason: "NEW_MAP_CHALLENGE"
    };
  }
  if (!newMap.app_code_reached) {
    return {
      cycle_id: cycleId,
      pass: false,
      challenge_detected: false,
      stop_on_challenge: false,
      home,
      new_map: newMap,
      kosovo: null,
      french_guiana: null,
      territory_matrix_pass: false,
      territory_matrix: [],
      reason: "NEW_MAP_APP_CODE_NOT_REACHED"
    };
  }

  const mapControlReady = await waitForMapControl(page, 30000).then(() => true).catch(() => false);
  if (!mapControlReady) {
    return {
      cycle_id: cycleId,
      pass: false,
      challenge_detected: false,
      stop_on_challenge: false,
      home,
      new_map: newMap,
      kosovo: null,
      french_guiana: null,
      territory_matrix_pass: false,
      territory_matrix: [],
      reason: "MAP_CONTROL_UNAVAILABLE"
    };
  }

  const cardIndex = await readRuntimeCardIndex(page).catch(() => null);
  if (!cardIndex) {
    return {
      cycle_id: cycleId,
      pass: false,
      challenge_detected: false,
      stop_on_challenge: false,
      home,
      new_map: newMap,
      kosovo: null,
      french_guiana: null,
      territory_matrix_pass: false,
      territory_matrix: [],
      reason: "CARD_INDEX_UNAVAILABLE"
    };
  }
  const recoveryState = { attempted: false };
  const territoryRows = [];
  for (const geo of priorityPopupGeos) {
    territoryRows.push(await auditGeo(page, geo, cardIndex[geo], cycleDir, {
      recoveryState
    }));
  }
  const deepTraceControls = [];
  for (const geo of popupTraceControlGeos) {
    deepTraceControls.push(await auditGeo(page, geo, cardIndex[geo], cycleDir, {
      groupDir: "popup-trace-control",
      role: "deep_trace_control",
      recoveryState
    }));
  }
  for (const geo of territoryMatrix.filter((candidate) => !priorityPopupGeos.includes(candidate))) {
    territoryRows.push(await auditGeo(page, geo, cardIndex[geo], cycleDir, {
      recoveryState
    }));
  }
  const kosovo = territoryRows.find((row) => row.geo === "XK") || null;
  const frenchGuiana = territoryRows.find((row) => row.geo === "GF") || null;
  const territoryPass = territoryRows.every((row) => row.status === "PASS");
  const mapStability = territoryPass
    ? await runMapStabilityProbe(page, cycleDir).catch((error) => ({
        generated_at: new Date().toISOString(),
        run_id: runId,
        pass: false,
        error: sanitize(error?.message || error || "MAP_STABILITY_ERROR"),
        rows: []
      }))
    : null;
  const seoFlow = territoryPass
    ? await auditSeoPages(page, targetUrl, cardIndex, territoryRows, cycleDir).catch((error) => ({
        generated_at: new Date().toISOString(),
        run_id: runId,
        selected_geos: [],
        challenge_detected: false,
        pass: false,
        error: sanitize(error?.message || error || "SEO_FLOW_ERROR"),
        rows: []
      }))
    : null;
  const geolocation = territoryPass && !seoFlow?.challenge_detected
    ? await runGeolocationProbe(page, cycleDir).catch((error) => ({
        generated_at: new Date().toISOString(),
        run_id: runId,
        RESULT: "FAIL",
        challenge_detected: false,
        error: sanitize(error?.message || error || "GEOLOCATION_ERROR")
      }))
    : null;
  const v2ChallengeDetected = Boolean(geolocation?.challenge_detected || seoFlow?.challenge_detected);
  return {
    cycle_id: cycleId,
    pass:
      home.app_code_reached &&
      newMap.app_code_reached &&
      kosovo?.status === "PASS" &&
      frenchGuiana?.status === "PASS" &&
      territoryPass,
    challenge_detected: v2ChallengeDetected,
    stop_on_challenge: v2ChallengeDetected,
    home,
    new_map: newMap,
    kosovo,
    french_guiana: frenchGuiana,
    deep_trace_controls: deepTraceControls,
    popup_trace_rows: collectPopupTraceRows({ deep_trace_controls: deepTraceControls, territory_matrix: territoryRows }),
    popup_trace_comparison: buildPopupTraceComparison(
      collectPopupTraceRows({ deep_trace_controls: deepTraceControls, territory_matrix: territoryRows })
    ),
    popup_trace_pass: territoryRows.every((row) => popupTraceIsComplete(row.popup_trace)),
    territory_matrix_pass: territoryPass,
    territory_matrix: territoryRows,
    map_stability: mapStability,
    map_stability_pass: Boolean(mapStability?.pass),
    geolocation,
    geolocation_pass: geolocation?.RESULT === "PASS",
    seo_flow: seoFlow,
    seo_flow_pass: Boolean(seoFlow?.pass),
    reason: geolocation?.challenge_detected
      ? "GEOLOCATION_CHALLENGE"
      : seoFlow?.challenge_detected
        ? "SEO_CHALLENGE"
        : territoryPass
          ? "OK"
          : "TERRITORY_MATRIX_FAIL"
  };
}

async function writeSeedArtifacts(seed) {
  const seedArtifact = { ...seed };
  delete seedArtifact.challenge_html;
  if (seed.challenge_detected) {
    const challengePath = path.join(reportDir, "challenge.html");
    await fs.writeFile(challengePath, seed.challenge_html || "", "utf8");
    seedArtifact.challenge_html = screenshotRelative(challengePath);
  }
  await writeJson(path.join(reportDir, "seed-response.json"), seedArtifact);
  await writeJson(path.join(reportDir, "cookies-before.json"), seed.cookies_before_serialized || []);
  await writeJson(path.join(reportDir, "cookies-after.json"), seed.cookies_after_serialized || []);
  return {
    challenge_html: seedArtifact.challenge_html || ""
  };
}

async function readHeaderOnlyBaseline() {
  const fullPath = path.isAbsolute(headerOnlyBaselinePath)
    ? headerOnlyBaselinePath
    : path.join(repoRoot, headerOnlyBaselinePath);
  const summary = await readJson(fullPath);
  if (!summary) {
    return {
      path: path.isAbsolute(headerOnlyBaselinePath)
        ? headerOnlyBaselinePath
        : headerOnlyBaselinePath,
      found: false,
      run_count: 0,
      challenge_count: 0,
      challenge_rate: null,
      access_mode: "UNCONFIRMED"
    };
  }
  const runCount = Number(summary.run_count || summary.OPERATION_COUNT || 0) || 0;
  const challengeCount = Number(summary.challenge_count || summary.CHALLENGE_COUNT || 0) || 0;
  return {
    path: path.isAbsolute(headerOnlyBaselinePath)
      ? headerOnlyBaselinePath
      : headerOnlyBaselinePath,
    found: true,
    run_count: runCount,
    challenge_count: challengeCount,
    challenge_rate: runCount > 0 ? Number((challengeCount / runCount).toFixed(4)) : null,
    access_mode: String(summary.access_mode || summary.header_mode || "header_navigation"),
    batch_id: String(summary.batch_id || summary.run_id || "")
  };
}

function consecutivePrefixPasses(cycles) {
  let count = 0;
  for (const cycle of cycles) {
    if (!cycle?.pass) break;
    count += 1;
  }
  return count;
}

function renderReport(summary) {
  const accessRows = summary.access_matrix.map((row) => [
    row.label,
    row.host,
    row.seed_http_status ?? "ERR",
    row.seed_challenge ? "YES" : "NO",
    row.app_code_reached ? "YES" : "NO",
    row.screenshot || "-"
  ]);
  const cycleRows = summary.cycles.map((cycle) => [
    cycle.cycle_id,
    cycle.pass ? "PASS" : cycle.challenge_detected ? "CHALLENGE_STOP" : "FAIL",
    cycle.home?.app_code_reached ? "YES" : "NO",
    cycle.new_map?.app_code_reached ? "YES" : "NO",
    cycle.kosovo?.status || "-",
    cycle.french_guiana?.status || "-",
    cycle.territory_matrix_pass ? "YES" : "NO",
    cycle.reason || "-"
  ]);
  return [
    "# Production Browser Recovery",
    "",
    `Generated: ${summary.generated_at}`,
    `Run: ${summary.run_id}`,
    `STATUS=${summary.status}`,
    `STOP_REASON=${summary.stop_reason || "NONE"}`,
    `JS_REPL_STATUS=${summary.JS_REPL_STATUS}`,
    `APP_CODE_REACHED=${summary.APP_CODE_REACHED}`,
    `LOCKED_TARGET=${summary.locked_target || "NONE"}`,
    `LOCKED_HOST=${summary.locked_host || "NONE"}`,
    `HOST_LOCK=${summary.host_lock ? "YES" : "NO"}`,
    `SEED_REQUEST_COUNT=${summary.seed_request_count}`,
    `TRANSPORT_MODE=${summary.transport_mode}`,
    "",
    "## Access Matrix",
    "",
    "| TARGET | HOST | SEED_STATUS | SEED_CHALLENGE | APP_CODE_REACHED | SCREENSHOT |",
    "| --- | --- | --- | --- | --- | --- |",
    ...accessRows.map((row) => `| ${row.join(" | ")} |`),
    "",
    "## Full UI Cycles",
    "",
    "| CYCLE | STATUS | HOME | MAP | XK | GF | TERRITORY_MATRIX | REASON |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...cycleRows.map((row) => `| ${row.join(" | ")} |`),
    "",
    "## Seed",
    "",
    `seed_target=${summary.seed_target || "NONE"}`,
    `seed_mode=${summary.seed_mode || "NONE"}`,
    `seed_redirect_policy=${summary.seed_redirect_policy || "NONE"}`,
    `bypass_cookie_names=${(summary.seed_bypass_cookies || []).join(",") || "-"}`,
    `seed_response_status=${summary.seed_response_status ?? "ERR"}`,
    `seed_response_mitigated=${summary.seed_response_mitigated || "-"}`,
    "",
    "## Challenge Rate Compare",
    "",
    `header_only_baseline_path=${summary.header_only_baseline.path}`,
    `header_only_baseline_found=${summary.header_only_baseline.found ? "YES" : "NO"}`,
    `header_only_baseline_challenge_rate=${summary.header_only_baseline.challenge_rate ?? "UNCONFIRMED"}`,
    `full_bypass_session_challenge_rate=${summary.full_bypass_session_challenge_rate ?? "UNCONFIRMED"}`,
    `challenge_rate_substantially_lower=${summary.challenge_rate_substantially_lower ? "YES" : "NO"}`,
    "",
    "## DONE WHEN Checklist",
    "",
    `- [${summary.APP_CODE_REACHED === "YES" ? "x" : " "}] APP_CODE_REACHED=YES`,
    `- [${summary.seed_cookie_confirmed || summary.seed_cookie_absence_documented ? "x" : " "}] bypass cookie confirmed or absence documented`,
    `- [${summary.artifacts.homepage ? "x" : " "}] homepage screenshot exists`,
    `- [${summary.artifacts.new_map ? "x" : " "}] new-map screenshot exists`,
    `- [${summary.artifacts.kosovo_popup ? "x" : " "}] Kosovo popup screenshot exists`,
    `- [${summary.artifacts.french_guiana_popup ? "x" : " "}] French Guiana popup screenshot exists`,
    `- [${summary.artifacts.popup_trace && summary.popup_trace_pass ? "x" : " "}] popup-trace.json shows full successful popup path`,
    `- [${summary.territory_matrix_pass ? "x" : " "}] territory matrix PASS`,
    `- [${summary.consecutive_full_ui_successes >= 3 ? "x" : " "}] 3 consecutive successful full-UI production runs`,
    `- [${summary.host_lock ? "x" : " "}] one locked production host`,
    `- [${summary.seed_request_count === 1 ? "x" : " "}] exactly one seed request`,
    `- [${summary.one_browser_context_page ? "x" : " "}] one browser/context/page session`,
    `- [${summary.report_updated ? "x" : " "}] REPORT UPDATED`
  ].join("\n");
}

async function updateRecoveryReport(summary) {
  const reportPath = path.join(repoRoot, "Reports", "ProdAudit", "production-browser-recovery.md");
  const content = renderReport(summary);
  await fs.writeFile(reportPath, `${content}\n`, "utf8");
  return reportPath;
}

function yesNo(value) {
  return value ? "YES" : "NO";
}

function renderRepeatabilityReport(summary) {
  return [
    "# Production Screenshot Repeatability",
    "",
    `RUN_ID=${summary.run_id}`,
    `BROWSER=${summary.browser || "NONE"}`,
    `HOST=${summary.locked_host || "NONE"}`,
    `SEED_STATUS=${summary.seed_response_status ?? "ERR"}`,
    `CHALLENGE=${summary.stop_reason === "SEED_CHALLENGE" || summary.seed_response_mitigated === "challenge" ? "YES" : "NO"}`,
    `APP_CODE_REACHED=${summary.APP_CODE_REACHED}`,
    `HOMEPAGE_SCREENSHOT=${yesNo(summary.artifacts?.homepage)}`,
    `MAP_SCREENSHOT=${yesNo(summary.artifacts?.new_map)}`,
    `KOSOVO_POPUP=${yesNo(summary.artifacts?.kosovo_popup)}`,
    `FRENCH_GUIANA_POPUP=${yesNo(summary.artifacts?.french_guiana_popup)}`,
    `POPUP_TRACE=${summary.popup_trace_pass ? "PASS" : "FAIL"}`,
    `TERRITORY_MATRIX=${summary.territory_matrix_pass ? "PASS" : "FAIL"}`,
    `SCREENSHOT_ANALYSIS=${summary.screenshot_analysis_pass ? "PASS" : "FAIL"}`,
    `MAP_STABILITY=${summary.map_stability_pass ? "PASS" : "FAIL"}`,
    `GEOLOCATION=${summary.geolocation_pass ? "PASS" : "FAIL"}`,
    `SEO_FLOW=${summary.seo_flow_pass ? "PASS" : "FAIL"}`,
    `RESULT=${summary.status}`,
    ""
  ].join("\n");
}

async function updateRepeatabilityReport(summary) {
  const reportPath = path.join(repoRoot, "Reports", "ProdAudit", "repeatability.md");
  await fs.writeFile(reportPath, renderRepeatabilityReport(summary), "utf8");
  return reportPath;
}

function replacementPassed(summary) {
  return (
    summary.APP_CODE_REACHED === "YES" &&
    summary.seed_request_count === 1 &&
    summary.host_lock === true &&
    summary.one_browser_context_page === true &&
    Boolean(summary.artifacts?.homepage) &&
    Boolean(summary.artifacts?.new_map) &&
    Boolean(summary.artifacts?.kosovo_popup) &&
    Boolean(summary.artifacts?.french_guiana_popup) &&
    Boolean(summary.artifacts?.popup_trace) &&
    summary.popup_trace_pass === true &&
    summary.territory_matrix_pass === true &&
    Number(summary.consecutive_full_ui_successes || 0) >= 3 &&
    summary.browser_transport?.js_repl_executed === false
  );
}

function renderReplacementReport(summary) {
  const passed = replacementPassed(summary);
  return [
    "# Playwright Interactive Replacement",
    "",
    `Generated: ${summary.generated_at}`,
    `RUN_ID=${summary.run_id}`,
    `RESULT=${summary.status}`,
    `PLAYWRIGHT_INTERACTIVE_REPLACED=${passed ? "YES" : "NO"}`,
    "",
    "## OLD STACK",
    "",
    "Playwright-Interactive",
    "",
    `JS_REPL_STATUS=${summary.JS_REPL_STATUS || "UNCONFIRMED"}`,
    "PRODUCTION_QA_DEPENDENCY=NO",
    "NOTES=Historical interactive stack used persistent browser handles through js_repl. Current production QA must not depend on js_repl.",
    "",
    "## NEW STACK",
    "",
    "prod_access_recovery",
    "",
    `BROWSER_EXECUTION_PATH=${summary.browser_execution_path || "UNCONFIRMED"}`,
    `TRANSPORT_MODE=${summary.transport_mode || "UNCONFIRMED"}`,
    `JS_REPL_EXECUTED=${summary.browser_transport?.js_repl_executed ? "YES" : "NO"}`,
    `LOCKED_HOST=${summary.locked_host || "NONE"}`,
    `SEED_REQUEST_COUNT=${summary.seed_request_count}`,
    `ONE_BROWSER_CONTEXT_PAGE=${summary.one_browser_context_page ? "YES" : "NO"}`,
    "",
    "## Comparison",
    "",
    "| CAPABILITY | OLD STACK | NEW STACK |",
    "| --- | --- | --- |",
    `| browser reuse | persistent interactive handles | ${summary.BROWSER_REUSE_EFFECT || "UNCONFIRMED"} |`,
    `| context reuse | persistent interactive context | ${summary.CONTEXT_REUSE_EFFECT || "UNCONFIRMED"} |`,
    `| session reuse | persistent js_repl session | ${summary.SESSION_REUSE_EFFECT || "UNCONFIRMED"} |`,
    `| screenshots | manual/interactive capture | homepage=${yesNo(summary.artifacts?.homepage)} new-map=${yesNo(summary.artifacts?.new_map)} Kosovo=${yesNo(summary.artifacts?.kosovo_popup)} FrenchGuiana=${yesNo(summary.artifacts?.french_guiana_popup)} |`,
    `| popup audits | interactive-only fallback | XK=${summary.cycles?.[0]?.kosovo?.status || "UNCONFIRMED"} GF=${summary.cycles?.[0]?.french_guiana?.status || "UNCONFIRMED"} |`,
    `| territory audits | interactive exploration | ${summary.territory_matrix_pass ? "PASS" : "FAIL"} |`,
    "",
    "## Evidence",
    "",
    `APP_CODE_REACHED=${summary.APP_CODE_REACHED}`,
    `HOMEPAGE_SCREENSHOT=${yesNo(summary.artifacts?.homepage)}`,
    `NEW_MAP_SCREENSHOT=${yesNo(summary.artifacts?.new_map)}`,
    `KOSOVO_POPUP_SCREENSHOT=${yesNo(summary.artifacts?.kosovo_popup)}`,
    `FRENCH_GUIANA_POPUP_SCREENSHOT=${yesNo(summary.artifacts?.french_guiana_popup)}`,
    `POPUP_TRACE=${summary.popup_trace_pass ? "PASS" : "FAIL"}`,
    `TERRITORY_MATRIX=${summary.territory_matrix_pass ? "PASS" : "FAIL"}`,
    `CONSECUTIVE_FULL_UI_SUCCESSES=${summary.consecutive_full_ui_successes}`,
    "",
    "## Result",
    "",
    `PLAYWRIGHT_INTERACTIVE_REPLACED=${passed ? "YES" : "NO"}`
  ].join("\n");
}

async function updateReplacementReport(summary) {
  const reportPath = path.join(repoRoot, "Reports", "ProdAudit", "playwright-interactive-replacement.md");
  await fs.writeFile(reportPath, `${renderReplacementReport(summary)}\n`, "utf8");
  return reportPath;
}

async function writeSecretMissingSummary() {
  await ensureDir(reportDir);
  const lockedTarget = buildLockedTarget();
  const summary = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    status: "FAIL",
    stop_reason: "VERCEL_SECRET_MISSING",
    hypothesis: attemptHypothesis,
    attempt_budget: attemptBudget,
    locked_target: lockedTarget.url,
    locked_host: hostName(lockedTarget.url),
    host_lock: true,
    seed_request_count: 0,
    one_browser_context_page: false,
    APP_CODE_REACHED: "NO",
    artifacts: {
      homepage: "",
      new_map: "",
      kosovo_popup: "",
      french_guiana_popup: "",
      popup_trace: "",
      challenge_html: ""
    },
    territory_matrix_pass: false,
    popup_trace_pass: false
  };
  await writeJson(path.join(reportDir, "summary.json"), summary);
  await appendChallengeHistory({
    seed_status: null,
    mitigated: "",
    browser: browserName,
    host: hostName(lockedTarget.url),
    app_code_reached: "NO",
    status: summary.status,
    stop_reason: summary.stop_reason,
    seed_request_count: 0
  });
  console.log("VERCEL_SECRET_MISSING");
  console.log(`REPORT_DIR=${screenshotRelative(reportDir)}`);
}

async function writeProdRunForbiddenSummary(reason, readiness) {
  await ensureDir(reportDir);
  const lockedTarget = buildLockedTarget();
  const summary = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    status: "FAIL",
    stop_reason: "PROD_RUN_FORBIDDEN",
    forbidden_reason: reason,
    hypothesis: attemptHypothesis,
    attempt_budget: attemptBudget,
    readiness_gate: {
      path: screenshotRelative(readiness.path),
      ok: Boolean(readiness.validation?.ok),
      reason: readiness.validation?.reason || reason,
      details: readiness.validation?.details || {}
    },
    locked_target: lockedTarget.url,
    locked_host: hostName(lockedTarget.url),
    host_lock: true,
    seed_request_count: 0,
    one_browser_context_page: false,
    APP_CODE_REACHED: "NO",
    artifacts: {
      homepage: "",
      new_map: "",
      kosovo_popup: "",
      french_guiana_popup: "",
      popup_trace: "",
      challenge_html: ""
    },
    territory_matrix_pass: false,
    popup_trace_pass: false
  };
  await writeJson(path.join(reportDir, "summary.json"), summary);
  await writeJson(path.join(reportDir, "headers.json"), {
    generated_at: summary.generated_at,
    run_id: runId,
    locked_target: lockedTarget.url,
    locked_host: hostName(lockedTarget.url),
    host_lock: true,
    attempt_budget: attemptBudget,
    hypothesis: attemptHypothesis,
    seed_request_count: 0,
    prod_run_forbidden: true,
    forbidden_reason: reason,
    readiness_gate: summary.readiness_gate
  });
  await appendChallengeHistory({
    seed_status: null,
    mitigated: "",
    browser: browserName,
    host: hostName(lockedTarget.url),
    app_code_reached: "NO",
    status: summary.status,
    stop_reason: `${summary.stop_reason}:${reason}`,
    seed_request_count: 0
  });
  console.log("PROD_RUN_FORBIDDEN");
  console.log(`FORBIDDEN_REASON=${reason}`);
  console.log(`SEED_REQUEST_COUNT=0`);
  console.log(`REPORT_DIR=${screenshotRelative(reportDir)}`);
}

async function main() {
  if (!secret) {
    await writeSecretMissingSummary();
    process.exitCode = 1;
    return;
  }
  const lockedTarget = buildLockedTarget();
  await ensureDir(reportDir);
  const readiness = await readProdAttemptReadiness();
  if (!readiness.validation.ok) {
    await writeProdRunForbiddenSummary(readiness.validation.reason, readiness);
    process.exitCode = 1;
    return;
  }
  const browserTransport = await resolveBrowserExecutionPath({ repoRoot });
  const slot = await acquireProjectProcessSlot("playwright:prod-access-recovery");
  const { browserType, launchOptions, browserLabel } = browserLaunchConfig();
  const browser = await browserType.launch(launchOptions);
  const networkEvents = [];
  try {
    const extraHeaders = contextExtraHeaders();
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      geolocation: {
        latitude: geolocationProbe.latitude,
        longitude: geolocationProbe.longitude,
        accuracy: 100
      },
      permissions: ["geolocation"],
      ...(Object.keys(extraHeaders).length > 0 ? { extraHTTPHeaders: extraHeaders } : {})
    });
    try {
      const firstPartyHeaderRoute = await installFirstPartyBypassRoute(context, lockedTarget, networkEvents);
      const page = await context.newPage();
      let seedCompletedAt = 0;
      page.on("response", async (response) => {
        const url = response.url();
        if (!isFirstPartyUrl(url, lockedTarget) && !url.startsWith("https://vercel.com/")) return;
        const requestHeaders = response.request().headers();
        const normalizedRequestHeaders = Object.fromEntries(
          Object.entries(requestHeaders).map(([name, value]) => [name.toLowerCase(), value])
        );
        networkEvents.push({
          url: sanitize(url),
          status: response.status(),
          elapsed_since_seed_ms: seedCompletedAt ? Date.now() - seedCompletedAt : null,
          resource_type: response.request().resourceType(),
          request_bypass_header_present: Boolean(normalizedRequestHeaders["x-vercel-protection-bypass"]),
          request_set_bypass_cookie_header_present: Boolean(normalizedRequestHeaders["x-vercel-set-bypass-cookie"]),
          request_vercel_header_names: Object.keys(normalizedRequestHeaders)
            .filter((name) => name.startsWith("x-vercel-"))
            .sort(),
          headers: sanitizeVercelEvidenceHeaders(
            typeof response.headers === "function" ? response.headers() : {},
            secret
          )
        });
      });

      const seed = await seedBypass(context, lockedTarget.url);
      seedCompletedAt = Date.now();
      const seedArtifacts = await writeSeedArtifacts(seed);

      const cycles = [];
      let stopReason = "";
      let status = seed.challenge_detected ? "CHALLENGE_STOP" : "FAIL";
      if (!seed.challenge_detected) {
        for (let cycleIndex = 1; cycleIndex <= fullUiRuns; cycleIndex += 1) {
          const cycle = await runFullUiCycle(page, lockedTarget.url, cycleIndex);
          cycles.push(cycle);
          if (cycle.stop_on_challenge) {
            stopReason = cycle.reason || "CHALLENGE_STOP";
            status = "CHALLENGE_STOP";
            break;
          }
          if (!cycle.pass && stopOnFirstFailure) {
            stopReason = cycle.reason || "CYCLE_FAIL";
            status = "FAIL";
            break;
          }
        }
        if (!stopReason && cycles.length === fullUiRuns && cycles.every((cycle) => cycle.pass)) {
          status = "PASS";
        } else if (!stopReason && cycles.some((cycle) => !cycle.pass)) {
          status = "FAIL";
          stopReason = cycles.find((cycle) => !cycle.pass)?.reason || "CYCLE_FAIL";
        }
      } else {
        stopReason = "SEED_CHALLENGE";
      }

      const firstCycle = cycles[0] || null;
      const accessMatrix = [buildAccessRow(lockedTarget, seed, firstCycle)];
      const representativeCycle = cycles.find((cycle) => cycle.pass) || firstCycle;
      const topLevelTerritoryMatrix = representativeCycle?.territory_matrix || [];
      const topLevelPopupTraceRows = representativeCycle?.popup_trace_rows || collectPopupTraceRows(representativeCycle);
      const popupTraceComparison = representativeCycle?.popup_trace_comparison || buildPopupTraceComparison(topLevelPopupTraceRows);
      const popupTracePass =
        topLevelTerritoryMatrix.length === territoryMatrix.length &&
        topLevelTerritoryMatrix.every((row) => popupTraceIsComplete(row.popup_trace));
      const artifacts = {
        homepage: "",
        new_map: "",
        kosovo_popup: "",
        french_guiana_popup: "",
        popup_trace: "",
        screenshot_analysis: "",
        map_stability: "",
        geolocation: "",
        seo_flow: "",
        challenge_html: seedArtifacts.challenge_html || ""
      };

      if (representativeCycle?.home?.screenshot) {
        await copyIfPresent(path.join(repoRoot, representativeCycle.home.screenshot), path.join(reportDir, "homepage.png"));
        artifacts.homepage = screenshotRelative(path.join(reportDir, "homepage.png"));
      }
      if (representativeCycle?.new_map?.screenshot) {
        await copyIfPresent(path.join(repoRoot, representativeCycle.new_map.screenshot), path.join(reportDir, "new-map.png"));
        artifacts.new_map = screenshotRelative(path.join(reportDir, "new-map.png"));
      }
      const kosovoShot = representativeCycle?.kosovo?.screenshots?.popup;
      if (kosovoShot) {
        await copyIfPresent(path.join(repoRoot, kosovoShot), path.join(reportDir, "kosovo-popup.png"));
        artifacts.kosovo_popup = screenshotRelative(path.join(reportDir, "kosovo-popup.png"));
      }
      const frenchShot = representativeCycle?.french_guiana?.screenshots?.popup;
      if (frenchShot) {
        await copyIfPresent(path.join(repoRoot, frenchShot), path.join(reportDir, "french-guiana-popup.png"));
        artifacts.french_guiana_popup = screenshotRelative(path.join(reportDir, "french-guiana-popup.png"));
      }

      await writeJson(path.join(reportDir, "territory-matrix.json"), {
        generated_at: new Date().toISOString(),
        run_id: runId,
        target: lockedTarget.url,
        host: hostName(lockedTarget.url),
        pass: Boolean(representativeCycle?.territory_matrix_pass),
        rows: topLevelTerritoryMatrix
      });
      const popupTracePath = path.join(reportDir, "popup-trace.json");
      await writeJson(popupTracePath, {
        generated_at: new Date().toISOString(),
        run_id: runId,
        target: lockedTarget.url,
        host: hostName(lockedTarget.url),
        pass: popupTracePass,
        required_fields: popupTraceRequiredFields,
        deep_trace_controls: representativeCycle?.deep_trace_controls || [],
        comparison: popupTraceComparison,
        rows: topLevelPopupTraceRows
      });
      artifacts.popup_trace = screenshotRelative(popupTracePath);
      if (representativeCycle?.map_stability) {
        const mapStabilityPath = path.join(reportDir, "map-stability.json");
        await writeJson(mapStabilityPath, representativeCycle.map_stability);
        artifacts.map_stability = screenshotRelative(mapStabilityPath);
      }
      if (representativeCycle?.geolocation) {
        const geolocationPath = path.join(reportDir, "geolocation.json");
        await writeJson(geolocationPath, representativeCycle.geolocation);
        artifacts.geolocation = screenshotRelative(geolocationPath);
      }
      if (representativeCycle?.seo_flow) {
        const seoFlowPath = path.join(reportDir, "seo-flow.json");
        await writeJson(seoFlowPath, representativeCycle.seo_flow);
        artifacts.seo_flow = screenshotRelative(seoFlowPath);
      }
      const screenshotAnalysis = await buildScreenshotAnalysis(artifacts, representativeCycle, topLevelTerritoryMatrix);
      const screenshotAnalysisPath = path.join(reportDir, "screenshot-analysis.json");
      await writeJson(screenshotAnalysisPath, screenshotAnalysis);
      artifacts.screenshot_analysis = screenshotRelative(screenshotAnalysisPath);
      await writeJson(path.join(reportDir, "network.json"), {
        generated_at: new Date().toISOString(),
        run_id: runId,
        locked_target: lockedTarget.url,
        events: networkEvents
      });
      const subresourceChallenges = summarizeSubresourceChallenges(networkEvents);
      await writeJson(path.join(reportDir, "headers.json"), {
        generated_at: new Date().toISOString(),
        run_id: runId,
        locked_target: lockedTarget.url,
        locked_host: hostName(lockedTarget.url),
        host_lock: true,
        attempt_budget: attemptBudget,
        hypothesis: attemptHypothesis,
        seed_request_count: 1,
        one_browser_context_page: true,
        browser_instance_count: 1,
        context_instance_count: 1,
        page_instance_count: 1,
        first_party_header_route: firstPartyHeaderRoute,
        bypass_cookie_mode: bypassCookieMode,
        card_index_proxy_mode: cardIndexProxyMode,
        readiness_gate: {
          path: screenshotRelative(readiness.path),
          ok: true,
          reason: readiness.validation.reason,
          details: readiness.validation.details
        },
        transport_mode: transportLabel(),
        context_header_names: Object.keys(extraHeaders),
        context_cookie_mode: bypassCookieMode,
        card_index_proxy_mode: cardIndexProxyMode,
        seed: {
          request_headers: seed.request_headers,
          response: seed.response,
          redirect_policy: seed.redirect_policy
        },
        access_matrix: accessMatrix.map((row) => ({
          target: row.label,
          url: sanitize(row.url),
          host: row.host,
          seed_http_status: row.seed_http_status,
          seed_challenge: row.seed_challenge,
          app_code_reached: row.app_code_reached,
          seed_headers: row.seed_headers
        })),
        subresource_challenges: subresourceChallenges,
        cycles: cycles.map((cycle) => ({
          cycle_id: cycle.cycle_id,
          reason: cycle.reason,
          home_headers: cycle.home?.response?.headers_object || {},
          new_map_headers: cycle.new_map?.response?.headers_object || {},
          xk: cycle.kosovo || null,
          gf: cycle.french_guiana || null,
          popup_trace_pass: Boolean(cycle.popup_trace_pass),
          popup_trace_comparison: cycle.popup_trace_comparison || null,
          map_stability_pass: Boolean(cycle.map_stability_pass),
          geolocation_pass: Boolean(cycle.geolocation_pass),
          seo_flow_pass: Boolean(cycle.seo_flow_pass)
        }))
      });

      const successCount = cycles.filter((cycle) => cycle.pass).length;
      const fullBypassSessionChallengeCount = seed.challenge_detected
        ? 1
        : cycles.filter((cycle) => cycle.challenge_detected).length;
      const fullBypassSessionRunCount = seed.challenge_detected ? 1 : Math.max(cycles.length, 1);
      const fullBypassSessionChallengeRate = fullBypassSessionRunCount > 0
        ? Number((fullBypassSessionChallengeCount / fullBypassSessionRunCount).toFixed(4))
        : null;
      const headerOnlyBaseline = await readHeaderOnlyBaseline();
      const challengeRateSubstantiallyLower =
        headerOnlyBaseline.challenge_rate !== null &&
        fullBypassSessionChallengeRate !== null &&
        fullBypassSessionChallengeRate + 0.25 <= headerOnlyBaseline.challenge_rate;
      const appCodeReached = cycles.some((cycle) => cycle.home?.app_code_reached && cycle.new_map?.app_code_reached);
      const summary = {
        generated_at: new Date().toISOString(),
        run_id: runId,
        status,
        stop_reason: stopReason,
        target_count: 1,
        chosen_target: lockedTarget.url,
        locked_target: lockedTarget.url,
        locked_host: hostName(lockedTarget.url),
        host_lock: true,
        attempt_budget: attemptBudget,
        hypothesis: attemptHypothesis,
        seed_request_count: 1,
        one_browser_context_page: true,
        browser_instance_count: 1,
        context_instance_count: 1,
        page_instance_count: 1,
        first_party_header_route: firstPartyHeaderRoute,
        card_index_proxy_mode: cardIndexProxyMode,
        readiness_gate: {
          path: screenshotRelative(readiness.path),
          ok: true,
          reason: readiness.validation.reason,
          details: readiness.validation.details
        },
        browser: browserLabel,
        headless,
        browser_args: launchOptions,
        browser_transport: browserTransport,
        transport_mode: transportLabel(),
        JS_REPL_STATUS: browserTransport.JS_REPL_STATUS,
        browser_execution_path: browserTransport.selected_path,
        APP_CODE_REACHED: appCodeReached ? "YES" : "NO",
        seed_target: lockedTarget.url,
        seed_mode: seed.mode,
        seed_redirect_policy: seed.redirect_policy,
        seed_cookie_mode: seed.cookie_mode,
        seed_cookie_confirmed: Boolean(seed.bypass_cookie_detected),
        seed_cookie_absence_documented: Boolean(seed.bypass_cookie_absence_documented),
        seed_bypass_cookies: seed.bypass_cookies || [],
        seed_response_status: seed.response?.status ?? null,
        seed_response_mitigated: seed.response?.x_vercel_mitigated || "",
        access_matrix: accessMatrix,
        cycles,
        territory_matrix_pass: Boolean(representativeCycle?.territory_matrix_pass),
        popup_trace_pass: popupTracePass,
        popup_trace_comparison: popupTraceComparison,
        screenshot_analysis_pass: Boolean(screenshotAnalysis.pass),
        map_stability_pass: Boolean(representativeCycle?.map_stability_pass),
        geolocation_pass: Boolean(representativeCycle?.geolocation_pass),
        seo_flow_pass: Boolean(representativeCycle?.seo_flow_pass),
        subresource_challenges: subresourceChallenges,
        successful_full_ui_runs: successCount,
        consecutive_full_ui_successes: consecutivePrefixPasses(cycles),
        full_bypass_session_run_count: fullBypassSessionRunCount,
        full_bypass_session_challenge_count: fullBypassSessionChallengeCount,
        full_bypass_session_challenge_rate: fullBypassSessionChallengeRate,
        header_only_baseline: headerOnlyBaseline,
        challenge_rate_substantially_lower: challengeRateSubstantiallyLower,
        artifacts,
        report_dir: screenshotRelative(reportDir),
        report_updated: false,
        ...reuseMetrics({
          browserReused: true,
          contextReused: true,
          sessionReused: true,
          operationCount: 1 + cycles.length,
          successCount,
          challengeCount: fullBypassSessionChallengeCount
        })
      };
      summary.report_updated = true;
      const reportPath = await updateRecoveryReport(summary);
      summary.report_path = screenshotRelative(reportPath);
      const repeatabilityReportPath = await updateRepeatabilityReport(summary);
      summary.repeatability_report_path = screenshotRelative(repeatabilityReportPath);
      const replacementReportPath = await updateReplacementReport(summary);
      summary.replacement_report_path = screenshotRelative(replacementReportPath);
      await writeJson(path.join(reportDir, "summary.json"), summary);
      await appendChallengeHistory({
        seed_status: summary.seed_response_status,
        mitigated: summary.seed_response_mitigated,
        browser: browserLabel,
        host: summary.locked_host,
        app_code_reached: summary.APP_CODE_REACHED,
        status: summary.status,
        stop_reason: summary.stop_reason || "",
        seed_request_count: summary.seed_request_count
      });

      console.log(`RUN_ID=${runId}`);
      console.log(`REPORT_DIR=${screenshotRelative(reportDir)}`);
      console.log(`STATUS=${summary.status}`);
      console.log(`STOP_REASON=${summary.stop_reason || "NONE"}`);
      console.log(`JS_REPL_STATUS=${browserTransport.JS_REPL_STATUS}`);
      console.log(`APP_CODE_REACHED=${summary.APP_CODE_REACHED}`);
      console.log(`LOCKED_TARGET=${sanitize(lockedTarget.url)}`);
      console.log(`LOCKED_HOST=${summary.locked_host}`);
      console.log(`SEED_REQUEST_COUNT=${summary.seed_request_count}`);
      console.log(`ATTEMPT_BUDGET=${summary.attempt_budget}`);
      console.log(`HYPOTHESIS=${sanitize(summary.hypothesis)}`);
      console.log(`FULL_UI_SUCCESS_COUNT=${summary.successful_full_ui_runs}`);
      console.log(`CONSECUTIVE_FULL_UI_SUCCESSES=${summary.consecutive_full_ui_successes}`);
      console.log(`POPUP_TRACE_PASS=${summary.popup_trace_pass ? "YES" : "NO"}`);
      console.log(`TERRITORY_MATRIX_PASS=${summary.territory_matrix_pass ? "YES" : "NO"}`);
      console.log(`SCREENSHOT_ANALYSIS_PASS=${summary.screenshot_analysis_pass ? "YES" : "NO"}`);
      console.log(`MAP_STABILITY_PASS=${summary.map_stability_pass ? "YES" : "NO"}`);
      console.log(`GEOLOCATION_PASS=${summary.geolocation_pass ? "YES" : "NO"}`);
      console.log(`SEO_FLOW_PASS=${summary.seo_flow_pass ? "YES" : "NO"}`);
      console.log(`REPORT_UPDATED=${summary.report_updated ? "YES" : "NO"}`);

      if (
        summary.APP_CODE_REACHED !== "YES" ||
        !artifacts.homepage ||
        !artifacts.new_map ||
        !artifacts.kosovo_popup ||
        !artifacts.french_guiana_popup ||
        !artifacts.popup_trace ||
        !summary.popup_trace_pass ||
        !summary.territory_matrix_pass ||
        summary.consecutive_full_ui_successes < 3
      ) {
        process.exitCode = 1;
      }
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
    slot.release();
  }
}

async function writeUncaughtErrorSummary(error) {
  const summaryPath = path.join(reportDir, "summary.json");
  if (await fileExists(summaryPath)) return;

  const lockedTarget = buildLockedTarget();
  const seed = await readJson(path.join(reportDir, "seed-response.json"));
  const hasSeed = Boolean(seed?.response);
  const message = sanitize(error?.message || error || "RUNNER_ERROR");
  const summary = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    status: "FAIL",
    stop_reason: "RUNNER_ERROR",
    runner_error: message,
    target_count: 1,
    chosen_target: lockedTarget.url,
    locked_target: lockedTarget.url,
    locked_host: hostName(lockedTarget.url),
    host_lock: true,
    attempt_budget: attemptBudget,
    hypothesis: attemptHypothesis,
    seed_request_count: hasSeed ? 1 : 0,
    one_browser_context_page: hasSeed,
    browser_instance_count: hasSeed ? 1 : 0,
    context_instance_count: hasSeed ? 1 : 0,
    page_instance_count: hasSeed ? 1 : 0,
    browser: browserName,
    APP_CODE_REACHED: "NO",
    seed_target: lockedTarget.url,
    seed_mode: seed?.mode || "",
    seed_redirect_policy: seed?.redirect_policy || "",
    seed_cookie_mode: seed?.cookie_mode || "",
    seed_cookie_confirmed: Boolean(seed?.bypass_cookie_detected),
    seed_cookie_absence_documented: Boolean(seed?.bypass_cookie_absence_documented),
    seed_bypass_cookies: seed?.bypass_cookies || [],
    seed_response_status: seed?.response?.status ?? null,
    seed_response_mitigated: seed?.response?.x_vercel_mitigated || "",
    access_matrix: [],
    cycles: [],
    territory_matrix_pass: false,
    popup_trace_pass: false,
    successful_full_ui_runs: 0,
    consecutive_full_ui_successes: 0,
    full_bypass_session_run_count: hasSeed ? 1 : 0,
    full_bypass_session_challenge_count: seed?.challenge_detected ? 1 : 0,
    full_bypass_session_challenge_rate: hasSeed ? (seed?.challenge_detected ? 1 : 0) : null,
    artifacts: {
      homepage: "",
      new_map: "",
      kosovo_popup: "",
      french_guiana_popup: "",
      popup_trace: "",
      challenge_html: seed?.challenge_html || ""
    },
    report_dir: screenshotRelative(reportDir),
    report_updated: false
  };

  await writeJson(summaryPath, summary);
  const headersPath = path.join(reportDir, "headers.json");
  if (!(await fileExists(headersPath))) {
    await writeJson(headersPath, {
      generated_at: summary.generated_at,
      run_id: runId,
      locked_target: lockedTarget.url,
      locked_host: hostName(lockedTarget.url),
      host_lock: true,
      attempt_budget: attemptBudget,
      hypothesis: attemptHypothesis,
      seed_request_count: summary.seed_request_count,
      one_browser_context_page: summary.one_browser_context_page,
      runner_error: message
    });
  }
  await appendChallengeHistory({
    seed_status: summary.seed_response_status,
    mitigated: summary.seed_response_mitigated,
    browser: browserName,
    host: summary.locked_host,
    app_code_reached: summary.APP_CODE_REACHED,
    status: summary.status,
    stop_reason: summary.stop_reason,
    seed_request_count: summary.seed_request_count
  });
}

await main().catch(async (error) => {
  await ensureDir(reportDir);
  await fs.writeFile(path.join(reportDir, "error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  await writeUncaughtErrorSummary(error).catch(() => {});
  console.error(error.message || error);
  process.exit(1);
});

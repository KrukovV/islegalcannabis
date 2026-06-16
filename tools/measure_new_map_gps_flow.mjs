import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { buildVercelBypassHeaders, redactVercelBypassSecret } from "./vercel_bypass.mjs";

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const playwright = require(require.resolve("playwright", {
  paths: [path.join(repoRoot, "apps/web")]
}));

const url = process.env.NEW_MAP_GPS_URL || "https://www.islegal.info/new-map";
const label = process.env.NEW_MAP_GPS_LABEL || "prod-gps";
const outDir = process.env.NEW_MAP_GPS_OUT_DIR
  ? path.resolve(process.env.NEW_MAP_GPS_OUT_DIR)
  : path.join(repoRoot, "Reports", "new-map-gps");
const browserName = process.env.NEW_MAP_GPS_BROWSER || "webkit";
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const latitude = Number(process.env.NEW_MAP_GPS_LAT || 50.0755);
const longitude = Number(process.env.NEW_MAP_GPS_LNG || 14.4378);
const timeoutMs = Number(process.env.NEW_MAP_GPS_TIMEOUT_MS || 60000);
const comparePath = process.env.NEW_MAP_GPS_COMPARE || "";
const gateMode = process.env.NEW_MAP_GPS_GATE === "1";
const maxMarkerMs = Number(process.env.NEW_MAP_GPS_MAX_MARKER_MS || 2500);
const maxCenterMs = Number(process.env.NEW_MAP_GPS_MAX_CENTER_MS || 2500);
const maxRecenterMs = Number(process.env.NEW_MAP_GPS_MAX_RECENTER_MS || 1000);
const maxPersistedMs = Number(process.env.NEW_MAP_GPS_MAX_PERSISTED_MS || 5000);
const maxCenterDistance = Number(process.env.NEW_MAP_GPS_MAX_CENTER_DISTANCE || 0.01);
const minCityLabels = Number(process.env.NEW_MAP_GPS_MIN_CITY_LABELS || 3);
const minZoomOutCountries = Number(process.env.NEW_MAP_GPS_MIN_ZOOM_OUT_COUNTRIES || 100);
const maxConsoleErrors = Number(process.env.NEW_MAP_GPS_MAX_CONSOLE_ERRORS || 1);
const staleGpsSeedEnabled = process.env.NEW_MAP_GPS_SEED_STALE === "1";
const staleGpsSeed = {
  lat: Number(process.env.NEW_MAP_GPS_STALE_LAT || 48.8566),
  lng: Number(process.env.NEW_MAP_GPS_STALE_LNG || 2.3522),
  source: "gps",
  iso2: String(process.env.NEW_MAP_GPS_STALE_ISO || "FR").toUpperCase()
};

function now() {
  return Date.now();
}

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

function sanitize(value) {
  return redactVercelBypassSecret(String(value || ""), secret);
}

function compactError(error) {
  return String(error?.message || error || "").split("\n")[0].slice(0, 240);
}

function delta(after, before) {
  if (typeof after !== "number" || typeof before !== "number") return null;
  return Math.round(after - before);
}

function pushIf(failures, condition, reason) {
  if (!condition) failures.push(reason);
}

function isSourceMapError(item) {
  return item.status === 404 && /\.map(?:[?#]|$)/i.test(item.url || "");
}

function isMapResourceError(item) {
  if (!item) return false;
  const status = Number(item.status || 0);
  if (status < 400 && !(status === 0 && item.phase === "requestfailed" && item.failure !== "cancelled")) return false;
  const target = String(item.url || "");
  if (/\/api\/ai-assistant\/query/i.test(target)) return false;
  return /\/api\/new-map\/|tiles(?:-[a-d])?\.basemaps\.cartocdn\.com|basemaps\.cartocdn\.com|maplibre|\.mvt(?:[?#]|$)|\.pbf(?:[?#]|$)|sprite(?:@2x)?\.(?:json|png)(?:[?#]|$)/i.test(target);
}

function isNonBlockingConsoleError(text) {
  const value = String(text || "").trim();
  if (/Fetch API cannot load .*\/api\/new-map\/basemap-tile\/.* due to access control checks\./i.test(value)) return true;
  return value === "eZ" || value === "ct";
}

function isNonBlockingPageError(text) {
  return /^Failed to load chunk \/_next\/static\/chunks\/.* from module \d+/i.test(String(text || "").trim());
}

async function waitFor(page, fn, timeout = timeoutMs) {
  return page.waitForFunction(fn, undefined, { timeout });
}

async function screenshot(page, name) {
  const filePath = path.join(outDir, `${label}.${name}.${browserName}.png`);
  await page.screenshot({ path: filePath, fullPage: false }).catch(() => undefined);
  const bytes = await fs.stat(filePath).then((stat) => stat.size).catch(() => 0);
  return { path: rel(filePath), bytes };
}

async function getMapState(page) {
  return page.evaluate(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    if (!map) return null;
    const center = map.getCenter?.();
    return {
      lng: center?.lng ?? null,
      lat: center?.lat ?? null,
      zoom: map.getZoom?.() ?? null,
      marker: document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") || null,
      storage: (() => {
        try {
          return JSON.parse(window.localStorage.getItem("geo") || "null");
        } catch {
          return null;
        }
      })()
    };
  });
}

async function getDockState(page) {
  return page.evaluate(() => {
    const dock = document.querySelector('[data-testid="new-map-ai-dock"]');
    return {
      locationSource: dock?.getAttribute("data-location-source") || null,
      gpsStatus: dock?.getAttribute("data-gps-status") || null,
      hint: document.querySelector('[data-testid="new-map-ai-geo-hint"]')?.textContent?.trim() || null
    };
  });
}

function distanceDegrees(state) {
  if (!state || typeof state.lng !== "number" || typeof state.lat !== "number") return null;
  const lngDelta = Math.abs(state.lng - longitude);
  const latDelta = Math.abs(state.lat - latitude);
  return Math.round(Math.sqrt((lngDelta * lngDelta) + (latDelta * latDelta)) * 10000) / 10000;
}

function markerMatches(state, lng, lat) {
  return state?.marker === `${lng},${lat}`;
}

async function countLabels(page, pattern) {
  return page.evaluate((rawPattern) => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    if (!map || typeof map.queryRenderedFeatures !== "function") return -1;
    const re = new RegExp(rawPattern, "i");
    const layers = (map.getStyle?.().layers || [])
      .filter((layer) => layer.type === "symbol" && re.test(layer.id))
      .map((layer) => layer.id);
    if (!layers.length) return -1;
    try {
      const features = map.queryRenderedFeatures(undefined, { layers });
      const unique = new Set();
      for (const feature of features) {
        const props = feature.properties || {};
        const name = props.name_en || props.name || props.name_de || props.name_fr || props.name_es || feature.id || "";
        unique.add(`${feature.layer?.id || ""}:${String(name)}`);
      }
      return unique.size || features.length;
    } catch {
      return -1;
    }
  }, pattern);
}

async function countRenderedCountries(page) {
  return page.evaluate(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    if (!map || typeof map.queryRenderedFeatures !== "function") return -1;
    try {
      return map.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length;
    } catch {
      return -1;
    }
  });
}

async function measureLabels(page, pattern, minLabels, timeout = 15000, settleMs = 3500) {
  const startedAt = Date.now();
  let firstMs = null;
  let maxCount = await countLabels(page, pattern);
  let finalCount = maxCount;
  while (Date.now() - startedAt < timeout) {
    finalCount = await countLabels(page, pattern);
    maxCount = Math.max(maxCount, finalCount);
    if (firstMs === null && finalCount >= minLabels) {
      firstMs = Date.now() - startedAt;
      const settleUntil = Date.now() + settleMs;
      while (Date.now() < settleUntil) {
        await page.waitForTimeout(250);
        finalCount = await countLabels(page, pattern);
        maxCount = Math.max(maxCount, finalCount);
      }
      break;
    }
    await page.waitForTimeout(250);
  }
  return {
    first_ms: firstMs,
    final_count: finalCount,
    max_count: maxCount
  };
}

async function findCountryFeaturePoint(page, iso) {
  return page.evaluate((targetIso) => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    if (!map || typeof map.queryRenderedFeatures !== "function") return null;
    const rect = map.getCanvas().getBoundingClientRect();
    for (let y = 40; y < rect.height - 40; y += 16) {
      for (let x = 40; x < rect.width - 40; x += 16) {
        const feature = map.queryRenderedFeatures([x, y], { layers: ["legal-fill"] })[0];
        if (!feature) continue;
        const props = feature.properties || {};
        const candidates = [props.geo, props.iso2, props.iso_a2, props.ISO_A2, feature.id]
          .map((value) => String(value || "").toUpperCase())
          .filter(Boolean);
        if (candidates.includes(targetIso)) {
          return { x, y };
        }
      }
    }
    return null;
  }, iso);
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await playwright[browserName].launch({
    headless: process.env.NEW_MAP_GPS_HEADED === "1" ? false : true,
    args: browserName === "chromium"
      ? ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
      : undefined
  });

  const parsed = new URL(url);
  const newContext = async (includeBypassHeaders) => browser.newContext({
    geolocation: { latitude, longitude },
    permissions: ["geolocation"],
    ...(includeBypassHeaders
      ? { extraHTTPHeaders: buildVercelBypassHeaders(secret, "samesitenone") }
      : {})
  });
  let useBypassHeaders = Boolean(secret);
  let context = await newContext(useBypassHeaders);
  const seed = { enabled: false, status: null, cookie_names: [], fallback_to_public: false };
  if (useBypassHeaders) {
    const seedResponse = await context.request.get(url, {
      headers: buildVercelBypassHeaders(secret, "samesitenone"),
      maxRedirects: 5,
      timeout: timeoutMs
    });
    seed.enabled = true;
    seed.status = seedResponse.status();
    seed.cookie_names = (await context.cookies(url)).map((cookie) => cookie.name);
    if (seed.status >= 400) {
      seed.fallback_to_public = true;
      useBypassHeaders = false;
      await context.close();
      context = await newContext(false);
    }
  }
  await context.grantPermissions(["geolocation"], { origin: parsed.origin }).catch(() => undefined);

  const page = await context.newPage();
  if (staleGpsSeedEnabled) {
    await page.addInitScript((savedGeo) => {
      if (window.sessionStorage.getItem("new-map-gps-stale-seeded") === "1") return;
      window.localStorage.setItem("geo", JSON.stringify(savedGeo));
      window.sessionStorage.setItem("new-map-gps-stale-seeded", "1");
    }, staleGpsSeed);
  }
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const resourceErrors = [];
  const requests = [];
  page.on("console", (msg) => {
    const text = msg.text().slice(0, 240);
    if (msg.type() === "error") consoleErrors.push(text);
    if (msg.type() === "warning") consoleWarnings.push(text);
  });
  page.on("pageerror", (error) => pageErrors.push(compactError(error)));
  page.on("requestfailed", (request) => {
    resourceErrors.push({
      phase: "requestfailed",
      url: sanitize(request.url()),
      status: 0,
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || ""
    });
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    resourceErrors.push({
      phase: "response",
      url: sanitize(response.url()),
      status: response.status(),
      resourceType: request.resourceType()
    });
  });
  page.on("requestfinished", async (request) => {
    const response = await request.response().catch(() => null);
    requests.push({
      url: sanitize(request.url()),
      method: request.method(),
      status: response?.status() ?? 0,
      resourceType: request.resourceType()
    });
  });

  const startedAt = now();
  let ok = true;
  const failures = [];
  const marks = {};
  const mark = (key) => {
    marks[key] = now() - startedAt;
  };

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    mark("domcontentloaded_ms");
    await waitFor(page, () => document.querySelector('[data-testid="new-map-root"]'));
    mark("root_ms");
    await waitFor(page, () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1");
    mark("map_ready_ms");
    await waitFor(page, () => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      return Boolean(map && map.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length > 0);
    });
    mark("countries_painted_ms");
    marks.initial = await getMapState(page);
    marks.initial_screenshot = await screenshot(page, "initial");

    const gpsButton = page.getByRole("button", { name: /GPS/i });
    await gpsButton.click({ timeout: 10000 });
    mark("gps_click_ms");
    await waitFor(page, () => {
      const marker = document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position");
      if (!marker) return false;
      const parsedMarker = marker.split(",").map(Number);
      return Math.abs(parsedMarker[0] - 14.4378) < 0.0001 && Math.abs(parsedMarker[1] - 50.0755) < 0.0001;
    }, 20000);
    mark("gps_marker_ms");
    await waitFor(page, () => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      const center = map?.getCenter?.();
      return Boolean(center && Math.abs(center.lng - 14.4378) < 0.25 && Math.abs(center.lat - 50.0755) < 0.25);
    }, 20000);
    mark("gps_center_ms");
    marks.after_gps = await getMapState(page);
    marks.after_gps_ui = await getDockState(page);
    marks.after_gps_screenshot = await screenshot(page, "after-gps");

    await page.evaluate(() => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      map?.jumpTo?.({ center: [-100, 35], zoom: 2.1 });
    });
    await page.waitForTimeout(250);
    marks.after_manual_pan = await getMapState(page);
    await gpsButton.click({ timeout: 10000 });
    mark("gps_reclick_ms");
    await waitFor(page, () => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      const center = map?.getCenter?.();
      return Boolean(center && Math.abs(center.lng - 14.4378) < 0.25 && Math.abs(center.lat - 50.0755) < 0.25);
    }, 20000);
    mark("gps_recenter_ms");
    marks.after_recenter = await getMapState(page);
    marks.after_recenter_ui = await getDockState(page);
    marks.after_recenter_screenshot = await screenshot(page, "after-recenter");

    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    mark("reload_domcontentloaded_ms");
    await waitFor(page, () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1");
    await waitFor(page, () => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755");
    mark("persisted_marker_ms");
    marks.after_reload = await getMapState(page);

    await page.evaluate(() => {
      window.__NEW_MAP_DEBUG__?.map?.jumpTo({ center: [2.3522, 46.8], zoom: 3.4 });
    });
    await page.waitForTimeout(350);
    const featurePoint = await findCountryFeaturePoint(page, "FR");
    const hoverPoint = await page.evaluate((point) => {
      const canvas = document.querySelector(".maplibregl-canvas");
      if (!point || !(canvas instanceof HTMLElement)) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + point.x, y: rect.top + point.y };
    }, featurePoint);
    if (hoverPoint) {
      await page.mouse.move(hoverPoint.x, hoverPoint.y);
      await page.waitForTimeout(350);
    }
    marks.hover = await page.evaluate(() => ({
      hoveredId: window.__NEW_MAP_DEBUG__?.hoveredId ?? null,
      popupVisible: Boolean(document.querySelector('[data-testid="new-map-country-popup"]')),
      cursor: getComputedStyle(document.querySelector(".maplibregl-canvas") || document.body).cursor
    }));
    marks.hover_screenshot = await screenshot(page, "hover");

    await page.evaluate(() => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      map?.jumpTo?.({ center: [14.4378, 50.0755], zoom: 8.2 });
    });
    const zoomInCityLabels = await measureLabels(page, "place_city|place_town|place_villages|place_hamlet|place_suburbs?", 3);
    marks.zoom_in = {
      state: await getMapState(page),
      country_labels: await countLabels(page, "country|admin_0|place_country"),
      city_labels: zoomInCityLabels.max_count,
      city_label_final_count: zoomInCityLabels.final_count,
      city_label_first_ms: zoomInCityLabels.first_ms,
      rendered_countries: await countRenderedCountries(page),
      screenshot: await screenshot(page, "zoom-in")
    };

    await page.evaluate(() => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      map?.jumpTo?.({ center: [10, 30], zoom: 1.7 });
    });
    const zoomOutCountryLabels = await measureLabels(page, "country|admin_0|place_country", 2, 8000, 1500);
    marks.zoom_out = {
      state: await getMapState(page),
      country_labels: zoomOutCountryLabels.max_count,
      country_label_final_count: zoomOutCountryLabels.final_count,
      country_label_first_ms: zoomOutCountryLabels.first_ms,
      city_labels: await countLabels(page, "place_city|place_town|place_villages|place_hamlet|place_suburbs?"),
      rendered_countries: await countRenderedCountries(page),
      screenshot: await screenshot(page, "zoom-out")
    };
  } catch (error) {
    ok = false;
    failures.push(compactError(error));
    marks.failure_screenshot = await screenshot(page, "failure");
  } finally {
    await context.close();
    await browser.close();
  }

  const metric = {
    gps_marker_latency_ms: delta(marks.gps_marker_ms, marks.gps_click_ms),
    gps_center_latency_ms: delta(marks.gps_center_ms, marks.gps_click_ms),
    gps_recenter_latency_ms: delta(marks.gps_recenter_ms, marks.gps_reclick_ms),
    persisted_marker_latency_ms: delta(marks.persisted_marker_ms, marks.reload_domcontentloaded_ms),
    gps_center_distance_deg: distanceDegrees(marks.after_gps),
    gps_recenter_distance_deg: distanceDegrees(marks.after_recenter),
    persisted_center_distance_deg: distanceDegrees(marks.after_reload),
    zoom_in_city_labels: marks.zoom_in?.city_labels ?? null,
    zoom_in_city_label_first_ms: marks.zoom_in?.city_label_first_ms ?? null,
    zoom_out_city_labels: marks.zoom_out?.city_labels ?? null,
    zoom_out_country_label_first_ms: marks.zoom_out?.country_label_first_ms ?? null,
    zoom_out_rendered_countries: marks.zoom_out?.rendered_countries ?? null,
    stale_saved_gps_loaded: staleGpsSeedEnabled
      ? (markerMatches(marks.initial, staleGpsSeed.lng, staleGpsSeed.lat) ? 1 : 0)
      : null,
    stale_saved_gps_refreshed: staleGpsSeedEnabled
      ? (markerMatches(marks.after_gps, longitude, latitude) && marks.after_gps?.storage?.iso2 !== staleGpsSeed.iso2 ? 1 : 0)
      : null,
    console_errors: consoleErrors.length,
    console_warnings: consoleWarnings.length,
    style_diff_warnings: consoleWarnings.filter((item) => /Style is not done loading|Unable to perform style diff/i.test(item)).length,
    glyph_warnings: consoleWarnings.filter((item) => /Unable to load glyph range/i.test(item)).length,
    resource_errors: resourceErrors.length,
    map_resource_errors: resourceErrors.filter(isMapResourceError).length,
    source_map_errors: resourceErrors.filter(isSourceMapError).length,
    blocking_console_errors: consoleErrors.filter((item) => !isNonBlockingConsoleError(item)).length,
    blocking_page_errors: pageErrors.filter((item) => !isNonBlockingPageError(item)).length,
    page_errors: pageErrors.length
  };
  const gateFailures = [];
  const finalStorage = marks.after_reload?.storage || marks.after_recenter?.storage || null;
  if (gateMode) {
    pushIf(gateFailures, ok, "FLOW_FAILED");
    pushIf(gateFailures, metric.gps_marker_latency_ms !== null && metric.gps_marker_latency_ms <= maxMarkerMs, "GPS_MARKER_SLOW");
    pushIf(gateFailures, metric.gps_center_latency_ms !== null && metric.gps_center_latency_ms <= maxCenterMs, "GPS_CENTER_SLOW");
    pushIf(gateFailures, metric.gps_recenter_latency_ms !== null && metric.gps_recenter_latency_ms <= maxRecenterMs, "GPS_RECENTER_SLOW");
    pushIf(gateFailures, metric.persisted_marker_latency_ms !== null && metric.persisted_marker_latency_ms <= maxPersistedMs, "GPS_PERSIST_SLOW");
    pushIf(gateFailures, metric.gps_center_distance_deg !== null && metric.gps_center_distance_deg <= maxCenterDistance, "GPS_CENTER_OFF");
    pushIf(gateFailures, metric.gps_recenter_distance_deg !== null && metric.gps_recenter_distance_deg <= maxCenterDistance, "GPS_RECENTER_OFF");
    pushIf(gateFailures, metric.persisted_center_distance_deg !== null && metric.persisted_center_distance_deg <= maxCenterDistance, "GPS_PERSIST_CENTER_OFF");
    pushIf(gateFailures, finalStorage?.source === "gps", "GPS_STORAGE_SOURCE_BAD");
    pushIf(gateFailures, marks.after_gps_ui?.locationSource === "gps", "GPS_UI_SOURCE_BAD");
    pushIf(gateFailures, marks.hover?.hoveredId === "FR" && marks.hover?.cursor === "pointer", "HOVER_BAD");
    pushIf(gateFailures, metric.zoom_in_city_labels !== null && metric.zoom_in_city_labels >= minCityLabels, "ZOOM_IN_CITY_LABELS_LOW");
    pushIf(gateFailures, metric.zoom_out_rendered_countries !== null && metric.zoom_out_rendered_countries >= minZoomOutCountries, "ZOOM_OUT_COUNTRIES_LOW");
    if (staleGpsSeedEnabled) {
      pushIf(gateFailures, metric.stale_saved_gps_loaded === 1, "STALE_GPS_SEED_NOT_LOADED");
      pushIf(gateFailures, metric.stale_saved_gps_refreshed === 1, "STALE_GPS_NOT_REFRESHED");
    }
    pushIf(gateFailures, metric.blocking_console_errors <= maxConsoleErrors, "CONSOLE_ERRORS");
    pushIf(gateFailures, metric.style_diff_warnings === 0, "STYLE_DIFF_WARNINGS");
    pushIf(gateFailures, metric.map_resource_errors === 0, "MAP_RESOURCE_ERRORS");
    pushIf(gateFailures, metric.source_map_errors === 0, "SOURCE_MAP_ERRORS");
    pushIf(gateFailures, metric.blocking_page_errors === 0, "PAGE_ERRORS");
  }

  const payload = {
    generated_at: new Date().toISOString(),
    label,
    url: sanitize(url),
    browser: browserName,
    cold_run: true,
    geolocation: { latitude, longitude },
    ok,
    failures,
    metric,
    gate: {
      enabled: gateMode,
      ok: gateFailures.length === 0,
      failures: gateFailures,
      thresholds: {
        max_marker_ms: maxMarkerMs,
        max_center_ms: maxCenterMs,
        max_recenter_ms: maxRecenterMs,
        max_persisted_ms: maxPersistedMs,
        max_center_distance: maxCenterDistance,
        min_city_labels: minCityLabels,
        min_zoom_out_countries: minZoomOutCountries,
        max_console_errors: maxConsoleErrors
      }
    },
    seed,
    saved_geo_seed: {
      enabled: staleGpsSeedEnabled,
      value: staleGpsSeed
    },
    marks,
    requests: requests.slice(-120),
    console_errors: consoleErrors,
    console_warnings: consoleWarnings,
    resource_errors: resourceErrors,
    page_errors: pageErrors
  };

  if (comparePath) {
    const before = JSON.parse(await fs.readFile(path.resolve(comparePath), "utf8"));
    payload.delta_vs_compare = {
      gps_marker_latency_ms: delta(metric.gps_marker_latency_ms, before.metric?.gps_marker_latency_ms),
      gps_center_latency_ms: delta(metric.gps_center_latency_ms, before.metric?.gps_center_latency_ms),
      gps_recenter_latency_ms: delta(metric.gps_recenter_latency_ms, before.metric?.gps_recenter_latency_ms),
      persisted_marker_latency_ms: delta(metric.persisted_marker_latency_ms, before.metric?.persisted_marker_latency_ms),
      zoom_in_city_labels: delta(metric.zoom_in_city_labels, before.metric?.zoom_in_city_labels),
      zoom_in_city_label_first_ms: delta(metric.zoom_in_city_label_first_ms, before.metric?.zoom_in_city_label_first_ms),
      zoom_out_city_labels: delta(metric.zoom_out_city_labels, before.metric?.zoom_out_city_labels),
      zoom_out_country_label_first_ms: delta(metric.zoom_out_country_label_first_ms, before.metric?.zoom_out_country_label_first_ms),
      zoom_out_rendered_countries: delta(metric.zoom_out_rendered_countries, before.metric?.zoom_out_rendered_countries),
      console_errors: delta(metric.console_errors, before.metric?.console_errors),
      style_diff_warnings: delta(metric.style_diff_warnings, before.metric?.style_diff_warnings),
      glyph_warnings: delta(metric.glyph_warnings, before.metric?.glyph_warnings),
      map_resource_errors: delta(metric.map_resource_errors, before.metric?.map_resource_errors),
      source_map_errors: delta(metric.source_map_errors, before.metric?.source_map_errors),
      blocking_console_errors: delta(metric.blocking_console_errors, before.metric?.blocking_console_errors),
      blocking_page_errors: delta(metric.blocking_page_errors, before.metric?.blocking_page_errors),
      page_errors: delta(metric.page_errors, before.metric?.page_errors)
    };
  }

  const outPath = path.join(outDir, `${label}.${browserName}.json`);
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n");

  console.log(
    `NEW_MAP_GPS_FLOW ok=${payload.ok ? 1 : 0} label=${label} marker_ms=${metric.gps_marker_latency_ms ?? "NA"} center_ms=${metric.gps_center_latency_ms ?? "NA"} recenter_ms=${metric.gps_recenter_latency_ms ?? "NA"} persisted_ms=${metric.persisted_marker_latency_ms ?? "NA"} city_labels=${metric.zoom_in_city_labels ?? "NA"} report=${rel(outPath)}`
  );
  if (gateMode) {
    const reason = gateFailures.length ? gateFailures.join(",") : "OK";
    console.log(`PROD_GPS_OK=${gateFailures.length ? 0 : 1} reason=${reason} target=${sanitize(url)} browser=${browserName} report=${rel(outPath)}`);
    console.log(
      [
        "PROD_GPS_METRIC",
        `gps_marker_ms=${metric.gps_marker_latency_ms ?? "NA"}`,
        `gps_center_ms=${metric.gps_center_latency_ms ?? "NA"}`,
        `gps_recenter_ms=${metric.gps_recenter_latency_ms ?? "NA"}`,
        `persisted_marker_ms=${metric.persisted_marker_latency_ms ?? "NA"}`,
        `gps_center_distance=${metric.gps_center_distance_deg ?? "NA"}`,
        `gps_recenter_distance=${metric.gps_recenter_distance_deg ?? "NA"}`,
        `persisted_center_distance=${metric.persisted_center_distance_deg ?? "NA"}`,
        `storage_iso=${finalStorage?.iso2 || "NA"}`,
        `storage_source=${finalStorage?.source || "NA"}`,
        `gps_ui_source=${marks.after_gps_ui?.locationSource || "NA"}`,
        `hovered=${marks.hover?.hoveredId || "NA"}`,
        `hover_cursor=${marks.hover?.cursor || "NA"}`,
        `zoom_in_city_labels=${metric.zoom_in_city_labels ?? "NA"}`,
        `zoom_in_city_label_first_ms=${metric.zoom_in_city_label_first_ms ?? "NA"}`,
        `zoom_out_rendered_countries=${metric.zoom_out_rendered_countries ?? "NA"}`,
        `stale_saved_gps_loaded=${metric.stale_saved_gps_loaded ?? "NA"}`,
        `stale_saved_gps_refreshed=${metric.stale_saved_gps_refreshed ?? "NA"}`,
        `console_errors=${metric.console_errors}`,
        `style_diff_warnings=${metric.style_diff_warnings}`,
        `glyph_warnings=${metric.glyph_warnings}`,
        `map_resource_errors=${metric.map_resource_errors}`,
        `source_map_errors=${metric.source_map_errors}`,
        `blocking_console_errors=${metric.blocking_console_errors}`,
        `blocking_page_errors=${metric.blocking_page_errors}`,
        `page_errors=${metric.page_errors}`
      ].join(" ")
    );
    if (payload.delta_vs_compare) {
      console.log(
        [
          "PROD_GPS_DELTA",
          `gps_marker_ms=${payload.delta_vs_compare.gps_marker_latency_ms ?? "NA"}`,
          `gps_center_ms=${payload.delta_vs_compare.gps_center_latency_ms ?? "NA"}`,
          `gps_recenter_ms=${payload.delta_vs_compare.gps_recenter_latency_ms ?? "NA"}`,
          `persisted_marker_ms=${payload.delta_vs_compare.persisted_marker_latency_ms ?? "NA"}`,
          `zoom_in_city_labels=${payload.delta_vs_compare.zoom_in_city_labels ?? "NA"}`,
          `zoom_in_city_label_first_ms=${payload.delta_vs_compare.zoom_in_city_label_first_ms ?? "NA"}`,
          `zoom_out_rendered_countries=${payload.delta_vs_compare.zoom_out_rendered_countries ?? "NA"}`,
          `console_errors=${payload.delta_vs_compare.console_errors ?? "NA"}`,
          `style_diff_warnings=${payload.delta_vs_compare.style_diff_warnings ?? "NA"}`,
          `glyph_warnings=${payload.delta_vs_compare.glyph_warnings ?? "NA"}`,
          `map_resource_errors=${payload.delta_vs_compare.map_resource_errors ?? "NA"}`,
          `source_map_errors=${payload.delta_vs_compare.source_map_errors ?? "NA"}`,
          `blocking_console_errors=${payload.delta_vs_compare.blocking_console_errors ?? "NA"}`,
          `blocking_page_errors=${payload.delta_vs_compare.blocking_page_errors ?? "NA"}`,
          `page_errors=${payload.delta_vs_compare.page_errors ?? "NA"}`
        ].join(" ")
      );
    }
    console.log(
      [
        "PROD_GPS_SCREENSHOTS",
        `gps=${marks.after_gps_screenshot?.path || "NA"}`,
        `recenter=${marks.after_recenter_screenshot?.path || "NA"}`,
        `hover=${marks.hover_screenshot?.path || "NA"}`,
        `zoom_in=${marks.zoom_in?.screenshot?.path || "NA"}`,
        `zoom_out=${marks.zoom_out?.screenshot?.path || "NA"}`
      ].join(" ")
    );
    console.log(`PROD_GPS_REPORT=${rel(outPath)}`);
  }
  if (!payload.ok) {
    console.log(`NEW_MAP_GPS_FLOW_FAIL failures=${failures.join(" | ") || "unknown"}`);
    process.exitCode = 1;
  }
  if (gateMode && gateFailures.length) {
    process.exitCode = 1;
  }
}

await run();

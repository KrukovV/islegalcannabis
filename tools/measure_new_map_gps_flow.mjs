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
const browserName = process.env.NEW_MAP_GPS_BROWSER || "chromium";
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const latitude = Number(process.env.NEW_MAP_GPS_LAT || 50.0755);
const longitude = Number(process.env.NEW_MAP_GPS_LNG || 14.4378);
const timeoutMs = Number(process.env.NEW_MAP_GPS_TIMEOUT_MS || 60000);
const comparePath = process.env.NEW_MAP_GPS_COMPARE || "";

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

function distanceDegrees(state) {
  if (!state || typeof state.lng !== "number" || typeof state.lat !== "number") return null;
  const lngDelta = Math.abs(state.lng - longitude);
  const latDelta = Math.abs(state.lat - latitude);
  return Math.round(Math.sqrt((lngDelta * lngDelta) + (latDelta * latDelta)) * 10000) / 10000;
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

async function waitForLabels(page, pattern, minLabels, timeout = 15000) {
  const startedAt = Date.now();
  let lastCount = await countLabels(page, pattern);
  while (Date.now() - startedAt < timeout) {
    if (lastCount >= minLabels) return lastCount;
    await page.waitForTimeout(250);
    lastCount = await countLabels(page, pattern);
  }
  return lastCount;
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
  const contextOptions = {
    geolocation: { latitude, longitude },
    permissions: ["geolocation"]
  };
  const context = await browser.newContext(contextOptions);
  const seed = { enabled: false, status: null, cookie_names: [] };
  if (secret) {
    const seedResponse = await context.request.get(url, {
      headers: buildVercelBypassHeaders(secret, "samesitenone"),
      maxRedirects: 5,
      timeout: timeoutMs
    });
    seed.enabled = true;
    seed.status = seedResponse.status();
    seed.cookie_names = (await context.cookies(url)).map((cookie) => cookie.name);
  }
  await context.grantPermissions(["geolocation"], { origin: parsed.origin }).catch(() => undefined);

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 240));
  });
  page.on("pageerror", (error) => pageErrors.push(compactError(error)));
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
    const zoomInCityLabels = await waitForLabels(page, "place_city|place_town|place_villages|place_hamlet|place_suburbs?", 3);
    marks.zoom_in = {
      state: await getMapState(page),
      country_labels: await countLabels(page, "country|admin_0|place_country"),
      city_labels: zoomInCityLabels,
      rendered_countries: await countRenderedCountries(page),
      screenshot: await screenshot(page, "zoom-in")
    };

    await page.evaluate(() => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      map?.jumpTo?.({ center: [10, 30], zoom: 1.7 });
    });
    const zoomOutCountryLabels = await waitForLabels(page, "country|admin_0|place_country", 2, 8000);
    marks.zoom_out = {
      state: await getMapState(page),
      country_labels: zoomOutCountryLabels,
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
    zoom_out_city_labels: marks.zoom_out?.city_labels ?? null,
    zoom_out_rendered_countries: marks.zoom_out?.rendered_countries ?? null,
    console_errors: consoleErrors.length,
    page_errors: pageErrors.length
  };

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
    seed,
    marks,
    requests: requests.slice(-120),
    console_errors: consoleErrors,
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
      zoom_out_city_labels: delta(metric.zoom_out_city_labels, before.metric?.zoom_out_city_labels),
      zoom_out_rendered_countries: delta(metric.zoom_out_rendered_countries, before.metric?.zoom_out_rendered_countries),
      console_errors: delta(metric.console_errors, before.metric?.console_errors),
      page_errors: delta(metric.page_errors, before.metric?.page_errors)
    };
  }

  const outPath = path.join(outDir, `${label}.${browserName}.json`);
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n");

  console.log(
    `NEW_MAP_GPS_FLOW ok=${payload.ok ? 1 : 0} label=${label} marker_ms=${metric.gps_marker_latency_ms ?? "NA"} center_ms=${metric.gps_center_latency_ms ?? "NA"} recenter_ms=${metric.gps_recenter_latency_ms ?? "NA"} persisted_ms=${metric.persisted_marker_latency_ms ?? "NA"} city_labels=${metric.zoom_in_city_labels ?? "NA"} report=${rel(outPath)}`
  );
  if (!payload.ok) {
    console.log(`NEW_MAP_GPS_FLOW_FAIL failures=${failures.join(" | ") || "unknown"}`);
    process.exitCode = 1;
  }
}

await run();

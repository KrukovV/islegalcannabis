import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import {
  buildVercelBypassSeedRequest,
  redactVercelBypassSecret
} from "./vercel_bypass.mjs";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const playwright = require(require.resolve("playwright", {
  paths: [path.join(repoRoot, "apps/web")]
}));

const url = process.env.NEW_MAP_JS_PERF_URL || "https://www.islegal.info/new-map";
const label = process.env.NEW_MAP_JS_PERF_LABEL || "prod-js-city";
const reportsDir = process.env.NEW_MAP_JS_PERF_OUT_DIR
  ? path.resolve(process.env.NEW_MAP_JS_PERF_OUT_DIR)
  : path.join(repoRoot, "Reports", "new-map-js-city");
const browserName = process.env.NEW_MAP_JS_PERF_BROWSER || "chromium";
const settleMs = Number(process.env.NEW_MAP_JS_PERF_SETTLE_MS || 2500);
const comparePath = process.env.NEW_MAP_JS_PERF_COMPARE || "";
const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const vercelBypassCookieMode = process.env.VERCEL_BYPASS_COOKIE_MODE || "samesitenone";
const cityLng = Number(process.env.NEW_MAP_CITY_LNG || 2.3522);
const cityLat = Number(process.env.NEW_MAP_CITY_LAT || 48.8566);
const cityTargetZoom = Number(process.env.NEW_MAP_CITY_ZOOM || 8.2);
const cityMinLabels = Number(process.env.NEW_MAP_CITY_MIN_LABELS || 3);
const cityTimeoutMs = Number(process.env.NEW_MAP_CITY_TIMEOUT_MS || 15000);

function kib(bytes) {
  return Math.round((Number(bytes || 0) / 1024) * 10) / 10;
}

function safeUrlName(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(rawUrl || "");
  }
}

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(rawUrl || "");
  }
}

function compactUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(rawUrl || "");
  }
}

function isFirstPartyChunk(rawUrl, pageOrigin) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.origin === pageOrigin && /\/_next\/static\/chunks\/.+\.js$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function sum(items, key) {
  return items.reduce((total, item) => total + Math.round(Number(item[key] || 0)), 0);
}

function byteLength(text) {
  return Buffer.byteLength(String(text || ""), "utf8");
}

function mergeRanges(ranges) {
  const sorted = ranges
    .filter((range) => Number(range.endOffset) > Number(range.startOffset))
    .map((range) => ({
      start: Number(range.startOffset),
      end: Number(range.endOffset)
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (!last || range.start > last.end) {
      merged.push({ ...range });
      continue;
    }
    last.end = Math.max(last.end, range.end);
  }
  return merged.reduce((total, range) => total + range.end - range.start, 0);
}

function detectLegacySignals(source) {
  const text = String(source || "");
  const signals = [
    ["array_at_polyfill", /Array\.prototype\.at\s*\|\||"at",\s*function\(/],
    ["array_flat_polyfill", /Array\.prototype\.flat\s*\|\||"flat",\s*function\(/],
    ["array_flat_map_polyfill", /Array\.prototype\.flatMap\s*\|\||"flatMap",\s*function\(/],
    ["object_from_entries_polyfill", /Object\.fromEntries\s*\|\||"fromEntries",\s*function\(/],
    ["object_has_own_polyfill", /Object\.hasOwn\s*\|\||"hasOwn",\s*function\(/],
    ["string_trim_end_polyfill", /String\.prototype\.trimEnd\s*\|\||"trimEnd",\s*function\(/],
    ["string_trim_start_polyfill", /String\.prototype\.trimStart\s*\|\||"trimStart",\s*function\(/]
  ];
  return signals.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function buildResourceIndex(resources) {
  const byUrl = new Map();
  const byPath = new Map();
  for (const entry of resources) {
    const normalized = normalizeUrl(entry.name);
    byUrl.set(normalized, entry);
    try {
      const parsed = new URL(entry.name);
      byPath.set(parsed.pathname, entry);
    } catch {
      // ignored
    }
  }
  return { byUrl, byPath };
}

function resourceForScript(resourceIndex, rawUrl) {
  const normalized = normalizeUrl(rawUrl);
  const exact = resourceIndex.byUrl.get(normalized);
  if (exact) return exact;
  try {
    const parsed = new URL(rawUrl);
    return resourceIndex.byPath.get(parsed.pathname) || null;
  } catch {
    return null;
  }
}

async function collectCoverage(client, pageOrigin, resources) {
  const resourceIndex = buildResourceIndex(resources);
  const coverage = await client.send("Profiler.takePreciseCoverage");
  const firstPartyChunks = [];
  const legacyChunks = [];
  let totalScriptSourceBytes = 0;
  let usedScriptSourceBytes = 0;
  let firstPartySourceBytes = 0;
  let firstPartyUsedBytes = 0;
  let firstPartyTransferBytes = 0;
  let firstPartyUnusedTransferEstimate = 0;

  for (const entry of coverage.result || []) {
    const scriptUrl = String(entry.url || "");
    if (!scriptUrl) continue;
    const isFirstParty = isFirstPartyChunk(scriptUrl, pageOrigin);
    if (!isFirstParty && !/\.js(?:\?|$)/.test(scriptUrl)) continue;

    let source = "";
    try {
      const result = await client.send("Debugger.getScriptSource", { scriptId: entry.scriptId });
      source = result.scriptSource || "";
    } catch {
      source = "";
    }
    const sourceBytes = source ? byteLength(source) : Number(entry?.functions?.[0]?.ranges?.[0]?.endOffset || 0);
    const ranges = [];
    for (const fn of entry.functions || []) {
      for (const range of fn.ranges || []) {
        if (Number(range.count || 0) > 0) {
          ranges.push(range);
        }
      }
    }
    const usedBytes = Math.min(sourceBytes, mergeRanges(ranges));
    const unusedBytes = Math.max(0, sourceBytes - usedBytes);
    totalScriptSourceBytes += sourceBytes;
    usedScriptSourceBytes += usedBytes;

    const resource = resourceForScript(resourceIndex, scriptUrl);
    const transferBytes = Math.round(Number(resource?.transferSize || 0));
    const encodedBytes = Math.round(Number(resource?.encodedBodySize || 0));
    const decodedBytes = Math.round(Number(resource?.decodedBodySize || 0));
    const unusedRatio = sourceBytes > 0 ? unusedBytes / sourceBytes : 0;
    const legacySignals = detectLegacySignals(source);

    if (legacySignals.length) {
      legacyChunks.push({
        url: compactUrl(scriptUrl),
        transfer_bytes: transferBytes,
        encoded_bytes: encodedBytes,
        source_bytes: sourceBytes,
        signals: legacySignals
      });
    }

    if (isFirstParty) {
      firstPartySourceBytes += sourceBytes;
      firstPartyUsedBytes += usedBytes;
      firstPartyTransferBytes += transferBytes;
      firstPartyUnusedTransferEstimate += transferBytes * unusedRatio;
      firstPartyChunks.push({
        url: compactUrl(scriptUrl),
        transfer_bytes: transferBytes,
        encoded_bytes: encodedBytes,
        decoded_bytes: decodedBytes,
        source_bytes: sourceBytes,
        used_bytes: usedBytes,
        unused_bytes: unusedBytes,
        unused_pct: sourceBytes ? Math.round(unusedRatio * 1000) / 10 : 0,
        estimated_unused_transfer_bytes: Math.round(transferBytes * unusedRatio),
        legacy_signals: legacySignals
      });
    }
  }

  firstPartyChunks.sort((a, b) => b.estimated_unused_transfer_bytes - a.estimated_unused_transfer_bytes);
  legacyChunks.sort((a, b) => b.transfer_bytes - a.transfer_bytes);

  const scriptResources = resources.filter((entry) => entry.initiatorType === "script");
  const firstPartyScriptResources = scriptResources.filter((entry) => {
    try {
      return new URL(entry.name).origin === pageOrigin;
    } catch {
      return false;
    }
  });

  return {
    script_transfer_bytes: sum(scriptResources, "transferSize"),
    first_party_script_transfer_bytes: sum(firstPartyScriptResources, "transferSize"),
    script_source_bytes: totalScriptSourceBytes,
    script_used_source_bytes: usedScriptSourceBytes,
    script_unused_source_bytes: Math.max(0, totalScriptSourceBytes - usedScriptSourceBytes),
    first_party_chunk_transfer_bytes: firstPartyTransferBytes,
    first_party_chunk_source_bytes: firstPartySourceBytes,
    first_party_chunk_used_source_bytes: firstPartyUsedBytes,
    first_party_chunk_unused_source_bytes: Math.max(0, firstPartySourceBytes - firstPartyUsedBytes),
    first_party_estimated_unused_transfer_bytes: Math.round(firstPartyUnusedTransferEstimate),
    first_party_chunk_unused_pct: firstPartySourceBytes
      ? Math.round(((firstPartySourceBytes - firstPartyUsedBytes) / firstPartySourceBytes) * 1000) / 10
      : 0,
    legacy_signal_count: legacyChunks.reduce((total, chunk) => total + chunk.signals.length, 0),
    legacy_chunk_count: legacyChunks.length,
    legacy_transfer_bytes: legacyChunks.reduce((total, chunk) => total + chunk.transfer_bytes, 0),
    top_unused_chunks: firstPartyChunks.slice(0, 12),
    legacy_chunks: legacyChunks.slice(0, 12)
  };
}

function summarizeResources(resources, pageOrigin) {
  const firstParty = resources.filter((entry) => {
    try {
      return new URL(entry.name).origin === pageOrigin;
    } catch {
      return false;
    }
  });
  const basemapTiles = resources.filter((entry) => entry.name.includes("/api/new-map/basemap-tile/"));
  return {
    total_transfer_bytes: sum(resources, "transferSize"),
    first_party_transfer_bytes: sum(firstParty, "transferSize"),
    basemap_tile_transfer_bytes: sum(basemapTiles, "transferSize"),
    basemap_tile_count: basemapTiles.length,
    top: [...resources]
      .sort((a, b) => Number(b.transferSize || 0) - Number(a.transferSize || 0))
      .slice(0, 15)
      .map((entry) => ({
        url: safeUrlName(entry.name),
        initiatorType: entry.initiatorType,
        transferSize: Math.round(entry.transferSize || 0),
        encodedBodySize: Math.round(entry.encodedBodySize || 0),
        decodedBodySize: Math.round(entry.decodedBodySize || 0),
        duration: Math.round(entry.duration || 0)
      }))
  };
}

function buildDelta(current, previous) {
  const curInitial = current.initial_js || {};
  const prevInitial = previous.initial_js || {};
  const curCity = current.city_zoom || {};
  const prevCity = previous.city_zoom || {};
  const curSummary = current.resources || {};
  const prevSummary = previous.resources || {};
  return {
    first_party_script_transfer_bytes: (curInitial.first_party_script_transfer_bytes || 0) - (prevInitial.first_party_script_transfer_bytes || 0),
    first_party_estimated_unused_transfer_bytes:
      (curInitial.first_party_estimated_unused_transfer_bytes || 0) - (prevInitial.first_party_estimated_unused_transfer_bytes || 0),
    first_party_unused_source_bytes:
      (curInitial.first_party_chunk_unused_source_bytes || 0) - (prevInitial.first_party_chunk_unused_source_bytes || 0),
    legacy_transfer_bytes: (curInitial.legacy_transfer_bytes || 0) - (prevInitial.legacy_transfer_bytes || 0),
    legacy_signal_count: (curInitial.legacy_signal_count || 0) - (prevInitial.legacy_signal_count || 0),
    city_label_ms: (curCity.elapsed_ms || 0) - (prevCity.elapsed_ms || 0),
    city_tile_transfer_bytes:
      (curCity.tile_transfer_bytes || 0) - (prevCity.tile_transfer_bytes || 0),
    total_transfer_bytes: (curSummary.total_transfer_bytes || 0) - (prevSummary.total_transfer_bytes || 0)
  };
}

async function measureCityZoom(page) {
  return page.evaluate(({ lng, lat, zoom, minLabels, timeoutMs }) => {
    const host = window;
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) {
      return {
        ok: false,
        reason: "MAP_MISSING",
        elapsed_ms: null,
        label_count: 0,
        tile_count: 0,
        tile_transfer_bytes: 0,
        tile_decoded_bytes: 0,
        layers: []
      };
    }
    const styleLayers = (map.getStyle()?.layers || [])
      .filter((layer) => layer.type === "symbol" && /(place_city|place_town|place_villages|place_hamlet|place_suburbs?)/i.test(layer.id))
      .map((layer) => layer.id);
    const rawLayers = host.__NEW_MAP_DEBUG__?.labelGroups?.city?.length
      ? host.__NEW_MAP_DEBUG__.labelGroups.city
      : styleLayers;
    const layers = rawLayers.filter((layerId) => Boolean(map.getLayer(layerId)));
    const start = performance.now();
    const resourceStart = performance.getEntriesByType("resource").length;

    function countLabels() {
      if (!layers.length) return 0;
      try {
        const features = map.queryRenderedFeatures(undefined, { layers });
        const unique = new Set();
        for (const feature of features) {
          const props = feature.properties || {};
          const name =
            props.name_en ||
            props.name ||
            props.name_de ||
            props.name_fr ||
            props.name_es ||
            feature.id ||
            "";
          unique.add(`${feature.layer?.id || ""}:${String(name)}`);
        }
        return unique.size || features.length;
      } catch {
        return 0;
      }
    }

    function tileSummary() {
      const resources = performance.getEntriesByType("resource").slice(resourceStart).filter((entry) => {
        return String(entry.name || "").includes("/api/new-map/basemap-tile/");
      });
      return {
        tile_count: resources.length,
        tile_transfer_bytes: resources.reduce((total, entry) => total + Math.round(entry.transferSize || 0), 0),
        tile_decoded_bytes: resources.reduce((total, entry) => total + Math.round(entry.decodedBodySize || 0), 0),
        top_tiles: resources
          .sort((a, b) => Number(b.duration || 0) - Number(a.duration || 0))
          .slice(0, 10)
          .map((entry) => ({
            url: String(entry.name || "").replace(/^https?:\/\/[^/]+/, ""),
            duration_ms: Math.round(entry.duration || 0),
            transfer_bytes: Math.round(entry.transferSize || 0),
            decoded_bytes: Math.round(entry.decodedBodySize || 0)
          }))
      };
    }

    return new Promise((resolve) => {
      let done = false;
      let timeout = 0;
      const cleanup = () => {
        map.off("render", tick);
        map.off("idle", tick);
        window.clearTimeout(timeout);
      };
      const finish = (reason) => {
        if (done) return;
        done = true;
        cleanup();
        const elapsed = Math.round(performance.now() - start);
        const count = countLabels();
        const tiles = tileSummary();
        resolve({
          ok: count >= minLabels,
          reason,
          elapsed_ms: elapsed,
          label_count: count,
          center: [lng, lat],
          zoom,
          layers,
          ...tiles
        });
      };
      function tick() {
        if (countLabels() >= minLabels) {
          finish("LABELS_VISIBLE");
        }
      }

      map.on("render", tick);
      map.on("idle", tick);
      timeout = window.setTimeout(() => finish("TIMEOUT"), timeoutMs);
      map.jumpTo({ center: [lng, lat], zoom });
      requestAnimationFrame(tick);
    });
  }, {
    lng: cityLng,
    lat: cityLat,
    zoom: cityTargetZoom,
    minLabels: cityMinLabels,
    timeoutMs: cityTimeoutMs
  });
}

if (browserName !== "chromium") {
  throw new Error("NEW_MAP_JS_PERF_BROWSER must be chromium because JS coverage uses CDP");
}

await fs.mkdir(reportsDir, { recursive: true });

const slot = await acquireProjectProcessSlot(`playwright:${browserName}:new-map-js-city-perf`);
let browser;
let context;
const startedAt = Date.now();
let bypassSeedStatus = null;
let bypassSeed;
let initialMeasured;
let initialJs;
let cityZoom;
let finalMeasured;
let cityJs;
const initialScreenshot = path.join(reportsDir, `${label}.initial.${browserName}.png`);
const cityScreenshot = path.join(reportsDir, `${label}.city.${browserName}.png`);

try {
  browser = await playwright.chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
  });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  bypassSeed = buildVercelBypassSeedRequest(url, vercelBypass, {
    cookieMode: vercelBypassCookieMode
  });
  if (bypassSeed.enabled) {
    const seedResponse = await context.request.get(bypassSeed.url, {
      headers: bypassSeed.headers,
      maxRedirects: 5,
      timeout: 45000
    });
    bypassSeedStatus = seedResponse.status();
  }

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Debugger.enable");
  await client.send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });

  await page.goto(bypassSeed.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="new-map-surface"][data-map-ready="1"]', { timeout: 45000 });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 15000 });
  await page.waitForFunction(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    return Boolean(map && map.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length > 100);
  }, { timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(settleMs);

  initialMeasured = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      duration: entry.duration,
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0,
      decodedBodySize: entry.decodedBodySize || 0
    }));
    const host = window;
    return {
      href: window.location.href,
      origin: window.location.origin,
      title: document.title,
      accessBlock: /Security Checkpoint|Could not verify your browser|Code 21|Не удалось проверить/i.test(document.body?.innerText || ""),
      resources,
      renderedCountries: host.__NEW_MAP_DEBUG__?.map?.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length || 0
    };
  });
  initialJs = await collectCoverage(client, initialMeasured.origin, initialMeasured.resources);
  await client.send("Profiler.stopPreciseCoverage").catch(() => undefined);
  await page.screenshot({ path: initialScreenshot, fullPage: false });

  await client.send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
  cityZoom = await measureCityZoom(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: cityScreenshot, fullPage: false });

  finalMeasured = await page.evaluate(() => {
    return {
      resources: performance.getEntriesByType("resource").map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        startTime: entry.startTime,
        duration: entry.duration,
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0
      }))
    };
  });
  cityJs = await collectCoverage(client, initialMeasured.origin, finalMeasured.resources);
  await client.send("Profiler.stopPreciseCoverage").catch(() => undefined);
} finally {
  if (context) {
    await context.close().catch(() => undefined);
  }
  if (browser) {
    await browser.close().catch(() => undefined);
  }
  slot.release();
}

const resources = summarizeResources(finalMeasured.resources, initialMeasured.origin);
const payload = {
  generated_at: new Date().toISOString(),
  label,
  browser: browserName,
  url: redactVercelBypassSecret(bypassSeed.url, vercelBypass),
  title: initialMeasured.title,
  access_block: initialMeasured.accessBlock,
  elapsed_ms: Date.now() - startedAt,
  rendered_countries: initialMeasured.renderedCountries,
  bypass_seed: {
    enabled: bypassSeed.enabled,
    status: bypassSeedStatus,
    cookie_mode: bypassSeed.cookieMode,
    header_names: Object.keys(bypassSeed.headers)
  },
  resources,
  initial_js: initialJs,
  city_js: cityJs,
  city_zoom: cityZoom,
  screenshots: {
    initial: path.relative(repoRoot, initialScreenshot),
    city: path.relative(repoRoot, cityScreenshot)
  }
};

let delta = null;
if (comparePath) {
  const previous = JSON.parse(await fs.readFile(path.resolve(comparePath), "utf8"));
  delta = buildDelta(payload, previous);
  payload.delta = delta;
}

const reportPath = path.join(reportsDir, `${label}.${browserName}.json`);
await fs.writeFile(reportPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

console.log([
  `NEW_MAP_JS_CITY label=${label}`,
  `url=${redactVercelBypassSecret(safeUrlName(bypassSeed.url), vercelBypass)}`,
  `script_kib=${kib(initialJs.script_transfer_bytes)}`,
  `first_party_script_kib=${kib(initialJs.first_party_script_transfer_bytes)}`,
  `unused_est_kib=${kib(initialJs.first_party_estimated_unused_transfer_bytes)}`,
  `unused_source_kib=${kib(initialJs.first_party_chunk_unused_source_bytes)}`,
  `unused_pct=${initialJs.first_party_chunk_unused_pct}`,
  `legacy_kib=${kib(initialJs.legacy_transfer_bytes)}`,
  `legacy_signals=${initialJs.legacy_signal_count}`,
  `city_label_ms=${cityZoom.elapsed_ms ?? "-"}`,
  `city_labels=${cityZoom.label_count ?? 0}`,
  `city_tile_kib=${kib(cityZoom.tile_transfer_bytes || 0)}`,
  `city_tiles=${cityZoom.tile_count || 0}`,
  `rendered_countries=${initialMeasured.renderedCountries}`,
  `initial_screenshot=${payload.screenshots.initial}`,
  `city_screenshot=${payload.screenshots.city}`,
  `report=${path.relative(repoRoot, reportPath)}`
].join(" "));

if (delta) {
  console.log([
    `NEW_MAP_JS_CITY_DELTA label=${label}`,
    `first_party_script_kib=${kib(delta.first_party_script_transfer_bytes)}`,
    `unused_est_kib=${kib(delta.first_party_estimated_unused_transfer_bytes)}`,
    `unused_source_kib=${kib(delta.first_party_unused_source_bytes)}`,
    `legacy_kib=${kib(delta.legacy_transfer_bytes)}`,
    `legacy_signals=${delta.legacy_signal_count}`,
    `city_label_ms=${delta.city_label_ms}`,
    `city_tile_kib=${kib(delta.city_tile_transfer_bytes)}`,
    `total_kib=${kib(delta.total_transfer_bytes)}`
  ].join(" "));
}

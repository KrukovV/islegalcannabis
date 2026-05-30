import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import {
  buildVercelBypassSeedRequest,
  redactVercelBypassSecret
} from "./vercel_bypass.mjs";

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const playwright = require(require.resolve("playwright", {
  paths: [path.join(repoRoot, "apps/web")]
}));

const url = process.env.NEW_MAP_PERF_URL || "https://www.islegal.info/new-map";
const label = process.env.NEW_MAP_PERF_LABEL || "prod";
const reportsDir = process.env.NEW_MAP_PERF_OUT_DIR
  ? path.resolve(process.env.NEW_MAP_PERF_OUT_DIR)
  : path.join(repoRoot, "Reports", "new-map-payload");
const browserName = process.env.NEW_MAP_PERF_BROWSER || "chromium";
const settleMs = Number(process.env.NEW_MAP_PERF_SETTLE_MS || 2500);
const comparePath = process.env.NEW_MAP_PERF_COMPARE || "";
const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const vercelBypassCookieMode = process.env.VERCEL_BYPASS_COOKIE_MODE || "samesitenone";

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

function summarizeResources(resources, pageOrigin) {
  const firstParty = resources.filter((entry) => {
    try {
      return new URL(entry.name).origin === pageOrigin;
    } catch {
      return false;
    }
  });
  const scriptResources = resources.filter((entry) => entry.initiatorType === "script");
  const countries = resources
    .filter((entry) => entry.name.includes("/static/countries/countries."))
    .at(-1) || null;
  const usStates = resources
    .filter((entry) => entry.name.includes("/api/new-map/us-states"))
    .at(-1) || null;
  const cardIndex = resources
    .filter((entry) => entry.name.includes("/api/new-map/card-index"))
    .at(-1) || null;

  const sum = (items, key) => items.reduce((total, entry) => total + Math.round(Number(entry[key] || 0)), 0);
  const top = [...resources]
    .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
    .slice(0, 15)
    .map((entry) => ({
      url: safeUrlName(entry.name),
      initiatorType: entry.initiatorType,
      transferSize: Math.round(entry.transferSize || 0),
      encodedBodySize: Math.round(entry.encodedBodySize || 0),
      decodedBodySize: Math.round(entry.decodedBodySize || 0),
      duration: Math.round(entry.duration || 0)
    }));

  return {
    total_transfer_bytes: sum(resources, "transferSize"),
    total_decoded_bytes: sum(resources, "decodedBodySize"),
    first_party_transfer_bytes: sum(firstParty, "transferSize"),
    first_party_decoded_bytes: sum(firstParty, "decodedBodySize"),
    script_transfer_bytes: sum(scriptResources, "transferSize"),
    script_decoded_bytes: sum(scriptResources, "decodedBodySize"),
    countries: countries ? {
      url: safeUrlName(countries.name),
      transfer_bytes: Math.round(countries.transferSize || 0),
      encoded_bytes: Math.round(countries.encodedBodySize || 0),
      decoded_bytes: Math.round(countries.decodedBodySize || 0),
      duration_ms: Math.round(countries.duration || 0)
    } : null,
    us_states: usStates ? {
      transfer_bytes: Math.round(usStates.transferSize || 0),
      decoded_bytes: Math.round(usStates.decodedBodySize || 0),
      duration_ms: Math.round(usStates.duration || 0)
    } : null,
    card_index: cardIndex ? {
      transfer_bytes: Math.round(cardIndex.transferSize || 0),
      decoded_bytes: Math.round(cardIndex.decodedBodySize || 0),
      duration_ms: Math.round(cardIndex.duration || 0)
    } : null,
    top
  };
}

function summarizeLongTasks(longTasks) {
  const durations = longTasks.map((entry) => Math.round(Number(entry.duration || 0)));
  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    count: durations.length,
    total_ms: total,
    max_ms: durations.length ? Math.max(...durations) : 0,
    over_200_count: durations.filter((value) => value >= 200).length,
    top: [...longTasks]
      .sort((a, b) => Number(b.duration || 0) - Number(a.duration || 0))
      .slice(0, 20)
      .map((entry) => ({
        start_ms: Math.round(Number(entry.startTime || 0)),
        duration_ms: Math.round(Number(entry.duration || 0)),
        name: String(entry.name || "self")
      }))
  };
}

function summarizeTrace(trace) {
  const t0 = Number(trace?.t0 || 0);
  const marks = trace?.marks || {};
  const get = (key) => typeof marks[key] === "number" ? Math.round(marks[key] - t0) : null;
  return {
    T2_map_constructor_ms: get("NM_T2_MAP_CONSTRUCTOR_START"),
    T4_styledata_ms: get("NM_T4_STYLEDATA_FIRST"),
    T5_basemap_ready_ms: get("NM_T5_SOURCEDATA_BASEMAP_READY"),
    T6_countries_ready_ms: get("NM_T6_COUNTRIES_SOURCE_READY"),
    T7_first_fill_ms: get("NM_T7_FIRST_FILL_RENDERED"),
    T8_idle_ms: get("NM_T8_IDLE_FIRST")
  };
}

function buildDelta(current, previous) {
  const currentSummary = current.summary || {};
  const previousSummary = previous.summary || {};
  const currentLongTasks = current.long_tasks || {};
  const previousLongTasks = previous.long_tasks || {};
  return {
    total_transfer_bytes: currentSummary.total_transfer_bytes - previousSummary.total_transfer_bytes,
    first_party_transfer_bytes: currentSummary.first_party_transfer_bytes - previousSummary.first_party_transfer_bytes,
    countries_transfer_bytes: (currentSummary.countries?.transfer_bytes || 0) - (previousSummary.countries?.transfer_bytes || 0),
    script_transfer_bytes: currentSummary.script_transfer_bytes - previousSummary.script_transfer_bytes,
    long_task_count: currentLongTasks.count - previousLongTasks.count,
    long_task_total_ms: currentLongTasks.total_ms - previousLongTasks.total_ms,
    long_task_max_ms: currentLongTasks.max_ms - previousLongTasks.max_ms,
    first_fill_ms: (current.trace_summary?.T7_first_fill_ms || 0) - (previous.trace_summary?.T7_first_fill_ms || 0)
  };
}

await fs.mkdir(reportsDir, { recursive: true });

const browser = await playwright[browserName].launch({
  headless: true,
  args: browserName === "chromium"
    ? ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
    : undefined
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
});
const bypassSeed = buildVercelBypassSeedRequest(url, vercelBypass, {
  cookieMode: vercelBypassCookieMode
});
let bypassSeedStatus = null;
if (bypassSeed.enabled) {
  const seedResponse = await context.request.get(bypassSeed.url, {
    headers: bypassSeed.headers,
    maxRedirects: 5,
    timeout: 45000
  });
  bypassSeedStatus = seedResponse.status();
}

const page = await context.newPage();
await page.addInitScript(() => {
  const host = window;
  host.__ILC_LONG_TASKS__ = [];
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        host.__ILC_LONG_TASKS__.push({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration
        });
      }
    });
    observer.observe({ type: "longtask", buffered: true });
    host.__ILC_LONG_TASK_OBSERVER__ = observer;
  } catch {
    host.__ILC_LONG_TASK_UNSUPPORTED__ = true;
  }
});

const responseHeaders = [];
page.on("response", async (response) => {
  const reqUrl = response.url();
  if (!reqUrl.includes("/static/countries/countries.") && !reqUrl.includes("/api/new-map/us-states")) return;
  const headers = await response.allHeaders().catch(() => ({}));
  responseHeaders.push({
    url: safeUrlName(reqUrl),
    status: response.status(),
    content_encoding: headers["content-encoding"] || "",
    content_length: headers["content-length"] || "",
    cache_control: headers["cache-control"] || "",
    x_countries_bytes: headers["x-new-map-countries-bytes"] || "",
    x_countries_encoding: headers["x-new-map-countries-encoding"] || ""
  });
});

const startedAt = Date.now();
await page.goto(bypassSeed.url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('[data-testid="new-map-surface"][data-map-ready="1"]', { timeout: 45000 });
await page.waitForSelector(".maplibregl-canvas", { timeout: 15000 });
await page.waitForFunction(() => {
  const map = window.__NEW_MAP_DEBUG__?.map;
  return Boolean(map && map.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length > 100);
}, { timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
await page.waitForTimeout(settleMs);

const screenshot = path.join(reportsDir, `${label}.${browserName}.png`);
await page.screenshot({ path: screenshot, fullPage: false });

const measured = await page.evaluate(() => {
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
    longTasks: host.__ILC_LONG_TASKS__ || [],
    longTaskUnsupported: Boolean(host.__ILC_LONG_TASK_UNSUPPORTED__),
    trace: host.__NEW_MAP_TRACE__ || null,
    renderedCountries: host.__NEW_MAP_DEBUG__?.map?.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length || 0
  };
});

await context.close();
await browser.close();

const summary = summarizeResources(measured.resources, measured.origin);
const longTasks = summarizeLongTasks(measured.longTasks);
const traceSummary = summarizeTrace(measured.trace);
const payload = {
  generated_at: new Date().toISOString(),
  label,
  browser: browserName,
  url: redactVercelBypassSecret(bypassSeed.url, vercelBypass),
  title: measured.title,
  access_block: measured.accessBlock,
  elapsed_ms: Date.now() - startedAt,
  rendered_countries: measured.renderedCountries,
  bypass_seed: {
    enabled: bypassSeed.enabled,
    status: bypassSeedStatus,
    cookie_mode: bypassSeed.cookieMode,
    header_names: Object.keys(bypassSeed.headers)
  },
  summary,
  long_tasks: longTasks,
  trace_summary: traceSummary,
  response_headers: responseHeaders,
  screenshot: path.relative(repoRoot, screenshot)
};

if (vercelBypass && payload.url) {
  payload.url = redactVercelBypassSecret(payload.url, vercelBypass);
}

let delta = null;
if (comparePath) {
  const previous = JSON.parse(await fs.readFile(path.resolve(comparePath), "utf8"));
  delta = buildDelta(payload, previous);
  payload.delta = delta;
}

const reportPath = path.join(reportsDir, `${label}.${browserName}.json`);
await fs.writeFile(reportPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

const countriesEncoding = responseHeaders.find((entry) => entry.url.includes("/static/countries/countries."))?.content_encoding || "-";
console.log([
  `NEW_MAP_PAYLOAD label=${label}`,
  `url=${redactVercelBypassSecret(safeUrlName(bypassSeed.url), vercelBypass)}`,
  `total_kib=${kib(summary.total_transfer_bytes)}`,
  `first_party_kib=${kib(summary.first_party_transfer_bytes)}`,
  `script_kib=${kib(summary.script_transfer_bytes)}`,
  `countries_kib=${kib(summary.countries?.transfer_bytes || 0)}`,
  `countries_decoded_kib=${kib(summary.countries?.decoded_bytes || 0)}`,
  `countries_encoding=${countriesEncoding}`,
  `us_states_kib=${kib(summary.us_states?.transfer_bytes || 0)}`,
  `card_index_kib=${kib(summary.card_index?.transfer_bytes || 0)}`,
  `long_tasks=${longTasks.count}`,
  `long_total_ms=${longTasks.total_ms}`,
  `long_max_ms=${longTasks.max_ms}`,
  `first_fill_ms=${traceSummary.T7_first_fill_ms ?? "-"}`,
  `screenshot=${payload.screenshot}`,
  `report=${path.relative(repoRoot, reportPath)}`
].join(" "));

if (delta) {
  console.log([
    `NEW_MAP_PAYLOAD_DELTA label=${label}`,
    `total_kib=${kib(delta.total_transfer_bytes)}`,
    `first_party_kib=${kib(delta.first_party_transfer_bytes)}`,
    `countries_kib=${kib(delta.countries_transfer_bytes)}`,
    `script_kib=${kib(delta.script_transfer_bytes)}`,
    `long_tasks=${delta.long_task_count}`,
    `long_total_ms=${delta.long_task_total_ms}`,
    `long_max_ms=${delta.long_task_max_ms}`,
    `first_fill_ms=${delta.first_fill_ms}`
  ].join(" "));
}

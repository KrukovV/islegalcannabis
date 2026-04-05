import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const playwright = require(require.resolve("playwright", {
  paths: [path.join(repoRoot, "apps/web")]
}));

const reportsDir = path.join(repoRoot, "Reports");
const localUrl = process.env.NEW_MAP_LOCAL_URL || "http://127.0.0.1:4010/new-map";
const prodUrl = process.env.NEW_MAP_PROD_URL || "https://islegal.info/new-map";

async function measure(browserName, url, label) {
  const browser = await playwright[browserName].launch({ headless: true });
  const page = await browser.newPage();
  const requests = [];
  const responses = [];

  page.on("request", (request) => {
    const reqUrl = request.url();
    if (!reqUrl.includes("/api/new-map/basemap-style") && !reqUrl.includes("/api/new-map/countries")) return;
    requests.push({
      url: reqUrl,
      ts: Date.now(),
      method: request.method()
    });
  });

  page.on("response", async (response) => {
    const reqUrl = response.url();
    if (!reqUrl.includes("/api/new-map/basemap-style") && !reqUrl.includes("/api/new-map/countries")) return;
    const headers = await response.allHeaders();
    responses.push({
      url: reqUrl,
      ts: Date.now(),
      status: response.status(),
      cacheControl: headers["cache-control"] || "",
      contentLength: headers["content-length"] || "",
      serverTiming: headers["server-timing"] || "",
      age: headers.age || "",
      xVercelCache: headers["x-vercel-cache"] || ""
    });
  });

  const start = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 10000 });
  await page.waitForTimeout(1200);

  const trace = await page.evaluate(() => {
    const host = window;
    return {
      href: window.location.href,
      trace: host.__NEW_MAP_TRACE__ || null,
      firstVisualReady: Boolean(host.__NEW_MAP_FIRST_VISUAL_READY__),
      badge: document.querySelector("[data-testid='runtime-parity-badge']")?.getAttribute("data-runtime-actual") || null
    };
  });

  const firstRequestTs = requests.length ? Math.min(...requests.map((r) => r.ts)) : null;
  const metrics = {
    navStartDateMs: start,
    requestStartMs: firstRequestTs ? firstRequestTs - start : null,
    canvasMs: Date.now() - start
  };

  const output = {
    label,
    browser: browserName,
    url,
    metrics,
    requests: requests.map((entry) => ({
      ...entry,
      deltaMs: entry.ts - start
    })),
    responses: responses.map((entry) => ({
      ...entry,
      deltaMs: entry.ts - start
    })),
    startupTrace: trace
  };

  const filePath = path.join(reportsDir, `new-map-startup.${label}.${browserName}.json`);
  await fs.writeFile(filePath, JSON.stringify(output, null, 2));
  await browser.close();
  return output;
}

function describeTrace(output) {
  const trace = output.startupTrace?.trace || {};
  const t0 = trace.t0 || 0;
  const marks = trace.marks || {};
  const get = (name) => typeof marks[name] === "number" ? Math.round(marks[name] - t0) : null;
  return {
    requestStartMs: output.metrics.requestStartMs,
    canvasMs: output.metrics.canvasMs,
    T1: get("NM_T1_HEAD_PREFETCH_READY"),
    T2: get("NM_T2_MAP_CONSTRUCTOR_START"),
    T3: get("NM_T3_MAP_INSTANCE_READY"),
    T4: get("NM_T4_STYLEDATA_FIRST"),
    T5: get("NM_T5_SOURCEDATA_BASEMAP_READY"),
    T6: get("NM_T6_COUNTRIES_SOURCE_READY"),
    T7: get("NM_T7_FIRST_FILL_RENDERED"),
    T8: get("NM_T8_IDLE_FIRST"),
    T9: get("NM_T9_RUNTIME_BADGE_ACTUAL"),
    T10: get("NM_T10_GEO_DONE"),
    T11: get("NM_T11_AI_READY"),
    badge: output.startupTrace?.badge
  };
}

function buildDeltaMarkdown(results) {
  const before = {
    chromium: { request: 1417, fill: 2773 },
    webkit: { request: 1950, fill: 2778 }
  };
  const lines = ["# new-map startup delta", ""];
  for (const browser of ["chromium", "webkit"]) {
    const local = describeTrace(results[`local.${browser}`]);
    const prod = describeTrace(results[`prod.${browser}`]);
    lines.push(`## ${browser}`);
    lines.push(`- local requestStartMs: ${local.requestStartMs}`);
    lines.push(`- local firstFillMs: ${local.T7}`);
    lines.push(`- prod before requestStartMs: ${before[browser].request}`);
    lines.push(`- prod after requestStartMs: ${prod.requestStartMs}`);
    lines.push(`- prod delta requestStartMs: ${before[browser].request - (prod.requestStartMs ?? before[browser].request)}`);
    lines.push(`- prod before firstFillMs: ${before[browser].fill}`);
    lines.push(`- prod after firstFillMs: ${prod.T7}`);
    lines.push(`- prod delta firstFillMs: ${before[browser].fill - (prod.T7 ?? before[browser].fill)}`);
    lines.push("");
  }
  return lines.join("\n");
}

await fs.mkdir(reportsDir, { recursive: true });

const outputs = {};
for (const [label, url] of [["local", localUrl], ["prod", prodUrl]]) {
  for (const browser of ["chromium", "webkit"]) {
    outputs[`${label}.${browser}`] = await measure(browser, url, label);
  }
}

await fs.writeFile(
  path.join(reportsDir, "new-map-startup.delta.md"),
  buildDeltaMarkdown(outputs)
);

for (const [key, value] of Object.entries(outputs)) {
  const summary = describeTrace(value);
  console.log(`${key} ${JSON.stringify(summary)}`);
}

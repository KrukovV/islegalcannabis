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
const prodUrl = process.env.NEW_MAP_PROD_URL || "https://www.islegal.info/new-map";
const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

function isTrackedMapResource(reqUrl) {
  return (
    reqUrl.includes("/api/new-map/basemap-style") ||
    reqUrl.includes("/api/new-map/card-index") ||
    reqUrl.includes("/api/new-map/countries") ||
    reqUrl.includes("/static/countries/countries.")
  );
}

function withProdBypass(url) {
  if (!vercelBypass || !url.includes("islegal.info")) return url;
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("x-vercel-protection-bypass", vercelBypass);
  nextUrl.searchParams.set("x-vercel-set-bypass-cookie", "samesitenone");
  return nextUrl.toString();
}

async function measure(browserName, url, label) {
  const browser = await playwright[browserName].launch({
    headless: true,
    args: browserName === "chromium"
      ? ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
      : undefined
  });
  const context = await browser.newContext({
    extraHTTPHeaders: vercelBypass && url.includes("islegal.info")
      ? { "x-vercel-protection-bypass": vercelBypass }
      : undefined
  });
  const page = await context.newPage();
  const requests = [];
  const responses = [];

  page.on("request", (request) => {
    const reqUrl = request.url();
    if (!isTrackedMapResource(reqUrl)) return;
    requests.push({
      url: reqUrl,
      ts: Date.now(),
      method: request.method()
    });
  });

  page.on("response", async (response) => {
    const reqUrl = response.url();
    if (!isTrackedMapResource(reqUrl)) return;
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
  await page.goto(withProdBypass(url), { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-map-surface"][data-map-ready="1"]', { state: "attached", timeout: 30000 });
  await page.waitForSelector(".maplibregl-canvas", { state: "attached", timeout: 10000 });
  await page.waitForFunction(() => {
    const trace = window.__NEW_MAP_TRACE__ || {};
    const map = window.__NEW_MAP_DEBUG__?.map;
    if (typeof trace.marks?.NM_T7_FIRST_FILL_RENDERED !== "number" || !map) return false;
    return map.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length > 100;
  }, { timeout: 60000 });

  const trace = await page.evaluate(() => {
    const host = window;
    const countriesEntry = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/static/countries/countries."))
      .at(-1);
    return {
      href: window.location.href,
      trace: host.__NEW_MAP_TRACE__ || null,
      firstVisualReady: Boolean(host.__NEW_MAP_FIRST_VISUAL_READY__),
      countriesResource: countriesEntry ? {
        url: countriesEntry.name,
        transferSize: Math.round(countriesEntry.transferSize || 0),
        decodedBodySize: Math.round(countriesEntry.decodedBodySize || 0),
        duration: Math.round(countriesEntry.duration || 0)
      } : null,
      renderedCountries: host.__NEW_MAP_DEBUG__?.map?.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length || 0,
      badge: document.querySelector("[data-testid='runtime-parity-badge']")?.getAttribute("data-runtime-actual") || null
    };
  });
  await page.screenshot({
    path: path.join(reportsDir, `new-map-startup.${label}.${browserName}.png`),
    fullPage: false
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
  if (vercelBypass && output.startupTrace?.href) {
    output.startupTrace.href = output.startupTrace.href.replace(vercelBypass, "[redacted]");
  }

  const filePath = path.join(reportsDir, `new-map-startup.${label}.${browserName}.json`);
  await fs.writeFile(filePath, JSON.stringify(output, null, 2));
  await context.close();
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

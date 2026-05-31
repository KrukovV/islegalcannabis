import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const playwright = require(require.resolve("playwright", {
  paths: [path.join(repoRoot, "apps/web")]
}));

const url = process.env.NEW_MAP_NETWORK_TREE_URL || "https://www.islegal.info/new-map";
const label = process.env.NEW_MAP_NETWORK_TREE_LABEL || "prod";
const reportsDir = process.env.NEW_MAP_NETWORK_TREE_OUT_DIR
  ? path.resolve(process.env.NEW_MAP_NETWORK_TREE_OUT_DIR)
  : path.join(repoRoot, "Reports", "network-tree");
const browserName = process.env.NEW_MAP_NETWORK_TREE_BROWSER || "chromium";
const settleMs = Number(process.env.NEW_MAP_NETWORK_TREE_SETTLE_MS || 1000);
const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

function safeUrlName(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return String(rawUrl || "");
  }
}

function kib(bytes) {
  return Math.round((Number(bytes || 0) / 1024) * 10) / 10;
}

function summarize(entries, pattern) {
  return entries
    .filter((entry) => entry.name.includes(pattern))
    .map((entry) => ({
      url: safeUrlName(entry.name),
      initiatorType: entry.initiatorType,
      start_ms: Math.round(entry.startTime || 0),
      response_end_ms: Math.round(entry.responseEnd || 0),
      duration_ms: Math.round(entry.duration || 0),
      transfer_kib: kib(entry.transferSize || 0),
      decoded_kib: kib(entry.decodedBodySize || 0)
    }));
}

await fs.mkdir(reportsDir, { recursive: true });

const browser = await playwright[browserName].launch({
  headless: true,
  args: browserName === "chromium"
    ? ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
    : undefined
});
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  extraHTTPHeaders: vercelBypass
    ? { "x-vercel-protection-bypass": vercelBypass }
    : undefined
});

let page;
try {
  page = await context.newPage();
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize?.(1000);
  });
  const started = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="new-map-surface"]', { state: "attached", timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1",
    undefined,
    { timeout: 60000 }
  );
  await page.waitForTimeout(settleMs);

  const data = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: Math.round(entry.startTime || 0),
      responseEnd: Math.round(entry.responseEnd || 0),
      duration: Math.round(entry.duration || 0),
      transferSize: Math.round(entry.transferSize || 0),
      encodedBodySize: Math.round(entry.encodedBodySize || 0),
      decodedBodySize: Math.round(entry.decodedBodySize || 0)
    }));
    const nav = performance.getEntriesByType("navigation")[0];
    const critical = resources.filter((entry) =>
      (entry.initiatorType === "link" && entry.name.endsWith(".css") && entry.startTime < 1000) ||
      entry.name.includes("/api/new-map/basemap-style") ||
      entry.name.includes("/api/new-map/basemap-source") ||
      entry.name.includes("/static/countries/countries.")
    );
    const preconnects = [...document.querySelectorAll('link[rel="preconnect"],link[rel="dns-prefetch"]')]
      .map((node) => ({
        rel: node.getAttribute("rel"),
        href: node.getAttribute("href")
      }));
    return {
      href: location.href,
      title: document.title,
      access_block: /Could not verify your browser|Code\\s*21|Access denied/i.test(document.body?.innerText || ""),
      map_ready: document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1",
      preconnects,
      navigation: nav ? {
        response_end_ms: Math.round(nav.responseEnd || 0),
        dom_content_loaded_ms: Math.round(nav.domContentLoadedEventEnd || 0),
        load_event_end_ms: Math.round(nav.loadEventEnd || 0),
        transfer_kib: Math.round((Number(nav.transferSize || 0) / 1024) * 10) / 10
      } : null,
      critical_end_ms: Math.max(0, ...critical.map((entry) => Math.round(entry.responseEnd || 0))),
      critical_transfer_kib: Math.round((critical.reduce((sum, entry) => sum + Number(entry.transferSize || 0), 0) / 1024) * 10) / 10,
      total_transfer_kib: Math.round((resources.reduce((sum, entry) => sum + Number(entry.transferSize || 0), 0) / 1024) * 10) / 10,
      tracked: {
        css: resources.filter((entry) => entry.name.includes("/_next/static/chunks/") && entry.name.endsWith(".css")),
        basemap_style: resources.filter((entry) => entry.name.includes("/api/new-map/basemap-style")),
        basemap_source: resources.filter((entry) => entry.name.includes("/api/new-map/basemap-source")),
        countries: resources.filter((entry) => entry.name.includes("/static/countries/countries."))
      }
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    label,
    browser: browserName,
    url,
    elapsed_ms: Date.now() - started,
    ...data,
    tracked: {
      css: data.tracked.css.map((entry) => ({
        url: safeUrlName(entry.name),
        initiatorType: entry.initiatorType,
        start_ms: entry.startTime,
        response_end_ms: entry.responseEnd,
        duration_ms: entry.duration,
        transfer_kib: kib(entry.transferSize),
        decoded_kib: kib(entry.decodedBodySize)
      })),
      basemap_style: summarize(data.tracked.basemap_style, "/api/new-map/basemap-style"),
      basemap_source: summarize(data.tracked.basemap_source, "/api/new-map/basemap-source"),
      countries: summarize(data.tracked.countries, "/static/countries/countries.")
    }
  };
  report.screenshot = path.join(reportsDir, `${label}.${browserName}.png`);
  await page.screenshot({ path: report.screenshot, fullPage: false });
  const reportPath = path.join(reportsDir, `${label}.${browserName}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`NETWORK_TREE_OK=1 label=${label} critical_end_ms=${report.critical_end_ms} critical_transfer_kib=${report.critical_transfer_kib} preconnects=${report.preconnects.length} report=${reportPath} screenshot=${report.screenshot}`);
  for (const entry of report.tracked.basemap_style) {
    console.log(`NETWORK_TREE_BASEMAP_STYLE response_end_ms=${entry.response_end_ms} duration_ms=${entry.duration_ms} transfer_kib=${entry.transfer_kib}`);
  }
  for (const entry of report.tracked.countries) {
    console.log(`NETWORK_TREE_COUNTRIES response_end_ms=${entry.response_end_ms} duration_ms=${entry.duration_ms} transfer_kib=${entry.transfer_kib}`);
  }
} finally {
  await page?.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

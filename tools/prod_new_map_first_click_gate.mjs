import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildVercelBypassHeaders, redactVercelBypassSecret } from "./vercel_bypass.mjs";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const outDir = process.env.PROD_FIRST_CLICK_OUT_DIR
  ? path.resolve(process.env.PROD_FIRST_CLICK_OUT_DIR)
  : path.join(repoRoot, "Reports", "new-map-first-click");
const target = process.env.PROD_FIRST_CLICK_URL || "https://www.islegal.info/new-map?qa=1";
const label = process.env.PROD_FIRST_CLICK_LABEL || `prod-first-click-${process.env.RUN_ID || Date.now()}`;
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const maxWallMs = Number(process.env.PROD_FIRST_CLICK_MAX_WALL_MS || 1500);
const maxTraceMs = Number(process.env.PROD_FIRST_CLICK_MAX_TRACE_MS || 350);
const minScreenshotBytes = Number(process.env.PROD_FIRST_CLICK_MIN_SCREENSHOT_BYTES || 4000);
const clickMode = process.env.PROD_FIRST_CLICK_MODE || "mouse";
const geos = (process.env.PROD_FIRST_CLICK_GEOS || "FR,GE,US-GA")
  .split(",")
  .map((geo) => geo.trim().toUpperCase())
  .filter(Boolean);

const views = {
  FR: { lng: 2.35, lat: 46.8, zoom: 4.4 },
  GE: { lng: 43.5, lat: 42.1, zoom: 5.8 },
  "US-GA": { lng: -83.4, lat: 32.7, zoom: 5.6 },
  SE: { lng: 15.2, lat: 62.0, zoom: 4.0 },
  AQ: { lng: 20.0, lat: -78.0, zoom: 2.2 }
};

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function round(value) {
  return value === null || value === undefined ? null : Math.round(Number(value));
}

async function waitForMapReady(page) {
  await page.waitForFunction(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    if (!map || typeof map.queryRenderedFeatures !== "function") return false;
    return map.queryRenderedFeatures(undefined, { layers: ["legal-fill"] }).length > 100;
  }, null, { timeout: 45000 });
}

async function jumpToGeo(page, geo) {
  const view = views[geo];
  if (!view) throw new Error(`NO_VIEW:${geo}`);
  await page.waitForFunction(() => Boolean(window.__NEW_MAP_QA__?.jumpTo), null, { timeout: 20000 });
  await page.evaluate(async ({ lng, lat, zoom }) => {
    await window.__NEW_MAP_QA__.jumpTo(lng, lat, zoom);
  }, view);
}

async function findFeaturePoint(page, geo) {
  const view = views[geo];
  const layers = geo.startsWith("US-")
    ? ["us-states-fill"]
    : ["legal-fill", "legal-territory-hitbox", "legal-point", "legal-territory-label"];
  for (let attempt = 0; attempt < 35; attempt += 1) {
    const point = await page.evaluate(({ geo, layers, view }) => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return null;
      const rect = map.getCanvas().getBoundingClientRect();
      const projected = map.project({ lng: view.lng, lat: view.lat });
      const windows = [
        {
          startX: Math.max(20, projected.x - 260),
          endX: Math.min(rect.width - 20, projected.x + 260),
          startY: Math.max(20, projected.y - 220),
          endY: Math.min(rect.height - 20, projected.y + 220),
          step: 8
        },
        {
          startX: 40,
          endX: rect.width - 40,
          startY: 40,
          endY: rect.height - 40,
          step: 18
        }
      ];
      for (const area of windows) {
        for (let y = area.startY; y < area.endY; y += area.step) {
          for (let x = area.startX; x < area.endX; x += area.step) {
            for (const layer of layers) {
              if (!map.getLayer(layer)) continue;
              const features = map.queryRenderedFeatures([x, y], { layers: [layer] });
              const hit = features.find((feature) => {
                const props = feature.properties || {};
                return [props.geo, props.iso2, props.iso_a2, props.ISO_A2, feature.id]
                  .map((value) => String(value || "").toUpperCase())
                  .includes(geo);
              });
              if (hit) {
                return {
                  x: Math.round(rect.left + x),
                  y: Math.round(rect.top + y),
                  canvasX: Math.round(x),
                  canvasY: Math.round(y),
                  layer,
                  featureId: String(hit.id || hit.properties?.geo || geo)
                };
              }
            }
          }
        }
      }
      return null;
    }, { geo, layers, view });
    if (point) return point;
    await page.waitForTimeout(150);
  }
  return null;
}

async function readPopupText(page) {
  return page
    .evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('[data-testid="new-map-country-popup"]'));
      const node = nodes.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
      return node?.textContent || node?.innerHTML || "";
    })
    .catch(() => "");
}

async function waitForPopupDom(page, timeoutMs) {
  await page.waitForFunction(() => {
    const nodes = Array.from(document.querySelectorAll('[data-testid="new-map-country-popup"]'));
    return nodes.some((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
  }, null, { timeout: timeoutMs });
}

async function isPopupDomVisible(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-testid="new-map-country-popup"]'));
    return nodes.some((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
  }).catch(() => false);
}

async function screenshotVisiblePopup(page, screenshotPath) {
  const box = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-testid="new-map-country-popup"]'));
    const node = nodes.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(rect.left)),
      y: Math.max(0, Math.floor(rect.top)),
      width: Math.max(1, Math.ceil(rect.width)),
      height: Math.max(1, Math.ceil(rect.height))
    };
  });
  const handle = await page.evaluateHandle(() => {
    const nodes = Array.from(document.querySelectorAll('[data-testid="new-map-country-popup"]'));
    return nodes.find((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }) || null;
  });
  const element = handle.asElement();
  if (element) {
    await element.screenshot({ path: screenshotPath }).catch(() => null);
  }
  await handle.dispose().catch(() => null);
  if (box && (!fsSync.existsSync(screenshotPath) || fsSync.statSync(screenshotPath).size === 0)) {
    await page.screenshot({ path: screenshotPath, clip: box }).catch(() => null);
  }
}

async function measureGeo(browser, geo) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 980 },
    deviceScaleFactor: 1,
    extraHTTPHeaders: buildVercelBypassHeaders(secret, "samesitenone")
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const url = target.includes("?") ? `${target}&firstClickGeo=${encodeURIComponent(geo)}` : `${target}?qa=1&firstClickGeo=${encodeURIComponent(geo)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForMapReady(page);
  await jumpToGeo(page, geo);
  const point = await findFeaturePoint(page, geo);
  if (!point) {
    await context.close();
    return { geo, ok: false, reason: "FEATURE_NOT_FOUND", consoleErrors };
  }

  await page.evaluate(() => {
    window.__NEW_MAP_TRACE__ = { t0: performance.now(), marks: {}, metrics: {} };
  });
  const hitTest = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return {
      tag: element?.tagName || "",
      className: String(element?.className || ""),
      testId: element?.getAttribute?.("data-testid") || "",
      pointerEvents: element ? getComputedStyle(element).pointerEvents : ""
    };
  }, point);
  const startedAt = Date.now();
  if (clickMode === "mouse") {
    await page.mouse.click(point.x, point.y);
  } else {
    await page.evaluate(({ canvasX, canvasY, layer }) => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return;
      const features = map.queryRenderedFeatures([canvasX, canvasY], { layers: [layer] });
      const lngLat = map.unproject([canvasX, canvasY]);
      map.fire("click", {
        point: { x: canvasX, y: canvasY },
        lngLat,
        features,
        originalEvent: { type: "click", isTrusted: false }
      });
    }, point);
  }
  await waitForPopupDom(page, maxWallMs).catch(() => null);
  const wallMs = Date.now() - startedAt;
  const text = await readPopupText(page);
  const popupVisible = await isPopupDomVisible(page);
  const screenshotPath = path.join(outDir, `${label}.${geo}.popup.png`);
  if (popupVisible) await screenshotVisiblePopup(page, screenshotPath);
  const trace = await page.evaluate(() => window.__NEW_MAP_TRACE__ || {});
  const marks = trace.marks || {};
  const traceMs =
    typeof marks.NM_POPUP_RENDER_READY === "number" && typeof marks.NM_POPUP_CLICK_RECEIVED === "number"
      ? marks.NM_POPUP_RENDER_READY - marks.NM_POPUP_CLICK_RECEIVED
      : null;
  const resources = await page.evaluate(() => {
    return performance.getEntriesByType("resource")
      .map((entry) => ({
        name: entry.name,
        transferSize: entry.transferSize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
        duration: entry.duration || 0
      }))
      .filter((entry) => entry.name.includes("/api/new-map/card-"));
  });
  const screenshotBytes = fsSync.existsSync(screenshotPath) ? fsSync.statSync(screenshotPath).size : 0;
  await context.close();

  const failures = [];
  if (!popupVisible) failures.push("POPUP_NOT_VISIBLE");
  if (!new RegExp(`ISO2:\\s*${geo.replace("-", "\\-")}`, "i").test(text || "")) failures.push("WRONG_POPUP_GEO");
  if (traceMs === null && wallMs > maxWallMs) failures.push(`WALL_MS_GT_${maxWallMs}`);
  if (traceMs === null) failures.push("TRACE_MARKS_MISSING");
  if (traceMs !== null && traceMs > maxTraceMs) failures.push(`TRACE_MS_GT_${maxTraceMs}`);
  if (screenshotBytes < minScreenshotBytes) failures.push(`SCREENSHOT_BYTES_LT_${minScreenshotBytes}`);

  return {
    geo,
    ok: failures.length === 0,
    reason: failures.join("|") || "OK",
    wallMs,
    traceMs: round(traceMs),
    point,
    hitTest,
    clickMode,
    popupTextSample: String(text || "").replace(/\s+/g, " ").trim().slice(0, 260),
    screenshot: rel(screenshotPath),
    screenshotBytes,
    resources,
    consoleErrors: consoleErrors.slice(0, 10)
  };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const slot = await acquireProjectProcessSlot("playwright:prod-new-map-first-click");
  let browser = null;
  const results = [];
  try {
    browser = await chromium.launch({ headless: true });
    for (const geo of geos) {
      results.push(await measureGeo(browser, geo));
    }
  } finally {
    if (browser) await browser.close();
    slot.release();
  }

  const wallValues = results.filter((item) => item.ok).map((item) => item.wallMs);
  const traceValues = results.filter((item) => item.ok && item.traceMs !== null).map((item) => item.traceMs);
  const report = {
    target: redactVercelBypassSecret(target, secret),
    label,
    geos,
    thresholds: { maxWallMs, maxTraceMs, minScreenshotBytes },
    summary: {
      total: results.length,
      ok: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      wall_p50_ms: percentile(wallValues, 50),
      wall_p90_ms: percentile(wallValues, 90),
      wall_max_ms: wallValues.length ? Math.max(...wallValues) : null,
      trace_p50_ms: percentile(traceValues, 50),
      trace_p90_ms: percentile(traceValues, 90),
      trace_max_ms: traceValues.length ? Math.max(...traceValues) : null
    },
    results
  };
  const reportPath = path.join(outDir, `${label}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  const ok = report.summary.failed === 0;
  console.log([
    `PROD_FIRST_CLICK_OK=${ok ? 1 : 0}`,
    `reason=${ok ? "OK" : "FAIL"}`,
    `target=${redactVercelBypassSecret(target, secret)}`,
    `report=${rel(reportPath)}`
  ].join(" "));
  console.log([
    "PROD_FIRST_CLICK_METRIC",
    `total=${report.summary.total}`,
    `ok=${report.summary.ok}`,
    `failed=${report.summary.failed}`,
    `wall_p50_ms=${report.summary.wall_p50_ms ?? "-"}`,
    `wall_p90_ms=${report.summary.wall_p90_ms ?? "-"}`,
    `wall_max_ms=${report.summary.wall_max_ms ?? "-"}`,
    `trace_p50_ms=${report.summary.trace_p50_ms ?? "-"}`,
    `trace_p90_ms=${report.summary.trace_p90_ms ?? "-"}`,
    `trace_max_ms=${report.summary.trace_max_ms ?? "-"}`
  ].join(" "));
  for (const result of results) {
    console.log([
      "PROD_FIRST_CLICK_ROW",
      `geo=${result.geo}`,
      `ok=${result.ok ? 1 : 0}`,
      `reason=${result.reason}`,
      `wall_ms=${result.wallMs ?? "-"}`,
      `trace_ms=${result.traceMs ?? "-"}`,
      `screenshot=${result.screenshot || "-"}`
    ].join(" "));
  }
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`PROD_FIRST_CLICK_OK=0 reason=${error?.message || error}`);
  process.exitCode = 1;
});

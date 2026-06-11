#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";
import {
  buildVercelBypassHeaders,
  redactVercelBypassSecret
} from "./vercel_bypass.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const target = process.env.PROD_POPUP_TARGET || process.env.PROD_AUDIT_TARGET || "https://www.islegal.info";
const runId = process.env.PROD_POPUP_RUN_ID || new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const reportRoot = path.join(repoRoot, "Reports", "ProdAudit", "popup-matrix", runId);
const matrix = (process.env.PROD_POPUP_MATRIX || "XK,GF,GL,PR,HK,MO,PS,TW,EH,NC,FO,GP,MQ,RE,GI")
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);

function sanitize(value) {
  return redactVercelBypassSecret(String(value ?? ""), secret);
}

function hasAccessBlock(text) {
  return /Security Checkpoint|Could not verify your browser|Code 21|Failed to verify your browser/i.test(text || "");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function responseEvidence(response) {
  if (!response) {
    return {
      status: null,
      location: "",
      x_vercel_mitigated: "",
      x_vercel_id: "",
      headers_object: {}
    };
  }
  const headersObject = typeof response.headers === "function" ? response.headers() : {};
  return {
    status: response.status(),
    location: headersObject.location || "",
    x_vercel_mitigated: headersObject["x-vercel-mitigated"] || "",
    x_vercel_id: headersObject["x-vercel-id"] || "",
    headers_object: headersObject
  };
}

async function waitForMapReady(page, timeout = 60000) {
  await page.waitForFunction(
    () => Boolean(window.__NEW_MAP_DEBUG__?.map) &&
      Boolean(document.querySelector('[data-testid="new-map-surface"][data-map-ready="1"]')) &&
      Boolean(document.querySelector(".maplibregl-canvas")),
    null,
    { timeout }
  );
}

async function readRuntimeCardIndex(page) {
  return await page.evaluate(async () => {
    const response = await fetch("/api/new-map/card-index", {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) throw new Error(`CARD_INDEX_FETCH_FAILED:${response.status}`);
    return response.json();
  });
}

function zoomForGeo(geo) {
  if (["MO", "GI"].includes(geo)) return 10;
  if (["HK"].includes(geo)) return 9;
  if (["XK"].includes(geo)) return 7;
  if (["FO", "GP", "MQ", "RE"].includes(geo)) return 7.5;
  return 5.8;
}

async function clearPopup(page) {
  const closeButton = page.locator('[data-testid="new-map-country-popup"] button[aria-label^="Close"]').first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click().catch(() => undefined);
    await page.waitForTimeout(150);
  }
}

async function jumpToGeo(page, geo, entry) {
  const lng = Number(entry?.coordinates?.lng);
  const lat = Number(entry?.coordinates?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error("NO_COORDINATES");
  const zoom = zoomForGeo(geo);
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
    : ["legal-territory-label", "legal-territory-hitbox", "legal-point", "legal-fill"];
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
            step: 8
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
                const hit = features.find((feature) => String(feature.properties?.geo || "").toUpperCase() === targetGeo);
                if (hit) {
                  return {
                    x: rect.left + x,
                    y: rect.top + y,
                    canvas_x: x,
                    canvas_y: y,
                    layer_id: layerId,
                    feature_id: String(hit.id || hit.properties?.geo || targetGeo)
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
    await page.waitForTimeout(250);
  }
  return null;
}

async function clickFeature(page, point) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
}

async function auditGeo(page, cardIndex, geo) {
  const geoDir = path.join(reportRoot, geo);
  await ensureDir(geoDir);
  const entry = cardIndex[geo];
  if (!entry) {
    return {
      geo,
      status: "FAIL",
      feature_exists: false,
      card_exists: false,
      popup_visible: false,
      reason: "CARD_MISSING"
    };
  }
  await clearPopup(page);
  await jumpToGeo(page, geo, entry);
  const point = await waitForFeaturePoint(page, geo, entry);
  if (!point) {
    await page.screenshot({ path: path.join(geoDir, "country.png"), fullPage: false }).catch(() => undefined);
    return {
      geo,
      status: "FAIL",
      feature_exists: false,
      card_exists: true,
      popup_visible: false,
      reason: "FEATURE_NOT_RENDERED"
    };
  }
  await clickFeature(page, point);
  const selectedMatched = await page.waitForFunction(
    (targetGeo) => window.__NEW_MAP_DEBUG__?.selectedId === targetGeo,
    geo,
    { timeout: 8000 }
  ).then(() => true).catch(() => false);
  await page.screenshot({ path: path.join(geoDir, "country.png"), fullPage: false }).catch(() => undefined);
  if (!selectedMatched) {
    const trace = await page.evaluate(() => window.__NEW_MAP_DEBUG__?.popupTrace || null).catch(() => null);
    await fs.writeFile(path.join(geoDir, "trace.json"), `${JSON.stringify({ geo, point, trace }, null, 2)}\n`, "utf8");
    return {
      geo,
      status: "FAIL",
      feature_exists: true,
      card_exists: true,
      popup_visible: false,
      point,
      trace,
      reason: "SELECTION_NOT_CONFIRMED"
    };
  }
  const popup = page.locator('[data-testid="new-map-country-popup"]').first();
  const popupVisible = await popup.isVisible({ timeout: 12000 }).catch(() => false);
  const popupHtml = popupVisible ? await popup.evaluate((node) => node.outerHTML).catch(() => "") : "";
  const popupText = popupVisible ? await popup.innerText().catch(() => "") : "";
  const trace = await page.evaluate(() => window.__NEW_MAP_DEBUG__?.popupTrace || null).catch(() => null);
  await fs.writeFile(path.join(geoDir, "popup-html.txt"), popupHtml || "", "utf8");
  await fs.writeFile(path.join(geoDir, "trace.json"), `${JSON.stringify({ geo, point, trace }, null, 2)}\n`, "utf8");
  await page.screenshot({ path: path.join(geoDir, "popup.png"), fullPage: false }).catch(() => undefined);
  const pass = popupVisible && popupText.includes(`ISO2: ${geo}`);
  return {
    geo,
    status: pass ? "PASS" : "FAIL",
    feature_exists: true,
    card_exists: true,
    popup_visible: popupVisible,
    popup_text_sample: sanitize(popupText.slice(0, 240)),
    point,
    trace,
    reason: pass ? "" : "POPUP_NOT_VISIBLE_OR_WRONG_GEO",
    screenshots: {
      country: path.relative(repoRoot, path.join(geoDir, "country.png")),
      popup: path.relative(repoRoot, path.join(geoDir, "popup.png")),
      html: path.relative(repoRoot, path.join(geoDir, "popup-html.txt"))
    }
  };
}

async function main() {
  await ensureDir(reportRoot);
  const slot = await acquireProjectProcessSlot("playwright:prod-popup-matrix-audit");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    ...(secret ? { extraHTTPHeaders: buildVercelBypassHeaders(secret, "true") } : {})
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${target}/new-map?qa=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const responseInfo = await responseEvidence(response);
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const challengeDetected = hasAccessBlock(bodyText) || responseInfo.x_vercel_mitigated === "challenge" || responseInfo.status === 403;
    if (challengeDetected) {
      await page.screenshot({ path: path.join(reportRoot, "challenge.png"), fullPage: false }).catch(() => undefined);
      const summary = {
        run_id: runId,
        target,
        status: "CHALLENGE_RUN",
        challenge_detected: true,
        nav_response: responseInfo,
        body_sample: sanitize(bodyText.slice(0, 500)),
        matrix,
        PASS: false
      };
      await fs.writeFile(path.join(reportRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      console.log(`PROD_POPUP_MATRIX_RUN=${runId}`);
      console.log("STATUS=CHALLENGE_RUN");
      console.log(`REPORT=${path.relative(repoRoot, path.join(reportRoot, "summary.json"))}`);
      process.exitCode = 2;
      return;
    }
    await waitForMapReady(page);
    await page.screenshot({ path: path.join(reportRoot, "new-map.png"), fullPage: false }).catch(() => undefined);
    const cardIndex = await readRuntimeCardIndex(page);
    const rows = [];
    for (const geo of matrix) {
      rows.push(await auditGeo(page, cardIndex, geo));
      await page.waitForTimeout(300);
    }
    const pass = rows.every((row) => row.status === "PASS");
    const summary = {
      run_id: runId,
      target,
      status: pass ? "PASS" : "FAIL",
      challenge_detected: false,
      nav_response: responseInfo,
      matrix_count: matrix.length,
      pass_count: rows.filter((row) => row.status === "PASS").length,
      fail_count: rows.filter((row) => row.status !== "PASS").length,
      PASS: pass,
      rows,
      screenshots: {
        new_map: path.relative(repoRoot, path.join(reportRoot, "new-map.png"))
      }
    };
    await fs.writeFile(path.join(reportRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(`PROD_POPUP_MATRIX_RUN=${runId}`);
    console.log(`STATUS=${summary.status}`);
    console.log(`PASS_COUNT=${summary.pass_count}/${summary.matrix_count}`);
    console.log(`REPORT=${path.relative(repoRoot, path.join(reportRoot, "summary.json"))}`);
    if (!pass) process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    slot.release();
  }
}

await main().catch(async (error) => {
  await ensureDir(reportRoot);
  await fs.writeFile(path.join(reportRoot, "error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(error.message || error);
  process.exit(1);
});

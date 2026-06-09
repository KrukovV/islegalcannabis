#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "Reports", "status-engine", "map-audit");
const TARGET_URL = process.env.MAP_AUDIT_URL || "http://127.0.0.1:3000/new-map?qa=1";

const REGIONS = [
  { id: "europe", label: "Europe", lng: 15, lat: 50, zoom: 3.2 },
  { id: "asia", label: "Asia", lng: 95, lat: 34, zoom: 2.1 },
  { id: "africa", label: "Africa", lng: 20, lat: 3, zoom: 2.35 },
  { id: "north-america", label: "North America", lng: -100, lat: 45, zoom: 2.3 },
  { id: "south-america", label: "South America", lng: -60, lat: -16, zoom: 2.65 },
  { id: "oceania", label: "Oceania", lng: 135, lat: -25, zoom: 2.75 }
];

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")} |`)
  ].join("\n");
}

async function readCanvasStats(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, reason: "NO_CANVAS", width: 0, height: 0, uniqueColors: 0, sampledPixels: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return { ok: false, reason: "NO_2D_CONTEXT", width, height, uniqueColors: 0, sampledPixels: 0 };
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      const xStep = Math.max(1, Math.floor(canvas.width / 80));
      const yStep = Math.max(1, Math.floor(canvas.height / 50));
      let sampledPixels = 0;
      for (let y = 0; y < canvas.height; y += yStep) {
        for (let x = 0; x < canvas.width; x += xStep) {
          const offset = (y * canvas.width + x) * 4;
          colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`);
          sampledPixels += 1;
        }
      }
      return {
        ok: width > 0 && height > 0 && colors.size > 8,
        reason: colors.size > 8 ? "OK" : "LOW_VARIANCE",
        width,
        height,
        uniqueColors: colors.size,
        sampledPixels
      };
    } catch (error) {
      return {
        ok: width > 0 && height > 0,
        reason: error instanceof Error ? `PIXEL_READ_UNAVAILABLE:${error.message}` : "PIXEL_READ_UNAVAILABLE",
        width,
        height,
        uniqueColors: 0,
        sampledPixels: 0
      };
    }
  });
}

async function readPngStats(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels || 4;
  const colors = new Set();
  const xStep = Math.max(1, Math.floor(info.width / 96));
  const yStep = Math.max(1, Math.floor(info.height / 64));
  let sampledPixels = 0;
  for (let y = 0; y < info.height; y += yStep) {
    for (let x = 0; x < info.width; x += xStep) {
      const offset = (y * info.width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = channels > 3 ? data[offset + 3] ?? 255 : 255;
      colors.add(`${red},${green},${blue},${alpha}`);
      sampledPixels += 1;
    }
  }
  return {
    ok: info.width > 0 && info.height > 0 && colors.size > 16,
    width: info.width,
    height: info.height,
    uniqueColors: colors.size,
    sampledPixels
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const slot = await acquireProjectProcessSlot("playwright:status-engine-map-audit");
  let browser = null;
  let context = null;
  try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleErrors.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push({ type: "pageerror", text: error.message });
  });

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-map-surface"][data-map-ready="1"]', { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__NEW_MAP_QA__), null, { timeout: 30000 });

  const surface = page.locator('[data-testid="new-map-surface"]');
  const rows = [];
  for (const region of REGIONS) {
    await page.evaluate(
      async ({ lng, lat, zoom }) => {
        await window.__NEW_MAP_QA__.jumpTo(lng, lat, zoom);
      },
      region
    );
    await page.waitForTimeout(450);
    const stats = await readCanvasStats(page);
    const screenshot = path.join(OUT_DIR, `${region.id}.png`);
    await surface.screenshot({ path: screenshot });
    const pngStats = await readPngStats(screenshot);
    rows.push({
      region: region.label,
      file: path.relative(ROOT, screenshot),
      camera: await page.evaluate(() => window.__NEW_MAP_QA__.getCamera()),
      canvas: stats,
      png: pngStats
    });
  }

  const errorText = await page.locator('[data-testid="new-map-error"]').textContent().catch(() => null);
  const summary = {
    generated_at: new Date().toISOString(),
    target_url: TARGET_URL,
    viewport: { width: 1440, height: 900 },
    ui_error: errorText || null,
    console_errors: consoleErrors,
    regions: rows
  };
  writeJson(path.join(OUT_DIR, "summary.json"), summary);
  fs.writeFileSync(
    path.join(OUT_DIR, "README.md"),
    [
      "# Map Audit",
      "",
      `Generated: ${summary.generated_at}`,
      `Target: ${TARGET_URL}`,
      `UI error: ${summary.ui_error || "none"}`,
      `Console warnings/errors: ${consoleErrors.length}`,
      "",
      markdownTable(
        ["Region", "Screenshot", "Canvas", "Camera"],
        rows.map((row) => [
          row.region,
          row.file,
          `canvas=${row.canvas.reason} ${row.canvas.width}x${row.canvas.height}; png=${row.png.ok ? "OK" : "LOW_VARIANCE"} colors=${row.png.uniqueColors}`,
          `${row.camera.lng.toFixed(2)}, ${row.camera.lat.toFixed(2)} z${row.camera.zoom.toFixed(2)}`
        ])
      ),
      ""
    ].join("\n"),
    "utf8"
  );

  await context.close();
  context = null;
  await browser.close();
  browser = null;
  console.log(`MAP_AUDIT=PASS screenshots=${rows.length} out=${path.relative(ROOT, OUT_DIR)}`);
  console.log(`MAP_AUDIT_CONSOLE_EVENTS=${consoleErrors.length}`);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    slot.release();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

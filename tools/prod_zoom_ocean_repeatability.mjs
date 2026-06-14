#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import {
  analyzePngFile,
  decodePng,
  encodePngRgba
} from "./ocean_background_pixel_analyzer.mjs";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";
import {
  getVercelBypassSecret,
  installVercelChallengeRecorder,
  redactSensitive,
  warmVercelBypass
} from "./lib/vercel-bypass.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TERRITORIES = [
  { id: "iceland", label: "Iceland", center: [-19.0, 64.9], zoom: 4, sampleRects: [{ x: 0.02, y: 0.18, width: 0.22, height: 0.44 }] },
  { id: "greenland-coast", label: "Greenland coast", center: [-42.0, 72.0], zoom: 3, sampleRects: [{ x: 0.58, y: 0.16, width: 0.32, height: 0.5 }] },
  { id: "uk-ireland", label: "United Kingdom / Ireland", center: [-3.5, 54.5], zoom: 4, sampleRects: [{ x: 0.02, y: 0.25, width: 0.28, height: 0.5 }] },
  { id: "france-western-europe", label: "France / Western Europe", center: [2.3, 46.8], zoom: 4, sampleRects: [{ x: 0.03, y: 0.25, width: 0.25, height: 0.48 }] },
  { id: "malta", label: "Mediterranean / Malta", center: [14.4, 35.9], zoom: 5, sampleRects: [{ x: 0.18, y: 0.22, width: 0.62, height: 0.42 }] },
  { id: "norway-fjords", label: "Norway fjords", center: [8.0, 62.0], zoom: 4, sampleRects: [{ x: 0.06, y: 0.2, width: 0.22, height: 0.55 }] },
  { id: "caribbean-cuba", label: "Caribbean / Cuba", center: [-79.5, 21.5], zoom: 4, sampleRects: [{ x: 0.2, y: 0.2, width: 0.5, height: 0.48 }] },
  { id: "panama-colombia", label: "Panama / Colombia coast", center: [-78.5, 8.8], zoom: 4, sampleRects: [{ x: 0.02, y: 0.16, width: 0.3, height: 0.5 }] },
  { id: "alaska-pacific", label: "Alaska / North Pacific", center: [-150.0, 61.0], zoom: 3, sampleRects: [{ x: 0.42, y: 0.22, width: 0.45, height: 0.48 }] },
  { id: "japan", label: "Japan", center: [138.0, 37.0], zoom: 4, sampleRects: [{ x: 0.18, y: 0.18, width: 0.55, height: 0.5 }] },
  { id: "indonesia", label: "Indonesia", center: [118.0, -2.0], zoom: 4, sampleRects: [{ x: 0.15, y: 0.18, width: 0.6, height: 0.48 }] },
  { id: "philippines", label: "Philippines", center: [122.0, 12.0], zoom: 5, sampleRects: [{ x: 0.14, y: 0.18, width: 0.58, height: 0.5 }] },
  { id: "new-zealand", label: "New Zealand", center: [174.0, -41.0], zoom: 4, sampleRects: [{ x: 0.08, y: 0.18, width: 0.58, height: 0.52 }] },
  { id: "fiji-pacific", label: "Fiji / Pacific", center: [178.0, -17.8], zoom: 5, sampleRects: [{ x: 0.06, y: 0.16, width: 0.72, height: 0.52 }] },
  { id: "south-africa-coast", label: "South Africa coast", center: [24.0, -30.0], zoom: 4, sampleRects: [{ x: 0.15, y: 0.58, width: 0.55, height: 0.22 }] }
];

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value ?? "")).digest("hex")}`;
}

function normalizeBaseUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("PROD_BASE_URL_MUST_BE_HTTPS");
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function wait(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBrowsers() {
  const raw = argValue("browsers", process.env.ZOOM_BROWSERS || "webkit,chromium");
  return raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function selectTerritories() {
  const raw = argValue("territories", process.env.ZOOM_TERRITORIES || "15");
  const limit = Number(raw);
  if (Number.isFinite(limit)) return DEFAULT_TERRITORIES.slice(0, Math.max(1, limit));
  const wanted = new Set(raw.split(",").map((item) => item.trim().toLowerCase()));
  return DEFAULT_TERRITORIES.filter((territory) => wanted.has(territory.id) || wanted.has(territory.label.toLowerCase()));
}

async function waitForMapReady(page) {
  await page.waitForFunction(
    () => Boolean(window.__NEW_MAP_QA__?.jumpTo) &&
      document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1" &&
      Boolean(document.querySelector(".maplibregl-canvas")),
    null,
    { timeout: 60000 }
  );
}

async function labelStats(page) {
  return await page.evaluate(() => window.__NEW_MAP_QA__?.getRenderedLabelStats?.() || { country: 0, city: 0, landscape: 0 });
}

async function waitForLabel(page, key, startTime, timeoutMs = 3000) {
  const initialStats = await labelStats(page);
  if (Number(initialStats[key] || 0) > 0) return { ms: Date.now() - startTime, stats: initialStats };
  while (Date.now() - startTime < timeoutMs) {
    const stats = await labelStats(page);
    if (Number(stats[key] || 0) > 0) return { ms: Date.now() - startTime, stats };
    await page.waitForTimeout(100);
  }
  return { ms: null, stats: await labelStats(page) };
}

async function waitForIdle(page, startTime) {
  await page.evaluate(() => window.__NEW_MAP_QA__?.waitForIdle?.()).catch(() => undefined);
  return Date.now() - startTime;
}

async function screenshotMap(page, filePath) {
  await ensureDir(path.dirname(filePath));
  await page.locator('[data-testid="new-map-surface"]').screenshot({ path: filePath });
  return path.relative(repoRoot, filePath);
}

async function performZoomAction(page, action) {
  const box = await page.locator('[data-testid="new-map-surface"]').boundingBox();
  if (!box) throw new Error("MAP_SURFACE_BOUNDS_MISSING");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, action === "zoomIn" ? -900 : 900);
}

async function runZoomAction(page, territory, cycle, action, screenshotDir, sessionKey) {
  const startTime = Date.now();
  await performZoomAction(page, action);
  await page.waitForTimeout(150);
  const screenshotPrefix = `${territory.id}-${sessionKey}-cycle${String(cycle).padStart(2, "0")}-${action}`;
  const transientPath = path.join(screenshotDir, `${screenshotPrefix}-transient.png`);
  const transient = await screenshotMap(page, transientPath);
  const firstRenderMs = Date.now() - startTime;
  const idleMs = await waitForIdle(page, startTime);
  const countryLabels = await waitForLabel(page, "country", startTime);
  const cityLabels = await waitForLabel(page, "city", startTime);
  const landscapeLabels = await waitForLabel(page, "landscape", startTime);
  const idlePath = path.join(screenshotDir, `${screenshotPrefix}-idle.png`);
  const idle = await screenshotMap(page, idlePath);
  const visual = analyzePngFile(idlePath, {
    sampleStride: 2,
    sampleRects: territory.sampleRects,
    excludeBottomRatio: 0.12
  });
  const renderedStats = await labelStats(page);
  const pass = visual.pass && idleMs < 10000;
  return {
    territory: territory.label,
    territory_id: territory.id,
    center: territory.center,
    cycle,
    action,
    measurements: {
      action_to_first_render_ms: firstRenderMs,
      action_to_country_labels_ms: countryLabels.ms,
      action_to_city_labels_ms: cityLabels.ms,
      action_to_landscape_labels_ms: landscapeLabels.ms,
      action_to_idle_ms: idleMs,
      rendered_country_label_count: renderedStats.country,
      rendered_city_label_count: renderedStats.city,
      rendered_landscape_label_count: renderedStats.landscape
    },
    visual,
    screenshots: {
      transient,
      idle
    },
    result: pass ? "pass" : "fail"
  };
}

function browserConfig(name) {
  if (name === "webkit") return { type: webkit, label: "webkit" };
  if (name === "chromium" || name === "chrome") return { type: chromium, label: name };
  throw new Error(`BROWSER_UNSUPPORTED:${name}`);
}

function thumbnail(source, targetWidth = 280) {
  const scale = targetWidth / source.width;
  const width = targetWidth;
  const height = Math.max(1, Math.round(source.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor(x / scale));
      const sy = Math.min(source.height - 1, Math.floor(y / scale));
      const src = (sy * source.width + sx) * 4;
      const dst = (y * width + x) * 4;
      data[dst] = source.data[src];
      data[dst + 1] = source.data[src + 1];
      data[dst + 2] = source.data[src + 2];
      data[dst + 3] = 255;
    }
  }
  return { width, height, data };
}

async function writeMontage(rows, outputPath) {
  const selected = rows
    .slice()
    .sort((a, b) => {
      if (a.result !== b.result) return a.result === "fail" ? -1 : 1;
      return Number(b.visual?.near_white_ratio || 0) - Number(a.visual?.near_white_ratio || 0);
    })
    .slice(0, 12);
  if (!selected.length) return "";
  const thumbs = [];
  for (const row of selected) {
    const filePath = path.join(repoRoot, row.screenshots.idle);
    const png = decodePng(await fs.readFile(filePath));
    thumbs.push(thumbnail(png));
  }
  const columns = 3;
  const gap = 8;
  const cellWidth = Math.max(...thumbs.map((item) => item.width));
  const cellHeight = Math.max(...thumbs.map((item) => item.height));
  const width = columns * cellWidth + (columns + 1) * gap;
  const height = Math.ceil(thumbs.length / columns) * cellHeight + (Math.ceil(thumbs.length / columns) + 1) * gap;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 215;
    data[index + 1] = 220;
    data[index + 2] = 220;
    data[index + 3] = 255;
  }
  for (const [index, thumb] of thumbs.entries()) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const offsetX = gap + col * (cellWidth + gap);
    const offsetY = gap + row * (cellHeight + gap);
    for (let y = 0; y < thumb.height; y += 1) {
      for (let x = 0; x < thumb.width; x += 1) {
        const src = (y * thumb.width + x) * 4;
        const dst = ((offsetY + y) * width + offsetX + x) * 4;
        data[dst] = thumb.data[src];
        data[dst + 1] = thumb.data[src + 1];
        data[dst + 2] = thumb.data[src + 2];
        data[dst + 3] = 255;
      }
    }
  }
  await fs.writeFile(outputPath, encodePngRgba(width, height, data));
  return path.relative(repoRoot, outputPath);
}

async function runCampaign() {
  const baseUrl = normalizeBaseUrl(process.env.PROD_BASE_URL || process.env.PROD_AUDIT_TARGET || "https://islegal.info");
  const secret = getVercelBypassSecret();
  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const artifactDir = path.join(repoRoot, "artifacts", "prod-repeatability", runId);
  const screenshotDir = path.join(artifactDir, "screenshots");
  const browsers = parseBrowsers();
  const territories = selectTerritories();
  const cycles = Math.max(1, Number(argValue("cycles", process.env.ZOOM_CYCLES || "5")) || 5);
  const runs = Math.max(1, Number(argValue("runs", process.env.ZOOM_RUNS || "3")) || 3);
  const cooldownMs = Math.max(0, Number(argValue("cooldown-ms", process.env.COOLDOWN_MS || "30000")) || 0);
  await ensureDir(screenshotDir);

  const rows = [];
  const sessions = [];
  for (let run = 1; run <= runs; run += 1) {
    for (const browserName of browsers) {
      const config = browserConfig(browserName);
      const slot = await acquireProjectProcessSlot(`playwright:prod-zoom-ocean:${config.label}`);
      const browser = await config.type.launch({
        headless: process.env.PROD_ZOOM_HEADLESS === "0" ? false : true
      });
      try {
        const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
        try {
          const page = await context.newPage();
          const recorder = installVercelChallengeRecorder(page, { baseUrl, secret });
          const bypass = await warmVercelBypass(context, baseUrl, { secret });
          const session = {
            run,
            browser: config.label,
            bypass,
            result: "fail",
            challenge_count: 0,
            rows: 0
          };
          sessions.push(session);
          if (bypass.challenge_detected) {
            session.result = "challenge";
            session.challenge_count = 1;
            continue;
          }
          await page.goto(`${baseUrl}/new-map?qa=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
          await waitForMapReady(page);
          const sessionKey = `run${run}-${config.label}`;
          for (const territory of territories) {
            await page.evaluate(
              ({ center, zoom }) => window.__NEW_MAP_QA__?.jumpTo(center[0], center[1], zoom),
              { center: territory.center, zoom: territory.zoom }
            );
            await page.evaluate(() => window.__NEW_MAP_QA__?.waitForIdle?.()).catch(() => undefined);
            await screenshotMap(page, path.join(screenshotDir, `${territory.id}-${sessionKey}-baseline.png`));
            for (let cycle = 1; cycle <= cycles; cycle += 1) {
              rows.push({
                run,
                browser: config.label,
                base_url_hash: sha256(baseUrl),
                ...(await runZoomAction(page, territory, cycle, "zoomIn", screenshotDir, sessionKey))
              });
              rows.push({
                run,
                browser: config.label,
                base_url_hash: sha256(baseUrl),
                ...(await runZoomAction(page, territory, cycle, "zoomOut", screenshotDir, sessionKey))
              });
            }
          }
          const network = recorder.summary();
          session.challenge_count = network.challenge_count;
          session.rows = rows.filter((row) => row.run === run && row.browser === config.label).length;
          session.network = network;
          session.result = network.challenge_count === 0 && rows
            .filter((row) => row.run === run && row.browser === config.label)
            .every((row) => row.result === "pass")
            ? "pass"
            : "fail";
        } finally {
          await context.close().catch(() => undefined);
        }
      } finally {
        await browser.close().catch(() => undefined);
        slot.release();
      }
      if (cooldownMs > 0) await wait(cooldownMs);
    }
  }

  const montagePath = await writeMontage(rows, path.join(artifactDir, "summary-ocean-zoom-montage.png"));
  const pass = sessions.length === runs * browsers.length &&
    sessions.every((session) => session.result === "pass") &&
    rows.length === runs * browsers.length * territories.length * cycles * 2 &&
    rows.every((row) => row.result === "pass");
  const summary = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    runner: "prod_zoom_ocean_repeatability",
    base_url_hash: sha256(baseUrl),
    browsers,
    territory_count: territories.length,
    cycles,
    runs,
    status: pass ? "PASS" : "FAIL",
    sessions,
    rows,
    screenshots: {
      root: path.relative(repoRoot, screenshotDir),
      montage: montagePath
    },
    secret_leak_guard: JSON.stringify(rows).includes(secret) || JSON.stringify(sessions).includes(secret) ? "FAIL" : "PASS"
  };
  await fs.writeFile(path.join(artifactDir, "prod_zoom_ocean_repeatability.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`PROD_ZOOM_OCEAN_RUN=${runId}`);
  console.log(`STATUS=${summary.status}`);
  console.log(`ROWS=${rows.length}`);
  console.log(`FAIL_ROWS=${rows.filter((row) => row.result !== "pass").length}`);
  console.log(`SECRET_LEAK_GUARD=${summary.secret_leak_guard}`);
  console.log(`REPORT=${path.relative(repoRoot, path.join(artifactDir, "prod_zoom_ocean_repeatability.json"))}`);
  if (summary.status !== "PASS") process.exitCode = 1;
}

await runCampaign().catch(async (error) => {
  const artifactDir = path.join(repoRoot, "artifacts", "prod-repeatability", new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, ""));
  await ensureDir(artifactDir);
  await fs.writeFile(path.join(artifactDir, "prod_zoom_ocean_repeatability.error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(redactSensitive(error.message || error));
  process.exit(1);
});

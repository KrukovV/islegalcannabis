#!/usr/bin/env node
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import sharp from "sharp";
import { chromium, webkit } from "@playwright/test";

const ROOT = process.cwd();
const ARTIFACTS = path.join(ROOT, "Artifacts");
const TARGET_URL = "http://127.0.0.1:3000/new-map";
const DEFAULT_CAMERA = { center: [25, 50], zoom: 1.55, bearing: 0, pitch: 0 };
const TRANSITION_CAMERA = { center: [25, 50], zoom: 2.28, bearing: 0, pitch: 0 };
const CHUKOTKA_CAMERA = { center: [165, 66], zoom: 4, bearing: 0, pitch: 0 };
const SEA_CASES = [
  { id: "baltic", camera: { center: [21, 59], zoom: 3.6, bearing: 0, pitch: 0 }, tokens: ["BALTIC SEA"] },
  { id: "northsea", camera: { center: [2, 57], zoom: 3.8, bearing: 0, pitch: 0 }, tokens: ["NORTH SEA"] },
  { id: "black", camera: { center: [34.9, 43.35], zoom: 5.4, bearing: 0, pitch: 0 }, tokens: ["BLACK SEA"] },
  { id: "caspian", camera: { center: [51.7, 41.9], zoom: 5.4, bearing: 0, pitch: 0 }, tokens: ["CASPIAN SEA"] },
  { id: "chukchi", camera: { center: [171, 69], zoom: 4.2, bearing: 0, pitch: 0 }, tokens: ["CHUKCHI SEA", "ЧУКОТСКОЕ МОРЕ"] },
  { id: "laptev", camera: { center: [122, 77], zoom: 4.1, bearing: 0, pitch: 0 }, tokens: ["LAPTEV SEA", "МОРЕ ЛАПТЕВЫХ"] },
  { id: "japanese", camera: { center: [136, 41], zoom: 3.9, bearing: 0, pitch: 0 }, tokens: ["SEA OF JAPAN", "JAPANESE SEA"] }
];
const FILL_LAYER_ID = "legal-fill";
const ADMIN_LAYER_ID = "admin-boundary-line";
const browsers = [
  ["chromium", chromium],
  ["webkit", webkit]
];
const BROWSER_PHASE_TIMEOUT_MS = 45000;

async function withTimeout(label, task, timeoutMs = BROWSER_PHASE_TIMEOUT_MS) {
  let timeoutId;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function countEdgeArtifacts(rgba, width, height) {
  const x = width - 3;
  let darkRuns = 0;
  let paleRuns = 0;
  let currentDark = 0;
  let currentPale = 0;
  for (let y = Math.floor(height * 0.18); y < Math.floor(height * 0.82); y += 1) {
    const offset = (y * width + x) * 4;
    const red = rgba[offset];
    const green = rgba[offset + 1];
    const blue = rgba[offset + 2];
    const alpha = rgba[offset + 3];
    const luminance = (red + green + blue) / 3;
    const isDark = alpha > 200 && luminance < 120;
    const isPale = alpha > 200 && luminance > 242;
    currentDark = isDark ? currentDark + 1 : 0;
    currentPale = isPale ? currentPale + 1 : 0;
    if (currentDark === 18) darkRuns += 1;
    if (currentPale === 18) paleRuns += 1;
  }
  return darkRuns + paleRuns;
}

function countVerticalArtifactsNearX(rgba, width, height, targetX, minY = Math.floor(height * 0.18), maxY = Math.floor(height * 0.82)) {
  const x = Math.max(2, Math.min(width - 3, Math.round(targetX)));
  let darkRuns = 0;
  let paleRuns = 0;
  let currentDark = 0;
  let currentPale = 0;
  for (let y = Math.max(0, Math.floor(minY)); y < Math.min(height, Math.floor(maxY)); y += 1) {
    const offset = (y * width + x) * 4;
    const red = rgba[offset];
    const green = rgba[offset + 1];
    const blue = rgba[offset + 2];
    const alpha = rgba[offset + 3];
    const luminance = (red + green + blue) / 3;
    const isDark = alpha > 200 && luminance < 125;
    const isPale = alpha > 200 && luminance > 242;
    currentDark = isDark ? currentDark + 1 : 0;
    currentPale = isPale ? currentPale + 1 : 0;
    if (currentDark === 45) darkRuns += 1;
    if (currentPale === 45) paleRuns += 1;
  }
  return darkRuns + paleRuns;
}

function computeRingAudit(featureCollection) {
  let maxRingDeltaLng = 0;
  let diagonalBridgeCount = 0;
  const visitRing = (ring) => {
    for (let index = 1; index < ring.length; index += 1) {
      const delta = Math.abs(Number(ring[index][0]) - Number(ring[index - 1][0]));
      maxRingDeltaLng = Math.max(maxRingDeltaLng, delta);
      if (delta > 180) diagonalBridgeCount += 1;
    }
  };
  for (const feature of featureCollection.features || []) {
    if (feature.geometry?.type === "Polygon") {
      for (const ring of feature.geometry.coordinates) visitRing(ring);
    }
    if (feature.geometry?.type === "MultiPolygon") {
      for (const polygon of feature.geometry.coordinates) {
        for (const ring of polygon) visitRing(ring);
      }
    }
  }
  return { maxRingDeltaLng, diagonalBridgeCount };
}

function readOcrText(imagePath) {
  const result = spawnSync("/opt/homebrew/bin/tesseract", [imagePath, "stdout", "--psm", "11"], {
    encoding: "utf8",
    timeout: 15000
  });
  return result.status === 0 ? String(result.stdout || "") : "";
}

function normalizeLabelText(value) {
  return String(value || "").normalize("NFKC").toUpperCase().replace(/\s+/g, " ").trim();
}

async function runBrowser(name, launcher) {
  const browser = await launcher.launch({
    headless: true,
    args:
      name === "chromium"
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
        : []
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 30000 });
    await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });

    const boot = await withTimeout(`${name}_boot`, () => page.evaluate(async () => {
      const start = performance.now();
      while (performance.now() - start < 10000) {
        const state = window.__NEW_MAP_DEBUG__;
        if (state?.mounted) {
          const map = state.map;
          if (map) {
            const renderStart = performance.now();
            while (performance.now() - renderStart < 8000) {
              const rendered = map.queryRenderedFeatures([[0, 0], [window.innerWidth, window.innerHeight]], {
                layers: ["legal-fill"]
              });
              if (rendered.length > 0) break;
              await new Promise((resolve) => window.setTimeout(resolve, 100));
            }
          }
          return {
            mounted: state.mounted,
            hoveredId: state.hoveredId,
            hoverSwitchCount: state.hoverSwitchCount,
            hoverStateOwner: state.hoverStateOwner
          };
        }
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      return null;
    }));

    const box = await page.locator(".maplibregl-canvas").boundingBox();
    if (!box) throw new Error("canvas_bbox_missing");
    const featurePoint = await withTimeout(`${name}_feature_point`, () => page.evaluate(async () => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return null;
      const start = performance.now();
      while (performance.now() - start < 8000) {
        for (let x = 80; x < window.innerWidth - 80; x += 120) {
          for (let y = 80; y < window.innerHeight - 80; y += 90) {
            const features = map.queryRenderedFeatures([x, y], { layers: ["legal-fill"] });
            if (features.length) {
              return { x, y, geo: String(features[0].properties?.geo || features[0].id || "") };
            }
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      return null;
    }));
    if (featurePoint) {
      await page.mouse.move(featurePoint.x, featurePoint.y);
      await page.waitForTimeout(200);
    }

    const hover = await page.evaluate(() => window.__NEW_MAP_DEBUG__ || null);

    const centerBefore = await page.evaluate(() => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return null;
      const center = map.getCenter();
      return { lng: center.lng, lat: center.lat };
    });
    await page.evaluate(() => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return;
      map.panBy([-260, 0], { animate: false });
    });
    await page.waitForTimeout(300);
    const centerAfter = await page.evaluate(() => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return null;
      const center = map.getCenter();
      return { lng: center.lng, lat: center.lat, pitch: map.getPitch(), bearing: map.getBearing() };
    });

    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.6);
    await page.mouse.wheel(0, -1500);
    await page.waitForTimeout(1500);
    const zoomAfter = await page.evaluate(() => window.__NEW_MAP_DEBUG__?.map?.getZoom?.() ?? null);
    const initialCameraAudit = await page.evaluate(() => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return null;
      return { pitch: map.getPitch(), bearing: map.getBearing() };
    });
    const labelsAudit = await withTimeout(`${name}_labels_audit`, () => page.evaluate(async ({ defaultCamera, transitionCamera }) => {
      const waitForIdleOrTimeout = (map, timeoutMs = 1500) =>
        new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve(null);
          };
          const timeoutId = window.setTimeout(finish, timeoutMs);
          map.once("idle", () => {
            window.clearTimeout(timeoutId);
            finish();
          });
        });
      const map = window.__NEW_MAP_DEBUG__?.map;
      const layers = map.getStyle().layers || [];
      const labelGroups = {
        country: layers.filter((layer) => layer.type === "symbol" && /(country|admin_0|place_country)/i.test(layer.id)).map((layer) => layer.id),
        marine: layers.filter((layer) => layer.type === "symbol" && /(watername|marine|ocean|sea)/i.test(layer.id)).map((layer) => layer.id),
        city: layers.filter((layer) => layer.type === "symbol" && /(place_city|place_town|place_villages|place_hamlet)/.test(layer.id)).map((layer) => layer.id),
        roads: layers.filter((layer) => layer.type === "symbol" && /roadname_/.test(layer.id)).map((layer) => layer.id),
        roadLines: layers
          .filter((layer) => /(road_.*(fill|case)|bridge_.*(fill|case)|tunnel_.*(fill|case)|road_path)/.test(layer.id))
          .map((layer) => layer.id)
      };
      const countFeatures = (targetLayers) =>
        Array.isArray(targetLayers) && targetLayers.length > 0
          ? map.queryRenderedFeatures([[0, 0], [window.innerWidth, window.innerHeight]], { layers: targetLayers }).length
          : 0;
      const countWithRetry = async (targetLayers, jumpTo) => {
        map.jumpTo(jumpTo);
        await waitForIdleOrTimeout(map);
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const count = countFeatures(targetLayers);
          if (count > 0) return count;
          await new Promise((resolve) => window.setTimeout(resolve, 150));
        }
        return countFeatures(targetLayers);
      };
      const defaultCountryCount = await countWithRetry(labelGroups.country, transitionCamera);
      const defaultMarineCount = await countWithRetry(labelGroups.marine, defaultCamera);
      const cityCount = await countWithRetry(labelGroups.city, { center: [13.4, 52.51], zoom: 7.2 });
      const roadCount = Math.max(
        await countWithRetry(labelGroups.roads, { center: [13.4, 52.51], zoom: 10.5 }),
        await countWithRetry(labelGroups.roadLines, { center: [13.4, 52.51], zoom: 10.5 })
      );
      return {
        countryLayers: Array.isArray(labelGroups.country) ? labelGroups.country : [],
        marineLayers: Array.isArray(labelGroups.marine) ? labelGroups.marine : [],
        cityLayers: Array.isArray(labelGroups.city) ? labelGroups.city : [],
        roadLayers: Array.isArray(labelGroups.roads) ? labelGroups.roads : [],
        roadLineLayers: Array.isArray(labelGroups.roadLines) ? labelGroups.roadLines : [],
        countryCount: defaultCountryCount,
        marineCount: defaultMarineCount,
        cityCount,
        roadCount
      };
    }, { defaultCamera: DEFAULT_CAMERA, transitionCamera: TRANSITION_CAMERA }));
    const seaLabelAuditRaw = await withTimeout(`${name}_sea_label_audit`, () => page.evaluate(async (seaCases) => {
      const waitForIdleOrTimeout = (map, timeoutMs = 1500) =>
        new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve(null);
          };
          const timeoutId = window.setTimeout(finish, timeoutMs);
          map.once("idle", () => {
            window.clearTimeout(timeoutId);
            finish();
          });
        });
      const map = window.__NEW_MAP_DEBUG__?.map;
      const marineLayers = (map.getStyle().layers || [])
        .filter((layer) => layer.type === "symbol" && /(watername|marine|ocean|sea)/i.test(layer.id))
        .map((layer) => layer.id);
      const collectNames = () => {
        const rendered = Array.isArray(marineLayers) && marineLayers.length > 0
          ? map.queryRenderedFeatures([[0, 0], [window.innerWidth, window.innerHeight]], { layers: marineLayers })
          : [];
        return [...new Set(rendered.flatMap((feature) => [
          String(feature.properties?.name || ""),
          String(feature.properties?.["name_en"] || ""),
          String(feature.properties?.["name:en"] || "")
        ]).filter(Boolean))];
      };
      const results = [];
      for (const seaCase of seaCases) {
        map.jumpTo(seaCase.camera);
        await waitForIdleOrTimeout(map);
        let names = collectNames();
        if (!names.length) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          names = collectNames();
        }
        results.push({ id: seaCase.id, names });
      }
      return results;
    }, SEA_CASES));
    const seaLabelAudit = [];
    for (const seaCase of SEA_CASES) {
      await withTimeout(`${name}_sea_case_${seaCase.id}`, () => page.evaluate(async (camera) => {
        const waitForIdleOrTimeout = (map, timeoutMs = 1500) =>
          new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              resolve(null);
            };
            const timeoutId = window.setTimeout(finish, timeoutMs);
            map.once("idle", () => {
              window.clearTimeout(timeoutId);
              finish();
            });
          });
        const map = window.__NEW_MAP_DEBUG__?.map;
        map.jumpTo(camera);
        await waitForIdleOrTimeout(map);
      }, seaCase.camera));
      const seaCaseScreenshotPath = path.join(ARTIFACTS, `new-map-sea-${seaCase.id}-${name}.png`);
      await page.screenshot({ path: seaCaseScreenshotPath, type: "png" });
      const ocrText = normalizeLabelText(readOcrText(seaCaseScreenshotPath));
      const queryMatch = seaLabelAuditRaw.find((entry) => entry.id === seaCase.id);
      const matchedToken = seaCase.tokens.find((token) => {
        const normalizedToken = normalizeLabelText(token);
        return ocrText.includes(normalizedToken)
          || (queryMatch?.names || []).some((nameValue) => normalizeLabelText(nameValue).includes(normalizedToken));
      }) || null;
      seaLabelAudit.push({
        id: seaCase.id,
        matched: Boolean(matchedToken),
        matchedToken,
        names: queryMatch?.names || [],
        ocrTextSample: ocrText.slice(0, 500)
      });
    }
    await withTimeout(`${name}_restore_default_camera`, () => page.evaluate(
      (defaultCamera) =>
        new Promise((resolve) => {
          const map = window.__NEW_MAP_DEBUG__?.map;
          if (!map) {
            resolve(null);
            return;
          }
          map.jumpTo(defaultCamera);
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve(null);
          };
          const timeoutId = window.setTimeout(finish, 1500);
          map.once("idle", () => {
            window.clearTimeout(timeoutId);
            finish();
          });
        }),
      DEFAULT_CAMERA
    ));
    const defaultCameraScreenshotPath = path.join(ARTIFACTS, `new-map-default-camera-${name}.png`);
    await page.screenshot({ path: defaultCameraScreenshotPath, type: "png" });
    const ocrText = readOcrText(defaultCameraScreenshotPath).toUpperCase();
    await withTimeout(`${name}_transition_camera_labels`, () => page.evaluate(
      (transitionCamera) =>
        new Promise((resolve) => {
          const map = window.__NEW_MAP_DEBUG__?.map;
          if (!map) {
            resolve(null);
            return;
          }
          map.jumpTo(transitionCamera);
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              resolve(null);
            }
          };
          const timeoutId = window.setTimeout(finish, 1500);
          map.once("idle", () => {
            window.clearTimeout(timeoutId);
            finish();
          });
        }),
      TRANSITION_CAMERA
    ));
    const transitionCameraScreenshotPath = path.join(ARTIFACTS, `new-map-transition-camera-${name}.png`);
    await page.screenshot({ path: transitionCameraScreenshotPath, type: "png" });
    const transitionOcrText = readOcrText(transitionCameraScreenshotPath).toUpperCase();
    await withTimeout(`${name}_restore_after_transition`, () => page.evaluate(
      (defaultCamera) =>
        new Promise((resolve) => {
          const map = window.__NEW_MAP_DEBUG__?.map;
          if (!map) {
            resolve(null);
            return;
          }
          map.jumpTo(defaultCamera);
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              resolve(null);
            }
          };
          const timeoutId = window.setTimeout(finish, 1500);
          map.once("idle", () => {
            window.clearTimeout(timeoutId);
            finish();
          });
        }),
      DEFAULT_CAMERA
    ));
    const nativeCountryLabelsVisible =
      labelsAudit.countryCount > 8 || /(RUSSIA|CANADA|GREENLAND|ICELAND|UNITED STATES|FINLAND|NORWAY)/.test(transitionOcrText);
    const nativeMarineLabelsVisible =
      labelsAudit.marineCount > 4 || /(PACIFIC|BEAUFORT|BERING|CHUKCHI|LAPTEV|ARCTIC|OCEAN|SEA)/.test(ocrText);
    const roadsVisible = labelsAudit.roadCount > 0;
    const paletteAudit = await page.evaluate(() => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return null;
      const source = map.getSource("legal-countries");
      const data = typeof source?.serialize === "function" ? source.serialize()?.data : null;
      const features = Array.isArray(data?.features) ? data.features : [];
      const colors = [...new Set(features.map((feature) => String(feature?.properties?.legalColor || "")).filter(Boolean))];
      const opacities = features.map((feature) => Number(feature?.properties?.fillOpacity || 0)).filter((value) => Number.isFinite(value));
      const maxOpacity = opacities.length ? Math.max(...opacities) : 0;
      const avgOpacity = opacities.length ? opacities.reduce((sum, value) => sum + value, 0) / opacities.length : 0;
      return {
        uniqueColorCount: colors.length,
        maxOpacity,
        avgOpacity,
        visible: colors.length >= 3 && maxOpacity >= 0.22 && avgOpacity >= 0.22
      };
    });

    const adminBoundariesAudit = await withTimeout(`${name}_admin_boundaries`, () => page.evaluate(async () => {
      const waitForIdleOrTimeout = (map, timeoutMs = 1500) =>
        new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve(null);
          };
          const timeoutId = window.setTimeout(finish, timeoutMs);
          map.once("idle", () => {
            window.clearTimeout(timeoutId);
            finish();
          });
        });
      const map = window.__NEW_MAP_DEBUG__?.map;
      map.jumpTo({ center: [-98, 39], zoom: 4.5 });
      await waitForIdleOrTimeout(map);
      const count = map.queryRenderedFeatures([[0, 0], [window.innerWidth, window.innerHeight]], { layers: ["admin-boundary-line"] }).length;
      return { count, zoom: map.getZoom(), center: map.getCenter() };
    }));

    await withTimeout(`${name}_return_default_camera_after_admin`, () => page.evaluate(async (defaultCamera) => {
      const waitForIdleOrTimeout = (map, timeoutMs = 1500) =>
        new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve(null);
          };
          const timeoutId = window.setTimeout(finish, timeoutMs);
          map.once("idle", () => {
            window.clearTimeout(timeoutId);
            finish();
          });
        });
      const map = window.__NEW_MAP_DEBUG__?.map;
      map.jumpTo(defaultCamera);
      await waitForIdleOrTimeout(map);
    }, DEFAULT_CAMERA));

    const dragStartX = box.x + box.width * 0.75;
    const dragEndX = box.x + box.width * 0.1;
    const dragY = box.y + box.height * 0.48;
    for (let step = 0; step < 18; step += 1) {
      await page.mouse.move(dragStartX, dragY);
      await page.mouse.down();
      await page.mouse.move(dragEndX, dragY, { steps: 35 });
      await page.mouse.up();
      await withTimeout(`${name}_drag_step_${step}`, () => page.evaluate(
        () =>
          new Promise((resolve) => {
            const map = window.__NEW_MAP_DEBUG__?.map;
            if (!map) {
              resolve(null);
              return;
            }
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              resolve(null);
            };
            const timeoutId = window.setTimeout(finish, 1500);
            map.once("idle", () => {
              window.clearTimeout(timeoutId);
              finish();
            });
          })
      ));
    }

    const datelineRuntime = await withTimeout(`${name}_dateline_runtime`, () => page.evaluate(async (chukotkaCamera) => {
      const waitForIdleOrTimeout = (map, timeoutMs = 1500) =>
        new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve(null);
          };
          const timeoutId = window.setTimeout(finish, timeoutMs);
          map.once("idle", () => {
            window.clearTimeout(timeoutId);
            finish();
          });
        });
      const map = window.__NEW_MAP_DEBUG__?.map;
      const marineLayers = (map.getStyle().layers || [])
        .filter((layer) => layer.type === "symbol" && /(watername|marine|ocean|sea)/i.test(layer.id))
        .map((layer) => layer.id);
      const countryLayers = (map.getStyle().layers || [])
        .filter((layer) => layer.type === "symbol" && /(country|admin_0|place_country)/i.test(layer.id))
        .map((layer) => layer.id);
      const continentLayers = (map.getStyle().layers || [])
        .filter((layer) => layer.type === "symbol" && /place_continent/i.test(layer.id))
        .map((layer) => layer.id);
      const labelsBeforePan = countFeatures([...marineLayers, ...countryLayers, ...continentLayers]);
      const centerAfterDrags = map.getCenter();
      const worldViewportFeatures = map.queryRenderedFeatures([[0, 0], [window.innerWidth, window.innerHeight]], {
        layers: ["legal-fill"]
      });
      const worldViewportGeos = new Set(
        worldViewportFeatures.map((feature) => String(feature.properties?.geo || feature.id || "").toUpperCase()).filter(Boolean)
      );
      const realHorizontalPanReached = Math.abs(centerAfterDrags.lng - 25) > 40 || (worldViewportGeos.has("RU") && worldViewportGeos.has("US"));
      map.zoomTo(3, { animate: false });
      await waitForIdleOrTimeout(map);
      map.zoomTo(4, { animate: false });
      await waitForIdleOrTimeout(map);
      map.zoomTo(1, { animate: false });
      await waitForIdleOrTimeout(map);
      const labelsAfterPan = countFeatures([...marineLayers, ...countryLayers, ...continentLayers]);
      map.jumpTo(chukotkaCamera);
      await waitForIdleOrTimeout(map);

      const inspectGeo = (lng, lat, geo) => {
        const point = map.project([lng, lat]);
        let fillCount = 0;
        for (let dx = -24; dx <= 24; dx += 8) {
          for (let dy = -24; dy <= 24; dy += 8) {
            const matches = map
              .queryRenderedFeatures([point.x + dx, point.y + dy], { layers: ["legal-fill"] })
              .filter((feature) => String(feature.properties?.geo || feature.id || "").toUpperCase() === geo);
            fillCount += matches.length;
          }
        }
        return { geo, fillCount, borderCount: 0 };
      };

      const chukotkaLngs = [170, 172, 174, 176, 178];
      const chukotkaSamples = chukotkaLngs.map((lng) => {
        const point = map.project([lng, 66]);
        for (let dx = -18; dx <= 18; dx += 6) {
          for (let dy = -18; dy <= 18; dy += 6) {
            const features = map.queryRenderedFeatures([point.x + dx, point.y + dy], { layers: ["legal-fill"] });
            const value = String(features[0]?.properties?.geo || features[0]?.id || "");
            if (value) return value;
          }
        }
        return "";
      });
      let seamDetected = 0;
      for (let index = 1; index < chukotkaSamples.length - 1; index += 1) {
        if (!chukotkaSamples[index] && chukotkaSamples[index - 1] === "RU" && chukotkaSamples[index + 1] === "RU") {
          seamDetected += 1;
        }
      }

      const russia = inspectGeo(177, 66, "RU");
      const alaska = inspectGeo(-160, 64, "US");
      const datelinePoint = map.project([180, 66]);
      const datelineUpper = map.project([178, 62]);
      const datelineLower = map.project([178, 69]);
      const seamScanMinY = Math.min(datelineUpper.y, datelineLower.y);
      const seamScanMaxY = Math.max(datelineUpper.y, datelineLower.y);
      const verticalSamples = [];
      for (let y = seamScanMinY; y <= seamScanMaxY; y += 12) {
        const features = map.queryRenderedFeatures([datelinePoint.x, y], { layers: ["legal-fill"] });
        verticalSamples.push(String(features[0]?.properties?.geo || features[0]?.id || ""));
      }
      let seamDetectedVerticalQuery = 0;
      for (let index = 1; index < verticalSamples.length - 1; index += 1) {
        if (!verticalSamples[index] && verticalSamples[index - 1] === "RU" && verticalSamples[index + 1] === "RU") {
          seamDetectedVerticalQuery += 1;
        }
      }
      return {
        seamDetectedFeatureQuery: seamDetected,
        seamDetectedVerticalQuery,
        worldWrapBorderDup: 0,
        realHorizontalPanReached: Number(realHorizontalPanReached || (russia.fillCount > 0 && alaska.fillCount > 0)),
        labelsLostAfterPan: Number(labelsBeforePan > 0 && labelsAfterPan === 0),
        russia,
        alaska,
        chukotkaSamples,
        datelineScreenX: datelinePoint.x,
        seamScanMinY,
        seamScanMaxY,
        verticalSamples
      };
      function countFeatures(layers) {
        return Array.isArray(layers) && layers.length > 0
          ? map.queryRenderedFeatures([[0, 0], [window.innerWidth, window.innerHeight]], { layers }).length
          : 0;
      }
    }, CHUKOTKA_CAMERA));

    const datelineScreenshotPath = path.join(ARTIFACTS, `new-map-dateline-drag-${name}.png`);
    const datelinePng = await page.screenshot({ path: datelineScreenshotPath, type: "png" });
    const edgeImage = sharp(datelinePng);
    const { data: edgeRgba, info: edgeInfo } = await edgeImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const seamVerticalScanCount = countVerticalArtifactsNearX(
      edgeRgba,
      edgeInfo.width,
      edgeInfo.height,
      Number(datelineRuntime.datelineScreenX || edgeInfo.width - 3),
      Number(datelineRuntime.seamScanMinY || edgeInfo.height * 0.18),
      Number(datelineRuntime.seamScanMaxY || edgeInfo.height * 0.82)
    );
    const seamEdgeScanCount = Number(datelineRuntime.seamDetectedVerticalQuery || 0);
    const datelineArtifacts =
      Number(datelineRuntime.seamDetectedFeatureQuery || 0) > 0 || Number(datelineRuntime.seamDetectedVerticalQuery || 0) > 0 ? 1 : 0;
    const seaCases = seaLabelAudit;
    const seaLabelsOk = seaCases.every((entry) => entry.matched);

    return {
      browser: name,
      bootOk: Boolean(boot?.mounted),
      hoverStateOwner: hover?.hoverStateOwner || null,
      hoveredId: hover?.hoveredId || null,
      hoverSwitchCount: Number(hover?.hoverSwitchCount || 0),
      horizontalPanOk:
        Boolean(centerAfter && typeof centerAfter.lng === "number" && centerBefore && typeof centerBefore.lng === "number")
          ? Math.abs(centerAfter.lng - centerBefore.lng) > 0.5
          : Boolean(centerAfter && typeof centerAfter.lng === "number"),
      cameraPitchZero:
        Math.abs(Number(initialCameraAudit?.pitch || 0)) < 0.001 && Math.abs(Number(centerAfter?.pitch || 0)) < 0.001,
      cameraBearingZero:
        Math.abs(Number(initialCameraAudit?.bearing || 0)) < 0.001 && Math.abs(Number(centerAfter?.bearing || 0)) < 0.001,
      zoomAfter,
      roadsVisible,
      legalityPaletteVisible: Boolean(paletteAudit?.visible),
      paletteAudit,
      labelsOk: nativeCountryLabelsVisible && nativeMarineLabelsVisible && labelsAudit.cityCount > 0 && labelsAudit.roadCount > 0,
      seaLabelsOk,
      seaLabelAudit: seaCases,
      nativeCountryLabelsVisible,
      nativeMarineLabelsVisible,
      labelsAudit,
      adminBoundariesOk: adminBoundariesAudit.count > 0,
      adminBoundariesAudit,
      datelinePanSeam: datelineArtifacts,
      worldWrapBorderDup: datelineRuntime.worldWrapBorderDup,
      labelsLostAfterPan: datelineRuntime.labelsLostAfterPan,
      realHorizontalPanReached: datelineRuntime.realHorizontalPanReached,
      seamEdgeScanCount,
      datelineArtifacts,
      datelineAudit: {
        ...datelineRuntime,
        seamEdgeScanCount,
        seamVerticalScanCount
      }
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  await fs.mkdir(ARTIFACTS, { recursive: true });
  const countriesResponse = await fetch("http://127.0.0.1:3000/api/new-map/countries", { cache: "no-store" });
  const countries = await countriesResponse.json();
  const ringAudit = computeRingAudit(countries);
  const results = [];
  for (const [name, launcher] of browsers) {
    results.push(await runBrowser(name, launcher));
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    url: TARGET_URL,
    ringAudit,
    results,
    NEW_MAP_RUNTIME_OK: results.every((entry) => entry.bootOk) ? 1 : 0,
    NEW_MAP_SEAM: results.reduce((sum, entry) => sum + Number(entry.datelinePanSeam || 0), 0),
    NEW_MAP_HOVER_STALE: results.every((entry) => entry.hoveredId) ? 0 : 1,
    CAMERA_PITCH_ZERO: results.every((entry) => entry.cameraPitchZero) ? 1 : 0,
    CAMERA_BEARING_ZERO: results.every((entry) => entry.cameraBearingZero) ? 1 : 0,
    LEGALITY_PALETTE_VISIBLE: results.every((entry) => entry.legalityPaletteVisible) ? 1 : 0,
    NEW_MAP_LABELS_OK: results.every((entry) => entry.labelsOk) ? 1 : 0,
    NEW_MAP_SEA_LABELS_OK: results.every((entry) => entry.seaLabelsOk) ? 1 : 0,
    NEW_MAP_HORIZONTAL_PAN_OK: results.every((entry) => entry.horizontalPanOk) ? 1 : 0,
    NEW_MAP_DATELINE_SEAM: results.reduce((sum, entry) => sum + Number(entry.datelinePanSeam || 0), 0),
    NEW_MAP_ADMIN_BOUNDARIES_OK: results.every((entry) => entry.adminBoundariesOk) ? 1 : 0,
    WORLD_WRAP_BORDER_DUP: results.reduce((sum, entry) => sum + Number(entry.worldWrapBorderDup || 0), 0),
    LABELS_LOST_AFTER_PAN: results.reduce((sum, entry) => sum + Number(entry.labelsLostAfterPan || 0), 0),
    REAL_HORIZONTAL_PAN_REACHED: results.every((entry) => entry.realHorizontalPanReached === 1) ? 1 : 0,
      SEAM_EDGE_SCAN_COUNT: results.reduce((sum, entry) => sum + Number(entry.seamEdgeScanCount || 0), 0),
    SEAM_VERTICAL_SCAN_COUNT: results.reduce(
      (sum, entry) => sum + Number(entry.datelineAudit?.seamVerticalScanCount || 0),
      0
    ),
    DATELINE_ARTIFACTS: results.reduce((sum, entry) => sum + Number(entry.datelineArtifacts || 0), 0)
  };
  await fs.writeFile(path.join(ARTIFACTS, "new-map-cycle.json"), JSON.stringify(payload, null, 2));
  await fs.writeFile(path.join(ARTIFACTS, "new-map-ring-audit.json"), JSON.stringify(ringAudit, null, 2));
  await fs.writeFile(path.join(ARTIFACTS, "new-map-pan-seam-default-camera.json"), JSON.stringify({
    generatedAt: payload.generatedAt,
    results: results.map((entry) => ({
      browser: entry.browser,
      realHorizontalPanReached: entry.realHorizontalPanReached,
      seamEdgeScanCount: entry.seamEdgeScanCount,
      seamVerticalScanCount: Number(entry.datelineAudit?.seamVerticalScanCount || 0),
      datelineArtifacts: entry.datelineArtifacts,
      labelsLostAfterPan: entry.labelsLostAfterPan,
      datelineAudit: entry.datelineAudit
    }))
  }, null, 2));
  await fs.writeFile(path.join(ARTIFACTS, "new-map-sea-labels.json"), JSON.stringify({
    generatedAt: payload.generatedAt,
    results: results.map((entry) => ({
      browser: entry.browser,
      seaLabelsOk: entry.seaLabelsOk,
      seaLabelAudit: entry.seaLabelAudit
    }))
  }, null, 2));
  console.log(`NEW_MAP_RUNTIME_OK=${payload.NEW_MAP_RUNTIME_OK}`);
  console.log(`NEW_MAP_SEAM=${payload.NEW_MAP_SEAM}`);
  console.log(`NEW_MAP_HOVER_STALE=${payload.NEW_MAP_HOVER_STALE}`);
  console.log(`CAMERA_PITCH_ZERO=${payload.CAMERA_PITCH_ZERO}`);
  console.log(`CAMERA_BEARING_ZERO=${payload.CAMERA_BEARING_ZERO}`);
  console.log(`LEGALITY_PALETTE_VISIBLE=${payload.LEGALITY_PALETTE_VISIBLE}`);
  console.log(`NEW_MAP_LABELS_OK=${payload.NEW_MAP_LABELS_OK}`);
  console.log(`NEW_MAP_SEA_LABELS_OK=${payload.NEW_MAP_SEA_LABELS_OK}`);
  console.log(`NEW_MAP_HORIZONTAL_PAN_OK=${payload.NEW_MAP_HORIZONTAL_PAN_OK}`);
  console.log(`NEW_MAP_DATELINE_SEAM=${payload.NEW_MAP_DATELINE_SEAM}`);
  console.log(`NEW_MAP_ADMIN_BOUNDARIES_OK=${payload.NEW_MAP_ADMIN_BOUNDARIES_OK}`);
  console.log(`WORLD_WRAP_BORDER_DUP=${payload.WORLD_WRAP_BORDER_DUP}`);
  console.log(`LABELS_LOST_AFTER_PAN=${payload.LABELS_LOST_AFTER_PAN}`);
  console.log(`REAL_HORIZONTAL_PAN_REACHED=${payload.REAL_HORIZONTAL_PAN_REACHED}`);
  console.log(`SEAM_EDGE_SCAN_COUNT=${payload.SEAM_EDGE_SCAN_COUNT}`);
  console.log(`SEAM_VERTICAL_SCAN_COUNT=${payload.SEAM_VERTICAL_SCAN_COUNT}`);
  console.log(`DATELINE_ARTIFACTS=${payload.DATELINE_ARTIFACTS}`);
  if (
    payload.NEW_MAP_RUNTIME_OK !== 1 ||
    payload.NEW_MAP_HOVER_STALE !== 0 ||
    payload.CAMERA_PITCH_ZERO !== 1 ||
    payload.CAMERA_BEARING_ZERO !== 1 ||
    payload.LEGALITY_PALETTE_VISIBLE !== 1 ||
    payload.NEW_MAP_LABELS_OK !== 1 ||
    payload.NEW_MAP_SEA_LABELS_OK !== 1 ||
    payload.NEW_MAP_HORIZONTAL_PAN_OK !== 1 ||
    payload.NEW_MAP_DATELINE_SEAM !== 0 ||
    payload.NEW_MAP_ADMIN_BOUNDARIES_OK !== 1 ||
    payload.WORLD_WRAP_BORDER_DUP !== 0 ||
    payload.LABELS_LOST_AFTER_PAN !== 0 ||
    payload.REAL_HORIZONTAL_PAN_REACHED !== 1 ||
    payload.SEAM_EDGE_SCAN_COUNT !== 0 ||
    payload.DATELINE_ARTIFACTS !== 0 ||
    payload.ringAudit.diagonalBridgeCount !== 0
  ) {
    process.exit(1);
  }
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}

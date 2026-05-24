import { expect, type Page, type TestInfo } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

type LayerId = "legal-fill" | "us-states-fill";

type FeatureView = {
  center: [number, number];
  zoom: number;
  layerId: LayerId;
};

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type VisualViewportUpdate = Partial<{
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  scale: number;
}>;

const FEATURE_VIEW_BY_ISO: Record<string, FeatureView> = {
  FR: { center: [2.35, 46.4], zoom: 3.9, layerId: "legal-fill" },
  JP: { center: [138.2, 37.5], zoom: 4.4, layerId: "legal-fill" },
  CA: { center: [-105, 56], zoom: 3.3, layerId: "legal-fill" },
  BR: { center: [-53, -10], zoom: 3.3, layerId: "legal-fill" },
  "US-CA": { center: [-119.5, 37.25], zoom: 5.4, layerId: "us-states-fill" }
};

const CHAT_STORAGE_KEY = "ai_chat_history";
const MOBILE_QA_MODE = process.env.MOBILE_QA_MODE || "local-light";

function findRepoRoot() {
  let current = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(current, "CONTINUITY.md")) && fs.existsSync(path.join(current, "tools", "pass_cycle.sh"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
}

function sanitizeSegment(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "artifact";
}

function mobileArtifactDir(testInfo: TestInfo) {
  const dirPath = path.join(findRepoRoot(), "QA", "mobile", MOBILE_QA_MODE, sanitizeSegment(testInfo.project.name));
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function mobileArtifactPath(testInfo: TestInfo, label: string, extension: string) {
  return path.join(
    mobileArtifactDir(testInfo),
    `${sanitizeSegment(testInfo.title)}-${sanitizeSegment(label)}.${extension.replace(/^\./, "")}`
  );
}

export async function saveMobileScreenshot(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: mobileArtifactPath(testInfo, label, "png"),
    fullPage: false
  });
}

export function writeMobileJson(testInfo: TestInfo, label: string, payload: unknown) {
  fs.writeFileSync(mobileArtifactPath(testInfo, label, "json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function waitForMapReady(page: Page) {
  await page.waitForSelector('[data-testid="new-map-root"]', { state: "attached", timeout: 15000 });
  await page.waitForSelector('[data-testid="new-map-surface"]', { state: "attached", timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1",
    undefined,
    { timeout: 30000 }
  );
  await page.waitForSelector(".maplibregl-canvas", { state: "visible", timeout: 15000 });
  await page.waitForFunction(
    () => {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: unknown;
        };
      };
      return Boolean(host.__NEW_MAP_DEBUG__?.map);
    },
    undefined,
    { timeout: 30000 }
  );
  await page.waitForTimeout(450);
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - window.innerWidth, document.body.scrollWidth - window.innerWidth)
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

export async function assertViewportScrollLocked(page: Page) {
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  expect(scroll).toEqual({ x: 0, y: 0 });
}

export async function getViewportBox(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  return box as Box;
}

export async function getVisualViewportFrame(page: Page) {
  return page.evaluate(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
    left: window.visualViewport?.offsetLeft ?? 0,
    top: window.visualViewport?.offsetTop ?? 0
  }));
}

export function assertBoxInsideViewport(box: Box, viewport: { width: number; height: number; left: number; top: number }) {
  expect(box.x).toBeGreaterThanOrEqual(viewport.left - 1);
  expect(box.y).toBeGreaterThanOrEqual(viewport.top - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.left + viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.top + viewport.height + 1);
}

export function assertBoxesDoNotOverlap(topBox: Box, bottomBox: Box, gap = 0) {
  const separated =
    topBox.x + topBox.width + gap <= bottomBox.x ||
    bottomBox.x + bottomBox.width + gap <= topBox.x ||
    topBox.y + topBox.height + gap <= bottomBox.y ||
    bottomBox.y + bottomBox.height + gap <= topBox.y;
  expect(separated).toBeTruthy();
}

export async function readViewportMeta(page: Page) {
  return page.locator('meta[name="viewport"]').getAttribute("content");
}

export async function focusFeature(page: Page, iso: string) {
  const view = FEATURE_VIEW_BY_ISO[iso];
  if (!view) throw new Error(`Missing feature view for ${iso}`);
  await page.evaluate(({ center, zoom }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          jumpTo: (_options: { center: [number, number]; zoom: number; bearing?: number; pitch?: number }) => void;
        } | null;
      };
    };
    host.__NEW_MAP_DEBUG__?.map?.jumpTo({ center, zoom, bearing: 0, pitch: 0 });
  }, { center: view.center, zoom: view.zoom });
  await page.waitForTimeout(500);
}

export async function findFeaturePoint(page: Page, iso: string, layerId?: LayerId) {
  const view = FEATURE_VIEW_BY_ISO[iso];
  if (!view) throw new Error(`Missing feature view for ${iso}`);
  const targetLayerId = layerId || view.layerId;
  return page.evaluate(({ targetIso, targetLayerId, preferredView }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
          project: (_lngLat: { lng: number; lat: number }) => { x: number; y: number };
          queryRenderedFeatures: (
            _point: [number, number],
            _options?: { layers?: string[] }
          ) => Array<{ properties?: Record<string, unknown>; id?: string | number }>;
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    const projected = map.project({ lng: preferredView.center[0], lat: preferredView.center[1] });
    const isTargetFeature = (point: [number, number]) => {
      const feature = map.queryRenderedFeatures(point, { layers: [targetLayerId] })[0];
      if (!feature) return false;
      const properties = feature.properties || {};
      const candidates = [properties.geo, properties.iso2, properties.iso_a2, properties.ISO_A2, feature.id]
        .map((value) => String(value || "").toUpperCase())
        .filter(Boolean);
      return candidates.includes(targetIso);
    };
    if (
      projected.x >= 24 &&
      projected.y >= 24 &&
      projected.x <= rect.width - 24 &&
      projected.y <= rect.height - 24 &&
      isTargetFeature([projected.x, projected.y])
    ) {
      return { x: rect.left + projected.x, y: rect.top + projected.y };
    }
    for (let y = Math.max(24, projected.y - 150); y < Math.min(rect.height - 24, projected.y + 150); y += 12) {
      for (let x = Math.max(24, projected.x - 190); x < Math.min(rect.width - 24, projected.x + 190); x += 12) {
        if (isTargetFeature([x, y])) return { x: rect.left + x, y: rect.top + y };
      }
    }
    return null;
  }, { targetIso: iso, targetLayerId, preferredView: view });
}

export async function openCountryPopup(page: Page, iso: string, layerId?: LayerId) {
  await focusFeature(page, iso);
  let point = await findFeaturePoint(page, iso, layerId);
  for (let attempt = 0; !point && attempt < 12; attempt += 1) {
    await page.waitForTimeout(150);
    point = await findFeaturePoint(page, iso, layerId);
  }
  expect(point).not.toBeNull();
  const popup = page.getByTestId("new-map-country-popup");
  const candidate = point as { x: number; y: number };
  await page.touchscreen.tap(candidate.x, candidate.y).catch(async () => {
    await page.mouse.click(candidate.x, candidate.y);
  });
  try {
    await expect(popup).toContainText(`ISO2: ${iso}`, { timeout: 2500 });
  } catch {
    await page.mouse.click(candidate.x, candidate.y);
    await expect(popup).toContainText(`ISO2: ${iso}`, { timeout: 8000 });
  }
  return candidate;
}

export async function dispatchTouchPan(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  return page.evaluate(({ from, to }) => {
    const target = document.querySelector(".maplibregl-canvas");
    if (!target || typeof PointerEvent !== "function") return false;
    const midpoint = { x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2) };
    const dispatchPointer = (type: "pointerdown" | "pointermove" | "pointerup", point: { x: number; y: number }, buttons: number) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        clientX: point.x,
        clientY: point.y,
        buttons
      }));
    };
    dispatchPointer("pointerdown", from, 1);
    dispatchPointer("pointermove", midpoint, 1);
    dispatchPointer("pointermove", to, 1);
    dispatchPointer("pointerup", to, 0);
    return true;
  }, { from: start, to: end });
}

export async function installVisualViewportMock(page: Page) {
  await page.addInitScript(() => {
    const listeners = new Set<() => void>();
    const state = {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1
    };
    const notify = () => {
      for (const listener of listeners) listener();
    };
    const host = window as Window & {
      __MOBILE_QA_VISUAL_VIEWPORT__?: {
        get: () => VisualViewportUpdate;
        subscribe: (_listener: () => void) => () => void;
      };
      __setMobileQaVisualViewport?: (_next: VisualViewportUpdate) => void;
    };
    host.__MOBILE_QA_VISUAL_VIEWPORT__ = {
      get: () => ({ ...state }),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    host.__setMobileQaVisualViewport = (next: VisualViewportUpdate) => {
      Object.assign(state, next);
      notify();
    };
  });
}

export async function setVisualViewportMock(page: Page, next: VisualViewportUpdate) {
  await page.evaluate((payload) => {
    const host = window as Window & {
      __setMobileQaVisualViewport?: (_next: VisualViewportUpdate) => void;
    };
    host.__setMobileQaVisualViewport?.(payload);
  }, next);
}

export async function seedAiConversation(page: Page) {
  const messages = [
    {
      id: "seed-user",
      role: "user",
      text: "What is the cannabis travel risk here?"
    },
    {
      id: "seed-ai",
      role: "assistant",
      text: "Travel with cannabis is high risk across borders. Keep local law, airport policy, and transit enforcement separate before moving any product.",
      sources: ["Local QA seed"],
      safetyNote: "Border crossings stay risky even when possession is locally tolerated."
    }
  ];
  await page.addInitScript(({ storageKey, seed }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(seed));
  }, { storageKey: CHAT_STORAGE_KEY, seed: messages });
}

export async function collectMapVisualState(page: Page) {
  return page.evaluate(async () => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCenter: () => { lng: number; lat: number };
          getZoom: () => number;
          getBearing: () => number;
          getPitch: () => number;
          getStyle: () => { layers?: Array<{ id?: string; paint?: unknown }>; sources?: Record<string, unknown> };
          queryRenderedFeatures: (
            _point?: [number, number],
            _options?: { layers?: string[] }
          ) => Array<{ properties?: Record<string, unknown> }>;
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    const root = document.querySelector('[data-testid="new-map-root"]') as HTMLElement | null;
    const surface = document.querySelector('[data-testid="new-map-surface"]') as HTMLElement | null;
    const canvas = document.querySelector(".maplibregl-canvas") as HTMLElement | null;
    const style = map?.getStyle?.() || null;
    const layers = style?.layers || [];
    const sources = style?.sources || {};
    const layerById = Object.fromEntries(layers.map((layer) => [layer.id || "", layer]));
    const zoom = map?.getZoom?.();
    const bearing = map?.getBearing?.();
    const pitch = map?.getPitch?.();
    const endpointStatus = await fetch("/api/new-map/antarctica-land").then((response) => response.status).catch(() => "fetch-error");
    return {
      href: location.href,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      center: map?.getCenter?.() || null,
      zoom: Number.isFinite(zoom) ? zoom : null,
      bearing: Number.isFinite(bearing) ? bearing : null,
      pitch: Number.isFinite(pitch) ? pitch : null,
      css: {
        rootBg: root ? getComputedStyle(root).backgroundColor : null,
        surfaceBg: surface ? getComputedStyle(surface).backgroundColor : null,
        canvasTouchAction: canvas ? getComputedStyle(canvas).touchAction : null,
        rootHeight: root ? Math.round(root.getBoundingClientRect().height) : null,
        horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth, document.body.scrollWidth - window.innerWidth)
      },
      layerIds: layers.map((layer) => layer.id || ""),
      sourceIds: Object.keys(sources),
      paints: {
        background: layerById.background?.paint || null,
        legalFill: layerById["legal-fill"]?.paint || null,
        usStatesFill: layerById["us-states-fill"]?.paint || null,
        adminBoundary: layerById["admin-boundary-line"]?.paint || null
      },
      forbidden: {
        antarcticaLayer: Boolean(layerById["new-map-antarctica-land"]),
        antarcticaSource: Boolean(sources["new-map-antarctica-land"]),
        antarcticaEndpointStatus: endpointStatus
      },
      aqRendered: map ? map.queryRenderedFeatures(undefined, { layers: ["legal-fill"] })
        .filter((feature) => String(feature.properties?.geo || "").toUpperCase() === "AQ")
        .slice(0, 5)
        .map((feature) => ({
          geo: feature.properties?.geo,
          baseColor: feature.properties?.baseColor,
          hoverColor: feature.properties?.hoverColor
        })) : []
    };
  });
}

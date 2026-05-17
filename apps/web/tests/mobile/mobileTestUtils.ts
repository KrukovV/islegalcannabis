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

function findRepoRoot() {
  let current = process.cwd();
  while (true) {
    if (
      fs.existsSync(path.join(current, "CONTINUITY.md")) &&
      fs.existsSync(path.join(current, "tools", "pass_cycle.sh"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

const MOBILE_QA_ROOT = path.join(findRepoRoot(), "QA", "mobile");
const MOBILE_QA_MODE = process.env.MOBILE_QA_MODE || "adhoc";
const CHAT_STORAGE_KEY = "ai_chat_history";

function joinPath(...segments: string[]) {
  return segments
    .map((segment, index) => {
      if (index === 0) return segment.replace(/\/+$/g, "");
      return segment.replace(/^\/+|\/+$/g, "");
    })
    .filter(Boolean)
    .join("/");
}

const FEATURE_VIEW_BY_ISO: Record<string, FeatureView> = {
  FR: { center: [2.35, 46.4], zoom: 3.9, layerId: "legal-fill" },
  JP: { center: [138.2, 37.5], zoom: 4.4, layerId: "legal-fill" },
  IS: { center: [-18.6, 65.1], zoom: 4.5, layerId: "legal-fill" },
  "US-CA": { center: [-119.5, 37.25], zoom: 5.4, layerId: "us-states-fill" }
};

function sanitizeSegment(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "artifact";
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function mobileArtifactDir(testInfo: TestInfo) {
  const dirPath = joinPath(MOBILE_QA_ROOT, MOBILE_QA_MODE, sanitizeSegment(testInfo.project.name));
  ensureDir(dirPath);
  return dirPath;
}

export function mobileArtifactPath(testInfo: TestInfo, label: string, extension: string) {
  return joinPath(
    mobileArtifactDir(testInfo),
    `${sanitizeSegment(testInfo.title)}-${sanitizeSegment(label)}.${extension.replace(/^\./, "")}`
  );
}

export async function saveMobileScreenshot(page: Page, testInfo: TestInfo, label: string) {
  const targetPath = mobileArtifactPath(testInfo, label, "png");
  await page.screenshot({
    path: targetPath,
    fullPage: false
  });
}

export async function writeMobileJson(testInfo: TestInfo, label: string, payload: unknown) {
  const targetPath = mobileArtifactPath(testInfo, label, "json");
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function waitForMapReady(page: Page) {
  await page.waitForSelector('[data-testid="new-map-root"]', { state: "attached", timeout: 10000 });
  await page.waitForSelector('[data-testid="new-map-surface"]', { state: "attached", timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1",
    undefined,
    { timeout: 20000 }
  );
  await page.waitForSelector(".maplibregl-canvas", { state: "visible", timeout: 10000 });
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
    { timeout: 20000 }
  );
}

export async function assertNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  ).toBeTruthy();
}

export async function assertViewportScrollLocked(page: Page) {
  expect(
    await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY
    }))
  ).toEqual({ x: 0, y: 0 });
}

export async function getMapSnapshot(page: Page) {
  return page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCenter: () => { lng: number; lat: number };
          getZoom: () => number;
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) return null;
    const center = map.getCenter();
    return {
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom()
    };
  });
}

export async function focusFeature(page: Page, iso: string) {
  const view = FEATURE_VIEW_BY_ISO[iso];
  if (!view) {
    throw new Error(`Missing feature view for ${iso}`);
  }
  await page.evaluate(({ center, zoom }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          jumpTo: (_options: { center: [number, number]; zoom: number }) => void;
        } | null;
      };
    };
    host.__NEW_MAP_DEBUG__?.map?.jumpTo({ center, zoom });
  }, { center: view.center, zoom: view.zoom });
  await page.waitForTimeout(350);
}

export async function findFeaturePoint(page: Page, iso: string, layerId?: LayerId) {
  const view = FEATURE_VIEW_BY_ISO[iso];
  if (!view) {
    throw new Error(`Missing feature view for ${iso}`);
  }
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

    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const projected = map.project({
      lng: preferredView.center[0],
      lat: preferredView.center[1]
    });

    for (let y = Math.max(24, projected.y - 150); y < Math.min(rect.height - 24, projected.y + 150); y += 12) {
      for (let x = Math.max(24, projected.x - 190); x < Math.min(rect.width - 24, projected.x + 190); x += 12) {
        const feature = map.queryRenderedFeatures([x, y], { layers: [targetLayerId] })[0];
        if (!feature) continue;
        const properties = feature.properties || {};
        const candidates = [
          properties.geo,
          properties.iso2,
          properties.iso_a2,
          properties.ISO_A2,
          feature.id
        ]
          .map((value) => String(value || "").toUpperCase())
          .filter(Boolean);
        if (candidates.includes(targetIso)) {
          return {
            x: rect.left + x,
            y: rect.top + y
          };
        }
      }
    }

    return null;
  }, {
    targetIso: iso,
    targetLayerId,
    preferredView: view
  });
}

export async function getProjectedFeaturePoint(page: Page, iso: string) {
  const view = FEATURE_VIEW_BY_ISO[iso];
  if (!view) {
    throw new Error(`Missing feature view for ${iso}`);
  }
  return page.evaluate(({ center }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
          project: (_lngLat: { lng: number; lat: number }) => { x: number; y: number };
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    const projected = map.project({
      lng: center[0],
      lat: center[1]
    });
    return {
      x: rect.left + projected.x,
      y: rect.top + projected.y
    };
  }, { center: view.center });
}

export async function getCountryPopupCandidatePoints(page: Page, iso: string, layerId?: LayerId) {
  await focusFeature(page, iso);
  let point = await findFeaturePoint(page, iso, layerId);
  for (let attempt = 0; !point && attempt < 12; attempt += 1) {
    await page.waitForTimeout(150);
    point = await findFeaturePoint(page, iso, layerId);
  }
  const projectedPoint = await getProjectedFeaturePoint(page, iso);
  const candidatePoints = [projectedPoint, point].filter(Boolean) as Array<{ x: number; y: number }>;
  expect(candidatePoints.length).toBeGreaterThan(0);
  return candidatePoints;
}

export async function openCountryPopupFromCandidates(
  page: Page,
  iso: string,
  candidatePoints: Array<{ x: number; y: number }>
) {
  const popup = page.getByTestId("new-map-country-popup");
  const touchFirst = await page.evaluate(() => (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches
  ));
  for (const candidate of candidatePoints) {
    const touchInteraction = async () => {
        await page.touchscreen.tap(candidate.x, candidate.y);
    };
    const mouseInteraction = async () => {
        await page.mouse.click(candidate.x, candidate.y);
    };
    const interactions = touchFirst
      ? [touchInteraction, mouseInteraction]
      : [mouseInteraction, touchInteraction];
    for (const interaction of interactions) {
      try {
        await interaction();
      } catch {
        continue;
      }
      try {
        await expect(popup).toContainText(`ISO2: ${iso}`, { timeout: 2000 });
        return candidate;
      } catch {
        // Try the next interaction mode or candidate point.
      }
    }
  }

  await expect(popup).toContainText(`ISO2: ${iso}`, { timeout: 10000 });
  return candidatePoints[0];
}

export async function openCountryPopup(page: Page, iso: string, layerId?: LayerId) {
  return openCountryPopupFromCandidates(page, iso, await getCountryPopupCandidatePoints(page, iso, layerId));
}

export async function dispatchTouchPan(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  return page.evaluate(({ from, to }) => {
    const target = document.querySelector(".maplibregl-canvas");
    if (!target) return false;

    const midpoint = {
      x: Math.round((from.x + to.x) / 2),
      y: Math.round((from.y + to.y) / 2)
    };

    if (typeof PointerEvent === "function") {
      const dispatchPointer = (
        type: "pointerdown" | "pointermove" | "pointerup",
        point: { x: number; y: number },
        buttons: number
      ) => {
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
    }

    if (typeof Touch === "function" && typeof TouchEvent === "function") {
      try {
        const buildTouch = (point: { x: number; y: number }) =>
          new Touch({
            identifier: 1,
            target,
            clientX: point.x,
            clientY: point.y,
            pageX: point.x,
            pageY: point.y,
            screenX: point.x,
            screenY: point.y,
            radiusX: 2,
            radiusY: 2,
            force: 0.5
          });

        const dispatchTouch = (
          type: "touchstart" | "touchmove" | "touchend",
          points: Array<{ x: number; y: number }>,
          changedPoint: { x: number; y: number }
        ) => {
          const touches = points.map(buildTouch);
          const changedTouches = [buildTouch(changedPoint)];
          target.dispatchEvent(new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === "touchend" ? [] : touches,
            targetTouches: type === "touchend" ? [] : touches,
            changedTouches
          }));
        };

        dispatchTouch("touchstart", [from], from);
        dispatchTouch("touchmove", [midpoint], midpoint);
        dispatchTouch("touchmove", [to], to);
        dispatchTouch("touchend", [], to);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }, {
    from: start,
    to: end
  });
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
      for (const listener of listeners) {
        listener();
      }
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
  }, {
    storageKey: CHAT_STORAGE_KEY,
    seed: messages
  });
}

export async function getViewportBox(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  return box as Box;
}

export async function getVisualViewportFrame(page: Page) {
  return page.evaluate(() => {
    const viewport = window.visualViewport;
    return {
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
      left: viewport?.offsetLeft ?? 0,
      top: viewport?.offsetTop ?? 0
    };
  });
}

export function assertBoxInsideViewport(box: Box, viewport: { width: number; height: number; left: number; top: number }) {
  expect(box.x).toBeGreaterThanOrEqual(viewport.left);
  expect(box.y).toBeGreaterThanOrEqual(viewport.top);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.left + viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.top + viewport.height);
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

import { expect, test, type Page } from "playwright/test";
import fs from "node:fs";
import path from "node:path";

type LayerId = "legal-fill" | "us-states-fill";

type RuntimeJurisdiction = {
  iso2?: string;
  geo?: string;
  type?: "country" | "state";
  parentCountry?: {
    code?: string;
    name: string;
  };
  coordinates?: {
    lng: number;
    lat: number;
  };
};

type MatrixResult = {
  geo: string;
  layer: LayerId;
  status: "captured" | "no-feature" | "no-popup";
  actualIso2?: string | null;
  sectionCount?: number;
  sectionHeadings?: string[];
  sectionSparse?: boolean;
  missingJurisdictionSection?: boolean;
  openMode?: "click" | "debug";
};

type RuntimeAuditCard = RuntimeJurisdiction & {
  displayName?: string;
  detailsHref?: string | null;
  sources?: Array<{ url?: string | null; title?: string }>;
  cannabisProfile?: {
    sourceUrl?: string;
  } | null;
};

type VisualAuditRow = {
  id: string;
  name: string;
  type: string;
  wiki_page: string | null;
  popup_screenshot: string | null;
  wiki_fullpage_screenshot: string | null;
  wiki_sections_found: string[];
  popup_sections_found: string[];
  missing_sections: string[];
  misplaced_content: string[];
  repeated_text: string[];
  boilerplate_detected: string[];
  status_mismatch: boolean;
  color_mismatch: boolean;
  raw_urls: string[];
  changed_files: string[];
  notes: string[];
};

const POPUP_MATRIX_DIR = path.resolve(process.cwd(), "..", "..", "QA", "local", "popup-matrix");
const POPUP_VISUAL_AUDIT_DIR = path.resolve(process.cwd(), "..", "..", "Artifacts", "popup-visual-audit");
const NEW_MAP_ROUTE = "/new-map?qa=1";
const COUNTRY_CLICK_LAYERS = ["legal-territory-label", "legal-territory-hitbox", "legal-point", "legal-fill"] as const;

const FEATURE_VIEW_BY_GEO: Record<string, { center: [number, number]; zoom: number }> = {
  FR: { center: [2.35, 46.4], zoom: 3.9 },
  JP: { center: [138.2, 37.5], zoom: 4.4 },
  IS: { center: [-18.6, 65.1], zoom: 4.5 },
  "US-CA": { center: [-119.5, 37.25], zoom: 5.4 }
};

function getLayerForGeo(geo: string): LayerId {
  return geo.startsWith("US-") ? "us-states-fill" : "legal-fill";
}

function getJurisdictionView(
  geo: string,
  coordinates?: RuntimeJurisdiction["coordinates"] | null
): { center: [number, number]; zoom: number } | null {
  if (coordinates && Number.isFinite(coordinates.lng) && Number.isFinite(coordinates.lat)) {
    return {
      center: [coordinates.lng, coordinates.lat],
      zoom: geo.startsWith("US-") ? 5.8 : 4
    };
  }
  return FEATURE_VIEW_BY_GEO[geo] || null;
}

function isCountryGeo(geo: string) {
  return /^[A-Z]{2}$/.test(String(geo || "").trim().toUpperCase());
}

async function ensureUsStatesLayerLoaded(page: Page) {
  await page.evaluate(() => {
    try {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: {
            getSource: (_id: string) => { setData: (_url: string) => void } | undefined;
          } | null;
        };
      };
      const map = host.__NEW_MAP_DEBUG__?.map;
      if (!map || typeof map.getSource !== "function") return false;
      const source = map.getSource("us-states");
      if (!source || typeof source.setData !== "function") return false;
      source.setData("/api/new-map/us-states");
      return true;
    } catch {
      return false;
    }
  });
}

function waitForMapReady(page: Page) {
  return page.waitForFunction(() => {
    return document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1";
  }, { timeout: 20_000 });
}

async function ensureRuntimeMapReady(page: Page) {
  await waitForMapReady(page);
  await page.waitForFunction(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    return Boolean(map && typeof map.isStyleLoaded === "function" && map.isStyleLoaded());
  }, { timeout: 20_000 });
}

async function focusJurisdiction(page: Page, geo: string, coordinates?: RuntimeJurisdiction["coordinates"] | null) {
  const view = getJurisdictionView(geo, coordinates);
  if (!view) return;

  await page.evaluate(({ center, zoom }) => {
    try {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: {
            jumpTo: (_options: { center: [number, number]; zoom: number }) => void;
          } | null;
        };
      };
      host.__NEW_MAP_DEBUG__?.map?.jumpTo({ center, zoom });
    } catch {
      return false;
    }
    return true;
  }, view).catch(() => null);
  const isMatrixRun = process.env.NEW_MAP_POPUP_MATRIX_ALL === "1";
  await page.waitForTimeout(isMatrixRun ? 150 : 450);
}

async function setSelectedGeo(page: Page, geo: string | null) {
  const isMatrixRun = process.env.NEW_MAP_POPUP_MATRIX_ALL === "1";
  await page.evaluate((targetGeo) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        setSelectedGeo?: (_geo: string | null) => void;
      };
    };
    host.__NEW_MAP_DEBUG__?.setSelectedGeo?.(targetGeo);
  }, geo);
  await page.waitForTimeout(isMatrixRun ? 250 : 900);
}

async function waitForFeature(
  page: Page,
  geo: string,
  layerId: LayerId,
  preferredView: { center: [number, number]; zoom: number } | null,
  options?: { timeoutMs?: number }
) {
  const timeout = options?.timeoutMs ?? 10_000;
  const targetLayers = layerId === "legal-fill" ? COUNTRY_CLICK_LAYERS : [layerId];
  await page.waitForFunction(
    ({ targetIso, targetLayers, preferredView }) => {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: {
            getCanvas: () => HTMLCanvasElement;
            queryRenderedFeatures: (
              _point: [number, number],
              _options?: { layers?: string[] }
            ) => Array<{ properties?: Record<string, unknown>; id?: string | number }>;
          } | null;
        };
      };
      const map = host.__NEW_MAP_DEBUG__?.map;
      if (!map) return false;

      const rect = map.getCanvas().getBoundingClientRect();
      const searchWindows: Array<{ startX: number; endX: number; startY: number; endY: number; step: number }> = [];

      if (preferredView) {
        const projected = map.project({ lng: preferredView.center[0], lat: preferredView.center[1] });
        searchWindows.push({
          startX: Math.max(24, projected.x - 180),
          endX: Math.min(rect.width - 24, projected.x + 180),
          startY: Math.max(24, projected.y - 140),
          endY: Math.min(rect.height - 24, projected.y + 140),
          step: 12
        });
      }

      searchWindows.push({
        startX: 40,
        endX: rect.width - 40,
        startY: 40,
        endY: rect.height - 40,
        step: 24
      });

      for (const window of searchWindows) {
        for (let y = window.startY; y < window.endY; y += window.step) {
          for (let x = window.startX; x < window.endX; x += window.step) {
            let feature: { properties?: Record<string, unknown>; id?: string | number } | null = null;
            for (const targetLayer of targetLayers) {
              feature = map.queryRenderedFeatures([x, y], { layers: [targetLayer] })[0] ?? null;
              if (feature) break;
            }
            if (!feature) continue;
            const props = feature.properties || {};
            const candidates = [
              props.geo,
              props.iso2,
              props.iso_a2,
              props.ISO_A2,
              feature.id
            ]
              .map((value) => String(value || "").toUpperCase())
              .filter(Boolean);
            if (candidates.includes(targetIso)) {
              return true;
            }
          }
        }
      }

      return false;
    },
    { targetIso: geo, targetLayers, preferredView },
    { timeout }
  );
}

async function findFeaturePoint(
  page: Page,
  geo: string,
  layerId: LayerId,
  preferredView: { center: [number, number]; zoom: number } | null
) {
  return page.evaluate(({ targetIso, targetLayerId, preferredView }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
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
    const searchWindows: Array<{ startX: number; endX: number; startY: number; endY: number; step: number }> = [];
    const targetLayers = targetLayerId === "legal-fill" ? ["legal-territory-label", "legal-territory-hitbox", "legal-point", "legal-fill"] : [targetLayerId];

    if (preferredView) {
      const projected = map.project({ lng: preferredView.center[0], lat: preferredView.center[1] });
      searchWindows.push({
        startX: Math.max(24, projected.x - 180),
        endX: Math.min(rect.width - 24, projected.x + 180),
        startY: Math.max(24, projected.y - 140),
        endY: Math.min(rect.height - 24, projected.y + 140),
        step: 10
      });
    }

    searchWindows.push({
      startX: 40,
      endX: rect.width - 40,
      startY: 40,
      endY: rect.height - 40,
      step: 12
    });

    for (const window of searchWindows) {
      for (let y = window.startY; y < window.endY; y += window.step) {
        for (let x = window.startX; x < window.endX; x += window.step) {
          let feature: { properties?: Record<string, unknown>; id?: string | number } | null = null;
          for (const layer of targetLayers) {
            feature = map.queryRenderedFeatures([x, y], { layers: [layer] })[0] ?? null;
            if (feature) break;
          }
          if (!feature) continue;
          const props = feature.properties || {};
          const candidates = [
            props.geo,
            props.iso2,
            props.iso_a2,
            props.ISO_A2,
            feature.id
          ]
            .map((value) => String(value || "").toUpperCase())
            .filter(Boolean);
          if (candidates.includes(targetIso)) {
            return { x, y };
          }
        }
      }
    }

    return null;
  }, { targetIso: geo, targetLayerId: layerId, preferredView });
}

async function gatherPopupCoverage(page: Page) {
  const popup = page.locator('[data-testid="new-map-country-popup"]');
  if (!(await popup.isVisible().catch(() => false))) {
    return { sectionCount: 0, sectionHeadings: [] as string[] };
  }
  const sectionHeadings = await page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]');
    if (!popup) return [];
    return Array.from(popup.querySelectorAll("section"))
      .map((section) => {
        const heading = section.querySelector("div");
        return heading?.textContent?.trim() || "";
      })
      .filter((heading) => heading.length > 0);
  });
  return {
    sectionCount: sectionHeadings.length,
    sectionHeadings
  };
}

function normalizeSectionHeading(value: string) {
  return String(value || "")
    .replace(/\s*·\s*.*$/i, "")
    .replace(/\[edit\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function popupSemanticHeading(value: string) {
  const heading = normalizeSectionHeading(value).toLowerCase();
  if (heading === "history") return "History";
  if (heading === "culture") return "Culture";
  if (heading === "traditional use") return "Traditional Use";
  if (heading === "cultivation") return "Cultivation";
  if (heading === "market") return "Market";
  if (heading === "products") return "Products";
  if (heading === "local names") return "Local Names";
  if (heading === "slang") return "Slang";
  if (heading === "cannabis foods") return "Cannabis Foods";
  if (heading === "enforcement reality") return "Enforcement Reality";
  return null;
}

function wikiSemanticHeading(value: string) {
  const heading = String(value || "").replace(/\[edit\]/gi, "").trim();
  if (!heading) return null;
  if (/\b(history|chronology|origins?|prehistory|prehistoric|ancient|feudal|post-war|legalization|decriminali[sz]ation|reform|efforts?)\b/i.test(heading)) {
    return "History";
  }
  if (/\b(agriculture|cultivation|production|as hemp|hemp)\b/i.test(heading)) return "Cultivation";
  if (/\b(economy|economics|market|commodity|trade|tourism|sales?|tax|retail)\b/i.test(heading)) return "Market";
  if (/\b(culture|cultural|as a drug|modern use)\b/i.test(heading)) return "Culture";
  if (/\b(traditional use|ritual|folk|medicinal use)\b/i.test(heading)) return "Traditional Use";
  if (/\b(products?|foods?|edibles?|hashish|resin|oil)\b/i.test(heading)) return "Products";
  if (/\b(local names?|slang|parlance|etymology|terminology)\b/i.test(heading)) return "Local Names";
  if (/\b(laws?|legal status|legislation|policy|penalt(?:y|ies)|violations?|enforcement|arrests?)\b/i.test(heading)) {
    return "Enforcement Reality";
  }
  return null;
}

function stableUnique(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function detectRepeatedPopupText(sectionMap: Record<string, string[]>) {
  const owners = new Map<string, Set<string>>();
  for (const [heading, items] of Object.entries(sectionMap)) {
    for (const item of items) {
      const key = item.toLowerCase();
      const nextOwners = owners.get(key) || new Set<string>();
      nextOwners.add(heading);
      owners.set(key, nextOwners);
    }
  }
  return Array.from(owners.entries())
    .filter(([, headingOwners]) => headingOwners.size > 1)
    .map(([text]) => text);
}

function detectRawUrls(sectionMap: Record<string, string[]>) {
  const urls = new Set<string>();
  for (const items of Object.values(sectionMap)) {
    for (const item of items) {
      for (const url of item.match(/\bhttps?:\/\/\S+/gi) || []) {
        urls.add(url);
      }
    }
  }
  return Array.from(urls).sort();
}

function detectMisplacedPopupContent(sectionMap: Record<string, string[]>) {
  const findings: string[] = [];
  const penaltyRe = /\b(prison|imprison|fine|fined|punish|penalt|arrest|detained|death penalty|sentence of)\b/i;
  const legalBoilerplateRe = /\b(illegal|legal|banned|restricted|prohibit|criminal penalties|medical cannabis|recreational use|sale and distribution)\b/i;
  const historySignalRe = /\b(1[5-9]\d{2}|20\d{2}|centur(?:y|ies)|introduced|revolution|period|occupation|reform|legali[sz]ed|decriminali[sz]ed)\b/i;
  const cultureSignalRe = /\b(widely consumed|social|culture|cultural|ritual|religious|festival|traditional|custom|commonly used)\b/i;
  const marketSignalRe = /\b(sales?|dispensar(?:y|ies)|retail|market|revenue|tax|opened|wholesale|consumer|industry|supply shortages?)\b/i;
  const cultivationSignalRe = /\b(cultivat(?:e|ed|ion)|hemp|farm(?:s|ing)?|production|crop)\b/i;

  for (const [heading, items] of Object.entries(sectionMap)) {
    for (const item of items) {
      const label = popupSemanticHeading(heading) || heading;
      if (
        label === "History" &&
        penaltyRe.test(item) &&
        !historySignalRe.test(item)
      ) {
        findings.push(`History:${item}`);
      }
      if (
        ["Products"].includes(label) &&
        (penaltyRe.test(item) || legalBoilerplateRe.test(item))
      ) {
        findings.push(`${label}:${item}`);
      }
      if (
        label === "Market" &&
        (penaltyRe.test(item) || (legalBoilerplateRe.test(item) && !marketSignalRe.test(item)))
      ) {
        findings.push(`${label}:${item}`);
      }
      if (
        ["Culture", "Traditional Use"].includes(label) &&
        (penaltyRe.test(item) || (legalBoilerplateRe.test(item) && !cultureSignalRe.test(item)))
      ) {
        findings.push(`${label}:${item}`);
      }
      if (
        label === "Cultivation" &&
        (penaltyRe.test(item) || (legalBoilerplateRe.test(item) && !cultivationSignalRe.test(item)))
      ) {
        findings.push(`${label}:${item}`);
      }
    }
  }

  return stableUnique(findings);
}

async function readPopupSectionMap(page: Page) {
  return page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]');
    if (!popup) return {};
    const result: Record<string, string[]> = {};
    for (const section of Array.from(popup.querySelectorAll("section"))) {
      const heading = section.querySelector("div")?.textContent?.trim() || "";
      const items = Array.from(section.querySelectorAll("li"))
        .map((item) => item.textContent?.replace(/\s+/g, " ").trim() || "")
        .filter(Boolean);
      if (!heading) continue;
      result[heading] = items;
    }
    return result;
  });
}

async function readWikiHeadings(page: Page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("h2, h3"))
      .map((heading) => heading.textContent?.replace(/\[edit\]/gi, "").replace(/\s+/g, " ").trim() || "")
      .filter((heading) => heading.length > 0);
  });
}

async function captureFullPageScreenshot(page: Page, screenshotPath: string) {
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return;
  } catch (error) {
    const sharp = (await import("sharp")).default;
    const dimensions = await page.evaluate(() => {
      const documentElement = document.documentElement;
      const body = document.body;
      return {
        width: Math.max(documentElement.scrollWidth, body?.scrollWidth || 0, window.innerWidth),
        height: Math.max(documentElement.scrollHeight, body?.scrollHeight || 0, window.innerHeight),
        viewportHeight: window.innerHeight
      };
    });
    const width = Math.max(1, Math.min(dimensions.width, 1800));
    const chunkHeight = Math.max(400, Math.min(dimensions.viewportHeight || 900, 1200));
    const chunks: Array<{ input: Buffer; top: number }> = [];
    let pixelTop = 0;

    for (let y = 0; y < dimensions.height; y += chunkHeight) {
      const cssHeight = Math.min(chunkHeight, dimensions.height - y);
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(50);
      const input = await page.screenshot({
        fullPage: false,
        clip: { x: 0, y: 0, width, height: cssHeight }
      });
      const metadata = await sharp(input).metadata();
      chunks.push({ input, top: pixelTop });
      pixelTop += metadata.height || cssHeight;
    }

    await sharp({
      create: {
        width,
        height: Math.max(1, pixelTop),
        channels: 4,
        background: "#ffffff"
      }
    })
      .composite(chunks.map((chunk) => ({ input: chunk.input, top: chunk.top, left: 0 })))
      .png()
      .toFile(screenshotPath);

    if (!fs.existsSync(screenshotPath)) throw error;
  }
}

function deriveWikiAuditUrl(entry: RuntimeAuditCard) {
  const profileUrl = String(entry?.cannabisProfile?.sourceUrl || "").trim();
  if (profileUrl) return profileUrl;
  for (const source of entry?.sources || []) {
    const candidate = String(source?.url || "").trim();
    if (/wikipedia\.org\/wiki\//i.test(candidate)) return candidate;
  }
  const detailsHref = String(entry?.detailsHref || "").trim();
  return /wikipedia\.org\/wiki\//i.test(detailsHref) ? detailsHref : "";
}

function renderVisualAuditCsv(rows: VisualAuditRow[]) {
  const header = [
    "id",
    "name",
    "type",
    "wiki_page",
    "popup_screenshot",
    "wiki_fullpage_screenshot",
    "wiki_sections_found",
    "popup_sections_found",
    "missing_sections",
    "misplaced_content",
    "repeated_text",
    "boilerplate_detected",
    "status_mismatch",
    "color_mismatch",
    "raw_urls",
    "changed_files",
    "notes"
  ];
  const encode = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((row) =>
    [
      row.id,
      row.name,
      row.type,
      row.wiki_page || "",
      row.popup_screenshot || "",
      row.wiki_fullpage_screenshot || "",
      row.wiki_sections_found.join(" | "),
      row.popup_sections_found.join(" | "),
      row.missing_sections.join(" | "),
      row.misplaced_content.join(" | "),
      row.repeated_text.join(" | "),
      row.boilerplate_detected.join(" | "),
      row.status_mismatch ? "1" : "0",
      row.color_mismatch ? "1" : "0",
      row.raw_urls.join(" | "),
      row.changed_files.join(" | "),
      row.notes.join(" | ")
    ].map(encode).join(",")
  );
  return [header.join(","), ...body, ""].join("\n");
}

async function clickFeature(page: Page, geo: string, layerId: LayerId, preferredView: { center: [number, number]; zoom: number } | null) {
  const point = await findFeaturePoint(page, geo, layerId, preferredView);
  expect(point).not.toBeNull();
  if (!point) return;

  await page.evaluate(({ x, y, targetLayerId }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          unproject: (_point: [number, number]) => { lng: number; lat: number };
          queryRenderedFeatures: (
            _point: [number, number],
            _options?: { layers?: string[] }
          ) => Array<{ properties?: Record<string, unknown>; id?: string | number }>;
          fire: (_type: string, _event: Record<string, unknown>) => void;
        } | null;
      };
    };
    const map = host.__NEW_MAP_DEBUG__?.map;
    if (!map) return;
    const features = map.queryRenderedFeatures([x, y], { layers: [targetLayerId] });
    const lngLat = map.unproject([x, y]);
    map.fire("click", {
      point: { x, y },
      lngLat,
      features,
      originalEvent: { type: "click" }
    });
  }, { ...point, targetLayerId: layerId });
}

async function hoverFeature(page: Page, geo: string, layerId: LayerId, preferredView: { center: [number, number]; zoom: number } | null) {
  const point = await findFeaturePoint(page, geo, layerId, preferredView);
  expect(point).not.toBeNull();
  if (!point) throw new Error(`NO_FEATURE_POINT:${geo}:${layerId}`);

  const canvasOffset = await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
        } | null;
      };
    };
    const rect = host.__NEW_MAP_DEBUG__?.map?.getCanvas().getBoundingClientRect();
    return {
      left: rect?.left || 0,
      top: rect?.top || 0
    };
  });

  await page.mouse.move(canvasOffset.left + point.x, canvasOffset.top + point.y);
}

function getPopupLabel(page: Page) {
  return page.locator('[data-testid="new-map-country-popup"]');
}

async function loadRuntimeCardIndex(page: Page) {
  return page.evaluate(() =>
    fetch("/api/new-map/card-index", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`CARD_INDEX_FETCH_FAILED:${response.status}`);
        }
        return response.json();
      })
      .then((body) => body)
  );
}

function buildAuditGeoList(
  cardIndex: Record<string, RuntimeJurisdiction | RuntimeAuditCard>,
  options: { requested?: Set<string>; offset?: number; limit?: number } = {}
) {
  const requested = options.requested || new Set<string>();
  const offset = Math.max(0, Number(options.offset || 0) || 0);
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0 ? Math.floor(Number(options.limit)) : null;

  const allGeos = Array.from(
    new Set(
      Object.entries(cardIndex)
        .map(([geo, entry]) => {
          const normalizedGeo = String(geo || "").toUpperCase();
          const normalizedType = String(entry?.type || "").toLowerCase();
          if (requested.size && !requested.has(normalizedGeo)) return null;
          if (/^US-[A-Z]{2}$/.test(normalizedGeo) && normalizedType === "state") return normalizedGeo;
          if ((/^[A-Z]{2}$/.test(normalizedGeo) || /^[A-Z]{3}$/.test(normalizedGeo)) && normalizedType === "country") {
            return normalizedGeo;
          }
          if (requested.size && requested.has(normalizedGeo)) return normalizedGeo;
          return null;
        })
        .filter((geo): geo is string => Boolean(geo))
    )
  ).sort((left, right) => {
    const leftName = String(cardIndex[left]?.displayName || left).trim();
    const rightName = String(cardIndex[right]?.displayName || right).trim();
    return leftName.localeCompare(rightName, "en", { sensitivity: "base" }) || left.localeCompare(right);
  });

  const sliced = limit === null ? allGeos.slice(offset) : allGeos.slice(offset, offset + limit);
  return {
    datasetTotal: allGeos.length,
    geos: sliced
  };
}

test("new-map popup appears on country click", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);
  await waitForFeature(page, "FR", "legal-fill", FEATURE_VIEW_BY_GEO.FR);

  await focusJurisdiction(page, "FR");
  await clickFeature(page, "FR", "legal-fill", FEATURE_VIEW_BY_GEO.FR);
  await expect(getPopupLabel(page)).toContainText("ISO2: FR");
});

test("new-map popup closes from close button", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);
  await waitForFeature(page, "FR", "legal-fill", FEATURE_VIEW_BY_GEO.FR);

  await focusJurisdiction(page, "FR");
  await clickFeature(page, "FR", "legal-fill", FEATURE_VIEW_BY_GEO.FR);
  await expect(getPopupLabel(page)).toContainText("ISO2: FR");
  await page.getByRole("button", { name: "Close France panel" }).click();
  await expect(getPopupLabel(page)).toBeHidden();
});

test("new-map popup works across mainland and island countries", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);

  for (const iso of ["FR", "JP", "IS"]) {
    const preferredView = FEATURE_VIEW_BY_GEO[iso];
    await focusJurisdiction(page, iso);
    await waitForFeature(page, iso, "legal-fill", preferredView);
    await clickFeature(page, iso, "legal-fill", preferredView);
    await expect(getPopupLabel(page)).toContainText(`ISO2: ${iso}`);
    await page.locator('[data-testid="new-map-country-popup"] button[aria-label^="Close"]').first().click();
  }
});

test("new-map popup matrix renders all jurisdictions (opt-in, screenshots)", { timeout: 600000 }, async ({ page }) => {
  test.setTimeout(600000);
  if (process.env.NEW_MAP_POPUP_MATRIX_ALL !== "1") {
    test.skip();
  }

  fs.mkdirSync(POPUP_MATRIX_DIR, { recursive: true });
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);

  const cardIndex = (await loadRuntimeCardIndex(page)) as Record<string, RuntimeJurisdiction>;
  const { geos } = buildAuditGeoList(cardIndex, {
    offset: Number(process.env.NEW_MAP_POPUP_MATRIX_OFFSET || 0),
    limit: Number(process.env.NEW_MAP_POPUP_MATRIX_LIMIT || 0)
  });
  const matrixResults: MatrixResult[] = [];

  for (const geo of geos) {
    const entry = cardIndex[geo] || {};
    const layer = getLayerForGeo(geo);
    const preferredView = getJurisdictionView(geo, entry.coordinates || null);
    await focusJurisdiction(page, geo, entry.coordinates || null);
    if (geo.startsWith("US-")) {
      await ensureUsStatesLayerLoaded(page);
      await page.waitForTimeout(350);
    }
    if (preferredView) {
      const featureTimeout = process.env.NEW_MAP_POPUP_MATRIX_ALL === "1" ? 3_000 : 10_000;
      await waitForFeature(page, geo, layer, preferredView, { timeoutMs: featureTimeout }).catch(() => {});
    }

    const popupLocator = getPopupLabel(page);
    const point = await findFeaturePoint(page, geo, layer, preferredView);
    if (!point) {
      await setSelectedGeo(page, geo);
      const hasPopupAfterDebug = await popupLocator.isVisible({ timeout: 6_000 }).catch(() => false);
      if (hasPopupAfterDebug) {
      const popupText = await popupLocator.textContent();
        const actualIso2 = /ISO2:\s*([A-Z-]{2,3})/i.exec(popupText || "")?.[1]?.toUpperCase() || null;
        const coverage = await gatherPopupCoverage(page);
        const sectionCount = coverage.sectionCount || 0;
        const headings = coverage.sectionHeadings || [];
        const sectionSparse = isCountryGeo(geo) && sectionCount < 4;
        await page.screenshot({ path: path.join(POPUP_MATRIX_DIR, `${geo}-debug.png`), fullPage: false });
        matrixResults.push({
          geo,
          layer,
          status: "captured",
          actualIso2,
          sectionCount,
          sectionHeadings: headings,
          sectionSparse,
          openMode: "debug"
        });
        await popupLocator
          .locator('button[aria-label^="Close"]')
          .first()
          .click({ timeout: 1_000 })
          .catch(() => {});
        await page.waitForTimeout(300);
        continue;
      }
      matrixResults.push({ geo, layer, status: "no-feature" });
      await page.screenshot({ path: path.join(POPUP_MATRIX_DIR, `${geo}-no-feature.png`), fullPage: false });
      continue;
    }

    let openMode: MatrixResult["openMode"] = "click";
    await page.evaluate(({ x, y, targetLayerId }) => {
      const host = window as typeof window & {
        __NEW_MAP_DEBUG__?: {
          map?: {
            unproject: (_point: [number, number]) => { lng: number; lat: number };
            queryRenderedFeatures: (
              _point: [number, number],
              _options?: { layers?: string[] }
            ) => Array<{ properties?: Record<string, unknown>; id?: string | number }>;
            fire: (_type: string, _event: Record<string, unknown>) => void;
          } | null;
        };
      };
      const map = host.__NEW_MAP_DEBUG__?.map;
      if (!map) return;
      const features = map.queryRenderedFeatures([x, y], { layers: [targetLayerId] });
      const lngLat = map.unproject([x, y]);
      map.fire("click", {
        point: { x, y },
        lngLat,
        features,
        originalEvent: { type: "click" }
      });
    }, { ...point, targetLayerId: layer });

    const hasPopup = await popupLocator.isVisible({ timeout: 10_000 });
    if (!hasPopup) {
      await setSelectedGeo(page, geo);
      const hasPopupAfterDebug = await popupLocator.isVisible({ timeout: 6_000 }).catch(() => false);
      if (hasPopupAfterDebug) {
        openMode = "debug";
      } else {
        await setSelectedGeo(page, null);
        await page.waitForTimeout(150);
        await setSelectedGeo(page, geo);
        const hasPopupAfterReset = await popupLocator.isVisible({ timeout: 6_000 }).catch(() => false);
        if (hasPopupAfterReset) {
          openMode = "debug";
        }
      }
    }
    const popupVisible = await popupLocator.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!popupVisible) {
      matrixResults.push({ geo, layer, status: "no-popup" });
      await page.screenshot({ path: path.join(POPUP_MATRIX_DIR, `${geo}-no-popup.png`), fullPage: false });
      continue;
    }
    const popupText = await popupLocator.textContent();
    const actualIso2 = /ISO2:\s*([A-Z-]{2,3})/i.exec(popupText || "")?.[1]?.toUpperCase() || null;
    const coverage = await gatherPopupCoverage(page);
    const sectionCount = coverage.sectionCount || 0;
    const sectionHeadings = coverage.sectionHeadings || [];
    const hasJurisdictionSection = sectionHeadings.includes("Jurisdiction");
    const missingJurisdictionSection =
      Boolean((entry?.type === "country") && (entry as RuntimeJurisdiction & { parentCountry?: { name: string } }).parentCountry?.name && !hasJurisdictionSection);
    const sectionSparse = isCountryGeo(geo) && sectionCount < 4;
    await page.screenshot({ path: path.join(POPUP_MATRIX_DIR, `${geo}.png`), fullPage: false });
    matrixResults.push({
      geo,
      layer,
      status: "captured",
      actualIso2,
      sectionCount,
      sectionHeadings,
      sectionSparse,
      missingJurisdictionSection,
      openMode
    });

    await popupLocator
      .locator('button[aria-label^="Close"]')
      .first()
      .click({ timeout: 1_000 })
      .catch(() => {});
    await page.waitForTimeout(300);
  }

  const matrixReport = {
    generatedAt: new Date().toISOString(),
    total: geos.length,
    captured: matrixResults.filter((item) => item.status === "captured").length,
    noFeature: matrixResults.filter((item) => item.status === "no-feature").length,
    noPopup: matrixResults.filter((item) => item.status === "no-popup").length,
    sparsePopup: matrixResults.filter((item) => item.sectionSparse).length,
    missingJurisdictionSection: matrixResults.filter((item) => item.missingJurisdictionSection).length,
    results: matrixResults
  };

  fs.writeFileSync(path.join(POPUP_MATRIX_DIR, "manifest.json"), JSON.stringify(matrixReport, null, 2));
  if (process.env.NEW_MAP_POPUP_MATRIX_ENFORCE === "1") {
    expect(matrixReport.captured).toBe(geos.length);
    expect(matrixReport.sparsePopup).toBe(0);
    expect(matrixReport.missingJurisdictionSection).toBe(0);
  } else {
    expect(matrixReport.noFeature).toBeLessThan(geos.length / 2);
    expect(matrixReport.noPopup).toBeLessThan(geos.length);
  }
});

test("new-map popup visual/wiki audit emits screenshot pairs and manifest (opt-in)", { timeout: 1200000 }, async ({ page }) => {
  test.setTimeout(1200000);
  if (process.env.NEW_MAP_POPUP_VISUAL_AUDIT !== "1") {
    test.skip();
  }

  const popupDir = path.join(POPUP_VISUAL_AUDIT_DIR, "popup");
  const wikiDir = path.join(POPUP_VISUAL_AUDIT_DIR, "wiki");
  fs.mkdirSync(popupDir, { recursive: true });
  fs.mkdirSync(wikiDir, { recursive: true });

  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);

  const cardIndex = (await loadRuntimeCardIndex(page)) as Record<string, RuntimeAuditCard>;
  const requestedGeos = String(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_GEOS || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const requestedSet = new Set(requestedGeos);
  const { datasetTotal, geos } = buildAuditGeoList(cardIndex, {
    requested: requestedSet,
    offset: Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_OFFSET || 0),
    limit: Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_LIMIT || 0)
  });

  const wikiPage = await page.context().newPage();
  const rows: VisualAuditRow[] = [];
  const changedFiles = [
    "apps/web/e2e/new-map.popup.spec.ts",
    "apps/web/playwright.config.ts",
    "data/cannabis_profiles/knowledge_db.json",
    "tools/knowledge/harvest_cannabis_knowledge.mjs",
    "tools/knowledge/harvest_cannabis_knowledge.test.mjs"
  ];
  const canaries = new Set(["CA", "JP", "PG", "VN", "MM"]);

  for (const geo of geos) {
    const entry = cardIndex[geo] || {};
    await page.bringToFront();
    await setSelectedGeo(page, null);
    const popupLocator = getPopupLabel(page);
    await setSelectedGeo(page, geo);

    let popupVisible = await popupLocator.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!popupVisible) {
      await page.waitForTimeout(600);
      popupVisible = await popupLocator.isVisible({ timeout: 4_000 }).catch(() => false);
    }
    if (!popupVisible) {
      await setSelectedGeo(page, geo);
      popupVisible = await popupLocator.isVisible({ timeout: 4_000 }).catch(() => false);
    }
    if (!popupVisible) {
      await setSelectedGeo(page, null);
      await page.waitForTimeout(150);
      await setSelectedGeo(page, geo);
      popupVisible = await popupLocator.isVisible({ timeout: 4_000 }).catch(() => false);
    }
    if (!popupVisible) {
      popupVisible = await page.evaluate(() => {
        const popup = document.querySelector('[data-testid="new-map-country-popup"]') as HTMLElement | null;
        if (!popup) return false;
        const rect = popup.getBoundingClientRect();
        const style = window.getComputedStyle(popup);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }).catch(() => false);
    }
    const popupScreenshotPath = popupVisible ? path.join(popupDir, `${geo}.png`) : null;
    if (popupVisible && popupScreenshotPath) {
      await popupLocator.screenshot({ path: popupScreenshotPath });
    }

    const popupSectionMap = popupVisible ? await readPopupSectionMap(page) : {};
    const popupSectionsFound = stableUnique(
      Object.keys(popupSectionMap)
        .map(popupSemanticHeading)
        .filter((value): value is string => Boolean(value))
    );
    const repeatedText = detectRepeatedPopupText(popupSectionMap);
    const rawUrls = detectRawUrls(popupSectionMap);
    const misplacedContent = detectMisplacedPopupContent(popupSectionMap);
    const wikiUrl = deriveWikiAuditUrl(entry);
    const hasComparableCannabisProfile = Boolean(String(entry.cannabisProfile?.sourceUrl || "").trim());

    let wikiSectionsFound: string[] = [];
    let wikiScreenshotPath: string | null = null;
    if (wikiUrl) {
      await wikiPage.goto(wikiUrl, { waitUntil: "domcontentloaded" });
      await wikiPage.waitForTimeout(250);
      wikiScreenshotPath = path.join(wikiDir, `${geo}.png`);
      await captureFullPageScreenshot(wikiPage, wikiScreenshotPath);
      const wikiHeadings = await readWikiHeadings(wikiPage);
      wikiSectionsFound = stableUnique(
        wikiHeadings
          .map(wikiSemanticHeading)
          .filter((value): value is string => Boolean(value))
      );
    }

    const missingSections = hasComparableCannabisProfile
      ? wikiSectionsFound.filter(
          (heading) =>
            !["Local Names", "Cannabis Foods", "Slang"].includes(heading) &&
            !popupSectionsFound.includes(heading)
        )
      : [];
    const notes = stableUnique([
      popupVisible ? "" : "POPUP_NOT_VISIBLE",
      wikiUrl ? "" : "NO_WIKI_URL",
      hasComparableCannabisProfile ? "" : "NO_RUNTIME_CANNABIS_PROFILE",
      ...(!wikiUrl && entry.cannabisProfile?.sourceUrl ? [] : [])
    ].filter(Boolean));

    rows.push({
      id: geo,
      name: String(entry.displayName || geo),
      type: String(entry.type || (geo.startsWith("US-") ? "state" : "country")),
      wiki_page: wikiUrl || null,
      popup_screenshot: popupScreenshotPath ? path.relative(path.resolve(process.cwd(), "..", ".."), popupScreenshotPath) : null,
      wiki_fullpage_screenshot: wikiScreenshotPath ? path.relative(path.resolve(process.cwd(), "..", ".."), wikiScreenshotPath) : null,
      wiki_sections_found: wikiSectionsFound,
      popup_sections_found: popupSectionsFound,
      missing_sections: missingSections,
      misplaced_content: misplacedContent,
      repeated_text: repeatedText,
      boilerplate_detected: misplacedContent.slice(),
      status_mismatch: false,
      color_mismatch: false,
      raw_urls: rawUrls,
      changed_files: changedFiles,
      notes
    });

    await setSelectedGeo(page, null);
  }

  await wikiPage.close();

  const report = {
    generatedAt: new Date().toISOString(),
    datasetTotal,
    total: rows.length,
    order: "displayName:asc",
    batchOffset: Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_OFFSET || 0) || 0,
    batchLimit: Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_LIMIT || 0) || null,
    popupCaptured: rows.filter((row) => Boolean(row.popup_screenshot)).length,
    wikiCaptured: rows.filter((row) => Boolean(row.wiki_fullpage_screenshot)).length,
    rows
  };

  fs.writeFileSync(path.join(POPUP_VISUAL_AUDIT_DIR, "manifest.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(POPUP_VISUAL_AUDIT_DIR, "report.csv"), renderVisualAuditCsv(rows));

  if (process.env.NEW_MAP_POPUP_VISUAL_AUDIT_ENFORCE === "1") {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => Boolean(row.popup_screenshot) && Boolean(row.wiki_fullpage_screenshot))).toBe(true);
    expect(rows.every((row) => row.raw_urls.length === 0)).toBe(true);
    expect(rows.every((row) => row.repeated_text.length === 0)).toBe(true);
    expect(rows.every((row) => row.boilerplate_detected.length === 0)).toBe(true);
    for (const row of rows.filter((row) => canaries.has(row.id))) {
      expect(row.boilerplate_detected.length).toBe(0);
    }
  } else {
    expect(rows.filter((row) => Boolean(row.popup_screenshot)).length).toBeGreaterThan(0);
    expect(rows.filter((row) => Boolean(row.wiki_fullpage_screenshot)).length).toBeGreaterThan(0);
  }
});

test("new-map desktop hover updates country feature-state", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);
  const preferredView = FEATURE_VIEW_BY_GEO.FR;

  await focusJurisdiction(page, "FR");
  await waitForFeature(page, "FR", "legal-fill", preferredView);

  const beforeSwitchCount = await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        hoverSwitchCount?: number;
      };
    };
    return host.__NEW_MAP_DEBUG__?.hoverSwitchCount || 0;
  });
  await hoverFeature(page, "FR", "legal-fill", preferredView);
  await page.waitForFunction(() => window.__NEW_MAP_DEBUG__?.hoveredId === "FR", { timeout: 5000 });
  const hoverState = await page.evaluate(() => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        hoveredId?: string | null;
        hoverSwitchCount?: number;
        map?: {
          getCanvas: () => HTMLCanvasElement;
        } | null;
      };
    };
    return {
      hoveredId: host.__NEW_MAP_DEBUG__?.hoveredId || null,
      hoverSwitchCount: host.__NEW_MAP_DEBUG__?.hoverSwitchCount || 0,
      cursor: host.__NEW_MAP_DEBUG__?.map?.getCanvas().style.cursor || ""
    };
  });

  expect(hoverState.hoveredId).toBe("FR");
  expect(hoverState.hoverSwitchCount).toBeGreaterThanOrEqual(beforeSwitchCount);
  expect(hoverState.cursor).toBe("pointer");
});

test.skip("new-map usa states appear on zoom and popup works for California", async ({ page }) => {
  await page.goto(NEW_MAP_ROUTE, { waitUntil: "domcontentloaded" });
  await ensureRuntimeMapReady(page);

  const preferredView = FEATURE_VIEW_BY_GEO["US-CA"];
  await focusJurisdiction(page, "US-CA");
  await waitForFeature(page, "US-CA", "us-states-fill", preferredView);
  await clickFeature(page, "US-CA", "us-states-fill", preferredView);
  await expect(getPopupLabel(page)).toContainText("ISO2: US-CA");
});

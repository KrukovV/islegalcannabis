#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";
import {
  buildVercelBypassCookieSeedUrl,
  buildVercelBypassHeaders,
  diffVercelBypassCookies
} from "../vercel_bypass.mjs";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "Reports", "status-engine");
const MAP_AUDIT_DIR = path.join(REPORT_DIR, "map-audit");
const STATUS_SSOT_PATH = path.join(ROOT, "data", "status-engine", "status_ssot_v9.json");
const KNOWLEDGE_DB_PATH = path.join(ROOT, "data", "cannabis_profiles", "knowledge_db.json");
const LOCAL_NAMES_PATH = path.join(ROOT, "data", "cannabis_profiles", "local_names.dictionary.json");

const CONTROL_COUNTRIES = [
  "AL",
  "AR",
  "AU",
  "AT",
  "DE",
  "CA",
  "IR",
  "KH",
  "BY",
  "BD",
  "AF",
  "AM",
  "AD",
  "BW",
  "DZ"
];

const CONTROL_STATES = ["US-CA", "US-CO", "US-WY", "US-NE", "US-KS", "US-WI", "US-UT", "US-IN"];
const PRODUCTION_SAMPLE = ["AL", "IR", "KH", "BY", "AU", "GF", "XK", "US-CA", "US-WY", "US-UT"];
const IDAHO = "US-ID";
const USA_VISUAL_STATES = ["US-CA", "US-WY", "US-NE", "US-KS", "US-UT"];
const REQUIRED_LOCAL_NAMES = ["kif", "hachich", "tekrouri", "dawamesc", "diamba", "liamba", "dagga", "happy pizza"];

const CAMERA_OVERRIDES = {
  AD: { lng: 1.6, lat: 42.55, zoom: 7.4 },
  AL: { lng: 20.0, lat: 41.1, zoom: 5.6 },
  AM: { lng: 44.9, lat: 40.3, zoom: 5.9 },
  AT: { lng: 14.2, lat: 47.6, zoom: 5.2 },
  BY: { lng: 28.0, lat: 53.5, zoom: 4.7 },
  BD: { lng: 90.3, lat: 23.8, zoom: 5.4 },
  BW: { lng: 24.6, lat: -22.2, zoom: 4.4 },
  KH: { lng: 104.9, lat: 12.6, zoom: 5.5 },
  IR: { lng: 53.6, lat: 32.4, zoom: 4.1 },
  DZ: { lng: 2.6, lat: 28.0, zoom: 3.9 },
  GF: { lng: -53.1, lat: 3.9, zoom: 5.2 },
  XK: { lng: 20.9, lat: 42.6, zoom: 7.0 },
  "US-CA": { lng: -119.5, lat: 37.25, zoom: 5.4 },
  "US-CO": { lng: -105.6, lat: 39.0, zoom: 5.6 },
  "US-WY": { lng: -107.5, lat: 43.0, zoom: 5.7 },
  "US-NE": { lng: -99.8, lat: 41.5, zoom: 5.6 },
  "US-KS": { lng: -98.5, lat: 38.5, zoom: 5.7 },
  "US-WI": { lng: -89.8, lat: 44.5, zoom: 5.6 },
  "US-UT": { lng: -111.8, lat: 39.3, zoom: 5.7 },
  "US-IN": { lng: -86.2, lat: 40.0, zoom: 5.8 },
  "US-ID": { lng: -114.4, lat: 44.3, zoom: 5.6 }
};

const WHY_BY_COLOR = {
  GREEN: "Cannabis can be legally accessed through recreational or regulated medical programs.",
  YELLOW: "Cannabis remains restricted, but enforcement is limited or access is partially allowed.",
  RED: "Cannabis remains prohibited and criminal penalties remain in force."
};

const BANNED_POPUP_PATTERNS = [
  ["recreational == LEGAL", /recreational\s*==\s*LEGAL/i],
  ["recreational == ILLEGAL", /recreational\s*==\s*ILLEGAL/i],
  ["medical == NONE", /medical\s*==\s*NONE/i],
  ["medical == REGULATED", /medical\s*==\s*REGULATED/i],
  ["medical == LIMITED", /medical\s*==\s*LIMITED/i],
  ["enforcement == SOFT", /enforcement\s*==\s*SOFT/i],
  ["enforcement == STRICT", /enforcement\s*==\s*STRICT/i],
  ["triggered_rules", /triggered_rules?/i],
  ["rule_ids", /rule_ids?/i],
  ["internal_reasoning", /internal_reasoning/i],
  ["internal evaluator output", /internal evaluator output/i],
  ["debug output", /\bdebug\b/i],
  ["map category enum", /LEGAL_OR_DECRIM|LIMITED_OR_MEDICAL/i],
  ["status enum line", /\bSTATUS\s+(RED|YELLOW|GREEN)\b/i]
];

function parseArgs() {
  const args = new Map();
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([^=]+)=(.*)$/);
    if (match) args.set(match[1], match[2]);
  }
  return {
    mode: args.get("mode") || "local",
    target: (args.get("target") || "http://127.0.0.1:3000").replace(/\/+$/, "")
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function writeJson(file, payload) {
  writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>")).join(" | ")} |`)
  ].join("\n");
}

function colorToCategory(color) {
  if (color === "GREEN") return "LEGAL_OR_DECRIM";
  if (color === "YELLOW") return "LIMITED_OR_MEDICAL";
  if (color === "RED") return "ILLEGAL";
  return "UNKNOWN";
}

function categoryToColor(category) {
  if (category === "LEGAL_OR_DECRIM") return "GREEN";
  if (category === "LIMITED_OR_MEDICAL") return "YELLOW";
  if (category === "ILLEGAL") return "RED";
  return "UNCONFIRMED";
}

function passFail(value) {
  return value ? "PASS" : "FAIL";
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function hasVercelAccessBlock(text) {
  return /Security Checkpoint|Could not verify your browser|Code 21|Failed to verify your browser/i.test(text || "");
}

async function seedVercelBypassCookie(context, target, secret) {
  const bypassSecretPresent = Boolean(secret);
  const seedUrl = buildVercelBypassCookieSeedUrl(target);
  if (!bypassSecretPresent) {
    return {
      bypassSecretPresent,
      seedUrl,
      seedStatus: null,
      seedMitigated: "",
      seedVercelId: "",
      cookieSeeded: false,
      cookieDetected: false,
      cookieName: "",
      cookieNames: [],
      cookieCount: 0,
      challengeDetected: false,
      bypassCookiePresent: false
    };
  }

  const cookiesBefore = await context.cookies();
  const response = await context.request.get(seedUrl, {
    headers: buildVercelBypassHeaders(secret, "true"),
    maxRedirects: 0,
    timeout: 45000
  });
  const seedBody = await response.text().catch(() => "");
  const cookiesAfter = await context.cookies();
  const seededCookies = diffVercelBypassCookies(cookiesBefore, cookiesAfter);
  const cookieNames = seededCookies.map((cookie) => cookie.name).filter(Boolean);
  const seedStatus = response.status();
  const cookieSeeded = seedStatus >= 200 && seedStatus < 400;
  const cookieDetected = seededCookies.length > 0;
  const challengeDetected =
    hasVercelAccessBlock(seedBody) ||
    response.headers()["x-vercel-mitigated"] === "challenge";

  return {
    bypassSecretPresent,
    seedUrl,
    seedStatus,
    seedMitigated: response.headers()["x-vercel-mitigated"] || "",
    seedVercelId: response.headers()["x-vercel-id"] || "",
    cookieSeeded,
    cookieDetected,
    cookieName: cookieNames[0] || "",
    cookieNames,
    cookieCount: seededCookies.length,
    challengeDetected,
    bypassCookiePresent: cookieSeeded && cookieDetected
  };
}

function profileList(entry, key) {
  const profile = entry?.cannabisProfile || {};
  return Array.isArray(profile[key]) ? profile[key] : [];
}

function cannabisProfileItems(entry) {
  return [
    ...profileList(entry, "products"),
    ...profileList(entry, "traditionalUse"),
    ...profileList(entry, "cannabisFoods"),
    ...profileList(entry, "slang"),
    ...profileList(entry, "cultivation"),
    ...profileList(entry, "market"),
    ...profileList(entry, "notes")
  ];
}

function expectedPopupSections(entry) {
  const sections = ["Status", "Why This Color"];
  if (profileList(entry, "enforcementReality").length) sections.push("Enforcement Reality");
  if (profileList(entry, "history").length) sections.push("History");
  if (profileList(entry, "culture").length) sections.push("Culture");
  if (profileList(entry, "localNames").length) sections.push("Local Names");
  if (cannabisProfileItems(entry).length) sections.push("Cannabis Profile");
  return sections;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FETCH_FAILED:${response.status}:${url}`);
  return response.json();
}

async function waitForMapReady(page) {
  await page.waitForSelector('[data-testid="new-map-surface"][data-map-ready="1"]', { timeout: 45000 });
  await page.waitForFunction(() => Boolean(window.__NEW_MAP_DEBUG__?.map), null, { timeout: 45000 });
}

async function jumpToGeo(page, geo, entry) {
  const override = CAMERA_OVERRIDES[geo];
  const coords = override || {
    lng: Number(entry?.coordinates?.lng),
    lat: Number(entry?.coordinates?.lat),
    zoom: geo.startsWith("US-") ? 5.6 : 4.6
  };
  if (!Number.isFinite(coords.lng) || !Number.isFinite(coords.lat)) {
    throw new Error(`NO_COORDINATES:${geo}`);
  }
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
    coords
  );
  await page.waitForTimeout(350);
}

async function findFeaturePoint(page, geo, layerIds, entry) {
  return page.evaluate(
    ({ targetGeo, targetLayerIds, lng, lat }) => {
      const map = window.__NEW_MAP_DEBUG__?.map;
      if (!map) return null;
      const canvas = map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const windows = [];
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        const projected = map.project({ lng, lat });
        windows.push({
          startX: Math.max(16, projected.x - 260),
          endX: Math.min(rect.width - 16, projected.x + 260),
          startY: Math.max(16, projected.y - 220),
          endY: Math.min(rect.height - 16, projected.y + 220),
          step: 10
        });
      }
      windows.push({
        startX: 32,
        endX: rect.width - 32,
        startY: 32,
        endY: rect.height - 32,
        step: 18
      });

      for (const area of windows) {
        for (let y = area.startY; y < area.endY; y += area.step) {
          for (let x = area.startX; x < area.endX; x += area.step) {
            for (const layerId of targetLayerIds) {
              const features = map.queryRenderedFeatures([x, y], { layers: [layerId] });
              for (const feature of features) {
                const props = feature.properties || {};
                const candidates = [props.geo, props.iso2, props.iso_a2, props.ISO_A2, feature.id]
                  .map((value) => String(value || "").toUpperCase())
                  .filter(Boolean);
                if (!candidates.includes(targetGeo)) continue;
                return {
                  x,
                  y,
                  layerId,
                  properties: {
                    geo: String(props.geo || feature.id || ""),
                    displayName: String(props.displayName || props.name_en || props.name || ""),
                    mapCategory: String(props.mapCategory || ""),
                    baseColor: String(props.baseColor || ""),
                    resultStatus: String(props.result?.status || props.status || ""),
                    resultColor: String(props.result?.color || "")
                  }
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
      lng: Number(entry?.coordinates?.lng ?? CAMERA_OVERRIDES[geo]?.lng),
      lat: Number(entry?.coordinates?.lat ?? CAMERA_OVERRIDES[geo]?.lat)
    }
  );
}

async function waitForFeaturePoint(page, geo, layerIds, entry) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const point = await findFeaturePoint(page, geo, layerIds, entry);
    if (point) return point;
    await page.waitForTimeout(300);
  }
  return null;
}

async function clickFeature(page, point) {
  const canvas = page.locator(".maplibregl-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("NO_MAP_CANVAS_BOUNDS");
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

async function readPopup(page, geo) {
  await page.waitForSelector('[data-testid="new-map-country-popup"]', { timeout: 20000 });
  await page.waitForFunction(
    (targetGeo) => {
      const popup = document.querySelector('[data-testid="new-map-country-popup"]');
      return Boolean(popup?.textContent?.includes(`ISO2: ${targetGeo}`));
    },
    geo,
    { timeout: 20000 }
  );
  return page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]');
    const badge = popup?.querySelector("[data-category]");
    return {
      text: popup?.textContent || "",
      innerText: popup?.innerText || "",
      category: badge?.getAttribute("data-category") || ""
    };
  });
}

function evaluatePopup({ popup, entry, expectedColor }) {
  const text = popup.innerText || popup.text || "";
  const textUpper = text.toUpperCase();
  const expectedWhy = WHY_BY_COLOR[expectedColor] || "";
  const leaks = BANNED_POPUP_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
  const missingSections = expectedPopupSections(entry).filter((section) => !textUpper.includes(section.toUpperCase()));
  const whyOccurrences = countOccurrences(text, expectedWhy);
  return {
    hasStatus: textUpper.includes("STATUS"),
    hasWhyThisColor: textUpper.includes("WHY THIS COLOR"),
    hasExpectedWhy: Boolean(expectedWhy && text.includes(expectedWhy)),
    whyOccurrences,
    missingSections,
    leaks,
    pass:
      textUpper.includes("STATUS") &&
      textUpper.includes("WHY THIS COLOR") &&
      Boolean(expectedWhy && text.includes(expectedWhy)) &&
      whyOccurrences === 1 &&
      missingSections.length === 0 &&
      leaks.length === 0
  };
}

async function auditJurisdiction(page, cardIndex, statusIndex, geo) {
  const status = statusIndex.get(geo);
  const entry = cardIndex[geo];
  const expectedColor = status?.color || "UNCONFIRMED";
  const expectedCategory = colorToCategory(expectedColor);
  const layerIds = geo.startsWith("US-")
    ? ["us-states-fill"]
    : ["legal-territory-label", "legal-territory-hitbox", "legal-point", "legal-fill"];
  if (!status) {
    return {
      geo,
      name: geo,
      expectedColor,
      source: "",
      pass: false,
      failure: "MISSING_STATUS_SSOT"
    };
  }
  if (!entry) {
    return {
      geo,
      name: status.name,
      expectedColor,
      source: status.sourceUrl || "",
      pass: false,
      failure: "MISSING_CARD_INDEX"
    };
  }

  await jumpToGeo(page, geo, entry);
  const point = await waitForFeaturePoint(page, geo, layerIds, entry);
  if (!point) {
    return {
      geo,
      name: status.name,
      expectedColor,
      source: status.sourceUrl || "",
      pass: false,
      failure: "FEATURE_NOT_RENDERED"
    };
  }
  await clickFeature(page, point);
  const popup = await readPopup(page, geo);
  const popupAudit = evaluatePopup({ popup, entry, expectedColor });
  const featureCategory = point.properties.mapCategory;
  const cardCategory = entry.mapCategory;
  const popupCategory = popup.category;
  const mapMatchesSsot = featureCategory === expectedCategory;
  const cardMatchesSsot = cardCategory === expectedCategory;
  const popupMatchesSsot = popupCategory === expectedCategory;
  const pass = mapMatchesSsot && cardMatchesSsot && popupMatchesSsot && popupAudit.pass;
  return {
    geo,
    name: entry.displayName || status.name,
    expectedColor,
    currentColor: categoryToColor(popupCategory || cardCategory || featureCategory),
    expectedCategory,
    featureCategory,
    cardCategory,
    popupCategory,
    featureColor: point.properties.baseColor,
    source: status.sourceUrl || "",
    popup: popupAudit,
    pass
  };
}

async function auditUsaMap(page, cardIndex) {
  await page.evaluate(async () => {
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
      map.jumpTo({ center: [-99, 39], zoom: 4.9, pitch: 0, bearing: 0 });
    });
  });
  await page.waitForTimeout(900);

  const stateRows = [];
  for (const geo of USA_VISUAL_STATES) {
    const point = await waitForFeaturePoint(page, geo, ["us-states-fill"], cardIndex[geo]);
    stateRows.push({
      geo,
      rendered: Boolean(point),
      mapCategory: point?.properties?.mapCategory || "",
      color: categoryToColor(point?.properties?.mapCategory || "")
    });
  }
  const expression = await page.evaluate(() => {
    const map = window.__NEW_MAP_DEBUG__?.map;
    return map?.getPaintProperty("legal-fill", "fill-opacity") || null;
  });
  const expressionText = JSON.stringify(expression);
  const stateLevelRendered = stateRows.every((row) => row.rendered);
  const distinctColors = new Set(stateRows.map((row) => row.color).filter(Boolean));
  const usCountryHiddenAtStateZoom = expressionText.includes('"US"') && expressionText.includes(",0,1");
  const surface = page.locator('[data-testid="new-map-surface"]');
  const screenshot = path.join(MAP_AUDIT_DIR, "usa-states.png");
  await surface.screenshot({ path: screenshot });
  return {
    pass: stateLevelRendered && distinctColors.size >= 2 && usCountryHiddenAtStateZoom,
    stateLevelRendered,
    distinctColors: Array.from(distinctColors),
    usCountryHiddenAtStateZoom,
    fillOpacityExpression: expression,
    screenshot: path.relative(ROOT, screenshot),
    states: stateRows
  };
}

function auditKnowledge(cardIndex) {
  const knowledgeDb = readJson(KNOWLEDGE_DB_PATH);
  const localNames = readJson(LOCAL_NAMES_PATH);
  const dictionaryTerms = new Set((localNames.entries || []).map((entry) => String(entry.term || "").toLowerCase()));
  const missingRequiredTerms = REQUIRED_LOCAL_NAMES.filter((term) => !dictionaryTerms.has(term));
  const entries = knowledgeDb.entries || [];
  const coverage = {
    entries: entries.length,
    history: entries.filter((entry) => (entry.history || []).length > 0).length,
    culture: entries.filter((entry) => (entry.culture || []).length > 0).length,
    localNames: entries.filter((entry) => (entry.localNames || []).length > 0).length,
    products: entries.filter((entry) => (entry.products || []).length > 0).length,
    notes: entries.filter((entry) => (entry.notes || []).length > 0).length,
    enforcementReality: entries.filter((entry) => (entry.enforcementReality || []).length > 0).length
  };
  const popupProfileSamples = [...CONTROL_COUNTRIES, ...CONTROL_STATES]
    .map((geo) => {
      const entry = cardIndex[geo];
      return {
        geo,
        history: profileList(entry, "history").length,
        culture: profileList(entry, "culture").length,
        localNames: profileList(entry, "localNames").length,
        products: profileList(entry, "products").length,
        notes: profileList(entry, "notes").length,
        enforcementReality: profileList(entry, "enforcementReality").length
      };
    });
  const popupProfileAvailable = popupProfileSamples.some((sample) =>
    sample.history + sample.culture + sample.localNames + sample.products + sample.notes + sample.enforcementReality > 0
  );
  return {
    pass:
      knowledgeDb.status_engine_touched === false &&
      coverage.entries > 0 &&
      coverage.notes > 0 &&
      missingRequiredTerms.length === 0 &&
      popupProfileAvailable,
    statusEngineTouched: knowledgeDb.status_engine_touched,
    coverage,
    requiredLocalNames: REQUIRED_LOCAL_NAMES.map((term) => ({ term, present: dictionaryTerms.has(term) })),
    missingRequiredTerms,
    popupProfileSamples
  };
}

function auditMapScreenshots() {
  const summaryPath = path.join(MAP_AUDIT_DIR, "summary.json");
  if (!fs.existsSync(summaryPath)) {
    return { pass: false, reason: "SUMMARY_MISSING", regions: [] };
  }
  const summary = readJson(summaryPath);
  const regions = summary.regions || [];
  return {
    pass: !summary.ui_error && regions.length >= 6 && regions.every((region) => region.png?.ok),
    reason: summary.ui_error || "OK",
    regions: regions.map((region) => ({
      region: region.region,
      file: region.file,
      pngOk: Boolean(region.png?.ok),
      uniqueColors: region.png?.uniqueColors || 0
    })),
    consoleEvents: (summary.console_errors || []).length
  };
}

function renderControlReport(title, rows) {
  return [
    `# ${title}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    markdownTable(
      ["Geo", "Name", "Expected Color", "Current Color", "Map", "Popup", "Debug Leaks", "Source", "Result"],
      rows.map((row) => [
        row.geo,
        row.name,
        row.expectedColor,
        row.currentColor || "",
        `${row.featureCategory || row.failure || ""}`,
        `${row.popupCategory || ""}`,
        row.popup?.leaks?.length ? row.popup.leaks.join(", ") : "none",
        row.source,
        passFail(row.pass)
      ])
    ),
    ""
  ].join("\n");
}

function renderProductionReport(results) {
  const auditResult = results.auditResult || (results.pass ? "PASS" : results.blocked ? "BLOCKED" : "FAIL");
  const title = results.reportTitle || "Production Audit";
  const flagPrefix = results.flagPrefix || "PRODUCTION_AUDIT";
  const blockedLines = results.blocked
    ? [
        "## Blocked",
        "",
        `Reason: ${results.blockReason || "UNKNOWN"}`,
        `Response status: ${results.responseStatus ?? results.seedStatus ?? ""}`,
        `Title: ${results.title || ""}`,
        `Screenshot: ${results.screenshot || ""}`,
        ""
      ]
    : [];
  return [
    `# ${title}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Target: ${results.target}`,
    "",
    "## Bypass Evidence",
    "",
    `bypass_secret_present: ${results.bypassSecretPresent ? 1 : 0}`,
    `cookie_seeded: ${results.cookieSeeded ? 1 : 0}`,
    `cookie_detected: ${results.cookieDetected ? 1 : 0}`,
    `cookie_name: ${results.cookieName || ""}`,
    `cookie_count: ${results.cookieCount ?? 0}`,
    `challenge_detected: ${results.challengeDetected ? 1 : 0}`,
    `nav_status: ${results.navStatus ?? ""}`,
    `audit_result: ${auditResult}`,
    "",
    ...blockedLines,
    markdownTable(
      ["Geo", "Name", "Expected Color", "Current Color", "Popup", "Debug Leaks", "Result"],
      results.rows.map((row) => [
        row.geo,
        row.name,
        row.expectedColor,
        row.currentColor || "",
        row.popupCategory || "",
        row.popup?.leaks?.length ? row.popup.leaks.join(", ") : "none",
        passFail(row.pass)
      ])
    ),
    "",
    `${flagPrefix}_PASS=${results.pass ? 1 : 0}`,
    `${flagPrefix}_BLOCKED=${results.blocked ? 1 : 0}`,
    `BYPASS_COOKIE_PRESENT=${results.bypassCookiePresent ? 1 : 0}`,
    ""
  ].join("\n");
}

function renderFinalProdAudit(results) {
  const deployApproved =
    results.countryPass &&
    results.statePass &&
    results.popupPass &&
    results.uiPass &&
    results.knowledgePass;
  return [
    "# Final Prod Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Target: ${results.target}`,
    "",
    `Country Audit: ${passFail(results.countryPass)}`,
    `State Audit: ${passFail(results.statePass)}`,
    `Popup Audit: ${passFail(results.popupPass)}`,
    `UI Audit: ${passFail(results.uiPass)}`,
    `Knowledge Audit: ${passFail(results.knowledgePass)}`,
    `USA Map Audit: ${passFail(results.usaMap.pass)}`,
    `Idaho Regression: ${passFail(results.idaho.pass)}`,
    "",
    `Deploy Recommendation: ${deployApproved ? "APPROVE" : "BLOCK"}`,
    `DEPLOY_APPROVED=${deployApproved ? 1 : 0}`,
    "",
    "## Evidence",
    "",
    `- Map screenshots: ${results.mapScreenshots.regions.length} regions, ${passFail(results.mapScreenshots.pass)}`,
    `- USA states screenshot: ${results.usaMap.screenshot}`,
    `- Country rows: ${results.countryRows.length}`,
    `- State rows: ${results.stateRows.length}`,
    `- Knowledge entries: ${results.knowledge.coverage.entries}`,
    `- Required local names missing: ${results.knowledge.missingRequiredTerms.length ? results.knowledge.missingRequiredTerms.join(", ") : "none"}`,
    ""
  ].join("\n");
}

async function runLocalAudit(target) {
  const statusData = readJson(STATUS_SSOT_PATH);
  const statusIndex = new Map((statusData.entries || []).map((entry) => [entry.id, entry]));
  const cardIndex = await fetchJson(`${target}/api/new-map/card-index`);
  const mapScreenshots = auditMapScreenshots();
  const slot = await acquireProjectProcessSlot("playwright:status-engine-final-prod-gate");
  let browser = null;
  let context = null;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleEvents = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleEvents.push({ type: message.type(), text: message.text() });
      }
    });
    page.on("pageerror", (error) => {
      consoleEvents.push({ type: "pageerror", text: error.message });
    });
    await page.goto(`${target}/new-map?qa=1`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page);

    const countryRows = [];
    for (const geo of CONTROL_COUNTRIES) {
      countryRows.push(await auditJurisdiction(page, cardIndex, statusIndex, geo));
    }

    const stateRows = [];
    for (const geo of CONTROL_STATES) {
      stateRows.push(await auditJurisdiction(page, cardIndex, statusIndex, geo));
    }

    const idaho = await auditJurisdiction(page, cardIndex, statusIndex, IDAHO);
    const usaMap = await auditUsaMap(page, cardIndex);
    const knowledge = auditKnowledge(cardIndex);
    const popupRows = [...countryRows, ...stateRows, idaho];
    const blockingConsoleEvents = consoleEvents.filter((event) =>
      event.type === "pageerror" ||
      /Encountered two children|Hydration failed|Minified React error|Unhandled Runtime Error/i.test(event.text || "")
    );
    const results = {
      target,
      generated_at: new Date().toISOString(),
      countryRows,
      stateRows,
      idaho,
      usaMap,
      knowledge,
      mapScreenshots,
      consoleEvents,
      blockingConsoleEvents,
      countryPass: countryRows.every((row) => row.pass),
      statePass: stateRows.every((row) => row.pass),
      popupPass: popupRows.every((row) => row.popup?.pass),
      uiPass: mapScreenshots.pass && usaMap.pass && blockingConsoleEvents.length === 0,
      knowledgePass: knowledge.pass
    };
    writeJson(path.join(REPORT_DIR, "final-prod-gate-evidence.json"), results);
    writeFile(path.join(REPORT_DIR, "control-country-audit.md"), renderControlReport("Control Country Audit", countryRows));
    writeFile(path.join(REPORT_DIR, "control-state-audit.md"), renderControlReport("Control State Audit", stateRows));
    writeFile(
      path.join(REPORT_DIR, "local-ui-audit.md"),
      [
        "# Local UI Audit",
        "",
        `Generated: ${results.generated_at}`,
        "",
        `Result: ${passFail(results.uiPass)}`,
        `Target: ${target}/new-map`,
        `Map ready: PASS`,
        `Map screenshots: ${passFail(mapScreenshots.pass)}`,
        `USA state-level map: ${passFail(usaMap.pass)}`,
        `Console warning/error events: ${consoleEvents.length}`,
        "",
        `LOCAL_UI_AUDIT_PASS=${results.uiPass ? 1 : 0}`,
        ""
      ].join("\n")
    );
    writeFile(path.join(REPORT_DIR, "final-prod-audit.md"), renderFinalProdAudit(results));
    console.log(`FINAL_PROD_GATE_COUNTRY=${passFail(results.countryPass)}`);
    console.log(`FINAL_PROD_GATE_STATE=${passFail(results.statePass)}`);
    console.log(`FINAL_PROD_GATE_POPUP=${passFail(results.popupPass)}`);
    console.log(`FINAL_PROD_GATE_UI=${passFail(results.uiPass)}`);
    console.log(`FINAL_PROD_GATE_KNOWLEDGE=${passFail(results.knowledgePass)}`);
    console.log(`DEPLOY_APPROVED=${results.countryPass && results.statePass && results.popupPass && results.uiPass && results.knowledgePass ? 1 : 0}`);
    if (!(results.countryPass && results.statePass && results.popupPass && results.uiPass && results.knowledgePass)) {
      process.exitCode = 1;
    }
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    slot.release();
  }
}

async function runProductionBrowserClickAudit({
  target,
  context,
  statusIndex,
  bypassEvidence,
  reportBase,
  screenshotName,
  reportTitle,
  flagPrefix
}) {
  const page = await context.newPage();
  const response = await page.goto(`${target}/new-map?qa=1`, { waitUntil: "domcontentloaded" });
  try {
    await waitForMapReady(page);
  } catch (error) {
    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const screenshot = path.join(MAP_AUDIT_DIR, screenshotName);
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => undefined);
    const accessBlocked = hasVercelAccessBlock(`${title}\n${bodyText}`);
    const results = {
      target,
      generated_at: new Date().toISOString(),
      reportTitle,
      flagPrefix,
      rows: [],
      pass: false,
      blocked: true,
      blockReason: accessBlocked ? "VERCEL_SECURITY_CHECKPOINT" : `MAP_READY_TIMEOUT:${error.message || error.name || "UNKNOWN"}`,
      responseStatus: response?.status() ?? null,
      navStatus: response?.status() ?? null,
      title,
      hasAccessBlock: accessBlocked,
      auditResult: "BLOCKED",
      screenshot: path.relative(ROOT, screenshot),
      bodySample: bodyText.slice(0, 240),
      ...bypassEvidence,
      challengeDetected: bypassEvidence.challengeDetected || accessBlocked
    };
    writeJson(path.join(REPORT_DIR, `${reportBase}.json`), results);
    writeFile(path.join(REPORT_DIR, `${reportBase}.md`), renderProductionReport(results));
    return results;
  }

  const cardIndex = await page.evaluate(async () => {
    const response = await fetch("/api/new-map/card-index", { cache: "no-store" });
    if (!response.ok) throw new Error(`CARD_INDEX_FETCH_FAILED:${response.status}`);
    return response.json();
  });
  const rows = [];
  for (const geo of PRODUCTION_SAMPLE) {
    rows.push(await auditJurisdiction(page, cardIndex, statusIndex, geo));
  }
  const pass = rows.every((row) => row.pass);
  const results = {
    target,
    generated_at: new Date().toISOString(),
    reportTitle,
    flagPrefix,
    rows,
    pass,
    blocked: false,
    navStatus: response?.status() ?? null,
    auditResult: pass ? "PASS" : "FAIL",
    ...bypassEvidence,
    challengeDetected: bypassEvidence.challengeDetected
  };
  writeJson(path.join(REPORT_DIR, `${reportBase}.json`), results);
  writeFile(path.join(REPORT_DIR, `${reportBase}.md`), renderProductionReport(results));
  return results;
}

async function runProductionAudit(target) {
  const statusData = readJson(STATUS_SSOT_PATH);
  const statusIndex = new Map((statusData.entries || []).map((entry) => [entry.id, entry]));
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
  const slot = await acquireProjectProcessSlot("playwright:status-engine-production-audit");
  let browser = null;
  let context = null;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      extraHTTPHeaders: secret ? buildVercelBypassHeaders(secret, "true") : {}
    });
    const bypassEvidence = await seedVercelBypassCookie(context, target, secret);
    const results = await runProductionBrowserClickAudit({
      target,
      context,
      statusIndex,
      bypassEvidence,
      reportBase: "production-audit",
      screenshotName: "production-blocked.png",
      reportTitle: "Production Audit",
      flagPrefix: "PRODUCTION_AUDIT"
    });
    console.log(`PRODUCTION_AUDIT=${passFail(results.pass)}`);
    console.log(`PRODUCTION_AUDIT_BLOCKED=${results.blocked ? 1 : 0}`);
    console.log(`BYPASS_COOKIE_PRESENT=${bypassEvidence.bypassCookiePresent ? 1 : 0}`);
    if (!results.pass) {
      if (results.blocked) console.log(`BLOCK_REASON=${results.blockReason}`);
      process.exitCode = 1;
    }
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    slot.release();
  }
}

async function runProductionDirectAudit(target) {
  const statusData = readJson(STATUS_SSOT_PATH);
  const statusIndex = new Map((statusData.entries || []).map((entry) => [entry.id, entry]));
  const slot = await acquireProjectProcessSlot("playwright:status-engine-production-direct-audit");
  let browser = null;
  let context = null;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1
    });
    const results = await runProductionBrowserClickAudit({
      target,
      context,
      statusIndex,
      bypassEvidence: {
        bypassSecretPresent: Boolean(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ""),
        seedUrl: "",
        seedStatus: null,
        seedMitigated: "",
        seedVercelId: "",
        cookieSeeded: false,
        cookieDetected: false,
        cookieName: "",
        cookieNames: [],
        cookieCount: 0,
        challengeDetected: false,
        bypassCookiePresent: false,
        accessMode: "direct_public_no_bypass_seed"
      },
      reportBase: "production-direct-audit",
      screenshotName: "production-direct-blocked.png",
      reportTitle: "Production Direct Public Audit",
      flagPrefix: "PRODUCTION_DIRECT_AUDIT"
    });
    console.log(`PRODUCTION_DIRECT_AUDIT=${passFail(results.pass)}`);
    console.log(`PRODUCTION_DIRECT_AUDIT_BLOCKED=${results.blocked ? 1 : 0}`);
    console.log("BYPASS_COOKIE_PRESENT=0");
    if (results.blocked) console.log(`BLOCK_REASON=${results.blockReason}`);
    if (!results.pass) process.exitCode = 1;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    slot.release();
  }
}

async function main() {
  const { mode, target } = parseArgs();
  if (mode === "production") {
    await runProductionAudit(target);
    return;
  }
  if (mode === "production-direct") {
    await runProductionDirectAudit(target);
    return;
  }
  await runLocalAudit(target);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

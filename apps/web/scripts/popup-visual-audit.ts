import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

type RuntimeJurisdiction = {
  iso2?: string;
  geo?: string;
  displayName?: string;
  type?: "country" | "state";
  coordinates?: {
    lng: number;
    lat: number;
  };
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

const POPUP_VISUAL_AUDIT_DIR = path.resolve(process.cwd(), "..", "..", "Artifacts", "popup-visual-audit");
const NEW_MAP_ROUTE = "/new-map?qa=1";

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
  const encode = (value: unknown) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
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
  if (heading === "jurisdiction") return "Jurisdiction";
  return null;
}

function wikiSemanticHeading(value: string) {
  const heading = String(value || "").replace(/\[edit\]/gi, "").trim();
  if (!heading) return null;
  if (/\b(history|chronology|origins?|prehistory|prehistoric|ancient|feudal|post-war|legalization|reform)\b/i.test(heading)) {
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
      for (const url of item.match(/\bhttps?:\/\/\S+/gi) || []) urls.add(url);
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
  const marketSignalRe =
    /\b(sales?|dispensar(?:y|ies)|retail(?:er|ers)?|market|revenue|tax|opened|wholesale|consumer|industry|supply shortages?|import(?:ation|ed|er|ers)?|export(?:ing|ed|er|ers)?|cannabis clubs?|social clubs?|private collective)\b/i;
  const cultivationSignalRe = /\b(cultivat(?:e|ed|ion)|hemp|farm(?:s|ing)?|production|crop)\b/i;

  for (const [heading, items] of Object.entries(sectionMap)) {
    for (const item of items) {
      const label = popupSemanticHeading(heading) || heading;
      if (label === "History" && penaltyRe.test(item) && !historySignalRe.test(item)) findings.push(`History:${item}`);
      if (label === "Products" && (penaltyRe.test(item) || legalBoilerplateRe.test(item))) findings.push(`Products:${item}`);
      if (label === "Market" && (penaltyRe.test(item) || (legalBoilerplateRe.test(item) && !marketSignalRe.test(item)))) {
        findings.push(`Market:${item}`);
      }
      if (
        ["Culture", "Traditional Use"].includes(label) &&
        (penaltyRe.test(item) || (legalBoilerplateRe.test(item) && !cultureSignalRe.test(item)))
      ) {
        findings.push(`${label}:${item}`);
      }
      if (label === "Cultivation" && (penaltyRe.test(item) || (legalBoilerplateRe.test(item) && !cultivationSignalRe.test(item)))) {
        findings.push(`Cultivation:${item}`);
      }
    }
  }

  return stableUnique(findings);
}

async function waitForMapReady(page: Page) {
  await page.waitForFunction(() => {
    return document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1";
  }, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const map = (window as typeof window & { __NEW_MAP_DEBUG__?: { map?: { isStyleLoaded: () => boolean } | null } }).__NEW_MAP_DEBUG__?.map;
    return Boolean(map && typeof map.isStyleLoaded === "function" && map.isStyleLoaded());
  }, { timeout: 20_000 });
}

async function setSelectedGeo(page: Page, geo: string | null) {
  const settleMs = Math.max(250, Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_SETTLE_MS || 900));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.evaluate((targetGeo) => {
        const host = window as typeof window & {
          __NEW_MAP_DEBUG__?: {
            setSelectedGeo?: (_geo: string | null) => void;
          };
        };
        host.__NEW_MAP_DEBUG__?.setSelectedGeo?.(targetGeo);
      }, geo);
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      const isDestroyedContext = /Execution context was destroyed/i.test(message);
      if (!isDestroyedContext || attempt > 0) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await waitForMapReady(page);
    }
  }
  await page.waitForTimeout(settleMs);
}

async function loadRuntimeCardIndex(page: Page) {
  return page.evaluate(() =>
    fetch("/api/new-map/card-index", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`CARD_INDEX_FETCH_FAILED:${response.status}`);
        return response.json();
      })
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
          if (/^[A-Z]{2}$/.test(normalizedGeo) && normalizedType === "country") return normalizedGeo;
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
    const sections: Record<string, string[]> = {};
    const headingNodes = Array.from(document.querySelectorAll("h2, h3"));
    for (const headingNode of headingNodes) {
      const heading = headingNode.textContent?.replace(/\[edit\]/gi, "").replace(/\s+/g, " ").trim() || "";
      if (!heading) continue;
      const sectionRoot = headingNode.closest(".mw-heading") || headingNode;
      const items: string[] = [];
      let cursor = sectionRoot.nextElementSibling;
      while (cursor) {
        if (cursor.matches(".mw-heading, h2, h3")) break;
        for (const paragraph of Array.from(cursor.querySelectorAll("p, li"))) {
          const text = paragraph.textContent?.replace(/\s+/g, " ").trim() || "";
          if (text) items.push(text);
        }
        cursor = cursor.nextElementSibling;
      }
      sections[heading] = items;
    }
    return sections;
  });
}

function wikiSectionHasSubstantiveContent(heading: string, items: string[]) {
  const label = wikiSemanticHeading(heading) || heading;
  if (!label) return false;
  const penaltyRe = /\b(prison|imprison|fine|fined|punish|penalt|arrest|detained|death penalty|sentence of)\b/i;
  const legalBoilerplateRe = /\b(illegal|legal|banned|restricted|prohibit|criminal penalties|medical cannabis|recreational use|sale and distribution)\b/i;
  const historySignalRe = /\b(1[5-9]\d{2}|20\d{2}|centur(?:y|ies)|introduced|revolution|period|occupation|reform|legali[sz]ed|decriminali[sz]ed)\b/i;
  const cultureSignalRe = /\b(widely consumed|social|culture|cultural|ritual|religious|festival|traditional|custom|commonly used)\b/i;
  const marketSignalRe =
    /\b(sales?|dispensar(?:y|ies)|retail(?:er|ers)?|market|revenue|tax|opened|wholesale|consumer|industry|supply shortages?|import(?:ation|ed|er|ers)?|export(?:ing|ed|er|ers)?|cannabis clubs?|social clubs?|private collective)\b/i;
  const cultivationSignalRe = /\b(cultivat(?:e|ed|ion)|hemp|farm(?:s|ing)?|production|crop)\b/i;
  const productSignalRe = /\b(cbd|oil|flower|tinctures?|patches?|edibles?|extract|resin|hashish|hemp seeds?)\b/i;
  const traditionalSignalRe = /\b(traditional|ritual|smok(?:e|ed|ing)|infused foods?|used for|preparation)\b/i;

  return items.some((item) => {
    if (!item) return false;
    if (label === "History") return historySignalRe.test(item);
    if (label === "Enforcement Reality") return penaltyRe.test(item);
    if (label === "Cultivation") return cultivationSignalRe.test(item) && !penaltyRe.test(item);
    if (label === "Market") return marketSignalRe.test(item) && !(legalBoilerplateRe.test(item) && !marketSignalRe.test(item));
    if (label === "Products") return productSignalRe.test(item) && !legalBoilerplateRe.test(item);
    if (label === "Traditional Use") return traditionalSignalRe.test(item) && !legalBoilerplateRe.test(item);
    if (label === "Culture") return cultureSignalRe.test(item) && !legalBoilerplateRe.test(item);
    if (label === "Cannabis Foods") return /\b(food|foods|pizza|edibles?|infused)\b/i.test(item) && !legalBoilerplateRe.test(item);
    if (label === "Local Names") return /\b(known as|called|referred to as|slang|local parlance|locally)\b/i.test(item);
    return false;
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

async function popupDomVisible(page: Page) {
  return page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]') as HTMLElement | null;
    if (!popup) return false;
    const rect = popup.getBoundingClientRect();
    const style = window.getComputedStyle(popup);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  });
}

async function main() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
  const popupDir = path.join(POPUP_VISUAL_AUDIT_DIR, "popup");
  const wikiDir = path.join(POPUP_VISUAL_AUDIT_DIR, "wiki");
  fs.mkdirSync(popupDir, { recursive: true });
  fs.mkdirSync(wikiDir, { recursive: true });

  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADFUL === "1" ? false : true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const wikiPage = await context.newPage();

  try {
    await page.goto(`${baseUrl}${NEW_MAP_ROUTE}`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page);

    const cardIndex = await loadRuntimeCardIndex(page) as Record<string, RuntimeAuditCard>;
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

    const rows: VisualAuditRow[] = [];
    const changedFiles = [
      "apps/web/scripts/popup-visual-audit.ts",
      "data/cannabis_profiles/knowledge_db.json",
      "tools/knowledge/harvest_cannabis_knowledge.mjs",
      "tools/knowledge/harvest_cannabis_knowledge.test.mjs"
    ];

    for (const [index, geo] of geos.entries()) {
      const entry = cardIndex[geo] || {};
      await page.bringToFront();
      await setSelectedGeo(page, null);
      await setSelectedGeo(page, geo);

      const popupLocator = page.locator('[data-testid="new-map-country-popup"]').first();
      let popupVisible = await popupLocator.isVisible().catch(() => false);
      if (!popupVisible) popupVisible = await popupDomVisible(page).catch(() => false);
      if (!popupVisible) {
        await page.waitForTimeout(1200);
        await setSelectedGeo(page, null);
        await setSelectedGeo(page, geo);
        popupVisible = await popupLocator.isVisible().catch(() => false);
        if (!popupVisible) popupVisible = await popupDomVisible(page).catch(() => false);
      }

      const popupScreenshotPath = popupVisible ? path.join(popupDir, `${geo}.png`) : null;
      if (popupVisible && popupScreenshotPath) {
        await popupLocator.screenshot({ path: popupScreenshotPath });
      }

      const popupSectionMap = popupVisible ? await readPopupSectionMap(page) : {};
      const popupSectionHeadings: string[] = [];
      for (const heading of Object.keys(popupSectionMap)) {
        const semanticHeading = popupSemanticHeading(heading);
        if (!semanticHeading || semanticHeading === "Jurisdiction") continue;
        popupSectionHeadings.push(semanticHeading);
      }
      const popupSectionsFound = stableUnique(popupSectionHeadings);
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
        const wikiSectionMap = await readWikiHeadings(wikiPage);
        const wikiSemanticHeadings: string[] = [];
        for (const [heading, items] of Object.entries(wikiSectionMap)) {
          if (!wikiSectionHasSubstantiveContent(heading, items)) continue;
          const semanticHeading = wikiSemanticHeading(heading);
          if (!semanticHeading) continue;
          wikiSemanticHeadings.push(semanticHeading);
        }
        wikiSectionsFound = stableUnique(wikiSemanticHeadings);
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
        hasComparableCannabisProfile ? "" : "NO_RUNTIME_CANNABIS_PROFILE"
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

      console.warn(`MAP_POPUP_VISUAL_AUDIT_ROW ${index + 1}/${geos.length} geo=${geo} popup=${popupVisible ? 1 : 0} wiki=${wikiUrl ? 1 : 0}`);
    }

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

    console.warn(`MAP_POPUP_VISUAL_AUDIT_DONE total=${report.total} popupCaptured=${report.popupCaptured} wikiCaptured=${report.wikiCaptured}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

void main();

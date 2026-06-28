import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { buildVercelBypassHeaders } from "../../../tools/vercel_bypass.mjs";

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
  processed: boolean;
  coverage_class:
    | "individual_article"
    | "substantive_article"
    | "stub_lead_only"
    | "redirect_parent"
    | "root_only"
    | "no_individual_wiki_page"
    | "synthetic_no_wiki"
    | "resolver_failed";
  low_coverage_reason: string | null;
  source_kind: "dedicated_profile" | "fallback_wikipedia_source" | "root_legality_source" | "no_wiki_source";
  artifact_dir: string;
  wiki_page: string | null;
  popup_screenshot: string | null;
  wiki_fullpage_screenshot: string | null;
  project_popup_text: string | null;
  project_popup_json: string | null;
  wiki_text_snapshot: string | null;
  wiki_html_snapshot: string | null;
  wiki_json_snapshot: string | null;
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
const GEO_WIKI_AUDIT_DIR = path.resolve(process.cwd(), "..", "..", "Artifacts", "geo-wiki-audit");
const NEW_MAP_ROUTE = "/new-map?qa=1";

function renderVisualAuditCsv(rows: VisualAuditRow[]) {
  const header = [
    "id",
    "name",
    "type",
    "processed",
    "coverage_class",
    "low_coverage_reason",
    "source_kind",
    "artifact_dir",
    "wiki_page",
    "popup_screenshot",
    "wiki_fullpage_screenshot",
    "project_popup_text",
    "project_popup_json",
    "wiki_text_snapshot",
    "wiki_html_snapshot",
    "wiki_json_snapshot",
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
      row.processed ? "1" : "0",
      row.coverage_class,
      row.low_coverage_reason || "",
      row.source_kind,
      row.artifact_dir,
      row.wiki_page || "",
      row.popup_screenshot || "",
      row.wiki_fullpage_screenshot || "",
      row.project_popup_text || "",
      row.project_popup_json || "",
      row.wiki_text_snapshot || "",
      row.wiki_html_snapshot || "",
      row.wiki_json_snapshot || "",
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
  if (heading === "status" || heading === "hard restrictions" || heading === "more context" || heading === "why this color") {
    return "Legal/Status";
  }
  if (heading === "culture") return "Culture";
  if (heading === "traditional use") return "Traditional Use";
  if (heading === "cultivation") return "Cultivation/Production";
  if (heading === "market") return "Market/Economy/Tourism";
  if (heading === "products") return "Products";
  if (heading === "local names" || heading === "slang") return "Slang/Local Names";
  if (heading === "cannabis foods") return "Cannabis Foods";
  if (heading === "enforcement reality") return "Enforcement";
  if (heading === "jurisdiction") return "Jurisdiction";
  return null;
}

function wikiSemanticHeading(value: string) {
  const heading = String(value || "").replace(/\[edit\]/gi, "").trim();
  if (!heading) return null;
  if (/\b(history|chronology|origins?|prehistory|prehistoric|ancient|feudal|post-war|legalization|decriminali[sz]ation|reform|efforts?)\b/i.test(heading)) {
    return "History";
  }
  if (/\b(laws?|legal status|legislation|policy|ballot|initiative|adult use|medical cannabis|medical marijuana|recreational|industrial)\b/i.test(heading)) {
    return "Legal/Status";
  }
  if (/\b(agriculture|cultivation|production|as hemp|hemp)\b/i.test(heading)) return "Cultivation/Production";
  if (/\b(economy|economics|market|commodity|trade|tourism|sales?|tax|retail)\b/i.test(heading)) return "Market/Economy/Tourism";
  if (/\b(culture|cultural|as a drug|modern use)\b/i.test(heading)) return "Culture";
  if (/\b(traditional use|ritual|folk|medicinal use)\b/i.test(heading)) return "Traditional Use";
  if (/\b(products?|foods?|edibles?|hashish|resin|oil)\b/i.test(heading)) return "Products";
  if (/\b(local names?|slang|parlance|etymology|terminology)\b/i.test(heading)) return "Slang/Local Names";
  if (/\b(laws?|legal status|legislation|policy|penalt(?:y|ies)|violations?|enforcement|arrests?)\b/i.test(heading)) {
    return "Enforcement";
  }
  return null;
}

function isNonContentWikiHeading(value: string) {
  const heading = String(value || "").replace(/\[edit\]/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
  return [
    "contents",
    "content",
    "see also",
    "references",
    "external links",
    "further reading",
    "notes"
  ].includes(heading);
}

function cleanWikiSectionItems(items: string[]) {
  return items.filter((item) => {
    const text = String(item || "").replace(/\s+/g, " ").trim();
    if (!text) return false;
    if (/^v\s+t\s+e$/i.test(text)) return false;
    if (/^outline of cannabis$/i.test(text)) return false;
    if (/^retrieved\s+\d{4}/i.test(text)) return false;
    if (/^archived from the original/i.test(text)) return false;
    if (/\.mw-parser-output\b/i.test(text)) return false;
    if (/^jump up to:/i.test(text)) return false;
    return true;
  });
}

function popupSupplementalSemanticHeadings(heading: string, items: string[]) {
  const text = [heading, ...items].join(" ");
  const headings: string[] = [];
  if (/\b(medical|medicinal|recreational|adult use|industrial|hemp)\b/i.test(text)) {
    headings.push("Medical/Industrial/Recreational");
  }
  if (/\b(legal|illegal|banned|restricted|prohibit|criminal penalties|law|status)\b/i.test(text)) {
    headings.push("Legal/Status");
  }
  return stableUnique(headings);
}

function wikiSupplementalSemanticHeadings(heading: string, items: string[]) {
  const text = [heading, ...items].join(" ");
  const headings: string[] = [];
  if (/\b(1[5-9]\d{2}|20\d{2}|[1-3],\d{3}\s*bce|bce|ce|dating back|ancient|early history|modern accounts?|background|developments?|reform|decriminali[sz]|legali[sz])\b/i.test(text)) {
    headings.push("History");
  }
  if (/\b(medical|medicinal|recreational|adult use|industrial|hemp)\b/i.test(text)) {
    headings.push("Medical/Industrial/Recreational");
  }
  if (/\b(cultivat(?:e|ed|ion)|hemp|farm(?:s|ing)?|production|crop|grow wild|eradication)\b/i.test(text)) {
    headings.push("Cultivation/Production");
  }
  if (/\b(sales?|dispensar(?:y|ies)|retail(?:er|ers)?|market|revenue|tax|opened|wholesale|consumer|industry|supply shortages?|import(?:ation|ed|er|ers)?|export(?:ing|ed|er|ers)?|transit route|econom(?:y|ic)|trade)\b/i.test(text)) {
    headings.push("Market/Economy/Tourism");
  }
  if (/\b(widely consumed|social|culture|cultural|ritual|religious|festival|traditional|custom|commonly used)\b/i.test(text)) {
    headings.push("Culture");
  }
  if (/\b(traditional use|ritual|folk|medicinal use|used for|preparation)\b/i.test(text)) {
    headings.push("Traditional Use");
  }
  if (/\b(products?|foods?|edibles?|hashish|resin|oil|flower|extract|cbd|tinctures?|patches?)\b/i.test(text)) {
    headings.push("Products");
  }
  if (/\b(local names?|slang|parlance|etymology|terminology|known as|called|referred to as|locally)\b/i.test(text)) {
    headings.push("Slang/Local Names");
  }
  if (/\b(penalt(?:y|ies)|enforcement|arrests?|prison|imprison|fines?|punish|detained|sentence of)\b/i.test(text)) {
    headings.push("Enforcement");
  }
  if (/\b(legal|illegal|banned|restricted|prohibit|criminal penalties|law|status)\b/i.test(text)) {
    headings.push("Legal/Status");
  }
  return stableUnique(headings);
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

function decodeWikiTitleFromUrl(url: string | null | undefined) {
  const normalized = String(url || "").trim();
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/\/wiki\/(.+)$/i);
    if (!match) return "";
    return decodeURIComponent(match[1]).replace(/_/g, " ").trim();
  } catch {
    return "";
  }
}

function isGenericCannabisWikiUrl(url: string | null | undefined) {
  const title = decodeWikiTitleFromUrl(url);
  return /^Cannabis in [^(]+$/i.test(title);
}

function isSpecificCannabisWikiUrl(url: string | null | undefined) {
  const title = decodeWikiTitleFromUrl(url);
  return /^Cannabis in .+\s+\(.+\)$/i.test(title);
}

function isSyntheticGeo(geo: string) {
  return /^[A-Z]{3}$/.test(String(geo || "").trim().toUpperCase());
}

function normalizeWikiComparableUrl(value: string) {
  try {
    const url = new URL(String(value || "").trim());
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return String(value || "").trim().replace(/\/+$/, "");
  }
}

function isDedicatedCannabisWiki(value: { url?: string | null; title?: string | null }) {
  const title = String(value.title || "").trim();
  const url = String(value.url || "").trim();
  return /^Cannabis in\b/i.test(title) || /\/wiki\/Cannabis_in_/i.test(url);
}

function deriveSourceKind(entry: RuntimeAuditCard, wikiUrl: string) {
  if (String(entry?.cannabisProfile?.sourceUrl || "").trim()) return "dedicated_profile" as const;
  if (/\/wiki\/Legality_of_cannabis(?:$|_by_)/i.test(wikiUrl)) return "root_legality_source" as const;
  if (wikiUrl) return "fallback_wikipedia_source" as const;
  return "no_wiki_source" as const;
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
      if (label === "Market/Economy/Tourism" && (penaltyRe.test(item) || (legalBoilerplateRe.test(item) && !marketSignalRe.test(item)))) {
        findings.push(`Market:${item}`);
      }
      if (
        ["Culture", "Traditional Use"].includes(label) &&
        (penaltyRe.test(item) || (legalBoilerplateRe.test(item) && !cultureSignalRe.test(item)))
      ) {
        findings.push(`${label}:${item}`);
      }
      if (label === "Cultivation/Production" && (penaltyRe.test(item) || (legalBoilerplateRe.test(item) && !cultivationSignalRe.test(item)))) {
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

async function readPopupSnapshot(page: Page) {
  return page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]');
    if (!popup) return null;
    const sectionMap: Record<string, string[]> = {};
    for (const section of Array.from(popup.querySelectorAll("section"))) {
      const heading = String(section.querySelector("div")?.textContent || "").replace(/\s+/g, " ").trim();
      if (!heading) continue;
      sectionMap[heading] = Array.from(section.querySelectorAll("li"))
        .map((item) => String(item.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
    }
    return {
      title: String(popup.querySelector('[class*="viewportPopupTitle"]')?.textContent || "").replace(/\s+/g, " ").trim(),
      meta: String(popup.querySelector('[class*="viewportPopupMeta"]')?.textContent || "").replace(/\s+/g, " ").trim(),
      status_badge: String(popup.querySelector('[class*="viewportPopupBadge"]')?.textContent || "").replace(/\s+/g, " ").trim(),
      raw_text: String((popup as HTMLElement).innerText || popup.textContent || "").replace(/\s+/g, " ").trim(),
      section_map: sectionMap,
      source_links: Array.from(popup.querySelectorAll("a"))
        .map((link) => ({
          href: String(link.getAttribute("href") || "").replace(/\s+/g, " ").trim(),
          text: String(link.textContent || "").replace(/\s+/g, " ").trim()
        }))
        .filter((item) => item.href || item.text)
    };
  });
}

async function readWikiSnapshot(page: Page) {
  const html = await page.content();
  const finalUrl = page.url();
  const snapshot = await page.evaluate(() => {
    const sectionMap: Record<string, string[]> = {};
    const headingNodes = Array.from(document.querySelectorAll("h2, h3"));
    for (const headingNode of headingNodes) {
      const heading = String(headingNode.textContent?.replace(/\[edit\]/gi, "") || "").replace(/\s+/g, " ").trim();
      if (!heading) continue;
      const sectionRoot = headingNode.closest(".mw-heading") || headingNode;
      const items: string[] = [];
      let cursor = sectionRoot.nextElementSibling;
      while (cursor) {
        if (cursor.matches(".mw-heading, h2, h3")) break;
        const nodes = [
          ...(cursor.matches("p, li") ? [cursor] : []),
          ...Array.from(cursor.querySelectorAll("p, li"))
        ];
        for (const paragraph of nodes) {
          const text = String(paragraph.textContent || "").replace(/\s+/g, " ").trim();
          if (text) items.push(text);
        }
        cursor = cursor.nextElementSibling;
      }
      sectionMap[heading] = items;
    }
    return {
      title: String(document.querySelector("#firstHeading")?.textContent || "").replace(/\s+/g, " ").trim(),
      raw_text: String(document.body?.innerText || "").replace(/\s+/g, " ").trim(),
      lead_paragraphs: Array.from(document.querySelectorAll("#mw-content-text > .mw-parser-output > p"))
        .map((paragraph) => String(paragraph.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 4),
      section_map: sectionMap
    };
  });
  return {
    ...snapshot,
    final_url: finalUrl,
    html
  };
}

function wikiSectionHasSubstantiveContent(heading: string, items: string[]) {
  const label = wikiSemanticHeading(heading) || heading;
  if (!label) return false;
  const penaltyRe = /\b(prison|imprison|fine|fined|punish|penalt|arrest|detained|death penalty|sentence of)\b/i;
  const legalBoilerplateRe = /\b(illegal|legal|banned|restricted|prohibit|criminal penalties|medical cannabis|recreational use|sale and distribution)\b/i;
  const historySignalRe = /\b(1[5-9]\d{2}|20\d{2}|[1-3],\d{3}\s*bce|bce|ce|dating back|ancient|centur(?:y|ies)|introduced|revolution|period|occupation|reform|legali[sz]ed|decriminali[sz]ed)\b/i;
  const cultureSignalRe = /\b(widely consumed|social|culture|cultural|ritual|religious|festival|traditional|custom|commonly used)\b/i;
  const marketSignalRe =
    /\b(sales?|dispensar(?:y|ies)|retail(?:er|ers)?|market|revenue|tax|opened|wholesale|consumer|industry|supply shortages?|import(?:ation|ed|er|ers)?|export(?:ing|ed|er|ers)?|cannabis clubs?|social clubs?|private collective)\b/i;
  const cultivationSignalRe = /\b(cultivat(?:e|ed|ion)|hemp|farm(?:s|ing)?|production|crop)\b/i;
  const productSignalRe = /\b(cbd|oil|flower|tinctures?|patches?|edibles?|extract|resin|hashish|hemp seeds?)\b/i;
  const traditionalSignalRe = /\b(traditional|ritual|smok(?:e|ed|ing)|infused foods?|used for|preparation)\b/i;

  return items.some((item) => {
    if (!item) return false;
    if (label === "History") return historySignalRe.test(item);
    if (label === "Legal/Status") return legalBoilerplateRe.test(item) || historySignalRe.test(item);
    if (label === "Medical/Industrial/Recreational") {
      return /\b(medical|medicinal|recreational|adult use|industrial|hemp)\b/i.test(item) && !penaltyRe.test(item);
    }
    if (label === "Enforcement") return penaltyRe.test(item);
    if (label === "Cultivation/Production") return cultivationSignalRe.test(item) && !penaltyRe.test(item);
    if (label === "Market/Economy/Tourism") return marketSignalRe.test(item) && !(legalBoilerplateRe.test(item) && !marketSignalRe.test(item));
    if (label === "Products") return productSignalRe.test(item) && !legalBoilerplateRe.test(item);
    if (label === "Traditional Use") return traditionalSignalRe.test(item) && !legalBoilerplateRe.test(item);
    if (label === "Culture") return cultureSignalRe.test(item) && !legalBoilerplateRe.test(item);
    if (label === "Cannabis Foods") return /\b(food|foods|pizza|edibles?|infused)\b/i.test(item) && !legalBoilerplateRe.test(item);
    if (label === "Slang/Local Names") return /\b(known as|called|referred to as|slang|local parlance|locally)\b/i.test(item);
    return false;
  });
}

function wikiSemanticSectionsFromSnapshot(sectionMap: Record<string, string[]>) {
  const wikiSemanticHeadings: string[] = [];
  for (const [heading, rawItems] of Object.entries(sectionMap)) {
    if (isNonContentWikiHeading(heading)) continue;
    const items = cleanWikiSectionItems(rawItems);
    if (!items.length) continue;
    const primaryHeading = wikiSemanticHeading(heading);
    if (primaryHeading && wikiSectionHasSubstantiveContent(primaryHeading, items)) {
      wikiSemanticHeadings.push(primaryHeading);
    }
    for (const derivedHeading of wikiSupplementalSemanticHeadings(heading, items)) {
      if (wikiSectionHasSubstantiveContent(derivedHeading, items)) {
        wikiSemanticHeadings.push(derivedHeading);
      }
    }
  }
  return stableUnique(wikiSemanticHeadings);
}

function wikiSemanticSectionsFromLead(leadParagraphs: string[]) {
  const headings: string[] = [];
  const items = cleanWikiSectionItems(leadParagraphs || []);
  if (!items.length) return headings;
  for (const derivedHeading of wikiSupplementalSemanticHeadings("Lead", items)) {
    if (wikiSectionHasSubstantiveContent(derivedHeading, items)) {
      headings.push(derivedHeading);
    }
  }
  return stableUnique(headings);
}

function classifyCoverage(params: {
  geo: string;
  wikiUrl: string;
  hasComparableCannabisProfile: boolean;
  sourceKind: VisualAuditRow["source_kind"];
  wikiSnapshot: Awaited<ReturnType<typeof readWikiSnapshot>> | null;
  wikiSectionsFound: string[];
}) {
  const { geo, wikiUrl, hasComparableCannabisProfile, sourceKind, wikiSnapshot, wikiSectionsFound } = params;
  const finalUrl = normalizeWikiComparableUrl(wikiSnapshot?.final_url || wikiUrl);
  const requestedUrl = normalizeWikiComparableUrl(wikiUrl);
  const finalTitle = String(wikiSnapshot?.title || "").trim();
  const dedicatedFinal = isDedicatedCannabisWiki({ url: finalUrl, title: finalTitle });
  const dedicatedRequested = isDedicatedCannabisWiki({ url: requestedUrl, title: finalTitle });
  const redirected = Boolean(requestedUrl && finalUrl && requestedUrl !== finalUrl);
  const leadParagraphCount = wikiSnapshot?.lead_paragraphs?.length || 0;

  if (!wikiUrl) {
    if (isSyntheticGeo(geo)) {
      return {
        coverageClass: "synthetic_no_wiki" as const,
        lowCoverageReason: "Synthetic/disputed geo has no dedicated wiki source."
      };
    }
    return {
      coverageClass: "resolver_failed" as const,
      lowCoverageReason: "Resolver failed to produce a wiki source for this geo."
    };
  }

  if (sourceKind === "root_legality_source") {
    return {
      coverageClass: "root_only" as const,
      lowCoverageReason: "Only root legality/source-row fallback resolved; profile sections should stay minimal."
    };
  }

  if (redirected && !dedicatedFinal) {
    return {
      coverageClass: "redirect_parent" as const,
      lowCoverageReason: "Exact cannabis page resolved to a broader parent or territory article."
    };
  }

  if (hasComparableCannabisProfile && dedicatedRequested) {
    if (wikiSectionsFound.length > 0) {
      return {
        coverageClass: "individual_article" as const,
        lowCoverageReason: null
      };
    }
    return {
      coverageClass: "stub_lead_only" as const,
      lowCoverageReason: "Dedicated cannabis page exists but only lead/stub content was found."
    };
  }

  if (wikiSectionsFound.length > 0 || leadParagraphCount > 0) {
    return {
      coverageClass: "substantive_article" as const,
      lowCoverageReason: wikiSectionsFound.length > 0 ? null : "Useful lead content exists, but no substantive section headings were detected."
    };
  }

  return {
    coverageClass: isSyntheticGeo(geo) ? "synthetic_no_wiki" as const : "no_individual_wiki_page" as const,
    lowCoverageReason: isSyntheticGeo(geo)
      ? "Synthetic/disputed geo has no substantive wiki article."
      : "No dedicated or substantive wiki article was resolved for this geo."
  };
}

function deriveSparseCoverageReason(params: {
  coverageClass: VisualAuditRow["coverage_class"];
  lowCoverageReason: string | null;
  popupSectionsFound: string[];
  wikiSectionsFound: string[];
  missingSections: string[];
  hasComparableCannabisProfile: boolean;
  sourceKind: VisualAuditRow["source_kind"];
}) {
  const {
    coverageClass,
    lowCoverageReason,
    popupSectionsFound,
    wikiSectionsFound,
    missingSections,
    hasComparableCannabisProfile,
    sourceKind
  } = params;
  if (lowCoverageReason) return lowCoverageReason;
  if (popupSectionsFound.length > 1) return null;

  if (coverageClass === "substantive_article") {
    if (!hasComparableCannabisProfile || sourceKind === "fallback_wikipedia_source") {
      return "Fallback territory/parent article is not cannabis-specific, so popup stays at law/source-only coverage.";
    }
    if (wikiSectionsFound.length <= 1) {
      return "Source article exposes only limited cannabis-specific structured sections for this geo.";
    }
    if (missingSections.length > 0) {
      return "Source article has additional structured sections that are not yet surfaced in the popup.";
    }
    return "Structured source coverage is still too thin to support more than one popup section without speculation.";
  }

  if (coverageClass === "individual_article") {
    if (missingSections.length > 0) {
      return "Dedicated cannabis article has additional structured sections that are not yet surfaced in the popup.";
    }
    if (wikiSectionsFound.length <= 1) {
      return "Dedicated cannabis article currently yields only one structured section.";
    }
    return "Dedicated cannabis article is present, but extracted facts still collapse into one popup section.";
  }

  return null;
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
  const sourceCandidates = (entry?.sources || [])
    .map((source) => String(source?.url || "").trim())
    .filter((candidate) => /wikipedia\.org\/wiki\//i.test(candidate));
  const canonicalCannabisCandidate = sourceCandidates.find((candidate) => isSpecificCannabisWikiUrl(candidate));
  if (canonicalCannabisCandidate && (!profileUrl || isGenericCannabisWikiUrl(profileUrl))) return canonicalCannabisCandidate;
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
  const bypassHeaders = buildVercelBypassHeaders(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "", "true");
  const cleanedBypassHeaders = Object.entries(bypassHeaders).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === "string" && value) {
      acc[key] = value;
    }
    return acc;
  }, {});
  const popupDir = path.join(POPUP_VISUAL_AUDIT_DIR, "popup");
  const wikiDir = path.join(POPUP_VISUAL_AUDIT_DIR, "wiki");
  fs.mkdirSync(GEO_WIKI_AUDIT_DIR, { recursive: true });
  fs.mkdirSync(popupDir, { recursive: true });
  fs.mkdirSync(wikiDir, { recursive: true });

  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADFUL === "1" ? false : true });
  const context = await browser.newContext({
    ...(Object.keys(cleanedBypassHeaders).length > 0 ? { extraHTTPHeaders: cleanedBypassHeaders } : {})
  });
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
      const geoArtifactDir = path.join(GEO_WIKI_AUDIT_DIR, geo);
      fs.mkdirSync(geoArtifactDir, { recursive: true });
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
        fs.copyFileSync(popupScreenshotPath, path.join(geoArtifactDir, "project-popup.png"));
      }

      const popupSnapshot = popupVisible ? await readPopupSnapshot(page) : null;
      const popupSectionMap = popupSnapshot?.section_map || {};
      const popupSectionHeadings: string[] = [];
      for (const [heading, items] of Object.entries(popupSectionMap)) {
        const semanticHeading = popupSemanticHeading(heading);
        if (semanticHeading && semanticHeading !== "Jurisdiction") popupSectionHeadings.push(semanticHeading);
        for (const derivedHeading of popupSupplementalSemanticHeadings(heading, items)) {
          popupSectionHeadings.push(derivedHeading);
        }
      }
      const popupSectionsFound = stableUnique(popupSectionHeadings);
      const repeatedText = detectRepeatedPopupText(popupSectionMap);
      const rawUrls = detectRawUrls(popupSectionMap);
      const misplacedContent = detectMisplacedPopupContent(popupSectionMap);
      const wikiUrl = deriveWikiAuditUrl(entry);
      const hasComparableCannabisProfile = Boolean(String(entry.cannabisProfile?.sourceUrl || "").trim());
      const sourceKind = deriveSourceKind(entry, wikiUrl);
      const popupTextPath = popupVisible ? path.join(geoArtifactDir, "project-popup.txt") : null;
      const popupJsonPath = popupVisible ? path.join(geoArtifactDir, "project-popup.json") : null;
      if (popupVisible && popupSnapshot && popupTextPath && popupJsonPath) {
        fs.writeFileSync(popupTextPath, `${popupSnapshot.raw_text}\n`);
        fs.writeFileSync(popupJsonPath, `${JSON.stringify(popupSnapshot, null, 2)}\n`);
      }

      let wikiSectionsFound: string[] = [];
      let wikiScreenshotPath: string | null = null;
      let wikiSnapshot: Awaited<ReturnType<typeof readWikiSnapshot>> | null = null;
      let wikiTextPath: string | null = null;
      let wikiHtmlPath: string | null = null;
      let wikiJsonPath: string | null = null;
      if (wikiUrl) {
        await wikiPage.goto(wikiUrl, { waitUntil: "domcontentloaded" });
        await wikiPage.waitForTimeout(250);
        wikiScreenshotPath = path.join(wikiDir, `${geo}.png`);
        await captureFullPageScreenshot(wikiPage, wikiScreenshotPath);
        fs.copyFileSync(wikiScreenshotPath, path.join(geoArtifactDir, "wiki-fullpage.png"));
        wikiSnapshot = await readWikiSnapshot(wikiPage);
        wikiTextPath = path.join(geoArtifactDir, "wiki-fullpage.txt");
        wikiHtmlPath = path.join(geoArtifactDir, "wiki-fullpage.html");
        wikiJsonPath = path.join(geoArtifactDir, "wiki-fullpage.json");
        fs.writeFileSync(wikiTextPath, `${wikiSnapshot.raw_text}\n`);
        fs.writeFileSync(wikiHtmlPath, wikiSnapshot.html);
        fs.writeFileSync(
          wikiJsonPath,
          `${JSON.stringify(
            {
              title: wikiSnapshot.title,
              final_url: wikiSnapshot.final_url,
              lead_paragraphs: wikiSnapshot.lead_paragraphs,
              section_map: wikiSnapshot.section_map
            },
            null,
            2
          )}\n`
        );
        const wikiSectionMap = wikiSnapshot.section_map;
        wikiSectionsFound = wikiSemanticSectionsFromSnapshot(wikiSectionMap);
        if (hasComparableCannabisProfile) {
          wikiSectionsFound = stableUnique([
            ...wikiSectionsFound,
            ...wikiSemanticSectionsFromLead(wikiSnapshot.lead_paragraphs || [])
          ]);
        }
      }

      const coverage = classifyCoverage({
        geo,
        wikiUrl,
        hasComparableCannabisProfile,
        sourceKind,
        wikiSnapshot,
        wikiSectionsFound
      });

      const missingSections = hasComparableCannabisProfile
        ? wikiSectionsFound.filter(
            (heading) =>
              !["Local Names", "Cannabis Foods", "Slang"].includes(heading) &&
              !popupSectionsFound.includes(heading)
          )
        : [];
      const sparseCoverageReason = deriveSparseCoverageReason({
        coverageClass: coverage.coverageClass,
        lowCoverageReason: coverage.lowCoverageReason,
        popupSectionsFound,
        wikiSectionsFound,
        missingSections,
        hasComparableCannabisProfile,
        sourceKind
      });
      const notes = stableUnique([
        popupVisible ? "" : "POPUP_NOT_VISIBLE",
        wikiUrl ? "" : "NO_WIKI_URL",
        hasComparableCannabisProfile ? "" : "NO_RUNTIME_CANNABIS_PROFILE",
        sparseCoverageReason ? `LOW_COVERAGE:${sparseCoverageReason}` : ""
      ].filter(Boolean));

      rows.push({
        id: geo,
        name: String(entry.displayName || geo),
        type: String(entry.type || (geo.startsWith("US-") ? "state" : "country")),
        processed: true,
        coverage_class: coverage.coverageClass,
        low_coverage_reason: sparseCoverageReason,
        source_kind: sourceKind,
        artifact_dir: path.relative(path.resolve(process.cwd(), "..", ".."), geoArtifactDir),
        wiki_page: wikiUrl || null,
        popup_screenshot: popupScreenshotPath ? path.relative(path.resolve(process.cwd(), "..", ".."), popupScreenshotPath) : null,
        wiki_fullpage_screenshot: wikiScreenshotPath ? path.relative(path.resolve(process.cwd(), "..", ".."), wikiScreenshotPath) : null,
        project_popup_text: popupTextPath ? path.relative(path.resolve(process.cwd(), "..", ".."), popupTextPath) : null,
        project_popup_json: popupJsonPath ? path.relative(path.resolve(process.cwd(), "..", ".."), popupJsonPath) : null,
        wiki_text_snapshot: wikiTextPath ? path.relative(path.resolve(process.cwd(), "..", ".."), wikiTextPath) : null,
        wiki_html_snapshot: wikiHtmlPath ? path.relative(path.resolve(process.cwd(), "..", ".."), wikiHtmlPath) : null,
        wiki_json_snapshot: wikiJsonPath ? path.relative(path.resolve(process.cwd(), "..", ".."), wikiJsonPath) : null,
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
      total_geo_count: datasetTotal,
      processed_geo_count: rows.length,
      total: rows.length,
      order: "displayName:asc",
      batchOffset: Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_OFFSET || 0) || 0,
      batchLimit: Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_LIMIT || 0) || null,
      popupCaptured: rows.filter((row) => Boolean(row.popup_screenshot)).length,
      wikiCaptured: rows.filter((row) => Boolean(row.wiki_fullpage_screenshot)).length,
      coverage_summary: rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.coverage_class] = (acc[row.coverage_class] || 0) + 1;
        return acc;
      }, {}),
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

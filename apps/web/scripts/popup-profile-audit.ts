import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sanitizeEvidenceQuoteText } from "../src/lib/text/sanitizeEvidenceQuoteText";
import { buildCardIndexSnapshot } from "../src/new-map/countrySource";
import {
  deriveCountryCardEntryFromCountryPageData,
  getCountryPageIndexByGeoCode
} from "../src/lib/countryPageStorage";
import { getStatusReviewOverride } from "../src/lib/statusReviewOverrides";

const SPECIAL_MAP_EXTRAS = new Set(["BJN", "BRT", "KAS", "PGA", "SCR", "SER", "SPI"]);
const PROFILE_SECTION_IDS = [
  "history",
  "localNames",
  "culture",
  "enforcementReality",
  "products",
  "traditionalUse",
  "notes",
  "cannabisFoods",
  "slang",
  "cultivation",
  "market"
] as const;
const NON_SUMMARY_SECTION_IDS = PROFILE_SECTION_IDS.filter((key) => key !== "notes");

type AuditRow = {
  id: string;
  name: string;
  iso_state: string;
  type: "country" | "state";
  wiki_page: string | null;
  resolver_status: "individual_wiki_page" | "no_individual_wiki_page";
  processed: boolean;
  sections: string[];
  status_mismatch: boolean;
  color_mismatch: boolean;
  raw_urls: string[];
  repeated_text: string[];
  garbage_text: string[];
  source_errors: string[];
  empty_sections: string[];
  template_sections: string[];
  status_review_override: boolean;
  status_review_override_reason: string | null;
  notes: string[];
};

type KnowledgeEntry = {
  geo?: string;
  wikiUrl?: string;
  sourceType?: string;
};

function repoRoot() {
  const fromWorkspace = path.resolve(process.cwd(), "..", "..");
  return path.basename(process.cwd()) === "web" && path.basename(path.dirname(process.cwd())) === "apps"
    ? fromWorkspace
    : process.cwd();
}

function normalizeText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stableItems(items: string[] | undefined) {
  return (items || []).map((item) => normalizeText(item)).filter(Boolean);
}

function sectionMap(entry: ReturnType<typeof buildCardIndexSnapshot>[string]) {
  const profile = entry.cannabisProfile || null;
  return Object.fromEntries(
    PROFILE_SECTION_IDS.map((key) => [key, stableItems(profile?.[key])])
  ) as Record<(typeof PROFILE_SECTION_IDS)[number], string[]>;
}

function collectRepeatedText(sections: Record<(typeof PROFILE_SECTION_IDS)[number], string[]>) {
  const seen = new Map<string, Set<string>>();
  for (const [sectionId, items] of Object.entries(sections) as Array<[keyof typeof sections, string[]]>) {
    for (const item of items) {
      const normalized = item.toLowerCase();
      const owners = seen.get(normalized) || new Set<string>();
      owners.add(String(sectionId));
      seen.set(normalized, owners);
    }
  }
  return Array.from(seen.entries())
    .filter(([, owners]) => owners.size >= 3)
    .map(([text]) => text);
}

function collectRawUrls(sections: Record<(typeof PROFILE_SECTION_IDS)[number], string[]>) {
  const matches = new Set<string>();
  for (const items of Object.values(sections)) {
    for (const item of items) {
      const found = item.match(/\bhttps?:\/\/\S+/gi) || [];
      for (const url of found) matches.add(url);
    }
  }
  return Array.from(matches).sort();
}

function looksLikeGarbageText(value: string) {
  const text = normalizeText(value);
  if (!text) return false;
  return /(?:\[\[|\]\]|\{\{|\}\}|<ref|Category:|\|\d{2,4}x\d{2,4}px\b|\b(?:See also|Further reading|External links|Bibliography|References)\b|(?:^|\s)\*+\s+)/i.test(
    text
  );
}

function collectGarbageText(sections: Record<(typeof PROFILE_SECTION_IDS)[number], string[]>) {
  const matches = new Set<string>();
  for (const items of Object.values(sections)) {
    for (const item of items) {
      const raw = normalizeText(item);
      if (!raw) continue;
      const sanitized = normalizeText(sanitizeEvidenceQuoteText(raw));
      if (looksLikeGarbageText(raw) || (sanitized.length === 0 && raw.length > 0)) {
        matches.add(raw);
      }
    }
  }
  return Array.from(matches).sort();
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function isTemplateLine(sectionId: (typeof PROFILE_SECTION_IDS)[number], value: string) {
  const text = normalizeText(value);
  if (!text) return false;
  if (/^main article:/i.test(text)) return true;
  if (sectionId === "enforcementReality") return false;
  if (/^(medical cannabis is legal|distribution is tolerated|prison exposure detected)\.?$/i.test(text)) return true;
  return /^(cannabis(?: in [^.]+)? is (?:illegal|legal|decriminalized|tolerated|restricted))\.?$/i.test(text);
}

function buildRows() {
  const root = repoRoot();
  const claims = readJson<Array<Record<string, unknown>>>(path.join(root, "data", "wiki", "wiki_claims.json"));
  const knowledgeDb = readJson<{ entries?: KnowledgeEntry[] }>(path.join(root, "data", "cannabis_profiles", "knowledge_db.json"));
  const knowledgeByGeo = new Map(
    (knowledgeDb.entries || [])
      .map((entry) => [normalizeText(String(entry.geo || "")).toUpperCase(), entry] as const)
      .filter(([geo]) => geo)
  );
  const cardIndex = buildCardIndexSnapshot();
  const pageIndex = getCountryPageIndexByGeoCode();
  const rows: AuditRow[] = [];

  for (const claim of claims) {
    const geo = normalizeText(String(claim.geo_key || "")).toUpperCase();
    if (!geo || SPECIAL_MAP_EXTRAS.has(geo)) continue;
    const entry = cardIndex[geo];
    const page = pageIndex.get(geo) || null;
    const knowledge = knowledgeByGeo.get(geo) || null;
    const sectionsById = entry ? sectionMap(entry) : Object.fromEntries(PROFILE_SECTION_IDS.map((key) => [key, []])) as Record<(typeof PROFILE_SECTION_IDS)[number], string[]>;
    const nonEmptySections = PROFILE_SECTION_IDS.filter((key) => sectionsById[key].length > 0);
    const repeatedText = collectRepeatedText(sectionsById);
    const rawUrls = collectRawUrls(sectionsById);
    const garbageText = collectGarbageText(sectionsById);
    const knowledgeSourceType = normalizeText(String(knowledge?.sourceType || ""));
    const liveKnowledgePage =
      knowledgeSourceType === "missing_wikipedia_article" ? "" : normalizeText(String(knowledge?.wikiUrl || ""));
    const candidateWikiPage = liveKnowledgePage || page?.sources?.legal || null;
    const expectedEntry = page ? deriveCountryCardEntryFromCountryPageData(page) : null;
    const resolverStatus =
      knowledgeSourceType === "missing_wikipedia_article"
        ? "no_individual_wiki_page"
        : candidateWikiPage
          ? "individual_wiki_page"
          : "no_individual_wiki_page";
    const wikiPage = resolverStatus === "individual_wiki_page" ? candidateWikiPage : null;
    const templateSections = NON_SUMMARY_SECTION_IDS.filter((key) => sectionsById[key].some((item) => isTemplateLine(key, item)));
    const emptySections = NON_SUMMARY_SECTION_IDS.filter((key) => sectionsById[key].length === 0);
    const visibleReasonItems = [
      ...(entry?.panel?.critical || []),
      ...(entry?.panel?.info || []),
      ...(entry?.panel?.why || [])
    ].filter((item) => normalizeText(String(item?.text || "")));
    const statusReviewOverride = getStatusReviewOverride(geo);
    const sourceErrors: string[] = [];
    if (nonEmptySections.length > 0 && resolverStatus !== "individual_wiki_page") {
      sourceErrors.push("VISIBLE_PROFILE_WITHOUT_INDIVIDUAL_WIKI_PAGE");
    }
    if (
      nonEmptySections.length > 0 &&
      resolverStatus === "individual_wiki_page" &&
      wikiPage &&
      !(entry?.sources || []).some((source) => normalizeText(source?.url || "") === normalizeText(wikiPage))
    ) {
      sourceErrors.push("VISIBLE_PROFILE_WITHOUT_LINKED_WIKI_SOURCE");
    }
    if (visibleReasonItems.length > 0 && !page?.sources?.legal && !(entry?.sources || []).some((source) => normalizeText(source?.url || ""))) {
      sourceErrors.push("VISIBLE_REASON_WITHOUT_SOURCE_URL");
    }
    if (
      nonEmptySections.length > 0 &&
      resolverStatus === "individual_wiki_page" &&
      (
        !normalizeText(entry?.cannabisProfile?.sourceUrl || "") ||
        normalizeText(entry?.cannabisProfile?.sourceUrl || "") !== normalizeText(wikiPage || "")
      )
    ) {
      sourceErrors.push("VISIBLE_PROFILE_SECTION_WITHOUT_MATCHING_SECTION_SOURCE");
    }
    if (nonEmptySections.length > 0 && !candidateWikiPage && !(entry?.sources || []).some((source) => normalizeText(source?.url || ""))) {
      sourceErrors.push("VISIBLE_PROFILE_WITHOUT_SOURCE_URL");
    }
    const statusMismatch =
      Boolean(expectedEntry) &&
      (
        entry?.mapCategory !== expectedEntry?.mapCategory ||
        entry?.result?.status !== expectedEntry?.result?.status
      );
    const colorMismatch = Boolean(expectedEntry) && entry?.result?.color !== expectedEntry?.result?.color;
    const processed =
      Boolean(entry) &&
      rawUrls.length === 0 &&
      repeatedText.length === 0 &&
      garbageText.length === 0 &&
      templateSections.length === 0 &&
      sourceErrors.length === 0 &&
      !statusMismatch &&
      !colorMismatch &&
      (
        resolverStatus === "no_individual_wiki_page"
          ? NON_SUMMARY_SECTION_IDS.every((key) => sectionsById[key].length === 0)
          : nonEmptySections.length > 0
      );

    rows.push({
      id: geo,
      name: entry?.displayName || page?.name || normalizeText(String(claim.name_in_wiki || geo)),
      iso_state: geo,
      type: entry?.type || page?.node_type || (geo.startsWith("US-") ? "state" : "country"),
      wiki_page: wikiPage,
      resolver_status: resolverStatus,
      processed,
      sections: nonEmptySections.map(String),
      status_mismatch: statusMismatch,
      color_mismatch: colorMismatch,
      raw_urls: rawUrls,
      repeated_text: repeatedText,
      garbage_text: garbageText,
      source_errors: sourceErrors,
      empty_sections: emptySections.map(String),
      template_sections: templateSections.map(String),
      status_review_override: Boolean(statusReviewOverride),
      status_review_override_reason: normalizeText(statusReviewOverride?.reason || "") || null,
      notes: [
        resolverStatus === "no_individual_wiki_page"
          ? "Root legal summary only; profile sections must stay hidden."
          : "Dedicated Cannabis_in_* page expected."
      ]
    });
  }

  return rows.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function toCsv(rows: AuditRow[]) {
  const header = [
    "id",
    "name",
    "iso_state",
    "type",
    "wiki_page",
    "resolver_status",
    "processed",
    "sections",
    "status_mismatch",
    "color_mismatch",
    "raw_urls",
    "repeated_text",
    "garbage_text",
    "source_errors",
    "empty_sections",
    "template_sections",
    "status_review_override",
    "status_review_override_reason",
    "notes"
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const values = [
      row.id,
      row.name,
      row.iso_state,
      row.type,
      row.wiki_page || "",
      row.resolver_status,
      row.processed ? "1" : "0",
      row.sections.join("|"),
      row.status_mismatch ? "1" : "0",
      row.color_mismatch ? "1" : "0",
      row.raw_urls.join("|"),
      row.repeated_text.join("|"),
      row.garbage_text.join("|"),
      row.source_errors.join("|"),
      row.empty_sections.join("|"),
      row.template_sections.join("|"),
      row.status_review_override ? "1" : "0",
      row.status_review_override_reason || "",
      row.notes.join("|")
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`);
    lines.push(values.join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const root = repoRoot();
  const rows = buildRows();
  const statusMismatchCount = rows.filter((row) => row.status_mismatch).length;
  const colorMismatchCount = rows.filter((row) => row.color_mismatch).length;
  const summary = {
    generated_at: new Date().toISOString(),
    total_dataset_entities: rows.length,
    processed_count: rows.filter((row) => row.processed).length,
    no_page_count: rows.filter((row) => row.resolver_status === "no_individual_wiki_page").length,
    empty_sections_count: rows.reduce((count, row) => count + row.empty_sections.length, 0),
    template_sections_count: rows.reduce((count, row) => count + row.template_sections.length, 0),
    repeated_text_count: rows.reduce((count, row) => count + row.repeated_text.length, 0),
    garbage_text_count: rows.reduce((count, row) => count + row.garbage_text.length, 0),
    raw_url_count: rows.reduce((count, row) => count + row.raw_urls.length, 0),
    source_errors_count: rows.reduce((count, row) => count + row.source_errors.length, 0),
    status_mismatch_count: statusMismatchCount,
    color_mismatch_count: colorMismatchCount,
    conflicts_count: statusMismatchCount + colorMismatchCount,
    status_review_override_count: rows.filter((row) => row.status_review_override).length,
    rows
  };
  const jsonPath = path.join(root, "Reports", "popup-profile-audit.json");
  const csvPath = path.join(root, "Reports", "popup-profile-audit.csv");
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(csvPath, toCsv(rows));
  console.warn(`POPUP_PROFILE_AUDIT_JSON=${path.relative(root, jsonPath)}`);
  console.warn(`POPUP_PROFILE_AUDIT_CSV=${path.relative(root, csvPath)}`);
  console.warn(`POPUP_PROFILE_TOTAL=${summary.total_dataset_entities}`);
  console.warn(`POPUP_PROFILE_PROCESSED=${summary.processed_count}`);
  console.warn(`POPUP_PROFILE_NO_PAGE=${summary.no_page_count}`);
  console.warn(`POPUP_PROFILE_TEMPLATE_SECTIONS=${summary.template_sections_count}`);
  console.warn(`POPUP_PROFILE_RAW_URLS=${summary.raw_url_count}`);
  console.warn(`POPUP_PROFILE_REPEATED_TEXT=${summary.repeated_text_count}`);
  console.warn(`POPUP_PROFILE_GARBAGE_TEXT=${summary.garbage_text_count}`);
  console.warn(`POPUP_PROFILE_SOURCE_ERRORS=${summary.source_errors_count}`);
  console.warn(`POPUP_PROFILE_STATUS_MISMATCHES=${summary.status_mismatch_count}`);
  console.warn(`POPUP_PROFILE_COLOR_MISMATCHES=${summary.color_mismatch_count}`);
  console.warn(`POPUP_PROFILE_CONFLICTS=${summary.conflicts_count}`);
  console.warn(`POPUP_PROFILE_STATUS_REVIEW_OVERRIDES=${summary.status_review_override_count}`);
}

void main();

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const LEGALITY_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");

function parseGeoScope(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const scope = new Set();
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--geos" && args[i + 1]) {
      args[i + 1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => scope.add(value));
      i += 2;
      continue;
    }
    i += 1;
  }
  return scope.size > 0 ? scope : null;
}

function normalizeSpace(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountryKey(value) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripWikiMarkupPreserveLinks(value) {
  let text = String(value || "");
  text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<ref[^>]*\/?>/gi, " ");
  text = text.replace(/\{\{\s*(plainlist|flatlist|ubl|unbulleted list|bulleted list|unordered list|list)\s*\|([\s\S]*?)\}\}/gi, (_, __, body) =>
    body
      .split("|")
      .map((part) => part.replace(/^\s*\*\s*/g, "").trim())
      .filter(Boolean)
      .join(" ")
  );
  text = text.replace(/\{\{\s*nowrap\s*\|([\s\S]*?)\}\}/gi, "$1");
  text = text.replace(/\{\{\s*lang\s*\|[^|}]+\|([\s\S]*?)\}\}/gi, "$1");
  text = text.replace(/\{\{\s*small\s*\|([\s\S]*?)\}\}/gi, "$1");
  text = text.replace(/\{\{\s*abbr\s*\|([^|}]+)(?:\|[^}]+)?\}\}/gi, "$1");
  text = text.replace(/\{\{\s*cvt\|([^}|]+)\|([^}|]+)[^}]*\}\}/gi, "$1 $2");
  text = text.replace(/\{\{\s*convert\|([^}|]+)\|([^}|]+)[^}]*\}\}/gi, "$1 $2");
  text = text.replace(/\{\{[\s\S]*?\}\}/g, " ");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/\[\s*\d+\s*\]/g, " ");
  text = text.replace(/\[https?:\/\/([^\s\]]+)\s+([^\]]+)\]/gi, (_, url, label) => `${label} (${url})`);
  text = text.replace(/\[https?:\/\/([^\s\]]+)\]/gi, (_, url) => `${url}`);
  text = text.replace(/<[^>]+>/g, " ");
  return normalizeSpace(text);
}

function extractMainArticle(raw) {
  const match = String(raw || "").match(/\{\{\s*main\s*\|([^}]+)\}\}/i);
  if (!match) return "";
  const parts = match[1]
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[0] || "";
}

function isPlaceholderNotes(notesText, notesRaw) {
  const text = normalizeSpace(notesText);
  if (!text) return true;
  if (/^Main article:/i.test(text)) return true;
  if (/^Main articles?:/i.test(text)) return true;
  if (/^See also:/i.test(text)) return true;
  if (/^Further information:/i.test(text)) return true;
  if (/^Cannabis in\s+/i.test(text)) {
    const rawText = stripWikiMarkupPreserveLinks(notesRaw);
    if (!rawText) return true;
  }
  return false;
}

function extractLeadParagraphs(raw) {
  let text = String(raw || "");
  text = text.replace(/\{\{\s*main\s*\|[^}]+\}\}/gi, " ");
  text = text.replace(/\{\{\s*see\s*also\s*\|[^}]+\}\}/gi, " ");
  text = text.replace(/\{\{\s*further(?:\s+information)?\s*\|[^}]+\}\}/gi, " ");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ""));
  const paragraphs = [];
  let buffer = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buffer.length) {
        paragraphs.push(buffer.join(" ").trim());
        buffer = [];
      }
      continue;
    }
    if (/^\{\{.*\}\}$/.test(trimmed)) continue;
    if (/^\[\[Category:/i.test(trimmed)) continue;
    if (/^==+/.test(trimmed)) break;
    buffer.push(trimmed);
    if (buffer.length >= 6) {
      paragraphs.push(buffer.join(" ").trim());
      buffer = [];
    }
  }
  if (buffer.length) {
    paragraphs.push(buffer.join(" ").trim());
  }
  const cleaned = paragraphs
    .map((para) => stripWikiMarkupPreserveLinks(para))
    .filter(Boolean);
  return cleaned.slice(0, 3);
}

function hasExtraAfterMain(text) {
  const normalized = normalizeSpace(text);
  if (!normalized) return false;
  const stripped = normalized.replace(/^Main articles?:\s*/i, "");
  const withoutMain = stripped.replace(/^[^\.]{0,200}\.\s*/i, "").trim();
  return Boolean(withoutMain);
}

function isMinOnlyNotes(notesText, notesKind) {
  if (String(notesKind || "").toUpperCase() === "MIN_ONLY") return true;
  return /^Main articles?:/i.test(normalizeSpace(notesText));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + "\n");
  fs.renameSync(tmpPath, filePath);
}

if (!fs.existsSync(MAP_PATH)) {
  console.log(`NOTES_SECTIONS_BACKFILL_OK=0 reason=missing:${MAP_PATH}`);
  process.exit(1);
}

const payload = readJson(MAP_PATH);
const items = payload?.items && typeof payload.items === "object" ? payload.items : {};
let legalityRows = [];
try {
  if (fs.existsSync(LEGALITY_PATH)) {
    const legalityPayload = readJson(LEGALITY_PATH);
    if (Array.isArray(legalityPayload?.rows)) {
      legalityRows = legalityPayload.rows;
    }
  }
} catch {
  legalityRows = [];
}
const legalityByIso2 = new Map();
const legalityByName = new Map();
for (const row of legalityRows) {
  const iso2 = String(row?.iso2 || "").toUpperCase();
  const country = String(row?.country || "");
  if (iso2) legalityByIso2.set(iso2, row);
  if (country) legalityByName.set(normalizeCountryKey(country), row);
}

function buildLegalitySummary(row) {
  if (!row || typeof row !== "object") return "";
  const rec = normalizeSpace(row.rec_status || "");
  const med = normalizeSpace(row.med_status || "");
  if (!rec && !med) return "";
  const parts = [];
  if (rec) parts.push(`Recreational status: ${rec}.`);
  if (med) parts.push(`Medical status: ${med}.`);
  return parts.join(" ");
}

const geoScope = parseGeoScope(process.argv);
let updated = 0;
let total = 0;
for (const [geoId, entry] of Object.entries(items)) {
  if (!entry || typeof entry !== "object") continue;
  const geoKey = String(entry.geo_id || entry.geo_key || geoId || "");
  if (geoScope && (!geoKey || !geoScope.has(geoKey))) {
    continue;
  }
  total += 1;
  const notesText = String(entry.notes_text || "");
  const notesRaw = String(entry.notes_raw || "");
  const existingKind = String(entry.notes_kind || "").toUpperCase();
  const sectionsUsed = Array.isArray(entry.notes_sections_used)
    ? entry.notes_sections_used
    : [];
  if (!existingKind && notesText) {
    const hasExtra = hasExtraAfterMain(notesText);
    entry.notes_kind = hasExtra ? "RICH" : "MIN_ONLY";
    entry.notes_reason_code = hasExtra ? "PARSED_SECTIONS" : "NO_EXTRA_TEXT";
    if (!hasExtra && !entry.notes_main_article && /^Main article:/i.test(notesText)) {
      entry.notes_main_article = notesText.replace(/^Main article:\s*/i, "").trim().replace(/\.$/, "");
    }
    updated += 1;
    continue;
  }
  const isRichStrong =
    existingKind === "RICH" &&
    notesText &&
    !isPlaceholderNotes(notesText, notesRaw) &&
    notesText.length >= 80;
  if (isRichStrong) {
    continue;
  }
  const shouldBackfill =
    isPlaceholderNotes(notesText, notesRaw) ||
    sectionsUsed.length === 0 ||
    ["MIN_ONLY", "WEAK", "PLACEHOLDER", "NONE"].includes(existingKind);
  if (!shouldBackfill) continue;
  const geoIso = String(entry.iso2 || "").toUpperCase();
  const geoKeyUpper = geoKey.toUpperCase();
  let mainArticle = extractMainArticle(notesRaw) || String(entry.notes_main_article || "");
  if ((geoKeyUpper === "RO" || geoKeyUpper === "RU") && isMinOnlyNotes(notesText, existingKind)) {
    const leadParagraphs = extractLeadParagraphs(notesRaw);
    const mainLine = mainArticle ? `Main article: ${mainArticle}.` : "";
    const combined = [mainLine, ...leadParagraphs].filter(Boolean).join("\n\n").trim().slice(0, 900);
    if (combined && combined.length > notesText.length) {
      entry.notes_text = combined;
      entry.notes_text_len = combined.length;
      entry.notes_sections_used = [mainArticle ? "main_article" : null, "lead"].filter(Boolean);
      entry.notes_kind = leadParagraphs.length > 0 ? "RICH" : "MIN_ONLY";
      entry.notes_reason_code = "NOTES_BACKFILL_LEAD";
      entry.notes_source = "wiki";
      if (mainArticle && !entry.notes_main_article) {
        entry.notes_main_article = mainArticle;
      }
      updated += 1;
      continue;
    }
  }
  const lookupIso = geoIso || (geoKeyUpper.length === 2 ? geoKeyUpper : "");
  const lookupName = normalizeCountryKey(entry.country || entry.name || entry.geo_name || "");
  const legalityRow =
    (lookupIso && legalityByIso2.get(lookupIso)) ||
    (lookupName && legalityByName.get(lookupName)) ||
    null;
  const legalitySummary = buildLegalitySummary(legalityRow);
  const fallbackMain = Array.isArray(entry.notes_main_articles) && entry.notes_main_articles.length
    ? String(entry.notes_main_articles[0]?.title || "")
    : "";
  if (!mainArticle) {
    mainArticle = extractMainArticle(notesRaw) || String(entry.notes_main_article || "") || fallbackMain;
  }
  if (existingKind === "RICH" && notesText && notesText.length < 80 && legalitySummary) {
    if (!notesText.includes(legalitySummary)) {
      const combinedRich = `${notesText.trim()}\n\n${legalitySummary}`.trim();
      entry.notes_text = combinedRich;
      entry.notes_text_len = combinedRich.length;
      entry.notes_sections_used = Array.isArray(entry.notes_sections_used) && entry.notes_sections_used.length
        ? Array.from(new Set([...entry.notes_sections_used, "legality_table"]))
        : ["legality_table"];
      entry.notes_kind = "RICH";
      entry.notes_reason_code = "LEG_TABLE_APPEND";
      entry.notes_source = "LEG_TABLE";
      updated += 1;
      continue;
    }
  }
  if (
    mainArticle &&
    notesText &&
    !/^Main article:/i.test(notesText) &&
    !hasExtraAfterMain(notesText) &&
    (sectionsUsed.length === 0 || sectionsUsed.every((section) => section === "main_article" || section === "notes_raw"))
  ) {
    if (existingKind === "RICH" && !isPlaceholderNotes(notesText, notesRaw)) {
      continue;
    }
    const mainOnly = `Main article: ${mainArticle}.`.trim();
    entry.notes_text = mainOnly;
    entry.notes_text_len = mainOnly.length;
    entry.notes_sections_used = ["main_article"];
    entry.notes_kind = "MIN_ONLY";
    entry.notes_reason_code = "NO_EXTRA_TEXT";
    if (!entry.notes_main_article) {
      entry.notes_main_article = mainArticle;
    }
    updated += 1;
    continue;
  }
  const leadParagraphs = extractLeadParagraphs(notesRaw);
  const mainLine = mainArticle ? `Main article: ${mainArticle}.` : "";
  const combined = [mainLine, ...leadParagraphs].filter(Boolean).join("\n\n").trim();
  if (combined) {
    entry.notes_text = combined;
    entry.notes_text_len = combined.length;
    entry.notes_sections_used = [mainArticle ? "main_article" : null, "lead"].filter(Boolean);
    entry.notes_kind = leadParagraphs.length > 0 ? "RICH" : "MIN_ONLY";
    entry.notes_reason_code = leadParagraphs.length > 0 ? "HAS_EXTRA_TEXT" : "NO_EXTRA_TEXT";
    if (mainArticle && !entry.notes_main_article) {
      entry.notes_main_article = mainArticle;
    }
    updated += 1;
    continue;
  }
  if (legalitySummary) {
    const combinedSummary = [mainLine, legalitySummary].filter(Boolean).join("\n\n").trim();
    if (combinedSummary) {
      entry.notes_text = combinedSummary;
      entry.notes_text_len = combinedSummary.length;
      entry.notes_sections_used = [mainArticle ? "main_article" : null, "legality_table"].filter(Boolean);
      entry.notes_kind = "RICH";
      entry.notes_reason_code = "LEG_TABLE";
      entry.notes_source = "LEG_TABLE";
      if (mainArticle && !entry.notes_main_article) {
        entry.notes_main_article = mainArticle;
      }
      updated += 1;
      continue;
    }
  }
  if (mainArticle) {
    if (existingKind === "RICH" && !isPlaceholderNotes(notesText, notesRaw)) {
      continue;
    }
    const mainOnly = `Main article: ${mainArticle}.`.trim();
    entry.notes_text = mainOnly;
    entry.notes_text_len = mainOnly.length;
    entry.notes_sections_used = ["main_article"];
    entry.notes_kind = "MIN_ONLY";
    entry.notes_reason_code = "NO_EXTRA_TEXT";
    if (!entry.notes_main_article) {
      entry.notes_main_article = mainArticle;
    }
    updated += 1;
    continue;
  }
  if (notesText && sectionsUsed.length === 0) {
    entry.notes_sections_used = ["notes_raw"];
    entry.notes_kind = entry.notes_kind || (hasExtraAfterMain(notesText) ? "RICH" : "MIN_ONLY");
    entry.notes_reason_code = entry.notes_reason_code || "NO_EXTRA_TEXT";
    updated += 1;
    continue;
  }
  if (sectionsUsed.length === 0) {
    entry.notes_kind = entry.notes_kind || "NONE";
    entry.notes_reason_code = entry.notes_reason_code || "NO_WIKI_SECTION";
    updated += 1;
  }
}

if (updated > 0) {
  writeAtomic(MAP_PATH, { ...payload, items });
}

console.log(`NOTES_SECTIONS_BACKFILL updated=${updated} total=${total}`);
console.log("NOTES_SECTIONS_BACKFILL_OK=1");

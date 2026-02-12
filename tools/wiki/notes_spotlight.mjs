#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  extractNotesFromWikitextSectionsDetailed,
  extractMainArticles,
  stripWikiMarkup
} from "./legality_wikitext_parser.mjs";
import { fetchPageInfo, fetchPageWikitextCached } from "./mediawiki_api.mjs";

const ROOT = process.cwd();
const MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const OUTPUT_PATH = path.join(ROOT, "Reports", "notes-spotlight.json");
const COVERAGE_PATH = path.join(ROOT, "Reports", "notes-coverage.txt");
const CACHE_DIR = path.join(ROOT, "data", "wiki", "cache");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function buildWikiUrl(title) {
  if (!title) return "";
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function loadCachedWikitextByTitle(title) {
  if (!title || !fs.existsSync(CACHE_DIR)) return null;
  const direct = `'''${title}'''`;
  const category = `[[Category:${title}`;
  const candidates = fs
    .readdirSync(CACHE_DIR)
    .filter((name) => name.endsWith(".json") && !name.startsWith("legality_") && name !== "notes_lead.json");
  for (const name of candidates) {
    const filePath = path.join(CACHE_DIR, name);
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const wikitext = String(payload?.wikitext || "");
      if (!wikitext) continue;
      if (wikitext.includes(direct) || wikitext.includes(category)) {
        return {
          ok: true,
          wikitext,
          revision_id: String(payload?.revision_id || ""),
          title
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function resolveTitle(entry) {
  if (!entry || typeof entry !== "object") return "";
  const notesArticles = Array.isArray(entry.notes_main_articles) ? entry.notes_main_articles : [];
  const mainArticles = Array.isArray(entry.main_articles) ? entry.main_articles : [];
  const first = [...notesArticles, ...mainArticles].find((item) => item && item.title);
  if (first?.title) return String(first.title);
  const wikiRow = String(entry.wiki_row_url || "");
  if (wikiRow.includes("/wiki/")) {
    try {
      const url = new URL(wikiRow);
      return decodeURIComponent(url.pathname.split("/wiki/")[1] || "").replace(/_/g, " ");
    } catch {
      return "";
    }
  }
  const name = String(entry.name_in_wiki || entry.name || "");
  return name;
}

function extractMainArticleFromNotes(raw) {
  const articles = extractMainArticles(raw);
  if (!articles.length) return "";
  return String(articles[0]?.title || "");
}

async function processGeo(geo, entry) {
  const title = resolveTitle(entry);
  if (!title) {
    return {
      geo,
      notes_len: 0,
      notes_sections_used: [],
      notes_preview_240: "",
      notes_main_article: extractMainArticleFromNotes(entry?.notes_raw || ""),
      source_rev: "",
      source_title: "",
      ok: 0
    };
  }
  const info = await fetchPageInfo(title);
  if (!info.ok || !info.pageid) {
    const cached = loadCachedWikitextByTitle(title);
    if (cached?.ok) {
      const detailed = extractNotesFromWikitextSectionsDetailed(cached.wikitext || "");
      const notesText = String(detailed?.text || "").trim();
      const preview = notesText ? notesText.slice(0, 240) : "";
      const mainArticle = detailed?.mainArticle || extractMainArticleFromNotes(entry?.notes_raw || "");
      return {
        geo,
        notes_len: notesText.length,
        notes_sections_used: Array.isArray(detailed?.sectionsUsed) ? detailed.sectionsUsed : [],
        notes_preview_240: preview,
        notes_main_article: mainArticle,
        source_rev: String(cached.revision_id || ""),
        source_title: String(cached.title || title),
        ok: notesText.length > 0 ? 1 : 0
      };
    }
    const fallbackRaw = String(entry?.notes_raw || "").trim();
    const fallbackText = fallbackRaw ? stripWikiMarkup(fallbackRaw) : "";
    return {
      geo,
      notes_len: fallbackText.length,
      notes_sections_used: fallbackText ? ["notes_raw"] : [],
      notes_preview_240: fallbackText ? fallbackText.slice(0, 240) : "",
      notes_main_article: extractMainArticleFromNotes(entry?.notes_raw || ""),
      source_rev: "",
      source_title: title,
      ok: fallbackText.length > 0 ? 1 : 0
    };
  }
  const wikiResult = await fetchPageWikitextCached(info.pageid, info.revision_id);
  if (!wikiResult.ok) {
    const cached = loadCachedWikitextByTitle(title);
    if (cached?.ok) {
      const detailed = extractNotesFromWikitextSectionsDetailed(cached.wikitext || "");
      const notesText = String(detailed?.text || "").trim();
      const preview = notesText ? notesText.slice(0, 240) : "";
      const mainArticle = detailed?.mainArticle || extractMainArticleFromNotes(entry?.notes_raw || "");
      return {
        geo,
        notes_len: notesText.length,
        notes_sections_used: Array.isArray(detailed?.sectionsUsed) ? detailed.sectionsUsed : [],
        notes_preview_240: preview,
        notes_main_article: mainArticle,
        source_rev: String(cached.revision_id || ""),
        source_title: String(cached.title || title),
        ok: notesText.length > 0 ? 1 : 0
      };
    }
    const fallbackRaw = String(entry?.notes_raw || "").trim();
    const fallbackText = fallbackRaw ? stripWikiMarkup(fallbackRaw) : "";
    return {
      geo,
      notes_len: fallbackText.length,
      notes_sections_used: fallbackText ? ["notes_raw"] : [],
      notes_preview_240: fallbackText ? fallbackText.slice(0, 240) : "",
      notes_main_article: extractMainArticleFromNotes(entry?.notes_raw || ""),
      source_rev: String(info.revision_id || ""),
      source_title: title,
      ok: fallbackText.length > 0 ? 1 : 0
    };
  }
  const detailed = extractNotesFromWikitextSectionsDetailed(wikiResult.wikitext || "");
  const notesText = String(detailed?.text || "").trim();
  const preview = notesText ? notesText.slice(0, 240) : "";
  const mainArticle = detailed?.mainArticle || extractMainArticleFromNotes(entry?.notes_raw || "");
  return {
    geo,
    notes_len: notesText.length,
    notes_sections_used: Array.isArray(detailed?.sectionsUsed) ? detailed.sectionsUsed : [],
    notes_preview_240: preview,
    notes_main_article: mainArticle,
    source_rev: String(wikiResult.revision_id || info.revision_id || ""),
    source_title: String(info.title || title),
    ok: notesText.length > 0 ? 1 : 0
  };
}

async function main() {
  const args = process.argv.slice(2);
  const geos = args.length ? args : ["RO", "RU", "AU"];
  const payload = readJson(MAP_PATH, { items: {} });
  const items = payload?.items && typeof payload.items === "object" ? payload.items : {};
  const results = [];
  for (const geo of geos) {
    const entry = items[String(geo || "").toUpperCase()];
    const row = await processGeo(String(geo || "").toUpperCase(), entry);
    results.push(row);
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ items: results }, null, 2) + "\n");

  let coverageLines = [];
  if (fs.existsSync(COVERAGE_PATH)) {
    const raw = fs.readFileSync(COVERAGE_PATH, "utf8");
    coverageLines = raw
      .split(/\r?\n/)
      .filter((line) => line && !/^NOTES_COVERAGE geo=/.test(line));
  }
  for (const row of results) {
    coverageLines.push(`NOTES_COVERAGE geo=${row.geo} ok=${row.ok} len=${row.notes_len}`);
  }
  fs.writeFileSync(COVERAGE_PATH, coverageLines.join("\n") + "\n");

  for (const row of results) {
    console.log(`NOTES_FOUND geo=${row.geo} value=${row.ok}`);
    console.log(`NOTES_LEN geo=${row.geo} value=${row.notes_len}`);
    console.log(`NOTES_SECTIONS geo=${row.geo} value=${row.notes_sections_used.length}`);
  }
}

main().catch((error) => {
  console.error("NOTES_SPOTLIGHT_FAIL", error?.message || String(error));
  process.exit(1);
});

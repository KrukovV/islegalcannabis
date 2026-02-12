#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  fetchPageHtmlCached,
  fetchPageInfo
} from "./mediawiki_api.mjs";
import {
  loadDefaultAliases,
  loadIsoLookupMap,
  normalizeName
} from "./wiki_geo_resolver.mjs";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
const CACHE_HTML_DIR = path.join(ROOT, "data", "wiki", "cache", "html");
const SSOT_WRITE = process.env.SSOT_WRITE === "1";
const SOURCE_URL = "https://en.wikipedia.org/wiki/Legality_of_cannabis";
const PAGE_TITLE = "Legality of cannabis";

if (!SSOT_WRITE) {
  console.log("SSOT_READONLY=1");
  process.exit(0);
}

function stripHtml(value) {
  let text = String(value || "");
  text = text.replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, " ");
  text = text.replace(/<br\s*\/?>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeHtml(text);
  return text.replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  let text = String(value || "");
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, "\"");
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  return text;
}

function parseTable(html) {
  const tableMatches = html.match(/<table[^>]*class=\"[^\"]*wikitable[^\"]*\"[^>]*>[\s\S]*?<\/table>/gi) || [];
  for (const tableHtml of tableMatches) {
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const rows = rowMatches.map((row) => {
      const cells = [];
      const cellMatches = row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || [];
      for (const cell of cellMatches) {
        cells.push(cell);
      }
      return cells;
    }).filter((cells) => cells.length > 0);
    if (rows.length === 0) continue;
    const headerCells = rows[0];
    const idx = parseHeaders(headerCells);
    if (idx.country >= 0 && idx.rec >= 0 && idx.med >= 0) {
      return rows;
    }
  }
  return null;
}

function parseHeaders(cells) {
  const labels = cells.map((cell) => stripHtml(cell).toLowerCase());
  const idx = {
    country: labels.findIndex((label) => label.includes("country") || label.includes("territory")),
    rec: labels.findIndex((label) => label.includes("recreational")),
    med: labels.findIndex((label) => label.includes("medical")),
    notes: labels.findIndex((label) => label.includes("notes"))
  };
  return idx;
}

function parseRecStatus(value) {
  const text = stripHtml(value).toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("unenforced") || text.includes("non-enforced")) return "Unenforced";
  if (text.includes("decriminal")) return "Decrim";
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  if (text.includes("legal")) return "Legal";
  return "Unknown";
}

function parseMedStatus(value) {
  const text = stripHtml(value).toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("limited") || text.includes("restricted") || text.includes("low thc")) {
    return "Limited";
  }
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  if (text.includes("legal") || text.includes("medical")) return "Legal";
  return "Unknown";
}

function resolveIso2(countryName, lookup, aliases) {
  const normalized = normalizeName(countryName);
  if (!normalized) return "";
  if (aliases[normalized]) return aliases[normalized];
  if (normalized === "united states of america") return "US";
  if (normalized === "united states") return "US";
  return lookup.get(normalized) || "";
}

function loadLatestCachedHtml() {
  if (!fs.existsSync(CACHE_HTML_DIR)) return "";
  const entries = fs.readdirSync(CACHE_HTML_DIR)
    .map((name) => {
      const full = path.join(CACHE_HTML_DIR, name);
      const stat = fs.statSync(full);
      return { full, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (!entries.length) return "";
  try {
    const payload = JSON.parse(fs.readFileSync(entries[0].full, "utf8"));
    return String(payload?.html || "");
  } catch {
    return "";
  }
}

async function main() {
  const info = await fetchPageInfo(PAGE_TITLE);
  let html = "";
  let revisionId = "";
  let source = "online";
  if (info.ok) {
    revisionId = info.revision_id || "";
    const htmlResult = await fetchPageHtmlCached(info.pageid, revisionId);
    if (htmlResult.ok) {
      html = htmlResult.html || "";
    }
  }
  if (!html) {
    const cached = loadLatestCachedHtml();
    if (cached) {
      html = cached;
      source = "offline-cache";
    }
  }
  if (!html) {
    console.log("LEGALITY_TABLE_ERROR=missing_html");
    process.exit(1);
  }

  const rows = parseTable(html);
  if (!rows || rows.length === 0) {
    console.log("LEGALITY_TABLE_ERROR=missing_table");
    process.exit(1);
  }

  const headerIdx = parseHeaders(rows[0]);
  const lookup = loadIsoLookupMap();
  const aliases = loadDefaultAliases();
  const seen = new Set();
  const outputRows = [];

  for (const cells of rows.slice(1)) {
    const countryCell = cells[headerIdx.country >= 0 ? headerIdx.country : 0] || "";
    const countryName = stripHtml(countryCell);
    if (!countryName) continue;
    const iso2 = resolveIso2(countryName, lookup, aliases);
    const recCell = cells[headerIdx.rec >= 0 ? headerIdx.rec : 1] || "";
    const medCell = cells[headerIdx.med >= 0 ? headerIdx.med : 2] || "";
    const notesCell = headerIdx.notes >= 0 ? (cells[headerIdx.notes] || "") : "";
    const key = `${iso2 || normalizeName(countryName)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    outputRows.push({
      country: countryName,
      iso2: iso2 || undefined,
      rec_status: parseRecStatus(recCell),
      med_status: parseMedStatus(medCell),
      wiki_notes_hint: notesCell ? stripHtml(notesCell) : ""
    });
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source_url: SOURCE_URL,
    source: source,
    revision_id: revisionId || undefined,
    row_count: outputRows.length,
    rows: outputRows
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n");

  console.log(`LEGALITY_TABLE_ROWS=${outputRows.length}`);
  console.log(`LEGALITY_TABLE_SOURCE=${source}`);
  if (revisionId) {
    console.log(`LEGALITY_TABLE_REVISION=${revisionId}`);
  }
}

main().catch((err) => {
  console.log(`LEGALITY_TABLE_ERROR=${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

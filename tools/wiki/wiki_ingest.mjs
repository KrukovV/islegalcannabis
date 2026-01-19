import fs from "node:fs";
import path from "node:path";
import {
  loadDefaultAliases,
  loadIsoNameMap,
  normalizeName
} from "./wiki_geo_resolver.mjs";

const ROOT = process.cwd();
const API_BASE = "https://en.wikipedia.org/w/api.php";
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.json");
const META_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.meta.json");
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const US_STATES_PATH = path.join(ROOT, "data", "geo", "us_state_centroids.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeAtomic(file, payload) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${path.basename(file)}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + "\n");
  fs.renameSync(tmpPath, file);
}

function buildWikiUrl(title) {
  if (!title) return "";
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function stripWikiMarkup(value) {
  let text = String(value || "");
  text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<ref[^>]*\/?>/gi, " ");
  text = text.replace(/\{\{[^}]+\}\}/g, " ");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function extractWikiLinks(value) {
  const links = [];
  const text = String(value || "");
  const matches = text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g);
  for (const match of matches) {
    const title = String(match[1] || "").trim();
    if (!title) continue;
    links.push(title);
  }
  return links;
}

function extractMainArticles(value) {
  const text = String(value || "");
  const results = [];
  const mainTemplate = text.matchAll(/\{\{\s*main\s*\|([^}]+)\}\}/gi);
  for (const match of mainTemplate) {
    const chunk = match[1] || "";
    const parts = chunk.split("|").map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const cleaned = part.replace(/\[\[|\]\]/g, "");
      if (cleaned) results.push(cleaned);
    }
  }
  if (/Main article/i.test(text) || /Main articles/i.test(text)) {
    const links = extractWikiLinks(text);
    for (const link of links) results.push(link);
  }
  const unique = Array.from(new Set(results));
  return unique.map((title) => ({ title, url: buildWikiUrl(title) }));
}

function extractUrls(text) {
  const urls = [];
  const matches = String(text || "").match(/https?:\/\/[^\s\]|}<>"]+/g) || [];
  for (const match of matches) {
    const cleaned = match.replace(/[),.;]+$/, "");
    if (cleaned) urls.push(cleaned);
  }
  return urls;
}

function parseCiteTemplate(template) {
  const cleaned = template.replace(/^\{\{|\}\}$/g, "");
  const parts = cleaned.split("|").slice(1);
  const entry = { url: "", title: "" };
  for (const part of parts) {
    const [rawKey, ...rest] = part.split("=");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join("=").trim();
    if (key === "url") entry.url = value;
    if (key === "title") entry.title = stripWikiMarkup(value);
  }
  return entry;
}

function extractNotesRefs(notesRaw, mainArticles) {
  const refs = [];
  const refMatches = String(notesRaw || "").match(/<ref[\s\S]*?<\/ref>/gi) || [];
  for (const ref of refMatches) {
    const citeMatches = ref.match(/\{\{cite[^}]+\}\}/gi) || [];
    for (const cite of citeMatches) {
      const parsed = parseCiteTemplate(cite);
      if (parsed.url) {
        refs.push({ url: parsed.url, title: parsed.title || "", source: "refs" });
      }
    }
    for (const url of extractUrls(ref)) {
      refs.push({ url, title: "", source: "refs" });
    }
  }
  const strippedNotes = String(notesRaw || "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^>]*\/?>/gi, " ");
  for (const url of extractUrls(strippedNotes)) {
    refs.push({ url, title: "", source: "notes" });
  }
  for (const article of mainArticles) {
    if (!article?.url) continue;
    refs.push({
      url: article.url,
      title: article.title || "",
      source: "main_article"
    });
  }
  const seen = new Set();
  const unique = [];
  for (const ref of refs) {
    const key = String(ref.url || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(ref);
  }
  return unique;
}

function parseRecreationalStatus(value) {
  const text = stripWikiMarkup(value).toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("unenforced") || text.includes("non-enforced")) return "Unenforced";
  if (text.includes("decriminal")) return "Decrim";
  if (text.includes("legal")) return "Legal";
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  return "Unknown";
}

function parseMedicalStatus(value) {
  const text = stripWikiMarkup(value).toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("legal") || text.includes("medical")) return "Legal";
  if (text.includes("limited") || text.includes("restricted") || text.includes("low thc")) {
    return "Limited";
  }
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  return "Unknown";
}

function splitRowCells(rowText) {
  const cells = [];
  let current = "";
  let depthSquare = 0;
  let depthCurly = 0;
  const flush = () => {
    const trimmed = current.replace(/^\s*[!|]/, "").trim();
    if (trimmed) cells.push(trimmed);
    current = "";
  };
  for (let i = 0; i < rowText.length; i += 1) {
    const chunk = rowText.slice(i, i + 2);
    if (chunk === "[[") {
      depthSquare += 1;
      current += chunk;
      i += 1;
      continue;
    }
    if (chunk === "]]" && depthSquare > 0) {
      depthSquare -= 1;
      current += chunk;
      i += 1;
      continue;
    }
    if (chunk === "{{") {
      depthCurly += 1;
      current += chunk;
      i += 1;
      continue;
    }
    if (chunk === "}}" && depthCurly > 0) {
      depthCurly -= 1;
      current += chunk;
      i += 1;
      continue;
    }
    if (depthSquare === 0 && depthCurly === 0) {
      if (chunk === "||" || chunk === "!!") {
        flush();
        i += 1;
        continue;
      }
      if (rowText[i] === "\n" && (rowText[i + 1] === "|" || rowText[i + 1] === "!")) {
        flush();
        current += rowText[i + 1];
        i += 1;
        continue;
      }
    }
    current += rowText[i];
  }
  flush();
  return cells;
}

function extractTableFromWikitext(wikitext) {
  const tables = [];
  const parts = String(wikitext || "").split("{|");
  for (let i = 1; i < parts.length; i += 1) {
    const chunk = parts[i];
    const end = chunk.indexOf("|}");
    if (end === -1) continue;
    const table = "{|" + chunk.slice(0, end + 2);
    tables.push(table);
  }
  return (
    tables.find((table) => /Country\/Territory|Country or territory/i.test(table)) ||
    tables.find((table) => /State|Province|Territory/i.test(table)) ||
    ""
  );
}

function parseWikiTable(tableText) {
  if (!tableText) return [];
  const rows = tableText.split(/\n\|-+/g).slice(1);
  const parsed = [];
  for (const row of rows) {
    if (!row.trim()) continue;
    const cells = splitRowCells(row);
    if (cells.length < 3) continue;
    const countryCell = cells[0] || "";
    const recCell = cells[1] || "";
    const medCell = cells[2] || "";
    const notesCell = cells[3] || "";
    const link = extractWikiLinks(countryCell)[0] || "";
    const name = stripWikiMarkup(countryCell);
    parsed.push({
      name,
      link,
      recreational: recCell,
      medical: medCell,
      notes: notesCell
    });
  }
  return parsed;
}

async function fetchWikiWikitext(pageTitle) {
  const params = new URLSearchParams({
    action: "parse",
    page: pageTitle,
    prop: "wikitext|revid",
    format: "json",
    formatversion: "2"
  });
  const url = `${API_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    return { ok: false, wikitext: "", revisionId: "" };
  }
  const payload = await res.json();
  return {
    ok: Boolean(payload?.parse?.wikitext),
    wikitext: payload?.parse?.wikitext || "",
    revisionId: String(payload?.parse?.revid || "")
  };
}

function loadStateNameMap() {
  const data = readJson(US_STATES_PATH, null);
  const items = data?.items || {};
  const map = new Map();
  for (const [key, entry] of Object.entries(items)) {
    if (!key || typeof entry !== "object") continue;
    const name = String(entry?.name || "").trim();
    if (!name) continue;
    map.set(normalizeName(name), key.toUpperCase());
  }
  return map;
}

function resolveCountryIso(name, aliases, isoMap) {
  const normalized = normalizeName(name);
  return aliases?.[normalized] || isoMap.get(normalized) || "";
}

async function parsePageClaims(pageTitle) {
  const response = await fetchWikiWikitext(pageTitle);
  if (!response.ok || !response.wikitext) {
    return { ok: false, revisionId: "", rows: [] };
  }
  const table = extractTableFromWikitext(response.wikitext);
  const rows = parseWikiTable(table);
  return { ok: true, revisionId: response.revisionId, rows };
}

async function main() {
  if (!fs.existsSync(ISO_PATH)) {
    console.error(`ERROR: missing ${ISO_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(US_STATES_PATH)) {
    console.error(`ERROR: missing ${US_STATES_PATH}`);
    process.exit(1);
  }
  const runAt = new Date().toISOString();
  const aliases = loadDefaultAliases();
  const isoMap = loadIsoNameMap();
  const stateMap = loadStateNameMap();

  const countryPage = "Legality of cannabis";
  const statePage = "Legality of cannabis by U.S. state";

  const countryResult = await parsePageClaims(countryPage);
  if (!countryResult.ok) {
    console.error("ERROR: failed to fetch country wiki table");
    process.exit(2);
  }
  const stateResult = await parsePageClaims(statePage);
  if (!stateResult.ok) {
    console.error("ERROR: failed to fetch state wiki table");
    process.exit(2);
  }

  const entries = new Map();
  let dupes = 0;
  let errors = 0;

  for (const row of countryResult.rows) {
    const iso2 = resolveCountryIso(row.name, aliases, isoMap);
    if (!iso2) {
      errors += 1;
      continue;
    }
    const geoKey = iso2.toUpperCase();
    if (entries.has(geoKey)) dupes += 1;
    const wikiRec = parseRecreationalStatus(row.recreational);
    const wikiMed = parseMedicalStatus(row.medical);
    const mainArticles = extractMainArticles(row.notes);
    const notesRaw = String(row.notes || "");
    const wikiRefs = extractNotesRefs(notesRaw, mainArticles);
    entries.set(geoKey, {
      geo_key: geoKey,
      wiki_row_url: buildWikiUrl(row.link || row.name),
      wiki_revision_id: countryResult.revisionId,
      fetched_at: runAt,
      wiki_rec: wikiRec,
      wiki_med: wikiMed,
      notes_raw: notesRaw,
      main_articles: mainArticles,
      wiki_refs: wikiRefs
    });
  }

  for (const row of stateResult.rows) {
    const normalized = normalizeName(row.name);
    const geoKey = stateMap.get(normalized);
    if (!geoKey) {
      errors += 1;
      continue;
    }
    if (entries.has(geoKey)) dupes += 1;
    const wikiRec = parseRecreationalStatus(row.recreational);
    const wikiMed = parseMedicalStatus(row.medical);
    const mainArticles = extractMainArticles(row.notes);
    const notesRaw = String(row.notes || "");
    const wikiRefs = extractNotesRefs(notesRaw, mainArticles);
    entries.set(geoKey, {
      geo_key: geoKey,
      wiki_row_url: buildWikiUrl(row.link || row.name),
      wiki_revision_id: stateResult.revisionId,
      fetched_at: runAt,
      wiki_rec: wikiRec,
      wiki_med: wikiMed,
      notes_raw: notesRaw,
      main_articles: mainArticles,
      wiki_refs: wikiRefs
    });
  }

  const items = Array.from(entries.values()).sort((a, b) =>
    String(a.geo_key || "").localeCompare(String(b.geo_key || ""))
  );

  writeAtomic(OUTPUT_PATH, { items });
  writeAtomic(META_PATH, {
    revision_id: countryResult.revisionId,
    states_revision_id: stateResult.revisionId,
    fetched_at: runAt,
    stats: {
      countries: countryResult.rows.length,
      states: stateResult.rows.length,
      wrote: items.length,
      dupes,
      errors
    }
  });

  console.log(
    `WIKI_INGEST: countries=${countryResult.rows.length} states=${stateResult.rows.length} rev=${countryResult.revisionId} wrote=${items.length} dupes=${dupes} errors=${errors}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

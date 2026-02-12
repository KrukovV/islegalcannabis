import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
import {
  loadDefaultAliases,
  loadIsoLookupMap,
  normalizeName
} from "./wiki_geo_resolver.mjs";
import { fetchPageInfo, fetchPageHtmlCached, fetchPageWikitextCached } from "./mediawiki_api.mjs";
import {
  parseLegalityTable,
  normalizeRowStatuses,
  extractNotesFromWikitextTable,
  extractNotesFromWikitextSections,
  extractNotesFromWikitextSectionsDetailed,
  parseRecreationalStatus,
  parseMedicalStatus,
  stripWikiMarkup
} from "./legality_wikitext_parser.mjs";
import { cacheAgeHours, loadCache, saveCache, shouldRefresh } from "./wiki_cache.mjs";

const BASE_DIR =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(new URL(import.meta.url).pathname);
let ROOT = process.env.PROJECT_ROOT ?? path.resolve(BASE_DIR, "../../..");
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  ROOT = path.resolve(BASE_DIR, "../..");
}
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  console.error("FATAL: PROJECT_ROOT not resolved:", ROOT);
  process.exit(2);
}
if (process.cwd() !== ROOT) {
  console.warn(`WARN: cwd=${process.cwd()} root=${ROOT} (auto-chdir)`);
  process.chdir(ROOT);
}
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.json");
const MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const META_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.meta.json");
const REFS_PATH = path.join(ROOT, "data", "wiki", "wiki_refs.json");
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const US_STATES_PATH = path.join(ROOT, "data", "geo", "us_state_centroids.json");
const ALL_GEO_PATH = path.join(ROOT, "apps", "web", "src", "lib", "geo", "allGeo.ts");

const COUNTRY_PAGE = "Legality of cannabis";
const STATE_PAGE = "Legality of cannabis by U.S. jurisdiction";
const CLEAR_NOTES = process.env.CLEAR_NOTES === "1";
const CLEAR_NOTES_REASON = String(process.env.CLEAR_NOTES_REASON || "");

function appendCiFinal(line) {
  const file = path.join(ROOT, "Reports", "ci-final.txt");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${line}\n`);
  } catch {
    // ignore
  }
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

const SSOT_WRITE = process.env.SSOT_WRITE === "1";
let ssotReadonlyLogged = false;
const dnsServers = String(process.env.WIKI_DNS_SERVERS || process.env.DNS_SERVERS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (dnsServers.length > 0) {
  dns.setServers(dnsServers);
  console.log(`DNS_OVERRIDE servers=${dnsServers.join(",")}`);
}

function writeAtomic(file, payload) {
  if (!SSOT_WRITE) {
    if (!ssotReadonlyLogged) {
      console.log("SSOT_READONLY=1");
      ssotReadonlyLogged = true;
    }
    return;
  }
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${path.basename(file)}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + "\n");
  fs.renameSync(tmpPath, file);
}

function loadAllGeo() {
  if (!fs.existsSync(ALL_GEO_PATH)) return [];
  const raw = fs.readFileSync(ALL_GEO_PATH, "utf8");
  const match = raw.match(/ALL_GEO\\s*:\\s*string\\[]\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;/);
  if (!match) return [];
  const body = match[1];
  return body
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function buildWikiUrl(title) {
  if (!title) return "";
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function inferNotesKind(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "NONE";
  if (/^Main article:/i.test(normalized)) return "MIN_ONLY";
  return "RICH";
}

function ensureNotesKind(entry, fallbackReason = "PARSED_SECTIONS") {
  if (!entry || typeof entry !== "object") return;
  const kind = String(entry.notes_kind || "");
  if (!kind) {
    entry.notes_kind = inferNotesKind(entry.notes_text || "");
  }
  if (!entry.notes_reason_code) {
    entry.notes_reason_code = entry.notes_kind === "MIN_ONLY" ? "NO_EXTRA_TEXT" : fallbackReason;
  }
}

function buildRefNotesMap(payload) {
  const items = payload?.items && typeof payload.items === "object" ? payload.items : payload;
  const map = new Map();
  if (!items || typeof items !== "object") return map;
  for (const [geo, refs] of Object.entries(items)) {
    if (!Array.isArray(refs) || !geo) continue;
    const titles = refs
      .map((ref) => String(ref?.title_hint || ref?.title || "").trim())
      .filter(Boolean);
    if (titles.length) map.set(String(geo).toUpperCase(), titles);
  }
  return map;
}

function resolveCountryIso(name, aliases, isoMap) {
  const normalized = normalizeName(name);
  return aliases?.[normalized] || isoMap.get(normalized) || "";
}

function loadStateNameMap() {
  const data = readJson(US_STATES_PATH, null);
  const items = data?.items || {};
  const map = new Map();
  for (const [key, entry] of Object.entries(items)) {
    if (!key || typeof entry !== "object") continue;
    const name = String(entry?.name || "").trim();
    if (!name) continue;
    const normalized = normalizeName(name);
    if (!normalized) continue;
    const geoKey = key.toUpperCase();
    map.set(normalized, geoKey);
    map.set(`${normalized} state`, geoKey);
    map.set(`${normalized} u s state`, geoKey);
  }
  return map;
}

function loadFallbackStateMap() {
  const states = {
    alabama: "US-AL",
    alaska: "US-AK",
    arizona: "US-AZ",
    arkansas: "US-AR",
    california: "US-CA",
    colorado: "US-CO",
    connecticut: "US-CT",
    delaware: "US-DE",
    florida: "US-FL",
    georgia: "US-GA",
    hawaii: "US-HI",
    idaho: "US-ID",
    illinois: "US-IL",
    indiana: "US-IN",
    iowa: "US-IA",
    kansas: "US-KS",
    kentucky: "US-KY",
    louisiana: "US-LA",
    maine: "US-ME",
    maryland: "US-MD",
    massachusetts: "US-MA",
    michigan: "US-MI",
    minnesota: "US-MN",
    mississippi: "US-MS",
    missouri: "US-MO",
    montana: "US-MT",
    nebraska: "US-NE",
    nevada: "US-NV",
    "new hampshire": "US-NH",
    "new jersey": "US-NJ",
    "new mexico": "US-NM",
    "new york": "US-NY",
    "north carolina": "US-NC",
    "north dakota": "US-ND",
    ohio: "US-OH",
    oklahoma: "US-OK",
    oregon: "US-OR",
    pennsylvania: "US-PA",
    "rhode island": "US-RI",
    "south carolina": "US-SC",
    "south dakota": "US-SD",
    tennessee: "US-TN",
    texas: "US-TX",
    utah: "US-UT",
    vermont: "US-VT",
    virginia: "US-VA",
    washington: "US-WA",
    "west virginia": "US-WV",
    wisconsin: "US-WI",
    wyoming: "US-WY",
    "district of columbia": "US-DC"
  };
  const map = new Map();
  for (const [name, code] of Object.entries(states)) {
    const normalized = normalizeName(name);
    if (!normalized) continue;
    map.set(normalized, code);
    map.set(`${normalized} state`, code);
    map.set(`${normalized} u s state`, code);
  }
  return map;
}

const FORCE_REFRESH = process.argv.includes("--refresh") || process.env.WIKI_FORCE_REFRESH === "1";
const MODE =
  process.argv.includes("--all") ||
  process.argv.includes("--all-countries") ||
  process.env.WIKI_SYNC_MODE === "all"
    ? "all"
    : "smoke";
const SMOKE_GEOS = new Set(["RU", "RO", "AU", "TH", "XK", "US-CA", "CA"]);
const DIAG = process.argv.includes("--diag");
const DUMP_ROW = process.argv.includes("--dump-row")
  ? process.argv[process.argv.indexOf("--dump-row") + 1]
  : "";
const DUMP_GEO = process.argv.includes("--dump-geo")
  ? process.argv[process.argv.indexOf("--dump-geo") + 1]
  : "";
const HTML_LEGALITY_PATH = path.join(ROOT, "data", "legal_raw", "wiki_legality.html");
const LEAD_CACHE_PATH = path.join(ROOT, "data", "wiki", "cache", "notes_lead.json");

function isPlaceholderNote(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (/^Cannabis in\s+/i.test(normalized)) return true;
  if (/^Main articles?:/i.test(normalized)) return true;
  if (/^Main article:/i.test(normalized)) return true;
  if (/^See also:/i.test(normalized)) return true;
  if (/^Further information:/i.test(normalized)) return true;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= 2 && normalized.length <= 20) return true;
  return false;
}

function stripHtmlNotes(value) {
  let text = String(value || "");
  text = text.replace(/<sup[\s\S]*?<\/sup>/gi, " ");
  text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;|&#160;/gi, " ");
  text = text.replace(/&#91;|\[|\]/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function normalizeLeadNotes(value) {
  let text = String(value || "");
  text = text.replace(/\[\d+\]/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function normalizeExtractedNotes(value) {
  let text = String(value || "");
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/^(Main articles?:|Main article:|See also:|Further information:)\s*/i, "");
  return text.trim();
}

function truncateSentences(text, maxSentences = 3, maxChars = 320) {
  const parts = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/);
  const selected = [];
  let total = 0;
  for (const part of parts) {
    const chunk = part.trim();
    if (!chunk) continue;
    selected.push(chunk);
    total += chunk.length + 1;
    if (selected.length >= maxSentences || total >= maxChars) break;
  }
  let result = selected.join(" ").trim();
  if (result.length > maxChars) {
    result = result.slice(0, maxChars).replace(/\s+\S*$/, "");
  }
  return result.trim();
}

function extractNotesFromHtmlSections(html) {
  if (!html) return "";
  const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const markers = [];
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const title = stripHtmlNotes(match[2] || "");
    if (!title) continue;
    markers.push({ title, start: match.index, end: headingRegex.lastIndex });
  }
  if (markers.length === 0) return "";
  const sections = [];
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const body = html.slice(current.end, next ? next.start : html.length);
    sections.push({ title: current.title, body });
  }
  const priority = [
    "notes",
    "see also",
    "references",
    "further reading",
    "external links",
    "bibliography",
    "legality",
    "legal status",
    "status",
    "medical",
    "recreational"
  ];
  for (const key of priority) {
    const target = sections.find((section) =>
      normalizeLeadNotes(section.title).toLowerCase().includes(key)
    );
    if (!target) continue;
    const paragraphs = [];
    for (const entry of target.body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const cleaned = normalizeExtractedNotes(stripHtmlNotes(entry[1] || ""));
      if (cleaned) paragraphs.push(cleaned);
    }
    const listItems = [];
    for (const entry of target.body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const cleaned = normalizeExtractedNotes(stripHtmlNotes(entry[1] || ""));
      if (cleaned) listItems.push(cleaned);
    }
    const combined = [...paragraphs, ...listItems].join(" ");
    const normalized = truncateSentences(normalizeExtractedNotes(combined));
    if (normalized) return normalized;
  }
  return "";
}

async function fetchSectionNotes(title, allowNetwork, options = {}) {
  const includeDecisions = options?.includeDecisions === true;
  if (!allowNetwork || !title) {
    return { text: "", mode: "NONE", key: "", section: "", links: 0, decisions: [], sectionsUsed: [], mainArticle: "", revisionId: "" };
  }
  const info = await fetchPageInfo(title);
  if (!info.ok || !info.pageid) {
    return { text: "", mode: "NONE", key: "", section: "", links: 0, decisions: [], sectionsUsed: [], mainArticle: "", revisionId: "" };
  }
  const htmlResult = await fetchPageHtmlCached(info.pageid, info.revision_id);
  let detailed = null;
  if (htmlResult.ok) {
    const htmlNotes = extractNotesFromHtmlSections(htmlResult.html || "");
    if (includeDecisions) {
      const wikiResult = await fetchPageWikitextCached(info.pageid, info.revision_id);
      if (wikiResult.ok) {
        detailed = extractNotesFromWikitextSectionsDetailed(wikiResult.wikitext || "");
      }
    }
    if (htmlNotes) {
      return {
        text: htmlNotes,
        mode: "HTML",
        key: "html",
        section: "html",
        links: Number(detailed?.linkCount || 0),
        decisions: Array.isArray(detailed?.decisions) ? detailed.decisions : [],
        sectionsUsed: Array.isArray(detailed?.sectionsUsed) ? detailed.sectionsUsed : [],
        mainArticle: String(detailed?.mainArticle || ""),
        revisionId: String(info.revision_id || "")
      };
    }
  }
  const wikiResult = await fetchPageWikitextCached(info.pageid, info.revision_id);
  if (wikiResult.ok) {
    detailed = extractNotesFromWikitextSectionsDetailed(wikiResult.wikitext || "");
    const rawNotes = detailed.text || "";
    const wikiNotes = rawNotes ? truncateSentences(normalizeExtractedNotes(rawNotes)) : "";
    if (wikiNotes) {
      return {
        text: wikiNotes,
        mode: "WIKITEXT",
        key: detailed.key || "",
        section: detailed.title || "",
        links: Number(detailed.linkCount || 0),
        decisions: Array.isArray(detailed.decisions) ? detailed.decisions : [],
        sectionsUsed: Array.isArray(detailed.sectionsUsed) ? detailed.sectionsUsed : [],
        mainArticle: String(detailed.mainArticle || ""),
        revisionId: String(wikiResult.revision_id || info.revision_id || "")
      };
    }
  }
  return {
    text: "",
    mode: "NONE",
    key: "",
    section: "",
    links: Number(detailed?.linkCount || 0),
    decisions: Array.isArray(detailed?.decisions) ? detailed.decisions : [],
    sectionsUsed: Array.isArray(detailed?.sectionsUsed) ? detailed.sectionsUsed : [],
    mainArticle: String(detailed?.mainArticle || ""),
    revisionId: String(info.revision_id || "")
  };
}

function extractHtmlNotesMap(html) {
  const notesMap = new Map();
  if (!html) return notesMap;
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const rowHtml of rows) {
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(
      (match) => match[1]
    );
    if (cells.length < 4) continue;
    const nameCell = cells[0] || "";
    const notesCell = cells[cells.length - 1] || "";
    const titleMatch = nameCell.match(/title=\"([^\"]+)\"/i);
    const nameMatch = nameCell.match(/>([^<]+)<\/a>/i);
    const name = titleMatch
      ? String(titleMatch[1] || "").trim()
      : nameMatch
        ? String(nameMatch[1] || "").trim()
        : "";
    if (!name) continue;
    const mainArticleMatch = notesCell.match(/Main articles?:\s*<a[^>]*title=\"([^\"]+)\"[^>]*>/i);
    const mainArticleTitle = mainArticleMatch ? String(mainArticleMatch[1] || "").trim() : "";
    const notesText = stripHtmlNotes(notesCell);
    const recText = stripHtmlNotes(cells[1] || "");
    const medText = stripHtmlNotes(cells[2] || "");
    if (!notesText) continue;
    notesMap.set(normalizeName(name), {
      name,
      notesText,
      mainArticleTitle,
      recText,
      medText
    });
  }
  return notesMap;
}

function loadLeadCache() {
  const payload = readJson(LEAD_CACHE_PATH, { items: {} });
  const items = payload?.items && typeof payload.items === "object" ? payload.items : {};
  return { items, generated_at: payload?.generated_at || "" };
}

function saveLeadCache(cache) {
  writeAtomic(LEAD_CACHE_PATH, cache);
}

async function fetchLeadSummary(title, allowNetwork) {
  if (!allowNetwork || !title) return "";
  const encoded = encodeURIComponent(String(title || "").replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return "";
    const payload = await res.json();
    return normalizeLeadNotes(payload?.extract || "");
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function maybeDumpRow(rows, dumpName, isoMap) {
  if (!dumpName) return;
  const target = dumpName.toLowerCase();
  const row = rows.find((item) => {
    const name = String(item.name || "").toLowerCase();
    const link = String(item.link || "").toLowerCase();
    return name === target || link === target;
  });
  if (!row) {
    console.log(`DUMP_ROW_MISS name=${dumpName}`);
    return;
  }
  const iso = resolveCountryIso(row.name || row.link || "", loadDefaultAliases(), isoMap);
  console.log(
    `DUMP_ROW name=${row.name || "-"} link=${row.link || "-"} rec_raw="${row.recreational_raw || ""}" med_raw="${row.medical_raw || ""}" notes_raw="${String(row.notes_raw || "").replace(/\s+/g, " ").trim().slice(0, 260)}" iso=${iso || "-"}`
  );
}

async function fetchPageRows(pageTitle, cacheFile) {
  const cachePath = path.join(ROOT, "data", "wiki", "cache", cacheFile);
  const cache = loadCache(cachePath);
  const ageHours = cacheAgeHours(cache);
  if (process.env.WIKI_CACHE_ONLY === "1") {
    if (cache?.rows?.length) {
      console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id || "-"}`);
      const rows = cache.rows.map((row) => normalizeRowStatuses(row));
      return { ok: true, rows, revisionId: cache.revision_id || "", fetchedAt: cache.fetched_at || "", pageid: cache.pageid || "" };
    }
    console.log(`WIKI_CACHE_ONLY_MISS: page="${pageTitle}"`);
    return { ok: false, reason: "CACHE_ONLY_MISS", error: "NO_CACHE" };
  }
  const refresh = FORCE_REFRESH ? true : shouldRefresh(cache, 4);
  const meta = await fetchPageInfo(pageTitle);
  if (!meta.ok) {
    if (process.env.ALLOW_WIKI_OFFLINE === "1" && cache?.rows?.length) {
      const refreshed = {
        pageid: cache.pageid || "",
        revision_id: cache.revision_id || "",
        fetched_at: new Date().toISOString(),
        rows: cache.rows.map((row) => normalizeRowStatuses(row))
      };
      saveCache(refreshed, cachePath);
      console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id || "-"}`);
      return { ok: true, rows: refreshed.rows, revisionId: refreshed.revision_id, fetchedAt: refreshed.fetched_at, pageid: cache.pageid || "" };
    }
    console.log(`WIKI_CACHE_MISS: page="${pageTitle}" reason=${meta.reason || "NETWORK_FAIL"}`);
    if (process.env.ALLOW_WIKI_OFFLINE === "1") {
      return { ok: true, rows: [], revisionId: cache?.revision_id || "", fetchedAt: cache?.fetched_at || "", pageid: cache?.pageid || "" };
    }
    return { ok: false, reason: meta.reason || "NETWORK_FAIL", error: meta.error || "-" };
  }
  const revisionChanged = cache?.revision_id && meta.revision_id
    ? cache.revision_id !== meta.revision_id
    : true;
  if (!refresh && cache?.rows?.length) {
    if (!revisionChanged) {
      console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id || "-"}`);
      const rows = cache.rows.map((row) => normalizeRowStatuses(row));
      return { ok: true, rows, revisionId: cache.revision_id || "", fetchedAt: cache.fetched_at || "", pageid: cache.pageid || meta.pageid || "" };
    }
    console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id || "-"}`);
    const rows = cache.rows.map((row) => normalizeRowStatuses(row));
    return { ok: true, rows, revisionId: cache.revision_id || "", fetchedAt: cache.fetched_at || "", pageid: cache.pageid || meta.pageid || "" };
  }
  if (!FORCE_REFRESH && cache?.revision_id && meta.revision_id && cache.revision_id === meta.revision_id && Array.isArray(cache.rows)) {
    const refreshed = {
      pageid: meta.pageid,
      revision_id: cache.revision_id,
      fetched_at: new Date().toISOString(),
      rows: cache.rows.map((row) => normalizeRowStatuses(row))
    };
    saveCache(refreshed, cachePath);
    console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id}`);
    return { ok: true, rows: refreshed.rows, revisionId: cache.revision_id, fetchedAt: refreshed.fetched_at, pageid: meta.pageid };
  }
  const wikitextResult = await fetchPageWikitextCached(meta.pageid, meta.revision_id);
  if (!wikitextResult.ok) {
    if (process.env.ALLOW_WIKI_OFFLINE === "1" && cache?.rows?.length) {
      const refreshed = {
        pageid: cache.pageid || meta.pageid || "",
        revision_id: cache.revision_id || "",
        fetched_at: new Date().toISOString(),
        rows: cache.rows.map((row) => normalizeRowStatuses(row))
      };
      saveCache(refreshed, cachePath);
      console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id || "-"}`);
      return { ok: true, rows: refreshed.rows, revisionId: refreshed.revision_id, fetchedAt: refreshed.fetched_at, pageid: cache.pageid || meta.pageid || "" };
    }
    console.log(`WIKI_CACHE_MISS: page="${pageTitle}" reason=${wikitextResult.reason || "NETWORK_FAIL"}`);
    if (process.env.ALLOW_WIKI_OFFLINE === "1") {
      return { ok: true, rows: [], revisionId: cache?.revision_id || "", fetchedAt: cache?.fetched_at || "", pageid: cache?.pageid || meta.pageid || "" };
    }
    return { ok: false, reason: wikitextResult.reason || "NETWORK_FAIL", error: wikitextResult.error || "-" };
  }
  const notesMap = extractNotesFromWikitextTable(wikitextResult.wikitext || "");
  const rows = parseLegalityTable(wikitextResult.wikitext || "", notesMap);
  const refreshed = {
    pageid: meta.pageid,
    revision_id: wikitextResult.revision_id,
    fetched_at: new Date().toISOString(),
    rows
  };
  saveCache(refreshed, cachePath);
  console.log(`WIKI_CACHE: page="${pageTitle}" hit=0 age_h=0 revision=${wikitextResult.revision_id || "-"}`);
  return { ok: true, rows, revisionId: wikitextResult.revision_id || "", fetchedAt: refreshed.fetched_at, pageid: meta.pageid };
}

async function main() {
  if (process.env.UPDATE_MODE !== "1") {
    console.log("SYNC_DISABLED UPDATE_MODE=0");
    return;
  }
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
  const isoMap = loadIsoLookupMap();
  const stateMap = loadStateNameMap();
  const fallbackStateMap = loadFallbackStateMap();
  const metaPrev = readJson(META_PATH, { pages: {} });

  const countryResult = await fetchPageRows(COUNTRY_PAGE, "legality_of_cannabis.json");
  if (!countryResult.ok) {
    console.error(`ERROR: failed to fetch ${COUNTRY_PAGE} (${countryResult.reason})`);
    if (process.env.WIKI_CACHE_ONLY === "1" && countryResult.reason === "CACHE_ONLY_MISS") {
      const existingMap = readJson(MAP_PATH, null);
      const existingMeta = readJson(META_PATH, null);
      if (existingMap?.items && existingMeta?.pages) {
        const mapItems = existingMap.items;
        const perGeoDir = path.join(ROOT, "data", "wiki", "wiki_claims");
        if (SSOT_WRITE) {
          fs.mkdirSync(perGeoDir, { recursive: true });
        }
        for (const [geoKey, entry] of Object.entries(mapItems)) {
          if (!geoKey || !entry) continue;
          const filePath = path.join(perGeoDir, `${geoKey}.json`);
          writeAtomic(filePath, entry);
        }
        const metaCounts = existingMeta.counts || {};
        const totalCount = Number(metaCounts.total || Object.keys(mapItems).length);
        const countriesCount = Number(metaCounts.countries || 0);
        const statesCount = Number(metaCounts.states || 0);
        writeAtomic(META_PATH, {
          ...existingMeta,
          fetched_at: runAt,
          counts: {
            total: totalCount,
            countries: countriesCount,
            states: statesCount
          }
        });
        console.log(`WIKI_CACHE_ONLY_FALLBACK: using existing map`);
        console.log(
          `WIKI_SYNC: mode=${MODE === "all" ? "all" : "smoke"} revision_id=${existingMeta.pages[COUNTRY_PAGE]?.revision_id || "-"} countries_count=${countriesCount} states_count=${statesCount} total=${totalCount} links_count=0 revision_changed=0 updated_count=0`
        );
        console.log(`WIKI_COUNTRIES_COUNT=${countriesCount} WIKI_STATES_COUNT=${statesCount} WIKI_TOTAL=${totalCount}`);
    return;
  }
  if (DUMP_ROW) {
    maybeDumpRow(countryResult.rows || [], DUMP_ROW, isoMap);
  }
  if (DUMP_GEO) {
    const iso = String(DUMP_GEO || "").toUpperCase();
    const isoEntries = readJson(ISO_PATH, { entries: [] })?.entries || [];
    const match = isoEntries.find((entry) => String(entry?.alpha2 || "").toUpperCase() === iso);
    if (match?.name) {
      maybeDumpRow(countryResult.rows || [], match.name, isoMap);
    } else {
      console.log(`DUMP_GEO_MISS geo=${iso}`);
    }
  }
    }
    process.exit(countryResult.reason === "NETWORK_FAIL" ? 10 : 2);
  }
  const stateResult = await fetchPageRows(STATE_PAGE, "legality_us_states.json");
  if (!stateResult.ok) {
    console.error(`ERROR: failed to fetch ${STATE_PAGE} (${stateResult.reason})`);
    if (process.env.WIKI_CACHE_ONLY === "1" && stateResult.reason === "CACHE_ONLY_MISS") {
      const existingMap = readJson(MAP_PATH, null);
      const existingMeta = readJson(META_PATH, null);
      if (existingMap?.items && existingMeta?.pages) {
        const mapItems = existingMap.items;
        const perGeoDir = path.join(ROOT, "data", "wiki", "wiki_claims");
        fs.mkdirSync(perGeoDir, { recursive: true });
        for (const [geoKey, entry] of Object.entries(mapItems)) {
          if (!geoKey || !entry) continue;
          const filePath = path.join(perGeoDir, `${geoKey}.json`);
          writeAtomic(filePath, entry);
        }
        const metaCounts = existingMeta.counts || {};
        const totalCount = Number(metaCounts.total || Object.keys(mapItems).length);
        const countriesCount = Number(metaCounts.countries || 0);
        const statesCount = Number(metaCounts.states || 0);
        writeAtomic(META_PATH, {
          ...existingMeta,
          fetched_at: runAt,
          counts: {
            total: totalCount,
            countries: countriesCount,
            states: statesCount
          }
        });
        console.log(`WIKI_CACHE_ONLY_FALLBACK: using existing map`);
        console.log(
          `WIKI_SYNC: mode=${MODE === "all" ? "all" : "smoke"} revision_id=${existingMeta.pages[COUNTRY_PAGE]?.revision_id || "-"} countries_count=${countriesCount} states_count=${statesCount} total=${totalCount} links_count=0 revision_changed=0 updated_count=0`
        );
        console.log(`WIKI_COUNTRIES_COUNT=${countriesCount} WIKI_STATES_COUNT=${statesCount} WIKI_TOTAL=${totalCount}`);
        return;
      }
    }
    process.exit(stateResult.reason === "NETWORK_FAIL" ? 10 : 2);
  }

  const entries = new Map();
  let htmlNotesMap = new Map();
  if (fs.existsSync(HTML_LEGALITY_PATH)) {
    try {
      const html = fs.readFileSync(HTML_LEGALITY_PATH, "utf8");
      htmlNotesMap = extractHtmlNotesMap(html);
    } catch {
      htmlNotesMap = new Map();
    }
  }
  const missingCountries = [];
  countryResult.rows.forEach((row, index) => {
    const iso2 = resolveCountryIso(row.name || row.link || "", aliases, isoMap);
    if (!iso2) {
      missingCountries.push(row.name || row.link || "");
      return;
    }
    const geoKey = iso2.toUpperCase();
    entries.set(geoKey, {
      geo_key: geoKey,
      name_in_wiki: row.name,
      wiki_row_url: buildWikiUrl(row.link || row.name),
      row_ref: `country:${index + 1}`,
      wiki_rec: row.recreational_status,
      wiki_med: row.medical_status,
      sources: row.notes_main_articles || [],
      sources_count: row.notes_main_articles?.length || 0,
      main_articles: row.notes_main_articles || [],
      notes_main_articles: row.notes_main_articles || [],
      notes_text: row.notes_text || "",
      notes_text_len: (row.notes_text || "").length,
      notes: row.notes_text || "",
      notes_raw: row.notes_raw || "",
      notes_sections_used: Array.isArray(row.notes_sections_used) ? row.notes_sections_used : [],
      notes_main_article: String(row.notes_main_article || row.notes_main_articles?.[0]?.title || ""),
      notes_rev: String(row.notes_rev || ""),
      notes_kind: String(row.notes_kind || ""),
      notes_reason_code: String(row.notes_reason_code || ""),
      recreational_status: row.recreational_status,
      medical_status: row.medical_status,
      wiki_revision_id: countryResult.revisionId,
      fetched_at: runAt
    });
  });

  stateResult.rows.forEach((row, index) => {
    const normalized = normalizeName(row.name || row.link || "");
    const geoKey = stateMap.get(normalized) || fallbackStateMap.get(normalized);
    if (!geoKey) return;
    entries.set(geoKey, {
      geo_key: geoKey,
      name_in_wiki: row.name,
      wiki_row_url: buildWikiUrl(row.link || row.name),
      row_ref: `state:${index + 1}`,
      wiki_rec: row.recreational_status,
      wiki_med: row.medical_status,
      sources: row.notes_main_articles || [],
      sources_count: row.notes_main_articles?.length || 0,
      main_articles: row.notes_main_articles || [],
      notes_main_articles: row.notes_main_articles || [],
      notes_text: row.notes_text || "",
      notes_text_len: (row.notes_text || "").length,
      notes: row.notes_text || "",
      notes_raw: row.notes_raw || "",
      notes_sections_used: Array.isArray(row.notes_sections_used) ? row.notes_sections_used : [],
      notes_main_article: String(row.notes_main_article || row.notes_main_articles?.[0]?.title || ""),
      notes_rev: String(row.notes_rev || ""),
      notes_kind: String(row.notes_kind || ""),
      notes_reason_code: String(row.notes_reason_code || ""),
      recreational_status: row.recreational_status,
      medical_status: row.medical_status,
      wiki_revision_id: stateResult.revisionId,
      fetched_at: runAt
    });
    if (geoKey === "US-CA") {
      console.log(
        `WIKI_PICK: geo=${geoKey} picked=states row="${row.name || ""}" rec=${row.recreational_status} med=${row.medical_status} rec_raw="${row.recreational_raw || ""}" med_raw="${row.medical_raw || ""}"`
      );
    }
  });

  const isoPayload = readJson(ISO_PATH, { entries: [] });
  const isoEntries = Array.isArray(isoPayload?.entries) ? isoPayload.entries : [];
  const countriesCount = isoEntries.length;
  isoEntries.forEach((entry) => {
    const iso2 = String(entry?.alpha2 || "").toUpperCase();
    if (!iso2 || entries.has(iso2)) return;
    const countryName = String(entry?.name || "").trim();
    const fallbackNotes = "";
    entries.set(iso2, {
      geo_key: iso2,
      name_in_wiki: countryName,
      wiki_row_url: countryName ? buildWikiUrl(countryName) : "",
      row_ref: `iso_fallback:${iso2}`,
      wiki_rec: "Unknown",
      wiki_med: "Unknown",
      sources: [],
      sources_count: 0,
      main_articles: [],
      notes_main_articles: [],
      notes_text: fallbackNotes,
      notes_text_len: fallbackNotes.length,
      notes: fallbackNotes,
      notes_raw: "",
      recreational_status: "Unknown",
      medical_status: "Unknown",
      wiki_revision_id: countryResult.revisionId,
      fetched_at: runAt
    });
  });

  if (htmlNotesMap.size > 0) {
    for (const entry of entries.values()) {
      const nameKey = normalizeName(entry.name_in_wiki || entry.geo_key || "");
      if (!nameKey || !htmlNotesMap.has(nameKey)) continue;
      const htmlRow = htmlNotesMap.get(nameKey);
      const htmlNotes = String(htmlRow?.notesText || "");
      if (!htmlNotes || isPlaceholderNote(htmlNotes)) continue;
      const currentNotes = String(entry.notes_text || "");
      if (!currentNotes || isPlaceholderNote(currentNotes) || htmlNotes.length > currentNotes.length) {
        const mainTitle = htmlRow.mainArticleTitle;
        const mainArticles = mainTitle
          ? [{ title: mainTitle, url: buildWikiUrl(mainTitle) }]
          : entry.notes_main_articles || [];
        entry.notes_text = htmlNotes;
        entry.notes_text_len = htmlNotes.length;
        entry.notes = htmlNotes;
        entry.notes_raw = htmlNotes;
        entry.notes_main_articles = mainArticles;
        entry.main_articles = mainArticles;
        entry.notes_sections_used = ["html"];
        entry.notes_main_article = mainTitle || entry.notes_main_article || "";
        ensureNotesKind(entry, "PARSED_HTML");
      }
      const htmlRec = String(htmlRow?.recText || "");
      const htmlMed = String(htmlRow?.medText || "");
      if (entry.wiki_rec === "Unknown" && htmlRec) {
        const recStatus = parseRecreationalStatus(htmlRec);
        entry.wiki_rec = recStatus;
        entry.recreational_status = recStatus;
        entry.recreational_raw = htmlRec;
      }
      if (entry.wiki_med === "Unknown" && htmlMed) {
        const medStatus = parseMedicalStatus(htmlMed);
        entry.wiki_med = medStatus;
        entry.medical_status = medStatus;
        entry.medical_raw = htmlMed;
      }
    }
  }

  const allowNetwork = process.env.FETCH_NETWORK !== "0" && process.env.ALLOW_NETWORK !== "0";
  const leadCache = loadLeadCache();
  let leadCacheUpdated = false;
  for (const entry of entries.values()) {
    if (!SMOKE_GEOS.has(entry.geo_key)) continue;
    const currentNotes = String(entry.notes_text || "");
    const mainArticle = entry.notes_main_articles?.[0]?.title || "";
    const forceDiag = entry.geo_key === "RO" || entry.geo_key === "RU";
    const needsUpgrade = !currentNotes || isPlaceholderNote(currentNotes) || /^Main article:/i.test(currentNotes) || currentNotes.length < 80;
    if (mainArticle && (needsUpgrade || forceDiag)) {
      const result = await fetchSectionNotes(mainArticle, allowNetwork, { includeDecisions: forceDiag });
      const sectionNotes = normalizeExtractedNotes(result.text);
      const weak = sectionNotes.length < 80 ? 1 : 0;
      const empty = sectionNotes.length === 0 ? 1 : 0;
      if (forceDiag) {
        const sectionLabel = result.section ? result.section.replace(/\s+/g, " ").trim() : "-";
        const keyLabel = result.key || "-";
        console.log(
          `NOTES_SECTION geo=${entry.geo_key} mode=${result.mode} key=${keyLabel} section="${sectionLabel}" links=${result.links} len=${sectionNotes.length}`
        );
        if (Array.isArray(result.decisions)) {
          for (const decision of result.decisions) {
            const titleLabel = decision.title ? String(decision.title).replace(/\s+/g, " ").trim() : "-";
            const key = decision.key || "-";
            const included = decision.included ? 1 : 0;
            const reason = decision.reason || "-";
            const links = Number(decision.linkCount || 0);
            const len = Number(decision.textLen || 0);
            console.log(
              `NOTES_SECTION_PICK geo=${entry.geo_key} title="${titleLabel}" key=${key} included=${included} reason=${reason} links=${links} len=${len}`
            );
          }
        }
        console.log(`NOTES_LINKS_COUNT geo=${entry.geo_key} count=${result.links}`);
      }
      if (needsUpgrade) {
        console.log(
          `NOTES_EXTRACT geo=${entry.geo_key} mode=${result.mode} notes_len=${sectionNotes.length} weak=${weak} empty=${empty}`
        );
      }
      const shouldUpgrade =
        sectionNotes &&
        !isPlaceholderNote(sectionNotes) &&
        sectionNotes.length >= 80 &&
        (isPlaceholderNote(currentNotes) || sectionNotes.length > currentNotes.length);
      if (shouldUpgrade) {
        entry.notes_text = sectionNotes;
        entry.notes_text_len = sectionNotes.length;
        entry.notes = sectionNotes;
        entry.notes_raw = sectionNotes;
        entry.notes_sections_used = Array.isArray(result.sectionsUsed) ? result.sectionsUsed : [];
        entry.notes_main_article = String(result.mainArticle || mainArticle || "");
        entry.notes_rev = String(result.revisionId || "");
        ensureNotesKind(entry, "PARSED_SECTIONS");
        continue;
      }
      if (entry.geo_key === "RO" || entry.geo_key === "RU" || entry.geo_key === "AU") {
        let reason = "SECTION_OK_NO_CHANGE";
        if (!sectionNotes) reason = "SECTION_MISSING";
        else if (sectionNotes.length < 80) reason = "SECTION_TOO_SHORT";
        else if (shouldUpgrade) reason = "SECTION_UPGRADE";
        console.log(`NOTES_SECTION_DECISION geo=${entry.geo_key} reason=${reason} len=${sectionNotes.length}`);
      }
    } else if (!mainArticle && needsUpgrade) {
      console.log(
        `NOTES_EXTRACT geo=${entry.geo_key} mode=NONE notes_len=0 weak=1 empty=1`
      );
      if (entry.geo_key === "RO" || entry.geo_key === "RU" || entry.geo_key === "AU") {
        console.log(`NOTES_WEAK geo=${entry.geo_key} reason=NO_MAIN_ARTICLE len=${currentNotes.length}`);
      }
    }
    if (!currentNotes || !/^Main article:/i.test(currentNotes) || currentNotes.length >= 80) continue;
    if (!mainArticle) continue;
    const cached = leadCache.items?.[mainArticle]?.text || "";
    let leadText = cached;
    if (!leadText && allowNetwork) {
      leadText = await fetchLeadSummary(mainArticle, allowNetwork);
      if (leadText) {
        leadCache.items[mainArticle] = { text: leadText, fetched_at: new Date().toISOString() };
        leadCacheUpdated = true;
      }
    }
    if (leadText && leadText.length >= 80 && !isPlaceholderNote(leadText)) {
      entry.notes_text = leadText;
      entry.notes_text_len = leadText.length;
      entry.notes = leadText;
      entry.notes_raw = leadText;
      entry.notes_sections_used = ["lead"];
      entry.notes_main_article = String(mainArticle || entry.notes_main_article || "");
      ensureNotesKind(entry, "LEAD_SUMMARY");
    }
    if (entry.geo_key === "RO" || entry.geo_key === "RU" || entry.geo_key === "AU") {
      const finalNotes = String(entry.notes_text || "").trim();
      const finalLen = finalNotes.length;
      const sectionsUsed = Array.isArray(entry.notes_sections_used) ? entry.notes_sections_used : [];
      if (sectionsUsed.length === 0) {
        console.log(`NOTES_WEAK geo=${entry.geo_key} reason=NO_SECTIONS len=${finalLen}`);
      } else if (finalLen < 200) {
        console.log(`NOTES_WEAK geo=${entry.geo_key} reason=TOO_SHORT len=${finalLen}`);
      }
    }
  }
  if (leadCacheUpdated) {
    saveLeadCache({ generated_at: runAt, items: leadCache.items });
  }

  for (const entry of entries.values()) {
    if (entry.geo_key !== "RO" && entry.geo_key !== "RU") continue;
    const notesText = String(entry.notes_text || "").trim();
    if (!notesText) {
      console.log(`NOTES_EMPTY_CORE_GEOS geo=${entry.geo_key} reason=EMPTY`);
      process.exit(1);
    }
  }

  let items = Array.from(entries.values()).sort((a, b) =>
    String(a.geo_key || "").localeCompare(String(b.geo_key || ""))
  );
  const existingMapPayload = readJson(MAP_PATH, null);
  const existingItems = existingMapPayload?.items && typeof existingMapPayload.items === "object"
    ? existingMapPayload.items
    : {};
  const mergeNotes = (current) => {
    if (!current || !current.geo_key) return current;
    const previous = existingItems[current.geo_key];
    if (!previous) return current;
    const currentNotes = String(current.notes_text || "");
    const previousNotes = String(previous.notes_text || "");
    const currentRaw = String(current.notes_raw || "");
    const mainOnly = /^\{\{\s*main\s*\|[^}]+\}\}$/i.test(currentRaw.replace(/\s+/g, " ").trim());
    const oldLen = previousNotes.length;
    const newLen = currentNotes.length;
    const allowShrink = process.env.ALLOW_NOTES_SHRINK === "1";
    const shrinkReason = String(process.env.NOTES_SHRINK_REASON || "");
    if (!currentNotes && previousNotes && !mainOnly && !isPlaceholderNote(previousNotes)) {
      if (CLEAR_NOTES) {
        if (!CLEAR_NOTES_REASON) {
          console.log("NOTES_CLEAR_DENIED reason=MISSING_CLEAR_NOTES_REASON");
          appendCiFinal("NOTES_CLEAR_DENIED reason=MISSING_CLEAR_NOTES_REASON");
          console.log(`NOTES_WRITE geo=${current.geo_key} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=CLEAR_REASON_MISSING`);
          return {
            ...current,
            notes_text: previousNotes,
            notes_text_len: previousNotes.length,
            notes: previousNotes,
            notes_raw: previous.notes_raw || current.notes_raw || "",
            notes_kind: previous.notes_kind || current.notes_kind || "",
            notes_reason_code: previous.notes_reason_code || current.notes_reason_code || "",
            notes_sections_used: Array.isArray(previous.notes_sections_used) ? previous.notes_sections_used : current.notes_sections_used,
            notes_main_article: previous.notes_main_article || current.notes_main_article
          };
        }
        console.log(`NOTES_CLEARED geo=${current.geo_key} reason=${CLEAR_NOTES_REASON}`);
        appendCiFinal(`NOTES_CLEARED geo=${current.geo_key} reason=${CLEAR_NOTES_REASON}`);
        console.log(`NOTES_WRITE geo=${current.geo_key} old_len=${oldLen} new_len=${newLen} decision=ALLOW reason=CLEAR_NOTES`);
        return current;
      }
      console.log(`NOTES_WRITE geo=${current.geo_key} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=EMPTY_NEW_NOTES`);
      return {
        ...current,
        notes_text: previousNotes,
        notes_text_len: previousNotes.length,
        notes: previousNotes,
        notes_raw: previous.notes_raw || current.notes_raw || "",
        notes_kind: previous.notes_kind || current.notes_kind || "",
        notes_reason_code: previous.notes_reason_code || current.notes_reason_code || "",
        notes_sections_used: Array.isArray(previous.notes_sections_used) ? previous.notes_sections_used : current.notes_sections_used,
        notes_main_article: previous.notes_main_article || current.notes_main_article
      };
    }
    if (oldLen > 0 && newLen > 0 && newLen < Math.floor(oldLen * 0.6)) {
      if (!allowShrink || !shrinkReason) {
        console.log(`NOTES_WRITE geo=${current.geo_key} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=SHRINK`);
        return {
          ...current,
          notes_text: previousNotes,
          notes_text_len: previousNotes.length,
          notes: previousNotes,
          notes_raw: previous.notes_raw || current.notes_raw || "",
          notes_kind: previous.notes_kind || current.notes_kind || "",
          notes_reason_code: previous.notes_reason_code || current.notes_reason_code || "",
          notes_sections_used: Array.isArray(previous.notes_sections_used) ? previous.notes_sections_used : current.notes_sections_used,
          notes_main_article: previous.notes_main_article || current.notes_main_article
        };
      }
      console.log(`NOTES_WRITE geo=${current.geo_key} old_len=${oldLen} new_len=${newLen} decision=ALLOW reason=${shrinkReason}`);
    } else if (newLen > oldLen) {
      console.log(`NOTES_WRITE geo=${current.geo_key} old_len=${oldLen} new_len=${newLen} decision=ALLOW reason=INCREASE`);
    }
    ensureNotesKind(current, "PARSED_SECTIONS");
    return current;
  };
  items = items.map((item) => mergeNotes(item));
  if (MODE === "smoke") {
    const mergedItems = { ...existingItems };
    for (const item of items) {
      if (!SMOKE_GEOS.has(item.geo_key)) continue;
      mergedItems[item.geo_key] = mergeNotes(item);
    }
    items = Object.values(mergedItems).filter((entry) => entry && entry.geo_key);
  }
  for (const item of items) {
    const sectionsUsed = Array.isArray(item.notes_sections_used)
      ? item.notes_sections_used
      : [];
    if (sectionsUsed.length === 0 && item.notes_text) {
      item.notes_sections_used = ["notes_raw"];
    }
    ensureNotesKind(item, "PARSED_SECTIONS");
  }
  const mapItems = {};
  items.forEach((item) => {
    const rowRef = String(item.row_ref || "");
    let source = "unknown";
    if (rowRef.startsWith("state:")) {
      source = "states";
    } else if (rowRef.startsWith("country:")) {
      source = "countries";
    }
    const enriched = { ...item, source, revision_id: item.wiki_revision_id || item.revision_id || "" };
    mapItems[item.geo_key] = enriched;
  });
  const allGeo = loadAllGeo();
  const stubItems = [];
  for (const geo of allGeo) {
    if (mapItems[geo]) continue;
    const stub = {
      geo_key: geo,
      rec_status: "Illegal",
      med_status: "Illegal",
      recreational_status: "Illegal",
      medical_status: "Illegal",
      notes_text: "",
      notes: "",
      notes_raw: "",
      notes_kind: "NONE",
      notes_reason_code: "WIKI_STUB",
      notes_sections_used: [],
      notes_main_article: "",
      main_articles: [],
      row_ref: "stub",
      wiki_revision_id: "",
      fetched_at: runAt,
      source: "WIKI_STUB"
    };
    mapItems[geo] = stub;
    stubItems.push(stub);
  }
  if (stubItems.length) {
    items = items.concat(stubItems);
  }
  writeAtomic(OUTPUT_PATH, Object.values(mapItems));
  writeAtomic(MAP_PATH, {
    generated_at: runAt,
    items: mapItems
  });
  const revisionChanged =
    metaPrev?.pages?.[COUNTRY_PAGE]?.revision_id !== countryResult.revisionId ||
    metaPrev?.pages?.[STATE_PAGE]?.revision_id !== stateResult.revisionId;
  const totalCount = items.length;
  const updatedCount = revisionChanged ? totalCount : 0;
  writeAtomic(META_PATH, {
    fetched_at: runAt,
    pages: {
      [COUNTRY_PAGE]: { pageid: countryResult.pageid || "", revision_id: countryResult.revisionId },
      [STATE_PAGE]: { pageid: stateResult.pageid || "", revision_id: stateResult.revisionId }
    },
    counts: {
      total: totalCount,
      countries: countriesCount,
      states: stateResult.rows.length
    },
    missing_countries: missingCountries.slice(0, 10)
  });

  const perGeoDir = path.join(ROOT, "data", "wiki", "wiki_claims");
  fs.mkdirSync(perGeoDir, { recursive: true });
  for (const [geoKey, entry] of Object.entries(mapItems)) {
    if (!geoKey || !entry) continue;
    const filePath = path.join(perGeoDir, `${geoKey}.json`);
    writeAtomic(filePath, entry);
  }

  const linkCount = items.reduce((sum, item) => sum + (item.notes_main_articles?.length || 0), 0);
  const modeLabel = MODE === "all" ? "all" : "smoke";
  console.log(
    `WIKI_SYNC: mode=${modeLabel} revision_id=${countryResult.revisionId} countries_count=${countriesCount} states_count=${stateResult.rows.length} total=${totalCount} links_count=${linkCount} revision_changed=${revisionChanged ? 1 : 0} updated_count=${updatedCount}`
  );
  console.log(`WIKI_COUNTRIES_COUNT=${countriesCount} WIKI_STATES_COUNT=${stateResult.rows.length} WIKI_TOTAL=${totalCount}`);
  if (missingCountries.length) {
    console.log(`WIKI_MISSING: count=${missingCountries.length} samples=${missingCountries.slice(0, 5).join("|")}`);
  }
  if (DIAG) {
    console.log(`WIKI_SYNC_DIAG: mode=${modeLabel} missing_countries=${missingCountries.length}`);
  }

  const strict = process.argv.includes("--once") || process.env.WIKI_SYNC_STRICT === "1";
  if (strict) {
    if (!countryResult.revisionId || items.length < 200) {
      console.error("ERROR: wiki sync guard failed (revision_id missing or total < 200)");
      process.exit(2);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

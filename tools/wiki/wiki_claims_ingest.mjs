import fs from "node:fs";
import path from "node:path";
import {
  loadDefaultAliases,
  loadIsoLookupMap,
  normalizeName
} from "./wiki_geo_resolver.mjs";

const ROOT = process.cwd();
const API_BASE = "https://en.wikipedia.org/w/api.php";
const API_TIMEOUT_MS = Number(process.env.WIKI_API_TIMEOUT_MS || 10000);
const API_RETRIES = Number(process.env.WIKI_API_RETRIES || 2);
const API_BACKOFF_MS = Number(process.env.WIKI_API_BACKOFF_MS || 400);
const API_RATE_LIMIT_MS = Number(process.env.WIKI_API_RATE_LIMIT_MS || 1000);
let lastRequestAt = 0;
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.json");
const META_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.meta.json");
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const US_STATES_PATH = path.join(ROOT, "data", "geo", "us_state_centroids.json");
const FETCH_UA = "islegalcannabis/wiki_claims";

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

function sleepMs(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < API_RATE_LIMIT_MS) {
    await sleepMs(API_RATE_LIMIT_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= API_RETRIES; attempt += 1) {
    await rateLimit();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": FETCH_UA },
        signal: controller.signal
      });
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        const delay = API_BACKOFF_MS * Math.pow(2, attempt);
        await sleepMs(delay);
        continue;
      }
      return res;
    } catch (error) {
      if (attempt >= API_RETRIES) throw error;
      const delay = API_BACKOFF_MS * Math.pow(2, attempt);
      await sleepMs(delay);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("fetchWithRetry exhausted");
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

function extractFlagTemplate(value) {
  const raw = String(value || "");
  const match = raw.match(/\{\{\s*flag(?:icon|deco|country|icon image)?\s*\|\s*([^|}]+)\s*/i);
  if (match && match[1]) return match[1].trim();
  return "";
}

function extractCountryName(cellText) {
  const templateValue = extractFlagTemplate(cellText);
  if (templateValue) return stripWikiMarkup(templateValue);
  const stripped = stripWikiMarkup(cellText);
  if (!stripped || /^id=/i.test(stripped)) return "";
  return stripped;
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

function parseRecreationalStatus(value) {
  const text = stripWikiMarkup(value).toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("unenforced") || text.includes("non-enforced")) return "Unenforced";
  if (text.includes("decriminal")) return "Decrim";
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  if (text.includes("legal")) return "Legal";
  return "Unknown";
}

function parseMedicalStatus(value) {
  const text = stripWikiMarkup(value).toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("limited") || text.includes("restricted") || text.includes("low thc")) {
    return "Limited";
  }
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  if (text.includes("legal") || text.includes("medical")) return "Legal";
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
    let countryCell = cells[0] || "";
    let recCell = cells[1] || "";
    let medCell = cells[2] || "";
    let notesCell = cells[3] || "";
    if (/^id=/i.test(stripWikiMarkup(countryCell)) && cells.length >= 4) {
      countryCell = cells[1] || "";
      recCell = cells[2] || "";
      medCell = cells[3] || "";
      notesCell = cells[4] || "";
    }
    const fallbackName = extractFlagTemplate(countryCell);
    const link = extractWikiLinks(countryCell)[0] || fallbackName || "";
    const name = extractCountryName(countryCell);
    if (!name) continue;
    if (/^Country\/Territory$/i.test(name) || /^Country or territory$/i.test(name) || /^State$/i.test(name)) {
      continue;
    }
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

function classifyFetchIssue(error, status, parseFail) {
  if (parseFail) return "PARSE_FAIL";
  if (typeof status === "number" && status > 0) {
    if (status === 403) return "HTTP_403";
    if (status === 429) return "HTTP_429";
    if (status >= 500) return "HTTP_5XX";
    return `HTTP_${status}`;
  }
  const code = String(error?.cause?.code || error?.code || error?.name || "");
  if (code.includes("ENOTFOUND") || code.includes("EAI_AGAIN")) return "NO_DNS";
  if (code.includes("CERT") || code.includes("TLS") || code.includes("SSL")) return "TLS_FAIL";
  if (code.includes("ETIMEDOUT") || code.includes("ECONNRESET")) return "NETWORK_FAIL";
  return code ? "FETCH_FAIL" : "FETCH_ERROR";
}

async function logFetchDiag(url, res, error, parseFail = false) {
  let status = 0;
  let redirects = 0;
  let contentType = "-";
  let bytes = 0;
  if (res) {
    status = res.status;
    redirects = res.redirected ? 1 : 0;
    contentType = res.headers.get("content-type") || "-";
    try {
      const clone = res.clone();
      const buf = await clone.arrayBuffer();
      bytes = buf.byteLength;
    } catch {
      bytes = 0;
    }
  }
  const errLabel = error
    ? String(error?.cause?.code || error?.code || error?.name || error?.message || "-")
    : "-";
  const issueClass = classifyFetchIssue(error, status, parseFail);
  console.error(
    `FETCH_DIAG: url=${url} err=${errLabel} code=${status || 0} redirects=${redirects} ua=${FETCH_UA} bytes=${bytes} content_type=${contentType} class=${issueClass}`
  );
}

async function fetchWikiWikitext(pageTitle) {
  const fixtureDir = process.env.WIKI_FIXTURE_DIR || "";
  if (fixtureDir) {
    const fileName = `${pageTitle.replace(/[^a-z0-9]+/gi, "_")}.wikitext`;
    const fixturePath = path.join(fixtureDir, fileName);
    if (fs.existsSync(fixturePath)) {
      return {
        ok: true,
        wikitext: fs.readFileSync(fixturePath, "utf8"),
        revisionId: "fixture"
      };
    }
  }
  const fixturePath = process.env.WIKI_FIXTURE_PATH || "";
  if (fixturePath && fs.existsSync(fixturePath)) {
    return {
      ok: true,
      wikitext: fs.readFileSync(fixturePath, "utf8"),
      revisionId: "fixture"
    };
  }
  const params = new URLSearchParams({
    action: "parse",
    page: pageTitle,
    prop: "wikitext|revid",
    format: "json",
    formatversion: "2"
  });
  const url = `${API_BASE}?${params.toString()}`;
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      await logFetchDiag(url, res, null);
      return { ok: false, wikitext: "", revisionId: "" };
    }
    try {
      const payload = await res.json();
      return {
        ok: Boolean(payload?.parse?.wikitext),
        wikitext: payload?.parse?.wikitext || "",
        revisionId: String(payload?.parse?.revid || "")
      };
    } catch (error) {
      await logFetchDiag(url, res, error, true);
      return { ok: false, wikitext: "", revisionId: "" };
    }
  } catch (error) {
    await logFetchDiag(url, null, error);
    return { ok: false, wikitext: "", revisionId: "" };
  }
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

async function parsePageClaims(pageTitle, options) {
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
  const isoMap = loadIsoLookupMap();
  const stateMap = loadStateNameMap();

  const countryPage = "Legality of cannabis";
  const statePage = "Legality of cannabis by U.S. jurisdiction";

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
  for (let index = 0; index < countryResult.rows.length; index += 1) {
    const row = countryResult.rows[index];
    const iso2 = resolveCountryIso(row.name, aliases, isoMap);
    if (!iso2) continue;
    const geoKey = iso2.toUpperCase();
    const wikiRec = parseRecreationalStatus(row.recreational);
    const wikiMed = parseMedicalStatus(row.medical);
    const mainArticles = extractMainArticles(row.notes);
    entries.set(geoKey, {
      geo_key: geoKey,
      name_in_wiki: row.name,
      wiki_row_url: buildWikiUrl(row.link || row.name),
      row_ref: `country:${index + 1}`,
      wiki_rec: wikiRec,
      wiki_med: wikiMed,
      main_articles: mainArticles,
      notes_main_articles: mainArticles,
      notes_text: stripWikiMarkup(row.notes),
      notes_raw: stripWikiMarkup(row.notes),
      recreational_status: wikiRec,
      medical_status: wikiMed,
      wiki_revision_id: countryResult.revisionId,
      fetched_at: runAt
    });
  }

  for (let index = 0; index < stateResult.rows.length; index += 1) {
    const row = stateResult.rows[index];
    const normalized = normalizeName(row.name);
    const geoKey = stateMap.get(normalized);
    if (!geoKey) continue;
    const wikiRec = parseRecreationalStatus(row.recreational);
    const wikiMed = parseMedicalStatus(row.medical);
    const mainArticles = extractMainArticles(row.notes);
    entries.set(geoKey, {
      geo_key: geoKey,
      name_in_wiki: row.name,
      wiki_row_url: buildWikiUrl(row.link || row.name),
      row_ref: `state:${index + 1}`,
      wiki_rec: wikiRec,
      wiki_med: wikiMed,
      main_articles: mainArticles,
      notes_main_articles: mainArticles,
      notes_text: stripWikiMarkup(row.notes),
      notes_raw: stripWikiMarkup(row.notes),
      recreational_status: wikiRec,
      medical_status: wikiMed,
      wiki_revision_id: stateResult.revisionId,
      fetched_at: runAt
    });
  }

  const isoPayload = readJson(ISO_PATH, { entries: [] });
  const isoEntries = Array.isArray(isoPayload?.entries) ? isoPayload.entries : [];
  for (const entry of isoEntries) {
    const iso2 = String(entry?.alpha2 || "").toUpperCase();
    if (!iso2 || entries.has(iso2)) continue;
    const countryName = String(entry?.name || "").trim();
    entries.set(iso2, {
      geo_key: iso2,
      name_in_wiki: countryName,
      wiki_row_url: countryName ? buildWikiUrl(countryName) : "",
      row_ref: `iso_fallback:${iso2}`,
      wiki_rec: "Unknown",
      wiki_med: "Unknown",
      main_articles: [],
      notes_main_articles: [],
      notes_text: "",
      notes_raw: "",
      recreational_status: "Unknown",
      medical_status: "Unknown",
      wiki_revision_id: countryResult.revisionId,
      fetched_at: runAt
    });
  }

  const items = Array.from(entries.values()).sort((a, b) =>
    String(a.geo_key || "").localeCompare(String(b.geo_key || ""))
  );

  writeAtomic(OUTPUT_PATH, items);
  writeAtomic(META_PATH, {
    fetched_at: runAt,
    pages: {
      [countryPage]: { revision_id: countryResult.revisionId },
      [statePage]: { revision_id: stateResult.revisionId }
    },
    counts: {
      total: items.length,
      countries: countryResult.rows.length,
      states: stateResult.rows.length
    }
  });

  console.log(
    `WIKI_INGEST countries=${countryResult.rows.length} revision=${countryResult.revisionId} states=${stateResult.rows.length} states_revision=${stateResult.revisionId}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

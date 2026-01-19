import fs from "node:fs";
import path from "node:path";
import {
  loadDefaultAliases,
  normalizeName,
  resolveWikiGeo
} from "./wiki_geo_resolver.mjs";
import { readWikiClaim } from "./wiki_claims_store.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "data", "wiki", "wiki_claims");
const API_BASE = "https://en.wikipedia.org/w/api.php";

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
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

export async function fetchWikiClaim(geoKey, options = {}) {
  const aliases = options.aliases || loadDefaultAliases();
  const resolved = resolveWikiGeo(geoKey, { aliases });
  const cached = readWikiClaim(resolved.geoKey);
  if (cached) {
    return { ok: true, payload: cached };
  }
  const response = await fetchWikiWikitext(resolved.wikiPage);
  if (!response.ok || !response.wikitext) {
    return { ok: false, reason: "WIKI_FETCH_FAILED" };
  }
  const table = extractTableFromWikitext(response.wikitext);
  if (!table) return { ok: false, reason: "WIKI_TABLE_MISSING" };
  const rows = parseWikiTable(table);
  const lookup = normalizeName(resolved.name || resolved.iso2 || resolved.geoKey);
  const match = rows.find((row) => normalizeName(row.name) === lookup);
  if (!match) {
    return { ok: false, reason: "WIKI_ROW_MISSING" };
  }
  const notes = extractMainArticles(match.notes);
  const notesRaw = String(match.notes || "");
  const wikiRefs = extractNotesRefs(notesRaw, notes);
  const wikiRec = parseRecreationalStatus(match.recreational);
  const wikiMed = parseMedicalStatus(match.medical);
  const wikiUrl = buildWikiUrl(match.link || match.name || resolved.name);
  const payload = {
    geo_key: resolved.geoKey,
    name_in_wiki: match.name,
    wiki_row_url: wikiUrl,
    wiki_rec: wikiRec,
    wiki_med: wikiMed,
    notes_raw: notesRaw,
    main_articles: notes,
    wiki_refs: wikiRefs,
    recreational_status: wikiRec,
    medical_status: wikiMed,
    notes_main_articles: notes,
    wiki_revision_id: response.revisionId,
    fetched_at: new Date().toISOString()
  };
  writeJson(path.join(OUTPUT_DIR, `${resolved.geoKey}.json`), payload);
  return { ok: true, payload };
}

async function main() {
  const geoKey = readArg("--geo", readArg("--iso", ""));
  if (!geoKey) {
    console.error("ERROR: missing --geo");
    process.exit(1);
  }
  const result = await fetchWikiClaim(geoKey, {});
  if (!result.ok) {
    console.error(`ERROR: ${result.reason || "WIKI_CLAIM_FAILED"}`);
    process.exit(2);
  }
  console.log(
    `OK wiki claim geo=${geoKey} rec=${result.payload.recreational_status} med=${result.payload.medical_status} main_articles=${result.payload.notes_main_articles.length}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

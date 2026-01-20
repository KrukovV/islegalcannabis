import fs from "node:fs";
import path from "node:path";
import {
  loadDefaultAliases,
  loadIsoLookupMap,
  normalizeName
} from "./wiki_geo_resolver.mjs";
import { fetchPageMeta, fetchPageWikitext } from "./mediawiki_api.mjs";
import { parseLegalityTable, normalizeRowStatuses } from "./legality_wikitext_parser.mjs";
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
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const US_STATES_PATH = path.join(ROOT, "data", "geo", "us_state_centroids.json");

const COUNTRY_PAGE = "Legality of cannabis";
const STATE_PAGE = "Legality of cannabis by U.S. jurisdiction";

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
    map.set(normalizeName(name), key.toUpperCase());
  }
  return map;
}

const FORCE_REFRESH = process.argv.includes("--refresh") || process.env.WIKI_FORCE_REFRESH === "1";

async function fetchPageRows(pageTitle, cacheFile) {
  const cachePath = path.join(ROOT, "data", "wiki", "cache", cacheFile);
  const cache = loadCache(cachePath);
  const ageHours = cacheAgeHours(cache);
  const refresh = FORCE_REFRESH ? true : shouldRefresh(cache, 4);
  if (!refresh && cache?.rows?.length) {
    console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id || "-"}`);
    const rows = cache.rows.map((row) => normalizeRowStatuses(row));
    return { ok: true, rows, revisionId: cache.revision_id || "", fetchedAt: cache.fetched_at || "" };
  }
  const meta = await fetchPageMeta(pageTitle);
  if (!meta.ok) {
    if (process.env.ALLOW_WIKI_OFFLINE === "1" && cache?.rows?.length) {
      console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id || "-"}`);
      const rows = cache.rows.map((row) => normalizeRowStatuses(row));
      return { ok: true, rows, revisionId: cache.revision_id || "", fetchedAt: cache.fetched_at || "" };
    }
    console.log(`WIKI_CACHE_MISS: page="${pageTitle}" reason=${meta.reason || "NETWORK_FAIL"}`);
    if (process.env.ALLOW_WIKI_OFFLINE === "1") {
      return { ok: true, rows: [], revisionId: cache?.revision_id || "", fetchedAt: cache?.fetched_at || "" };
    }
    return { ok: false, reason: meta.reason || "NETWORK_FAIL", error: meta.error || "-" };
  }
  const wikitextResult = await fetchPageWikitext(meta.pageid);
  if (!wikitextResult.ok) {
    if (process.env.ALLOW_WIKI_OFFLINE === "1" && cache?.rows?.length) {
      console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id || "-"}`);
      const rows = cache.rows.map((row) => normalizeRowStatuses(row));
      return { ok: true, rows, revisionId: cache.revision_id || "", fetchedAt: cache.fetched_at || "" };
    }
    console.log(`WIKI_CACHE_MISS: page="${pageTitle}" reason=${wikitextResult.reason || "NETWORK_FAIL"}`);
    if (process.env.ALLOW_WIKI_OFFLINE === "1") {
      return { ok: true, rows: [], revisionId: cache?.revision_id || "", fetchedAt: cache?.fetched_at || "" };
    }
    return { ok: false, reason: wikitextResult.reason || "NETWORK_FAIL", error: wikitextResult.error || "-" };
  }
  if (!FORCE_REFRESH && cache?.revision_id && cache.revision_id === wikitextResult.revision_id && Array.isArray(cache.rows)) {
    const refreshed = {
      pageid: meta.pageid,
      revision_id: cache.revision_id,
      fetched_at: new Date().toISOString(),
      rows: cache.rows.map((row) => normalizeRowStatuses(row))
    };
    saveCache(refreshed, cachePath);
    console.log(`WIKI_CACHE: page="${pageTitle}" hit=1 age_h=${ageHours?.toFixed(2) ?? "-"} revision=${cache.revision_id}`);
    return { ok: true, rows: refreshed.rows, revisionId: cache.revision_id, fetchedAt: refreshed.fetched_at };
  }
  const rows = parseLegalityTable(wikitextResult.wikitext || "");
  const refreshed = {
    pageid: meta.pageid,
    revision_id: wikitextResult.revision_id,
    fetched_at: new Date().toISOString(),
    rows
  };
  saveCache(refreshed, cachePath);
  console.log(`WIKI_CACHE: page="${pageTitle}" hit=0 age_h=0 revision=${wikitextResult.revision_id || "-"}`);
  return { ok: true, rows, revisionId: wikitextResult.revision_id || "", fetchedAt: refreshed.fetched_at };
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

  const countryResult = await fetchPageRows(COUNTRY_PAGE, "legality_of_cannabis.json");
  if (!countryResult.ok) {
    console.error(`ERROR: failed to fetch ${COUNTRY_PAGE} (${countryResult.reason})`);
    process.exit(countryResult.reason === "NETWORK_FAIL" ? 10 : 2);
  }
  const stateResult = await fetchPageRows(STATE_PAGE, "legality_us_states.json");
  if (!stateResult.ok) {
    console.error(`ERROR: failed to fetch ${STATE_PAGE} (${stateResult.reason})`);
    process.exit(stateResult.reason === "NETWORK_FAIL" ? 10 : 2);
  }

  const entries = new Map();
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
      main_articles: row.notes_main_articles || [],
      notes_main_articles: row.notes_main_articles || [],
      notes_text: row.notes_text || "",
      notes_raw: row.notes_raw || "",
      recreational_status: row.recreational_status,
      medical_status: row.medical_status,
      wiki_revision_id: countryResult.revisionId,
      fetched_at: runAt
    });
  });

  stateResult.rows.forEach((row, index) => {
    const normalized = normalizeName(row.name || row.link || "");
    const geoKey = stateMap.get(normalized);
    if (!geoKey) return;
    entries.set(geoKey, {
      geo_key: geoKey,
      name_in_wiki: row.name,
      wiki_row_url: buildWikiUrl(row.link || row.name),
      row_ref: `state:${index + 1}`,
      wiki_rec: row.recreational_status,
      wiki_med: row.medical_status,
      main_articles: row.notes_main_articles || [],
      notes_main_articles: row.notes_main_articles || [],
      notes_text: row.notes_text || "",
      notes_raw: row.notes_raw || "",
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
  isoEntries.forEach((entry) => {
    const iso2 = String(entry?.alpha2 || "").toUpperCase();
    if (!iso2 || entries.has(iso2)) return;
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
  });

  const items = Array.from(entries.values()).sort((a, b) =>
    String(a.geo_key || "").localeCompare(String(b.geo_key || ""))
  );
  const mapItems = {};
  items.forEach((item) => {
    mapItems[item.geo_key] = item;
  });
  writeAtomic(OUTPUT_PATH, items);
  writeAtomic(MAP_PATH, {
    generated_at: runAt,
    items: mapItems
  });
  writeAtomic(META_PATH, {
    fetched_at: runAt,
    pages: {
      [COUNTRY_PAGE]: { revision_id: countryResult.revisionId },
      [STATE_PAGE]: { revision_id: stateResult.revisionId }
    },
    counts: {
      total: items.length,
      countries: countryResult.rows.length,
      states: stateResult.rows.length
    },
    missing_countries: missingCountries.slice(0, 10)
  });

  const linkCount = items.reduce((sum, item) => sum + (item.notes_main_articles?.length || 0), 0);
  console.log(
    `WIKI_SYNC: revision_id=${countryResult.revisionId} countries_count=${countryResult.rows.length} states_count=${stateResult.rows.length} total=${items.length} links_count=${linkCount}`
  );
  if (missingCountries.length) {
    console.log(`WIKI_MISSING: count=${missingCountries.length} samples=${missingCountries.slice(0, 5).join("|")}`);
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

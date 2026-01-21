import fs from "node:fs";
import path from "node:path";
import {
  loadDefaultAliases,
  loadIsoLookupMap,
  normalizeName
} from "./wiki_geo_resolver.mjs";
import { fetchPageInfo, fetchPageWikitextCached } from "./mediawiki_api.mjs";
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
const SMOKE_GEOS = new Set(["RU", "TH", "XK", "US-CA", "CA"]);
const DIAG = process.argv.includes("--diag");

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
  const rows = parseLegalityTable(wikitextResult.wikitext || "");
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
      notes_text: "",
      notes_text_len: 0,
      notes: "",
      notes_raw: "",
      recreational_status: "Unknown",
      medical_status: "Unknown",
      wiki_revision_id: countryResult.revisionId,
      fetched_at: runAt
    });
  });

  let items = Array.from(entries.values()).sort((a, b) =>
    String(a.geo_key || "").localeCompare(String(b.geo_key || ""))
  );
  if (MODE === "smoke") {
    const existingMapPayload = readJson(MAP_PATH, null);
    const existingItems = existingMapPayload?.items && typeof existingMapPayload.items === "object"
      ? existingMapPayload.items
      : {};
    const mergedItems = { ...existingItems };
    for (const item of items) {
      if (!SMOKE_GEOS.has(item.geo_key)) continue;
      mergedItems[item.geo_key] = item;
    }
    items = Object.values(mergedItems).filter((entry) => entry && entry.geo_key);
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

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { extractWikiRefs } from "./wiki_refs.mjs";

const ROOT = process.cwd();
const SSOT_CLAIMS_PATH = path.join(ROOT, "data", "wiki_ssot", "wiki_claims.json");
const SSOT_REFS_PATH = path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json");
const LEGACY_CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.json");
const LEGACY_META_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.meta.json");
const LEGACY_DIR = path.join(ROOT, "data", "wiki", "wiki_claims");
const REPORT_PATH = path.join(ROOT, "Reports", "wiki_refresh", "last_run.json");
const FETCH_NETWORK =
  process.env.FETCH_NETWORK ?? process.env.ALLOW_NETWORK ?? process.env.NETWORK ?? "1";
const FETCH_ENABLED_ENV = FETCH_NETWORK !== "0";
const NETWORK_GUARD = process.env.NETWORK_GUARD ?? "1";
const MAX_ARTICLES = Number(process.env.WIKI_ARTICLE_LIMIT || 2);
const MAX_REFS = Number(process.env.WIKI_REF_LIMIT || 20);
const RATE_LIMIT_MS = Number(process.env.WIKI_RATE_LIMIT_MS || 700);

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
  if (durationMs <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, durationMs);
}

function loadLegacyClaims() {
  const direct = readJson(LEGACY_CLAIMS_PATH, null);
  if (direct) {
    if (Array.isArray(direct)) return direct;
    if (Array.isArray(direct.items)) return direct.items;
  }
  if (!fs.existsSync(LEGACY_DIR)) return [];
  const files = fs
    .readdirSync(LEGACY_DIR)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(LEGACY_DIR, entry));
  const items = [];
  for (const file of files) {
    const payload = readJson(file, null);
    if (payload) items.push(payload);
  }
  return items;
}

function loadWikiRevision() {
  const meta = readJson(LEGACY_META_PATH, null);
  if (!meta || typeof meta !== "object") return "";
  const pages = meta.pages || {};
  const values = Object.values(pages);
  for (const entry of values) {
    const rev = String(entry?.revision_id || "");
    if (rev) return rev;
  }
  return "";
}

function normalizeMainArticles(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return { title: entry, url: "" };
        }
        if (entry && typeof entry === "object") {
          return { title: entry.title || "", url: entry.url || "" };
        }
        return null;
      })
      .filter(Boolean);
  }
  return [];
}

function normalizeClaim(item, fallbackRevision, fallbackFetchedAt) {
  const geo = String(item?.geo || item?.geo_key || item?.geoKey || "").toUpperCase();
  if (!geo) return null;
  return {
    geo,
    country_name: String(item?.country_name || item?.name_in_wiki || item?.name || "").trim(),
    rec_status: String(
      item?.rec_status || item?.wiki_rec || item?.recreational_status || "Unknown"
    ),
    med_status: String(
      item?.med_status || item?.wiki_med || item?.medical_status || "Unknown"
    ),
    notes_text: String(item?.notes_text || item?.notes_raw || item?.notes || ""),
    main_articles: normalizeMainArticles(item?.main_articles || item?.notes_main_articles),
    wiki_row_url: String(item?.wiki_row_url || ""),
    updated_at: String(item?.updated_at || item?.fetched_at || fallbackFetchedAt || ""),
    wiki_revision_id: String(item?.wiki_revision_id || fallbackRevision || "")
  };
}

function buildRefEntry(ref) {
  const url = String(ref?.url || "").trim();
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = "";
  }
  return {
    url,
    host,
    title_hint: String(ref?.title || ref?.publisher || ref?.article_title || ""),
    section_hint: String(ref?.section || ref?.section_name || ""),
    source: String(ref?.source || "main_article")
  };
}

async function buildRefsForClaim(claim) {
  const geo = claim.geo;
  const iso2 = geo.split("-")[0] || geo;
  const articles = Array.isArray(claim.main_articles) ? claim.main_articles : [];
  const trimmed = articles
    .filter((entry) => entry?.title)
    .slice(0, MAX_ARTICLES)
    .map((entry) => ({ title: entry.title, url: entry.url || "" }));
  if (!trimmed.length) {
    return { refs: [], official: 0, nonOfficial: 0 };
  }
  const payload = await extractWikiRefs({ geoKey: geo, iso2, articles: trimmed });
  const combined = [
    ...(Array.isArray(payload?.official_candidates) ? payload.official_candidates : []),
    ...(Array.isArray(payload?.supporting_refs) ? payload.supporting_refs : [])
  ];
  const seen = new Set();
  const refs = [];
  for (const ref of combined) {
    const entry = buildRefEntry(ref);
    if (!entry || !entry.url) continue;
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    refs.push(entry);
    if (refs.length >= MAX_REFS) break;
  }
  return {
    refs,
    official: Array.isArray(payload?.official_candidates)
      ? payload.official_candidates.length
      : 0,
    nonOfficial: Array.isArray(payload?.supporting_refs)
      ? payload.supporting_refs.length
      : 0
  };
}

function getNetworkMode() {
  if (typeof process.env.FETCH_NETWORK !== "undefined") {
    return { source: "env", name: "FETCH_NETWORK", value: String(process.env.FETCH_NETWORK) };
  }
  if (typeof process.env.ALLOW_NETWORK !== "undefined") {
    return { source: "env", name: "ALLOW_NETWORK", value: String(process.env.ALLOW_NETWORK) };
  }
  if (typeof process.env.NETWORK !== "undefined") {
    return { source: "env", name: "NETWORK", value: String(process.env.NETWORK) };
  }
  return { source: "config", name: "default", value: "1" };
}

function hasWikiCache() {
  if (fs.existsSync(SSOT_CLAIMS_PATH)) return true;
  if (fs.existsSync(LEGACY_CLAIMS_PATH)) return true;
  if (fs.existsSync(LEGACY_DIR)) {
    try {
      return fs.readdirSync(LEGACY_DIR).some((entry) => entry.endsWith(".json"));
    } catch {
      return false;
    }
  }
  return false;
}

async function main() {
  const runAt = new Date().toISOString();
  let refreshStatus = "SKIPPED";
  let fetchEnabled = FETCH_ENABLED_ENV;
  const networkMode = getNetworkMode();
  const networkEnabled = networkMode.value !== "0";
  const offlineAllowed = process.env.ALLOW_WIKI_OFFLINE === "1";
  const cacheHit = hasWikiCache();
  console.log(
    `NET_MODE: network_enabled=${networkEnabled ? 1 : 0} source=${networkMode.source} value=${networkMode.name}=${networkMode.value}`
  );
  console.log(
    `WIKI_MODE: offline_allowed=${offlineAllowed ? 1 : 0} cache_hit=${cacheHit ? 1 : 0}`
  );

  if (!FETCH_ENABLED_ENV && NETWORK_GUARD !== "0") {
    console.error(
      `ERROR: NETWORK_GUARD blocked wiki refresh (FETCH_NETWORK=${FETCH_NETWORK})`
    );
    process.exit(2);
  }

  if (FETCH_ENABLED_ENV) {
    const result = spawnSync(process.execPath, [path.join(ROOT, "tools", "wiki", "wiki_claims_ingest.mjs")], {
      stdio: "inherit"
    });
    if (result.status !== 0) {
      if (process.env.ALLOW_WIKI_OFFLINE === "1") {
        console.warn("WARN: wiki refresh fetch failed; using cached data (ALLOW_WIKI_OFFLINE=1).");
        refreshStatus = "OFFLINE_FALLBACK";
        fetchEnabled = false;
      } else {
        process.exit(result.status ?? 1);
      }
    } else {
      refreshStatus = "FETCHED";
    }
  }

  const legacyClaims = loadLegacyClaims();
  const fallbackRevision = loadWikiRevision();
  let claims = legacyClaims
    .map((item) => normalizeClaim(item, fallbackRevision, runAt))
    .filter(Boolean)
    .sort((a, b) => String(a.geo).localeCompare(String(b.geo)));
  let usedExisting = false;

  if (!fetchEnabled && fs.existsSync(SSOT_CLAIMS_PATH)) {
    const existing = readJson(SSOT_CLAIMS_PATH, null);
    const items = Array.isArray(existing?.items)
      ? existing.items
      : Array.isArray(existing)
        ? existing
        : [];
    if (items.length) {
      claims = items
        .map((item) => normalizeClaim(item, "", ""))
        .filter(Boolean)
        .sort((a, b) => String(a.geo).localeCompare(String(b.geo)));
      usedExisting = true;
    }
  } else if (!claims.length && fs.existsSync(SSOT_CLAIMS_PATH)) {
    const existing = readJson(SSOT_CLAIMS_PATH, null);
    const items = Array.isArray(existing?.items)
      ? existing.items
      : Array.isArray(existing)
        ? existing
        : [];
    for (const item of items) {
      const normalized = normalizeClaim(item, "", "");
      if (normalized) claims.push(normalized);
    }
  }

  if (!claims.length) {
    writeAtomic(REPORT_PATH, {
      run_at: runAt,
      refresh_status: fetchEnabled ? "FETCH_EMPTY" : "OFFLINE_EMPTY",
      geos: 0,
      main_articles_total: 0,
      refs_total: 0,
      official: 0,
      non_official: 0
    });
    console.log(
      "WIKI_REFRESH: geos=0 main_articles_total=0 refs_total=0 official=0 non_official=0"
    );
    process.exit(0);
  }

  const mainArticlesTotal = claims.reduce(
    (sum, claim) => sum + (Array.isArray(claim.main_articles) ? claim.main_articles.length : 0),
    0
  );
  let refsTotal = 0;
  let officialTotal = 0;
  let nonOfficialTotal = 0;
  const refItems = [];
  if (fetchEnabled) {
    for (const claim of claims) {
      const { refs, official, nonOfficial } = await buildRefsForClaim(claim);
      refsTotal += refs.length;
      officialTotal += official;
      nonOfficialTotal += nonOfficial;
      refItems.push({ geo_key: claim.geo, refs });
      sleepMs(RATE_LIMIT_MS);
    }
  } else if (fs.existsSync(SSOT_REFS_PATH)) {
    const existing = readJson(SSOT_REFS_PATH, null);
    const items = Array.isArray(existing?.items)
      ? existing.items
      : Array.isArray(existing)
        ? existing
        : [];
    for (const item of items) {
      const geoKey = String(item?.geo_key || item?.geo || "").toUpperCase();
      if (!geoKey) continue;
      const refs = Array.isArray(item?.refs) ? item.refs : [];
      refsTotal += refs.length;
      refItems.push({ geo_key: geoKey, refs });
    }
  } else {
    for (const claim of claims) {
      refItems.push({ geo_key: claim.geo, refs: [] });
    }
  }

  if (!usedExisting || fetchEnabled) {
    writeAtomic(SSOT_CLAIMS_PATH, { items: claims, updated_at: runAt });
  }
  if (fetchEnabled) {
    writeAtomic(SSOT_REFS_PATH, { items: refItems, updated_at: runAt });
  } else if (!usedExisting && refItems.length) {
    writeAtomic(SSOT_REFS_PATH, { items: refItems, updated_at: runAt });
  }

  const reportPayload = {
    run_at: runAt,
    refresh_status: fetchEnabled ? refreshStatus : "OFFLINE",
    geos: claims.length,
    main_articles_total: mainArticlesTotal,
    refs_total: refsTotal,
    official: officialTotal,
    non_official: nonOfficialTotal
  };
  writeAtomic(REPORT_PATH, reportPayload);

  console.log(
    `WIKI_REFRESH: geos=${claims.length} main_articles_total=${mainArticlesTotal} refs_total=${refsTotal} official=${officialTotal} non_official=${nonOfficialTotal}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

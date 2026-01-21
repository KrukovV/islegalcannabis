import fs from "node:fs";
import path from "node:path";

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
const API_BASE = "https://en.wikipedia.org/w/api.php";
const PAGE_TITLE = "Legality_of_cannabis";
const PING_URL = "https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json";
const PING_TIMEOUT_MS = Number(process.env.WIKI_PING_TIMEOUT_MS || 4000);
const WIKI_CACHE_MAX_AGE_H = Number(process.env.WIKI_CACHE_MAX_AGE_H || 6);
const WIKI_CACHE_DIR = path.join(ROOT, "data", "wiki", "cache");
const WIKI_CACHE_FILES = [
  path.join(ROOT, "data", "wiki", "cache", "legality_of_cannabis.json"),
  path.join(ROOT, "data", "wiki", "cache", "legality_us_states.json")
];

function checkWikiCacheOk() {
  const ages = [];
  for (const file of WIKI_CACHE_FILES) {
    if (!fs.existsSync(file)) {
      return { ok: false, reason: `missing:${file}` };
    }
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return { ok: false, reason: `read:${file}` };
    }
    const fetched = Date.parse(payload?.fetched_at || "");
    if (!fetched) {
      return { ok: false, reason: `stale:${file}` };
    }
    const age = (Date.now() - fetched) / 36e5;
    if (age > WIKI_CACHE_MAX_AGE_H) {
      return { ok: false, reason: `age:${age.toFixed(2)}` };
    }
    ages.push(age);
  }
  const ageMax = ages.length ? Math.max(...ages) : null;
  return { ok: true, ageMax };
}

function readFixtureWikitext() {
  const fixtureDir = process.env.WIKI_FIXTURE_DIR || "";
  if (fixtureDir) {
    const fileName = `${PAGE_TITLE.replace(/[^a-z0-9]+/gi, "_")}.wikitext`;
    const fixturePath = path.join(fixtureDir, fileName);
    if (fs.existsSync(fixturePath)) {
      return fs.readFileSync(fixturePath, "utf8");
    }
  }
  const fixturePath = process.env.WIKI_FIXTURE_PATH || "";
  if (fixturePath && fs.existsSync(fixturePath)) {
    return fs.readFileSync(fixturePath, "utf8");
  }
  return "";
}

function normalizeFetchError(error) {
  if (!error) return "UNKNOWN";
  const code = error?.cause?.code || error?.code || error?.name || "";
  if (code) return String(code);
  return String(error?.message || "UNKNOWN");
}

async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url, { method: "GET" });
  } catch (error) {
    return { ok: false, reason: "NETWORK_FAIL", error: normalizeFetchError(error) };
  }
  if (!res.ok) {
    return { ok: false, reason: "NETWORK_FAIL", error: `HTTP_${res.status}` };
  }
  try {
    const payload = await res.json();
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "NETWORK_FAIL", error: "JSON_PARSE" };
  }
}

function cachePathForWikitext(pageid, revisionId) {
  if (!pageid || !revisionId) return "";
  return path.join(WIKI_CACHE_DIR, `${pageid}-${revisionId}.json`);
}

function loadWikitextCache(pageid, revisionId) {
  const cachePath = cachePathForWikitext(pageid, revisionId);
  if (!cachePath || !fs.existsSync(cachePath)) return "";
  try {
    const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    return String(payload?.wikitext || "");
  } catch {
    return "";
  }
}

function saveWikitextCache(pageid, revisionId, wikitext) {
  const cachePath = cachePathForWikitext(pageid, revisionId);
  if (!cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const payload = {
    pageid: String(pageid),
    revision_id: String(revisionId),
    fetched_at: new Date().toISOString(),
    wikitext: String(wikitext || "")
  };
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2) + "\n");
}

export async function fetchPageMeta(title) {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "info",
    inprop: "url",
    format: "json",
    formatversion: "2"
  });
  const url = `${API_BASE}?${params.toString()}`;
  const response = await fetchJson(url);
  if (!response.ok) {
    return { ok: false, reason: response.reason, error: response.error };
  }
  const page = response.payload?.query?.pages?.[0] || {};
  return {
    ok: true,
    pageid: String(page.pageid || ""),
    title: String(page.title || title),
    canonicalUrl: String(page.canonicalurl || page.fullurl || "")
  };
}

export async function fetchPageInfo(title) {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "info|revisions",
    rvprop: "ids",
    format: "json",
    formatversion: "2"
  });
  const url = `${API_BASE}?${params.toString()}`;
  const response = await fetchJson(url);
  if (!response.ok) {
    return { ok: false, reason: response.reason, error: response.error };
  }
  const page = response.payload?.query?.pages?.[0] || {};
  const revision = page?.revisions?.[0] || {};
  return {
    ok: true,
    pageid: String(page.pageid || ""),
    title: String(page.title || title),
    revision_id: String(revision.revid || "")
  };
}

export async function fetchPageWikitext(pageid) {
  if (!pageid) {
    return { ok: false, reason: "NETWORK_FAIL", error: "PAGEID_MISSING" };
  }
  const params = new URLSearchParams({
    action: "query",
    pageids: String(pageid),
    prop: "revisions",
    rvprop: "content|ids",
    rvslots: "main",
    format: "json",
    formatversion: "2"
  });
  const url = `${API_BASE}?${params.toString()}`;
  const response = await fetchJson(url);
  if (!response.ok) {
    return { ok: false, reason: response.reason, error: response.error };
  }
  const page = response.payload?.query?.pages?.[0] || {};
  const revision = page?.revisions?.[0] || {};
  const content = revision?.slots?.main?.content || "";
  const revisionId = String(revision?.revid || "");
  const bytes = Buffer.byteLength(content, "utf8");
  console.log(`WIKI_API: pageid=${pageid} revision=${revisionId || "-"} bytes=${bytes} ok=1`);
  return {
    ok: Boolean(content),
    wikitext: content,
    revision_id: revisionId
  };
}

export async function fetchPageWikitextCached(pageid, revisionId) {
  const cached = loadWikitextCache(pageid, revisionId);
  if (cached) {
    const bytes = Buffer.byteLength(cached, "utf8");
    console.log(`WIKI_API: pageid=${pageid} revision=${revisionId} bytes=${bytes} ok=1 cache=1`);
    return { ok: true, wikitext: cached, revision_id: String(revisionId) };
  }
  const result = await fetchPageWikitext(pageid);
  if (result.ok && result.revision_id) {
    saveWikitextCache(pageid, result.revision_id, result.wikitext);
  }
  return result;
}

export async function fetchLegalityPageMeta() {
  const params = new URLSearchParams({
    action: "query",
    titles: PAGE_TITLE,
    prop: "info",
    inprop: "url",
    format: "json",
    formatversion: "2"
  });
  const url = `${API_BASE}?${params.toString()}`;
  const response = await fetchJson(url);
  if (!response.ok) {
    return { ok: false, reason: response.reason, error: response.error };
  }
  const page = response.payload?.query?.pages?.[0] || {};
  return {
    ok: true,
    pageid: String(page.pageid || ""),
    title: String(page.title || "Legality of cannabis"),
    canonicalUrl: String(page.canonicalurl || page.fullurl || "")
  };
}

export async function fetchLegalityWikitext(pageid) {
  const fixtureText = readFixtureWikitext();
  if (fixtureText) {
    const bytes = Buffer.byteLength(fixtureText, "utf8");
    console.log(`WIKI_API: pageid=${pageid || "fixture"} revision=fixture bytes=${bytes} ok=1`);
    return { ok: true, wikitext: fixtureText, revision_id: "fixture" };
  }
  return fetchPageWikitext(pageid);
}

async function pingWiki() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(PING_URL, {
      method: "GET",
      signal: controller.signal,
      headers: { "user-agent": "islegalcannabis/wiki_ping" }
    });
    clearTimeout(timer);
    if (res.ok) {
      console.log(`WIKI_API_PING: status=${res.status} reason=OK err=-`);
      process.exit(0);
    }
    console.log(`WIKI_API_PING: status=${res.status} reason=HTTP err=-`);
    if (process.env.WIKI_OFFLINE_OK === "1") {
      const cacheStatus = checkWikiCacheOk();
      if (cacheStatus.ok) {
        console.log(
          `WIKI_MODE: cached_ok=1 cache_age_h=${cacheStatus.ageMax?.toFixed(2) ?? "-"} max_cache_h=${WIKI_CACHE_MAX_AGE_H}`
        );
        process.exit(0);
      }
    }
    process.exit(12);
  } catch (error) {
    clearTimeout(timer);
    const code = String(error?.cause?.code || error?.code || error?.name || error?.message || "-");
    if (code.includes("ENOTFOUND") || code.includes("EAI_AGAIN")) {
      console.log(`WIKI_API_PING: status=- reason=DNS err=${code}`);
      if (process.env.WIKI_OFFLINE_OK === "1") {
        const cacheStatus = checkWikiCacheOk();
        if (cacheStatus.ok) {
          console.log(
            `WIKI_MODE: cached_ok=1 cache_age_h=${cacheStatus.ageMax?.toFixed(2) ?? "-"} max_cache_h=${WIKI_CACHE_MAX_AGE_H}`
          );
          process.exit(0);
        }
      }
      process.exit(10);
    }
    if (code.includes("CERT") || code.includes("TLS") || code.includes("SSL")) {
      console.log(`WIKI_API_PING: status=- reason=TLS err=${code}`);
      if (process.env.WIKI_OFFLINE_OK === "1") {
        const cacheStatus = checkWikiCacheOk();
        if (cacheStatus.ok) {
          console.log(
            `WIKI_MODE: cached_ok=1 cache_age_h=${cacheStatus.ageMax?.toFixed(2) ?? "-"} max_cache_h=${WIKI_CACHE_MAX_AGE_H}`
          );
          process.exit(0);
        }
      }
      process.exit(11);
    }
    if (code.includes("AbortError")) {
      console.log(`WIKI_API_PING: status=- reason=TIMEOUT err=${code}`);
      if (process.env.WIKI_OFFLINE_OK === "1") {
        const cacheStatus = checkWikiCacheOk();
        if (cacheStatus.ok) {
          console.log(
            `WIKI_MODE: cached_ok=1 cache_age_h=${cacheStatus.ageMax?.toFixed(2) ?? "-"} max_cache_h=${WIKI_CACHE_MAX_AGE_H}`
          );
          process.exit(0);
        }
      }
      process.exit(13);
    }
    console.log(`WIKI_API_PING: status=- reason=HTTP err=${code}`);
    if (process.env.WIKI_OFFLINE_OK === "1") {
      const cacheStatus = checkWikiCacheOk();
      if (cacheStatus.ok) {
        console.log(
          `WIKI_MODE: cached_ok=1 cache_age_h=${cacheStatus.ageMax?.toFixed(2) ?? "-"} max_cache_h=${WIKI_CACHE_MAX_AGE_H}`
        );
        process.exit(0);
      }
    }
    process.exit(12);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--ping")) {
    pingWiki();
  }
}

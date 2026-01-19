import fs from "node:fs";
import path from "node:path";
import { validateOfficialUrl } from "./validate_official_url.mjs";

const ROOT = process.cwd();
const DEFAULT_CATALOG = path.join(ROOT, "data", "sources", "official_catalog.json");
const DEFAULT_ISO = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const REPORT_PATH = path.join(ROOT, "Reports", "auto_seed", "last_seed.json");
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const DEFAULT_CANDIDATES = path.join(
  ROOT,
  "data",
  "sources",
  "official_catalog.candidates.json"
);

const BANNED_HOSTS = new Set([
  "wikipedia.org",
  "wikidata.org",
  "medium.com",
  "reddit.com",
  "fandom.com",
  "blogspot.com",
  "bit.ly",
  "t.co",
  "tinyurl.com"
]);

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function loadIsoList(filePath) {
  const payload = readJson(filePath);
  if (!payload) return [];
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.entries)
      ? payload.entries
      : [];
  const codes = raw
    .map((entry) => {
      if (typeof entry === "string") return entry.toUpperCase();
      if (entry?.alpha2) return String(entry.alpha2).toUpperCase();
      if (entry?.code) return String(entry.code).toUpperCase();
      return "";
    })
    .filter((code) => code.length === 2);
  return Array.from(new Set(codes)).sort();
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return {};
  return { ...entry };
}

function normalizeUrl(url) {
  return String(url || "").trim();
}

function isBannedHost(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase();
  if (host.includes("blog")) return true;
  for (const banned of BANNED_HOSTS) {
    if (host === banned || host.endsWith(`.${banned}`)) return true;
  }
  return false;
}

function filterCandidate(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (isBannedHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/sparql-results+json" }
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchWikidataOfficial(iso2, fetchImpl) {
  const query = `
    SELECT ?official WHERE {
      ?country wdt:P297 "${iso2}".
      ?country wdt:P856 ?official.
    }
  `;
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(
    query
  )}`;
  const payload = await fetchJson(url, fetchImpl);
  const bindings = Array.isArray(payload?.results?.bindings)
    ? payload.results.bindings
    : [];
  return bindings
    .map((row) => String(row?.official?.value || ""))
    .filter(Boolean);
}

async function validateCandidate(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal
    });
    let redirectCount = 0;
    while (
      response &&
      response.status >= 300 &&
      response.status < 400 &&
      redirectCount < 5
    ) {
      const location = response.headers?.get("location");
      if (!location) break;
      const nextUrl = new URL(location, response.url || url).toString();
      if (!filterCandidate(nextUrl)) {
        return { ok: false, reason: "final_url_rejected" };
      }
      redirectCount += 1;
      response = await fetchImpl(nextUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal
      });
    }
    const status = Number(response.status || 0);
    if (status < 200 || status >= 400) {
      return { ok: false, reason: `status_${status}` };
    }
    const finalUrl = response.url || url;
    if (!filterCandidate(finalUrl)) {
      return { ok: false, reason: "final_url_rejected" };
    }
    return { ok: true, status, finalUrl };
  } catch (error) {
    return { ok: false, reason: error?.name === "AbortError" ? "timeout" : "fetch_error" };
  } finally {
    clearTimeout(timeout);
  }
}

function buildNote(status) {
  return `auto-seeded via wikidata P856; validated=${status}; type=gov_portal`;
}

function countOfficialEntries(catalog) {
  return Object.values(catalog).filter((entry) => {
    const list = Array.isArray(entry?.official) ? entry.official : [];
    return list.length > 0;
  }).length;
}

function sortedCatalog(catalog) {
  const entries = Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

export async function autoSeedOfficialCatalog({
  catalogPath = DEFAULT_CATALOG,
  isoPath = DEFAULT_ISO,
  candidatesPath = DEFAULT_CANDIDATES,
  limit = 60,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch unavailable");
  }
  const iso2List = loadIsoList(isoPath);
  if (iso2List.length === 0) {
    throw new Error("missing iso list");
  }
  const catalog = readJson(catalogPath) || {};
  const beforeCount = countOfficialEntries(catalog);
  const rejected = [];
  const addedIso = [];

  const targets = iso2List.filter((iso2) => {
    const entry = catalog[iso2];
    const official = Array.isArray(entry?.official) ? entry.official : [];
    return official.length === 0;
  });

  const candidatePayload = readJson(candidatesPath) || {};
  const candidateMap = candidatePayload.candidates || {};

  for (const iso2 of targets.slice(0, limit)) {
    let candidates = Array.isArray(candidateMap?.[iso2])
      ? candidateMap[iso2]
      : [];
    if (candidates.length === 0) {
      try {
        candidates = await fetchWikidataOfficial(iso2, fetchImpl);
      } catch (error) {
        rejected.push({
          iso2,
          url: "",
          reason: error?.message || "wikidata_error"
        });
        continue;
      }
    }
    const filtered = [];
    for (const url of candidates) {
      if (!filterCandidate(url)) {
        rejected.push({ iso2, url, reason: "filtered" });
        continue;
      }
      filtered.push(normalizeUrl(url));
    }
    filtered.sort();
    let added = false;
    for (const url of filtered) {
      const verdict = await validateCandidate(url, fetchImpl);
      if (!verdict.ok) {
        rejected.push({ iso2, url, reason: verdict.reason });
        continue;
      }
      const allow = validateOfficialUrl(verdict.finalUrl || url);
      const entry = normalizeEntry(catalog[iso2]);
      if (allow.ok) {
        entry.official = [verdict.finalUrl || url];
      } else {
        entry.official = [];
        entry.candidate_only = true;
        entry.candidates = Array.isArray(entry.candidates)
          ? Array.from(new Set([...entry.candidates, verdict.finalUrl || url]))
          : [verdict.finalUrl || url];
      }
      const note = buildNote(verdict.status);
      entry.notes = entry.notes ? `${entry.notes} | ${note}` : note;
      catalog[iso2] = entry;
      addedIso.push(iso2);
      added = true;
      break;
    }
    if (!added && filtered.length === 0) {
      rejected.push({ iso2, url: "", reason: "no_candidates" });
    }
  }

  const afterCount = countOfficialEntries(catalog);
  const report = {
    ts: new Date().toISOString(),
    iso_total: iso2List.length,
    before_count: beforeCount,
    after_count: afterCount,
    added_count: Math.max(0, afterCount - beforeCount),
    added_iso2: addedIso,
    rejected
  };

  writeJson(catalogPath, sortedCatalog(catalog));
  writeJson(REPORT_PATH, report);

  return report;
}

async function main() {
  const args = process.argv.slice(2);
  let catalogPath = DEFAULT_CATALOG;
  let isoPath = DEFAULT_ISO;
  let candidatesPath = DEFAULT_CANDIDATES;
  let limit = 60;
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--catalog" && value) catalogPath = value;
    if (args[i] === "--iso" && value) isoPath = value;
    if (args[i] === "--candidates" && value) candidatesPath = value;
    if (args[i] === "--limit" && value) limit = Number(value || 0);
  }
  const report = await autoSeedOfficialCatalog({
    catalogPath,
    isoPath,
    candidatesPath,
    limit
  });
  console.log(
    `AUTO_SEED: added=${report.added_count} (before=${report.before_count} after=${report.after_count}) artifact=Reports/auto_seed/last_seed.json`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}

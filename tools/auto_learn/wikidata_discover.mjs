import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const CANDIDATES_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "official_catalog.candidates.json"
);
const DENYLIST_PATH = path.join(ROOT, "data", "sources", "domain_denylist.json");
const REPORT_PATH = path.join(ROOT, "Reports", "auto_learn", "wikidata_discover.json");
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

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

function loadDenylist(filePath) {
  const payload = readJson(filePath);
  const banned = Array.isArray(payload?.banned) ? payload.banned : [];
  return new Set(
    banned.map((host) => String(host || "").toLowerCase()).filter(Boolean)
  );
}

function isBannedHost(hostname, denylist) {
  if (!hostname) return true;
  const host = hostname.toLowerCase();
  if (host.includes("blog")) return true;
  for (const banned of denylist) {
    if (host === banned || host.endsWith(`.${banned}`)) return true;
  }
  return false;
}

function filterCandidate(url, denylist) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (isBannedHost(parsed.hostname, denylist)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchWikidataOfficial(iso2) {
  const query = `
    SELECT ?official WHERE {
      ?country wdt:P297 "${iso2}".
      ?country wdt:P856 ?official.
    }
  `;
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(
    query
  )}`;
  const response = await fetch(url, {
    headers: { accept: "application/sparql-results+json" }
  });
  if (!response.ok) return [];
  const payload = await response.json();
  const bindings = Array.isArray(payload?.results?.bindings)
    ? payload.results.bindings
    : [];
  return bindings
    .map((row) => String(row?.official?.value || ""))
    .filter(Boolean);
}

async function validateCandidate(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let response = await fetch(url, {
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
      redirectCount += 1;
      response = await fetch(nextUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal
      });
    }
    const status = Number(response.status || 0);
    if (status < 200 || status >= 400) {
      return { ok: false, reason: `status_${status}` };
    }
    return { ok: true, status, finalUrl: response.url || url };
  } catch (error) {
    return { ok: false, reason: error?.name === "AbortError" ? "timeout" : "fetch_error" };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let limit = 60;
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--limit" && value) limit = Number(value || 0);
  }

  const iso2List = loadIsoList(ISO_PATH);
  const denylist = loadDenylist(DENYLIST_PATH);
  const existing = readJson(CANDIDATES_PATH) || { candidates: {} };
  const candidates = existing.candidates || {};

  const rejected = [];
  const addedIso = [];
  let validatedOk = 0;

  for (const iso2 of iso2List.slice(0, limit)) {
    const urls = await fetchWikidataOfficial(iso2);
    const filtered = urls.filter((url) => filterCandidate(url, denylist));
    const validated = [];
    for (const url of filtered) {
      const verdict = await validateCandidate(url);
      if (!verdict.ok) {
        rejected.push({ iso2, url, reason: verdict.reason });
        continue;
      }
      if (!filterCandidate(verdict.finalUrl, denylist)) {
        rejected.push({ iso2, url: verdict.finalUrl, reason: "denylist" });
        continue;
      }
      validatedOk += 1;
      validated.push(verdict.finalUrl);
    }
    if (validated.length > 0) {
      const unique = Array.from(new Set(validated)).sort();
      candidates[iso2] = unique;
      addedIso.push(iso2);
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    candidates
  };
  writeJson(CANDIDATES_PATH, payload);

  const report = {
    ts: payload.generated_at,
    iso_total: iso2List.length,
    candidates_added: addedIso.length,
    validated_ok: validatedOk,
    rejected
  };
  writeJson(REPORT_PATH, report);

  console.log(
    `WIKIDATA_DISCOVER: candidates_added=${report.candidates_added} validated_ok=${report.validated_ok} rejected=${report.rejected.length}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}

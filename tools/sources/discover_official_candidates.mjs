import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const DENYLIST_PATH = path.join(ROOT, "data", "sources", "domain_denylist.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function loadDenylist() {
  const payload = readJson(DENYLIST_PATH, {});
  const banned = Array.isArray(payload?.banned) ? payload.banned : [];
  return new Set(
    banned.map((host) => String(host || "").toLowerCase()).filter(Boolean)
  );
}

function isBannedHost(hostname, denylist) {
  if (!hostname) return true;
  const host = hostname.toLowerCase();
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

function buildQuery(iso2) {
  return `
    SELECT ?countryWebsite ?legislatureWebsite ?legislationWebsite ?ministryWebsite WHERE {
      ?country wdt:P297 "${iso2}" .
      OPTIONAL { ?country wdt:P856 ?countryWebsite . }
      OPTIONAL {
        ?country wdt:P194 ?legislature .
        ?legislature wdt:P856 ?legislatureWebsite .
      }
      OPTIONAL { ?country wdt:P1414 ?legislationWebsite . }
      OPTIONAL {
        ?country wdt:P159 ?ministry .
        ?ministry wdt:P856 ?ministryWebsite .
      }
    }
  `;
}

async function fetchWikidata(iso2) {
  const query = buildQuery(iso2);
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": "islegalcannabis/1.0 (on_demand)"
    }
  });
  if (!response.ok) {
    throw new Error(`wikidata fetch failed (${response.status})`);
  }
  return response.json();
}

function scoreForProp(prop) {
  if (prop === "P856") return 100;
  if (prop === "P194") return 85;
  if (prop === "P1414") return 80;
  if (prop === "P159") return 70;
  return 50;
}

function extractCandidates(raw, denylist) {
  const bindings = raw?.results?.bindings || [];
  const candidates = [];
  const fetchedAt = new Date().toISOString();
  for (const row of bindings) {
    const pairs = [
      { value: row?.countryWebsite?.value, prop: "P856" },
      { value: row?.legislatureWebsite?.value, prop: "P194" },
      { value: row?.legislationWebsite?.value, prop: "P1414" },
      { value: row?.ministryWebsite?.value, prop: "P159" }
    ];
    for (const entry of pairs) {
      if (!entry.value) continue;
      if (!filterCandidate(entry.value, denylist)) continue;
      candidates.push({
        url: entry.value,
        source: "wikidata",
        prop: entry.prop,
        score: scoreForProp(entry.prop),
        fetched_at: fetchedAt
      });
    }
  }
  const seen = new Set();
  const deduped = [];
  for (const entry of candidates) {
    const key = String(entry.url || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped.sort((a, b) => (b.score || 0) - (a.score || 0));
}

export async function discoverOfficialCandidates(iso2, maxCandidates = 50) {
  const cleanIso = String(iso2 || "").toUpperCase();
  if (!cleanIso || cleanIso.length !== 2) {
    throw new Error("invalid iso2");
  }
  const denylist = loadDenylist();
  const wikidata = await fetchWikidata(cleanIso);
  const candidates = extractCandidates(wikidata, denylist);
  return candidates.slice(0, maxCandidates);
}

async function main() {
  const args = process.argv.slice(2);
  const isoIdx = args.indexOf("--iso2");
  const iso2 = isoIdx >= 0 ? args[isoIdx + 1] : "";
  const maxIdx = args.indexOf("--max");
  const maxCandidates = maxIdx >= 0 ? Number(args[maxIdx + 1] || 0) : 50;
  if (!iso2) {
    console.error("ERROR: missing --iso2");
    process.exit(1);
  }
  const results = await discoverOfficialCandidates(iso2, maxCandidates || 50);
  process.stdout.write(JSON.stringify({ iso2: String(iso2).toUpperCase(), candidates: results }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}

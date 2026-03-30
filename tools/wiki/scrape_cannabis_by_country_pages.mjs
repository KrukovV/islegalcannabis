#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "ssot", "wiki_pages_universe.json");
const SOURCE_URL = "https://en.wikipedia.org/wiki/Cannabis_by_country";
const CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugToName(slug) {
  return decodeURIComponent(String(slug || ""))
    .replace(/_/g, " ")
    .trim();
}

async function fetchCountryLinks() {
  const res = await fetch(SOURCE_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const html = await res.text();
  const links = [];
  const re = /href="\/wiki\/([^"#:]+)"/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const slug = String(match[1] || "").trim();
    if (!slug || slug.includes(":")) continue;
    links.push(slug);
  }
  return links;
}

function buildNameToUrlMap(links) {
  const map = new Map();
  for (const slug of links) {
    const name = normalizeName(slugToName(slug));
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, `https://en.wikipedia.org/wiki/${slug}`);
    }
  }
  return map;
}

function readClaimWikiUrls() {
  const payload = readJson(CLAIMS_PATH);
  const items = payload?.items && typeof payload.items === "object" ? payload.items : {};
  const out = new Map();
  for (const [geo, row] of Object.entries(items)) {
    const iso = String(geo || "").toUpperCase();
    const wikiUrl = String(row?.wiki_row_url || "").trim();
    if (/^[A-Z]{2}$/.test(iso) && /^https?:\/\/.+/i.test(wikiUrl)) {
      out.set(iso, wikiUrl);
    }
  }
  return out;
}

function mergeUniverse(existingItems, urlByName, claimWikiUrls) {
  return existingItems.map((row) => {
    const iso2 = String(row?.iso2 || "").toUpperCase();
    const country = String(row?.country || row?.country_name || iso2);
    const key = normalizeName(country);
    const discovered = urlByName.get(key) || "";
    const prev = String(row?.wiki_page_url || row?.expected_wiki_url || "").trim();
    const claimWikiUrl = String(claimWikiUrls.get(iso2) || "").trim();
    const prefersClaim = !row?.from_cannabis_by_country;
    const wikiPageUrl = prefersClaim ? claimWikiUrl || prev || discovered || "" : prev || discovered || claimWikiUrl || "";
    const sources = Array.isArray(row?.sources) ? row.sources.slice() : [];
    if (discovered && !sources.includes(SOURCE_URL)) {
      sources.push(SOURCE_URL);
    }
    return {
      ...row,
      iso2,
      country,
      country_name: String(row?.country_name || country),
      wiki_page_url: wikiPageUrl || null,
      expected_wiki_url: wikiPageUrl || String(row?.expected_wiki_url || ""),
      expected_wiki_page_url: wikiPageUrl || null,
      source_rank: wikiPageUrl ? "DISCOVERY_WIKI" : String(row?.source_rank || "UNSOURCED"),
      sources,
      from_cannabis_by_country: Boolean(discovered || row?.from_cannabis_by_country)
    };
  });
}

async function main() {
  const existing = readJson(OUT);
  const existingItems = Array.isArray(existing?.items) ? existing.items : [];
  if (existingItems.length === 0) {
    console.log("WIKI_PAGES_DISCOVERY_OK=0");
    console.log("WIKI_PAGES_DISCOVERY_REASON=MISSING_UNIVERSE_FILE");
    process.exit(2);
  }

  let links = [];
  let fetchError = null;
  try {
    links = await fetchCountryLinks();
  } catch (e) {
    fetchError = String(e?.message || e);
  }
  const urlByName = buildNameToUrlMap(links);
  const claimWikiUrls = readClaimWikiUrls();
  const merged = mergeUniverse(existingItems, urlByName, claimWikiUrls);
  const payload = {
    ...existing,
    unsourced_list: 1,
    source_url: SOURCE_URL,
    fetched_at: new Date().toISOString(),
    fetch_error: fetchError,
    items: merged
  };

  const canWrite = process.env.UPDATE_MODE === "1" && process.env.SSOT_WRITE === "1";
  if (canWrite) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`WIKI_PAGES_DISCOVERY_WRITTEN=${OUT}`);
  }
  console.log(`WIKI_PAGES_DISCOVERY_TOTAL=${merged.length}`);
  console.log(
    `WIKI_PAGES_DISCOVERY_LINKED=${merged.filter((row) => String(row?.wiki_page_url || "").startsWith("http")).length}`
  );
  console.log(`WIKI_PAGES_DISCOVERY_ERROR=${fetchError ? 1 : 0}`);
  console.log("WIKI_PAGES_DISCOVERY_OK=1");
}

main();

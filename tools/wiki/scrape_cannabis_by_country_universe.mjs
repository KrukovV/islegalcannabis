#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "ssot", "wiki_pages_universe.json");
const SOURCE_URL = "https://en.wikipedia.org/wiki/Cannabis_by_country";
const ALL_GEO_PATH = path.join(ROOT, "apps", "web", "src", "lib", "geo", "allGeo.ts");
const CENTROIDS_PATH = path.join(ROOT, "data", "centroids", "adm0.json");
const CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const GEOJSON_PATH = path.join(ROOT, "data", "geojson", "ne_50m_admin_0_countries.geojson");

function loadIsoCountries() {
  const src = fs.readFileSync(ALL_GEO_PATH, "utf8");
  const match = src.match(/ALL_GEO\s*:\s*string\[\]\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((token) => token.trim().replace(/^['"]|['"]$/g, ""))
    .filter((geo) => /^[A-Z]{2}$/.test(geo) && geo !== "US")
    .sort();
}

function loadCountryNames() {
  const centroidsPayload = JSON.parse(fs.readFileSync(CENTROIDS_PATH, "utf8"));
  const items = centroidsPayload?.items || {};
  const out = new Map();
  for (const [iso, row] of Object.entries(items)) {
    const key = String(iso || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(key) || key === "US") continue;
    out.set(key, String(row?.name || key));
  }
  if (fs.existsSync(CLAIMS_PATH)) {
    const claimsPayload = JSON.parse(fs.readFileSync(CLAIMS_PATH, "utf8"));
    const claimsItems = claimsPayload?.items || {};
    for (const [geo, row] of Object.entries(claimsItems)) {
      const iso = String(geo || "").toUpperCase();
      if (!/^[A-Z]{2}$/.test(iso) || iso === "US") continue;
      const name = String(
        row?.country || row?.name || row?.geo_name || ""
      ).trim();
      if (name) out.set(iso, name);
    }
  }
  if (fs.existsSync(GEOJSON_PATH)) {
    const geo = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
    const features = Array.isArray(geo?.features) ? geo.features : [];
    for (const feature of features) {
      const props = feature?.properties || {};
      const iso = String(props.ISO_A2 || props.iso_a2 || "").toUpperCase();
      if (!/^[A-Z]{2}$/.test(iso) || iso === "US") continue;
      const name = String(props.NAME || props.name || "").trim();
      if (!name) continue;
      if (!out.has(iso) || out.get(iso) === iso) {
        out.set(iso, name);
      }
    }
  }
  return out;
}

function loadClaimWikiUrls() {
  if (!fs.existsSync(CLAIMS_PATH)) return new Map();
  const claimsPayload = JSON.parse(fs.readFileSync(CLAIMS_PATH, "utf8"));
  const claimsItems = claimsPayload?.items || {};
  const out = new Map();
  for (const [geo, row] of Object.entries(claimsItems)) {
    const iso = String(geo || "").toUpperCase();
    const url = String(row?.wiki_row_url || "").trim();
    if (/^[A-Z]{2}$/.test(iso) && iso !== "US" && /^https?:\/\/.+/i.test(url)) {
      out.set(iso, url);
    }
  }
  return out;
}

function slugify(name) {
  return String(name || "")
    .replace(/[’']/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function fetchPageTitles() {
  const res = await fetch(SOURCE_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const html = await res.text();
  const titles = new Set();
  const re = /href="\/wiki\/([^"#:]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const title = decodeURIComponent(m[1] || "").trim();
    if (!title) continue;
    titles.add(title);
  }
  return titles;
}

function buildItems(isoCountries, names, pageTitles, claimWikiUrls) {
  return isoCountries.map((iso) => {
    const name = names.get(iso) || iso;
    const slug = slugify(name);
    const candidates = [
      slug,
      `Cannabis_in_${slug}`,
      `Cannabis_in_the_${slug}`
    ];
    const matched = candidates.find((c) => pageTitles.has(c)) || null;
    const claimWikiUrl = String(claimWikiUrls.get(iso) || "").trim();
    const expectedUrl = matched
      ? `https://en.wikipedia.org/wiki/${matched}`
      : claimWikiUrl || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(name).replaceAll(" ", "_"))}`;
    const expectedSlug = (() => {
      try {
        return decodeURIComponent(new URL(expectedUrl).pathname.split("/wiki/")[1] || "");
      } catch {
        return matched || candidates[0];
      }
    })();
    return {
      iso2: iso,
      country_name: name,
      expected_wiki_slug: expectedSlug,
      expected_wiki_url: expectedUrl,
      from_cannabis_by_country: Boolean(matched)
    };
  });
}

async function main() {
  const isoCountries = loadIsoCountries();
  const names = loadCountryNames();
  const claimWikiUrls = loadClaimWikiUrls();
  let titles = new Set();
  let fetchError = null;
  try {
    titles = await fetchPageTitles();
  } catch (e) {
    fetchError = String(e?.message || e);
  }

  const items = buildItems(isoCountries, names, titles, claimWikiUrls);
  const payload = {
    unsourced_list: 1,
    source_url: SOURCE_URL,
    fetched_at: new Date().toISOString(),
    fetch_error: fetchError,
    iso_total: isoCountries.length,
    matched_from_source: items.filter((x) => x.from_cannabis_by_country).length,
    items
  };

  const canWrite = process.env.UPDATE_MODE === "1" && process.env.SSOT_WRITE === "1";
  if (canWrite) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`WIKI_PAGES_UNIVERSE_WRITTEN=${OUT}`);
  }
  console.log(`WIKI_PAGES_UNIVERSE_TOTAL=${items.length}`);
  console.log(`WIKI_PAGES_UNIVERSE_MATCHED=${payload.matched_from_source}`);
  console.log(`WIKI_PAGES_UNIVERSE_ERROR=${fetchError ? 1 : 0}`);
}

main();

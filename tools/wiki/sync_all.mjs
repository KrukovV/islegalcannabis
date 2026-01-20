import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readWikiClaimsSnapshot } from "./wiki_claims_store.mjs";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const REFS_SSOT_PATH = path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json");
const OUTPUT_CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.json");
const OUTPUT_CLAIMS_MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const OUTPUT_REFS_PATH = path.join(ROOT, "data", "wiki", "wiki_refs.json");
const OFFICIAL_BADGES_PATH = path.join(ROOT, "data", "wiki", "wiki_official_badges.json");

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

function normalizeMainArticles(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return { title: entry, url: "" };
      if (entry && typeof entry === "object") {
        return {
          title: String(entry.title || entry.name || ""),
          url: String(entry.url || "")
        };
      }
      return null;
    })
    .filter((entry) => entry && entry.title);
}

function normalizeClaim(entry, fallbackFetchedAt) {
  if (!entry || typeof entry !== "object") return null;
  const geo = String(entry.geo || entry.geo_key || entry.geoKey || entry.geo_id || "").toUpperCase();
  if (!geo) return null;
  return {
    geo_id: geo,
    rec_status: String(
      entry.recreational_status || entry.wiki_rec || entry.rec_status || "Unknown"
    ),
    med_status: String(
      entry.medical_status || entry.wiki_med || entry.med_status || "Unknown"
    ),
    recreational_status: String(
      entry.recreational_status || entry.wiki_rec || entry.rec_status || "Unknown"
    ),
    medical_status: String(
      entry.medical_status || entry.wiki_med || entry.med_status || "Unknown"
    ),
    notes_text: String(entry.notes_text || entry.notes_raw || entry.notes || ""),
    main_articles: normalizeMainArticles(entry.main_articles || entry.notes_main_articles),
    row_ref: String(entry.row_ref || entry.wiki_row_ref || entry.rowRef || ""),
    wiki_revision_id: String(entry.wiki_revision_id || entry.revision_id || ""),
    fetched_at: String(entry.fetched_at || entry.updated_at || fallbackFetchedAt || "")
  };
}

function normalizeRefsPayload(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.items && typeof payload.items === "object") {
    return Object.values(payload.items);
  }
  return [];
}

function normalizeRef(entry) {
  if (!entry || typeof entry !== "object") return null;
  const url = String(entry.url || "").trim();
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = "";
  }
  return {
    url,
    title: String(entry.title || entry.title_hint || ""),
    publisher: String(entry.publisher || entry.host || ""),
    section_hint: String(entry.section_hint || entry.section || ""),
    host
  };
}

function loadIsoEntries() {
  const payload = readJson(ISO_PATH, null);
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  return entries
    .map((entry) => String(entry?.alpha2 || entry?.id || "").toUpperCase())
    .filter(Boolean);
}

function loadOfficialBadgeTotals() {
  if (!fs.existsSync(OFFICIAL_BADGES_PATH)) return { official: 0 };
  try {
    const payload = JSON.parse(fs.readFileSync(OFFICIAL_BADGES_PATH, "utf8"));
    const totals = payload?.totals || {};
    return {
      official: Number(totals.official || 0) || 0,
      non_official: Number(totals.non_official || 0) || 0
    };
  } catch {
    return { official: 0, non_official: 0 };
  }
}

function readClaimsMap(file) {
  const payload = readJson(file, null);
  if (!payload || typeof payload !== "object") return {};
  if (payload.items && typeof payload.items === "object" && !Array.isArray(payload.items)) {
    return payload.items;
  }
  if (Array.isArray(payload)) {
    const map = {};
    for (const entry of payload) {
      const geo = String(entry?.geo_id || entry?.geo || entry?.geo_key || "").toUpperCase();
      if (!geo) continue;
      map[geo] = entry;
    }
    return map;
  }
  return {};
}

function normalizeForCompare(entry) {
  if (!entry || typeof entry !== "object") return "";
  const clone = { ...entry };
  delete clone.fetched_at;
  return JSON.stringify(clone);
}

async function main() {
  const runAt = new Date().toISOString();
  const refresh = spawnSync(process.execPath, [path.join(ROOT, "tools", "wiki", "wiki_refresh.mjs")], {
    stdio: "inherit"
  });
  if (refresh.status !== 0) {
    process.exit(refresh.status ?? 1);
  }

  const previousClaims = readClaimsMap(OUTPUT_CLAIMS_PATH);
  const claimsSnapshot = readWikiClaimsSnapshot() || [];
  const claimsByGeo = {};
  let revisionId = "";
  for (const item of claimsSnapshot) {
    const normalized = normalizeClaim(item, runAt);
    if (!normalized) continue;
    claimsByGeo[normalized.geo_id] = normalized;
    if (!revisionId && normalized.wiki_revision_id) {
      revisionId = normalized.wiki_revision_id;
    }
  }

  writeAtomic(OUTPUT_CLAIMS_PATH, {
    generated_at: runAt,
    items: claimsByGeo
  });
  writeAtomic(OUTPUT_CLAIMS_MAP_PATH, {
    generated_at: runAt,
    items: claimsByGeo
  });

  const refsPayload = readJson(REFS_SSOT_PATH, null);
  const refItems = normalizeRefsPayload(refsPayload);
  const refsByGeo = {};
  let refsTotal = 0;
  for (const item of refItems) {
    const geo = String(item?.geo_key || item?.geo || item?.geo_id || "").toUpperCase();
    if (!geo) continue;
    const refs = Array.isArray(item?.refs) ? item.refs : [];
    const normalizedRefs = [];
    for (const ref of refs) {
      const normalized = normalizeRef(ref);
      if (!normalized) continue;
      normalizedRefs.push(normalized);
    }
    refsTotal += normalizedRefs.length;
    refsByGeo[geo] = normalizedRefs;
  }

  writeAtomic(OUTPUT_REFS_PATH, {
    generated_at: runAt,
    items: refsByGeo
  });

  const isoEntries = loadIsoEntries();
  const mainArticlesTotal = Object.values(claimsByGeo).reduce((sum, claim) => {
    const list = Array.isArray(claim?.main_articles) ? claim.main_articles : [];
    return sum + list.length;
  }, 0);
  const claimKeys = new Set(Object.keys(claimsByGeo));
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  for (const code of isoEntries) {
    const current = claimsByGeo[code];
    if (!current) {
      failed += 1;
      continue;
    }
    const prev = previousClaims[code];
    if (prev) {
      const prevNorm = normalizeForCompare(prev);
      const currNorm = normalizeForCompare(current);
      if (prevNorm === currNorm) unchanged += 1;
      else updated += 1;
    } else {
      updated += 1;
    }
  }
  const geosTotal = isoEntries.length;
  const officialTotals = loadOfficialBadgeTotals();

  console.log(
    `WIKI_SYNC: geos=${geosTotal} claims_ok=${geosTotal - failed} main_articles_total=${mainArticlesTotal} refs_total=${refsTotal}`
  );
  console.log(`WIKI_LINKS: extracted=${refsTotal} stored=${refsTotal}`);
  console.log(
    `REFS_SPLIT: official=${officialTotals.official} non_official=${officialTotals.non_official || 0}`
  );
  console.log(
    `OFFICIAL_BADGE: official_links=${officialTotals.official} non_official=${officialTotals.non_official || 0}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

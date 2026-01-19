import fs from "node:fs";
import path from "node:path";
import { classifyOfficialUrl } from "../sources/validate_official_url.mjs";

const ROOT = process.cwd();
const REFS_PATH = path.join(ROOT, "data", "wiki", "wiki_refs.json");
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "wiki_official_badges.json");

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

function normalizeRefsPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (payload.items && typeof payload.items === "object" && !Array.isArray(payload.items)) {
    return payload.items;
  }
  if (Array.isArray(payload)) {
    const map = {};
    for (const item of payload) {
      const geo = String(item?.geo || item?.geo_key || item?.geo_id || "").toUpperCase();
      if (!geo) continue;
      const refs = Array.isArray(item?.refs) ? item.refs : [];
      map[geo] = refs;
    }
    return map;
  }
  return {};
}

function hostForUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function main() {
  const runAt = new Date().toISOString();
  const payload = readJson(REFS_PATH, null);
  const refsByGeo = normalizeRefsPayload(payload);
  const results = {};
  let totalRefs = 0;
  let officialTotal = 0;
  let nonOfficialTotal = 0;
  const hostCounts = new Map();

  for (const [geo, refs] of Object.entries(refsByGeo)) {
    const list = Array.isArray(refs) ? refs : [];
    const entries = [];
    for (const ref of list) {
      const url = String(ref?.url || "").trim();
      if (!url) continue;
      totalRefs += 1;
      const iso2 = geo.split("-")[0] || geo;
      const classified = classifyOfficialUrl(url, undefined, { iso2 });
      const host = hostForUrl(url);
      if (classified.ok) {
        officialTotal += 1;
        if (host) hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
      } else {
        nonOfficialTotal += 1;
      }
      entries.push({
        url,
        title: String(ref?.title || ""),
        publisher: String(ref?.publisher || ""),
        section_hint: String(ref?.section_hint || ""),
        host,
        official_badge: Boolean(classified.ok),
        matched_rule: classified.ok
          ? String(classified.matched_rule || "gov_allowlist")
          : String(classified.reason || "not_official")
      });
    }
    results[geo] = entries;
  }

  const topHosts = Array.from(hostCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([host]) => host);

  writeAtomic(OUTPUT_PATH, {
    generated_at: runAt,
    totals: {
      total_refs: totalRefs,
      official: officialTotal,
      non_official: nonOfficialTotal
    },
    top_hosts: topHosts,
    items: results
  });

  const spotlightGeos = ["RU", "TH", "US-CA", "XK"];
  for (const geo of spotlightGeos) {
    const entries = Array.isArray(results[geo]) ? results[geo] : [];
    let official = 0;
    let nonOfficial = 0;
    const geoHosts = new Map();
    for (const entry of entries) {
      if (entry.official_badge) official += 1;
      else nonOfficial += 1;
      const host = String(entry.host || "");
      if (host) geoHosts.set(host, (geoHosts.get(host) || 0) + 1);
    }
    const geoTopHosts = Array.from(geoHosts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([host]) => host)
      .join(",");
    console.log(
      `OFFICIAL_BADGE: geo=${geo} official=${official} non_official=${nonOfficial} top_hosts=${geoTopHosts || "-"}`
    );
  }

  console.log(
    `WIKI_BADGES: geos=${Object.keys(results).length} refs_total=${totalRefs} official_refs_total=${officialTotal} non_official_refs_total=${nonOfficialTotal} top_hosts=${topHosts.join(",") || "-"}`
  );
  console.log(
    `OFFICIAL_BADGE: official_links=${officialTotal} non_official=${nonOfficialTotal}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SSOT_WRITE = process.env.SSOT_WRITE === "1";
const REFS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const CLAIMS_MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");
const ALLOWLIST_PATH = path.join(ROOT, "data", "sources", "allowlist_domains.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeAtomic(file, payload) {
  if (!SSOT_WRITE) {
    console.log("SSOT_READONLY=1");
    return;
  }
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${path.basename(file)}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + "\n");
  fs.renameSync(tmpPath, file);
}

function matchAllowlist(host, patterns) {
  if (!host) return false;
  for (const patternRaw of patterns) {
    const pattern = String(patternRaw || "").trim();
    if (!pattern) continue;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const re = new RegExp(`^${escaped}$`, "i");
    if (re.test(host)) return true;
  }
  return false;
}

async function main() {
  const printPerGeo = process.argv.includes("--print") || process.argv.includes("--diag");
  const payload = readJson(REFS_PATH, null);
  const items = payload?.items && typeof payload.items === "object" ? payload.items : {};
  const mapPayload = readJson(CLAIMS_MAP_PATH, null);
  const mapItems = mapPayload?.items && typeof mapPayload.items === "object" ? mapPayload.items : {};
  const allowlistPayload = readJson(ALLOWLIST_PATH, null);
  const allowlist = Array.isArray(allowlistPayload?.allowed) ? allowlistPayload.allowed : [];
  const mapKeys = Object.keys(mapItems);
  const geoKeys = mapKeys.length ? mapKeys : Object.keys(items);
  if (!geoKeys.length) {
    writeAtomic(OUTPUT_PATH, {
      fetched_at: new Date().toISOString(),
      totals: {
        total_refs: 0,
        official: 0,
        non_official: 0
      },
      top_hosts: [],
      top_denies: [],
      items: {}
    });
    console.log(
      "WIKI_OFFICIAL_EVAL: geo=ALL total_refs=0 official=0 non_official=0 top_hosts=- top_denies=-"
    );
    process.exit(0);
  }
  const runAt = new Date().toISOString();
  const results = {};
  const hostCounts = new Map();
  let totalRefs = 0;
  let officialTotal = 0;
  let nonOfficialTotal = 0;

  for (const geoKeyRaw of geoKeys) {
    const refs = items[geoKeyRaw];
    const geoKey = String(geoKeyRaw || "").toUpperCase();
    if (!geoKey) continue;
    const list = Array.isArray(refs) ? refs : [];
    const officialHosts = new Map();
    let geoTotal = 0;
    let geoOfficial = 0;
    let geoNonOfficial = 0;
    for (const ref of list) {
      const host = String(ref?.host || "").toLowerCase().replace(/^www\./, "");
      if (ref?.url) {
        totalRefs += 1;
        geoTotal += 1;
      }
      if (ref?.official) {
        officialTotal += 1;
        geoOfficial += 1;
        if (host) officialHosts.set(host, (officialHosts.get(host) || 0) + 1);
      } else {
        nonOfficialTotal += 1;
        geoNonOfficial += 1;
      }
    }
    const topHosts = Array.from(officialHosts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([host]) => host);
    for (const host of topHosts) {
      hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
    }
    results[geoKey] = {
      geo_key: geoKey,
      sources_total: geoTotal,
      sources_official: geoOfficial,
      total_refs: geoTotal,
      official: geoOfficial,
      non_official: geoNonOfficial,
      official_badge: geoOfficial > 0 ? 1 : 0,
      top_official_domains: topHosts,
      top_official_hosts: topHosts,
      last_checked_at: runAt
    };
  }

  const topHosts = Array.from(hostCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([host]) => host);
  const totalGeo = geoKeys.length;
  const withBadge = Object.values(results).filter((entry) => entry?.official_badge === 1).length;

  writeAtomic(OUTPUT_PATH, {
    fetched_at: runAt,
    totals: {
      total_refs: totalRefs,
      official: officialTotal,
      non_official: nonOfficialTotal,
      countries: totalGeo,
      total_geo: totalGeo,
      with_badge: withBadge
    },
    top_hosts: topHosts,
    items: results
  });

  console.log(
    `OFFICIAL_BADGE: total_links=${totalRefs} official_links=${officialTotal} non_official_links=${nonOfficialTotal} top_official_domains=${topHosts.join(",") || "-"}`
  );
  console.log(
    `OFFICIAL_BADGE_TOTALS total_geo=${totalGeo} with_badge=${withBadge} official_refs=${officialTotal} non_official_refs=${nonOfficialTotal} refs=${totalRefs} countries=${totalGeo}`
  );
  const caRefs = Array.isArray(items["CA"]) ? items["CA"] : [];
  if (caRefs.length) {
    const caHosts = new Map();
    for (const ref of caRefs) {
      const host = String(ref?.host || "").toLowerCase().replace(/^www\./, "");
      if (!host) continue;
      caHosts.set(host, (caHosts.get(host) || 0) + 1);
    }
    const topDomains = Array.from(caHosts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([host]) => host);
    const allowlistHits = topDomains.filter((host) => matchAllowlist(host, allowlist));
    const allowlistMiss = topDomains.filter((host) => !matchAllowlist(host, allowlist));
    console.log(
      `OFFICIAL_BADGE_CA_DOMAINS top_domains=${topDomains.join(",") || "-"} allowlist_hits=${allowlistHits.join(",") || "-"} allowlist_miss=${allowlistMiss.join(",") || "-"}`
    );
  } else {
    console.log("OFFICIAL_BADGE_CA_DOMAINS top_domains=- allowlist_hits=- allowlist_miss=-");
  }
  if (printPerGeo) {
    const ordered = Object.values(results)
      .sort((a, b) => String(a.geo_key || "").localeCompare(String(b.geo_key || "")));
    for (const entry of ordered) {
      const topDomains = Array.isArray(entry.top_official_domains) ? entry.top_official_domains.join(",") : "-";
      console.log(
        `OFFICIAL_BADGE geo=${entry.geo_key} official=${entry.sources_official} non_official=${entry.sources_total - entry.sources_official} total_refs=${entry.sources_total} top_official_domains=${topDomains || "-"}`
      );
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REFS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");

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

async function main() {
  const printPerGeo = process.argv.includes("--print");
  const payload = readJson(REFS_PATH, null);
  const items = payload?.items && typeof payload.items === "object" ? payload.items : {};
  const geoKeys = Object.keys(items);
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

  for (const [geoKeyRaw, refs] of Object.entries(items)) {
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
      official_badge: geoOfficial > 0 ? 1 : 0,
      top_official_domains: topHosts,
      last_checked_at: runAt
    };
  }

  const topHosts = Array.from(hostCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([host]) => host);

  writeAtomic(OUTPUT_PATH, {
    fetched_at: runAt,
    totals: {
      total_refs: totalRefs,
      official: officialTotal,
      non_official: nonOfficialTotal
    },
    top_hosts: topHosts,
    items: results
  });

  console.log(
    `OFFICIAL_BADGE: total_links=${totalRefs} official_links=${officialTotal} non_official_links=${nonOfficialTotal} top_official_domains=${topHosts.join(",") || "-"}`
  );
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

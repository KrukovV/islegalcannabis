import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const REFS_PATHS = [
  path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json"),
  path.join(ROOT, "data", "wiki", "wiki_refs.json")
];
const CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const ENRICHED_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const BADGES_PATH = path.join(ROOT, "data", "wiki", "wiki_official_badges.json");
const OFFICIAL_EVAL_PATH = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");
const ALLOWLIST_PATH = path.join(ROOT, "data", "sources", "official_allowlist.json");
const OFFICIAL_SSOT_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const SUMMARY_PATH = path.join(ROOT, "Reports", "official_domains_summary.txt");
const DIFF_PATH = path.join(ROOT, "Reports", "official_domains_diff.txt");
const DIFF_JSON_PATH = path.join(ROOT, "Reports", "official_diff.json");
const CANDIDATES_PATH = path.join(ROOT, "Reports", "official_candidates.txt");
const GEO_BREAKDOWN_PATH = path.join(ROOT, "Reports", "official_geo_breakdown.json");
const OFFICIAL_COVERAGE_BASELINE_PATH = path.join(
  ROOT,
  "Reports",
  "official_coverage.baseline.json"
);
const OFFICIAL_REFS_BASELINE_PATH = path.join(
  ROOT,
  "Reports",
  "official_refs_dangling.baseline.json"
);
const OFFICIAL_REFS_DANGLING_PATH = path.join(
  ROOT,
  "Reports",
  "official_refs_dangling.txt"
);
const OFFICIAL_EXPECTED = 413;

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function normalizeHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!raw.includes("://")) {
    return raw.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "");
  }
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildAllowlist() {
  const payload = readJson(ALLOWLIST_PATH, { domains: [] });
  return new Set(
    []
      .concat(payload?.domains || [])
      .map((entry) => String(entry || "").toLowerCase().replace(/^www\./, ""))
      .filter(Boolean)
  );
}

function findLatestAllowlistBackup() {
  const dir = path.dirname(ALLOWLIST_PATH);
  const base = path.basename(ALLOWLIST_PATH);
  if (!fs.existsSync(dir)) return null;
  const candidates = fs
    .readdirSync(dir)
    .filter((file) => file.startsWith(`${base}.bak.`))
    .map((file) => path.join(dir, file))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.file || null;
}

function guardAllowlistSize(allowlistSize, summaryLines) {
  const backupPath = findLatestAllowlistBackup();
  const backupPayload = backupPath
    ? readJson(backupPath, { domains: [] })
    : null;
  const prevDomains = Array.isArray(backupPayload?.domains)
    ? backupPayload.domains
    : null;
  const prevCount = prevDomains ? prevDomains.length : allowlistSize;
  const expectedMin = Math.max(50, Math.floor(prevCount * 0.7));
  if (allowlistSize < expectedMin) {
    summaryLines.push(
      `OFFICIAL_ALLOWLIST_GUARD_FAIL prev=${prevCount} new=${allowlistSize} reason=SHRUNK_TOO_MUCH`
    );
    return false;
  }
  summaryLines.push(
    `OFFICIAL_ALLOWLIST_GUARD_OK prev=${prevCount} new=${allowlistSize}`
  );
  return true;
}

function loadRefsPayload() {
  let fallback = null;
  for (const candidate of REFS_PATHS) {
    const payload = readJson(candidate, { items: {} });
    const items = payload?.items || payload;
    if (!items || typeof items !== "object") {
      continue;
    }
    const itemKeys = Object.keys(items);
    if (!itemKeys.length) {
      continue;
    }
    if (!fallback) {
      fallback = { path: candidate, payload };
    }
    let refsCount = 0;
    for (const value of Object.values(items)) {
      if (Array.isArray(value)) refsCount += value.length;
    }
    if (refsCount > 0) {
      return { path: candidate, payload };
    }
  }
  return fallback ?? { path: REFS_PATHS[0], payload: { items: {} } };
}

function main() {
  const refsSource = loadRefsPayload();
  const refsPayload = refsSource.payload;
  const claimsPayload = readJson(CLAIMS_PATH, { items: {} });
  const enrichedPayload = readJson(ENRICHED_PATH, { items: {} });
  const badgesPayload = readJson(BADGES_PATH, { items: {} });
  const officialEvalPayload = readJson(OFFICIAL_EVAL_PATH, { items: {} });
  const allowlist = buildAllowlist();
  const officialPayload = readJson(OFFICIAL_SSOT_PATH, { domains: [] });
  const officialItems = Array.isArray(officialPayload?.domains)
    ? officialPayload.domains
    : [];
  const officialDomains = new Set(
    officialItems.map((entry) => normalizeHost(entry)).filter(Boolean)
  );
  const officialCount = officialItems.length;
  const wikipediaDomains = officialItems.filter((entry) =>
    String(entry || "").toLowerCase().endsWith("wikipedia.org")
  );
  if (wikipediaDomains.length > 0) {
    console.log(`OFFICIAL_INVALID_DOMAIN wikipedia.org count=${wikipediaDomains.length}`);
    process.exit(2);
  }
  if (officialCount !== OFFICIAL_EXPECTED) {
    console.log(`OFFICIAL_ITEMS_PRESENT=${officialCount}`);
    console.log(`OFFICIAL_BASELINE_CHANGED expected=${OFFICIAL_EXPECTED} got=${officialCount}`);
    process.exit(2);
  }
  const officialHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(officialItems))
    .digest("hex")
    .slice(0, 12);
  console.log(`OFFICIAL_BASELINE_COUNT=${officialCount}`);
  console.log(`OFFICIAL_SHA=${officialHash}`);
  const items = refsPayload?.items || refsPayload || {};
  const claimItems = claimsPayload?.items || {};
  const enrichedItems = enrichedPayload?.items || {};
  const badgesItems = badgesPayload?.items || {};
  const evalItems = officialEvalPayload?.items || {};
  const hasBadges = Object.keys(badgesItems || {}).length > 0;
  const allGeos = Object.keys(claimItems);
  const candidateGeos = ["CA", "AU", "RO", "RU"];
  const domainCounts = new Map();
  const allowlistCounts = new Map();
  const missingCounts = new Map();
  const perGeoMissing = new Map();
  const candidateDomainCounts = new Map();
  const candidateExamples = new Map();
  const usedOfficialDomains = new Set();
  let totalLinks = 0;
  let allowlistedDomains = 0;
  let officialHits = 0;
  let officialGeos = 0;
  const missingGeos = [];
  let coveredTotal = 0;
  let coveredCountries = 0;
  let coveredStates = 0;
  let invalidUrls = 0;

  for (const geo of allGeos) {
    const refs = Array.isArray(items[geo]) ? items[geo] : [];
    const officialRefs = Array.isArray(badgesItems[geo])
      ? badgesItems[geo]
      : [];
    let geoOfficial = 0;
    let geoOfficialUrls = 0;
    const geoMissing = new Map();
    for (const ref of refs) {
      const url = String(ref?.url || "");
      if (!url) continue;
      totalLinks += 1;
      const host = normalizeHost(url);
      if (!host) {
        invalidUrls += 1;
        continue;
      }
      domainCounts.set(host, (domainCounts.get(host) || 0) + 1);
      if (candidateGeos.includes(geo)) {
        const geoKey = geo.toUpperCase();
        if (!candidateDomainCounts.has(geoKey)) {
          candidateDomainCounts.set(geoKey, new Map());
          candidateExamples.set(geoKey, new Map());
        }
        const counts = candidateDomainCounts.get(geoKey);
        const examples = candidateExamples.get(geoKey);
        counts.set(host, (counts.get(host) || 0) + 1);
        if (!examples.has(host)) {
          examples.set(host, url);
        }
      }
      if (allowlist.has(host)) {
        allowlistedDomains += 1;
        officialHits += 1;
        geoOfficial += 1;
        allowlistCounts.set(host, (allowlistCounts.get(host) || 0) + 1);
      } else {
        missingCounts.set(host, (missingCounts.get(host) || 0) + 1);
        geoMissing.set(host, (geoMissing.get(host) || 0) + 1);
      }
    }
    if (hasBadges) {
      for (const ref of officialRefs) {
        const url = String(ref?.url || "");
        if (!url) continue;
        const host = normalizeHost(url);
        if (!host || host.endsWith("wikipedia.org")) continue;
        if (ref?.official_badge && officialDomains.has(host)) {
          geoOfficialUrls += 1;
          usedOfficialDomains.add(host);
        }
      }
    } else {
      const evalEntry = evalItems[geo] || {};
      geoOfficialUrls = Number(evalEntry?.sources_official ?? evalEntry?.official ?? 0) || 0;
    }
    if (geoOfficial > 0) officialGeos += 1;
    if (geoOfficialUrls > 0) {
      coveredTotal += 1;
      if (/^[A-Z]{2}-/.test(geo)) {
        coveredStates += 1;
      } else {
        coveredCountries += 1;
      }
    } else {
      missingGeos.push(geo);
    }
    if (geoMissing.size > 0) {
      perGeoMissing.set(geo, geoMissing);
    }
  }

  const uniqueDomains = domainCounts.size;
  const summaryLines = [];
  const diffLines = [];
  const missingLinks = Math.max(0, totalLinks - officialHits);
  summaryLines.push(
    `OFFICIAL_DOMAINS_TOTAL geos=${allGeos.length} refs=${totalLinks} unique_domains=${uniqueDomains} allowlisted_domains=${allowlist.size} invalid_urls=${invalidUrls} total=${totalLinks} matched=${officialHits} missing=${missingLinks}`
  );
  summaryLines.push(`OFFICIAL_SSOT_SHA12=${officialHash}`);
  summaryLines.push(`OFFICIAL_ALLOWLIST_SIZE domains=${allowlist.size}`);
  const guardOk = guardAllowlistSize(allowlist.size, summaryLines);
  const total = allGeos.length;
  const missing = Math.max(0, total - coveredTotal);
  const coveredLine = `OFFICIAL_COVERED_COUNTRIES=${coveredCountries}`;
  summaryLines.push(coveredLine);
  summaryLines.push(`OFFICIAL_COVERAGE covered=${coveredTotal} missing=${missing} total=${total}`);
  summaryLines.push(`OFFICIAL_GEOS_WITH_URLS_TOTAL=${coveredTotal}`);
  summaryLines.push(`OFFICIAL_GEOS_WITH_URLS_COUNTRIES=${coveredCountries}`);
  summaryLines.push(`OFFICIAL_GEOS_WITH_URLS_STATES=${coveredStates}`);
  const missingTop = missingGeos.slice().sort().slice(0, 20);
  summaryLines.push(
    `OFFICIAL_GEOS_WITHOUT_URLS_TOP20=${missingTop.length ? missingTop.join(",") : "-"}`
  );
  const coverageRatio = allGeos.length
    ? (coveredTotal / allGeos.length).toFixed(3)
    : "0.000";
  summaryLines.push(
    `OFFICIAL_GEO_COVERAGE total_geo=${allGeos.length} official_geo=${coveredTotal} ratio=${coverageRatio}`
  );

  let coverageGuardOk = true;
  const coverageBaseline = readJson(OFFICIAL_COVERAGE_BASELINE_PATH, null);
  const baselineCoveredRaw =
    coverageBaseline && typeof coverageBaseline.covered_total === "number"
      ? Number(coverageBaseline.covered_total) || 0
      : null;
  if (baselineCoveredRaw !== null && !(baselineCoveredRaw === 0 && coveredTotal > 0)) {
    const baselineCovered = baselineCoveredRaw;
    if (coveredTotal < baselineCovered) {
      summaryLines.push(
        `OFFICIAL_COVERAGE_GUARD status=FAIL baseline=${baselineCovered} current=${coveredTotal} reason=SHRINK`
      );
      coverageGuardOk = false;
    } else {
      summaryLines.push(
        `OFFICIAL_COVERAGE_GUARD status=PASS baseline=${baselineCovered} current=${coveredTotal}`
      );
    }
  } else {
    writeJson(OFFICIAL_COVERAGE_BASELINE_PATH, {
      generated_at: new Date().toISOString(),
      covered_total: coveredTotal,
      covered_countries: coveredCountries,
      covered_states: coveredStates,
      total_geo: total,
    });
    summaryLines.push(
      `OFFICIAL_COVERAGE_GUARD status=BOOTSTRAP baseline=${coveredTotal} current=${coveredTotal}`
    );
  }

  const officialRefsTotal = officialDomains.size;
  const officialRefsUsed = usedOfficialDomains.size;
  const officialRefsDangling = Math.max(0, officialRefsTotal - officialRefsUsed);
  const danglingList = Array.from(officialDomains)
    .filter((host) => !usedOfficialDomains.has(host))
    .sort()
    .slice(0, 50);
  summaryLines.push(`OFFICIAL_REFS_TOTAL=${officialRefsTotal}`);
  summaryLines.push(`OFFICIAL_REFS_USED=${officialRefsUsed}`);
  summaryLines.push(`OFFICIAL_REFS_DANGLING=${officialRefsDangling}`);
  summaryLines.push(
    `OFFICIAL_REFS_DANGLING_TOP50=${danglingList.length ? danglingList.join(",") : "-"}`
  );
  writeJson(OFFICIAL_REFS_DANGLING_PATH, {
    generated_at: new Date().toISOString(),
    dangling_total: officialRefsDangling,
    dangling: danglingList,
  });
  let refsGuardOk = true;
  const refsBaseline = readJson(OFFICIAL_REFS_BASELINE_PATH, null);
  const baselineDanglingRaw =
    refsBaseline && typeof refsBaseline.dangling_total === "number"
      ? Number(refsBaseline.dangling_total) || 0
      : null;
  const baselineRefsTotal =
    refsBaseline && typeof refsBaseline.refs_total === "number"
      ? Number(refsBaseline.refs_total) || 0
      : 0;
  if (
    baselineDanglingRaw !== null &&
    !(baselineRefsTotal === 0 && officialRefsTotal > 0)
  ) {
    const baselineDangling = baselineDanglingRaw;
    if (officialRefsDangling > baselineDangling) {
      summaryLines.push(
        `OFFICIAL_REFS_DANGLING_GUARD status=FAIL baseline=${baselineDangling} current=${officialRefsDangling} reason=INCREASED`
      );
      refsGuardOk = false;
    } else {
      summaryLines.push(
        `OFFICIAL_REFS_DANGLING_GUARD status=PASS baseline=${baselineDangling} current=${officialRefsDangling}`
      );
    }
  } else {
    writeJson(OFFICIAL_REFS_BASELINE_PATH, {
      generated_at: new Date().toISOString(),
      dangling_total: officialRefsDangling,
      refs_total: officialRefsTotal,
      refs_used: officialRefsUsed,
    });
    summaryLines.push(
      `OFFICIAL_REFS_DANGLING_GUARD status=BOOTSTRAP baseline=${officialRefsDangling} current=${officialRefsDangling}`
    );
  }

  const topDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20);
  summaryLines.push("TOP_DOMAINS");
  for (const [host, count] of topDomains) {
    summaryLines.push(`${host} ${count}`);
  }

  const topAllowlist = Array.from(allowlistCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20);
  summaryLines.push("TOP_ALLOWLIST_HITS");
  for (const [host, count] of topAllowlist) {
    summaryLines.push(`${host} ${count}`);
  }

  const missingDomains = Array.from(missingCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 50);
  const matchedDomains = Array.from(allowlistCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 50);
  const diffTopLine = `OFFICIAL_DIFF_TOP_MISSING count=${missingDomains.length} file=${path.relative(
    ROOT,
    DIFF_PATH
  )}`;
  const diffMatchedLine = `OFFICIAL_DIFF_TOP_MATCHED count=${matchedDomains.length} file=${path.relative(
    ROOT,
    DIFF_PATH
  )}`;
  const diffGeoLine = `OFFICIAL_DIFF_BY_GEO sample=${candidateGeos.join(
    ","
  )} file=${path.relative(ROOT, CANDIDATES_PATH)}`;
  summaryLines.push(diffTopLine);
  summaryLines.push(diffMatchedLine);
  summaryLines.push(diffGeoLine);
  const geoMissingSorted = Array.from(perGeoMissing.entries())
    .map(([geo, map]) => ({
      geo,
      missing: Array.from(map.values()).reduce((sum, value) => sum + value, 0),
      top: Array.from(map.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([host]) => host)
    }))
    .sort((a, b) => b.missing - a.missing || a.geo.localeCompare(b.geo))
    .slice(0, 30);
  const geoTopLine = `OFFICIAL_GEO_TOP_MISSING n=${geoMissingSorted.length} by=missing_domains`;
  summaryLines.push(geoTopLine);
  for (const entry of geoMissingSorted) {
    summaryLines.push(
      `OFFICIAL_GEO_MISSING geo=${entry.geo} missing=${entry.missing} top_missing=${entry.top.join(",")}`
    );
  }
  summaryLines.push("TOP_MISSING_DOMAINS");
  for (const [host, count] of missingDomains) {
    summaryLines.push(`${host} ${count}`);
    diffLines.push(`${host} ${count}`);
  }
  summaryLines.push("TOP_MATCHED_DOMAINS");
  for (const [host, count] of matchedDomains) {
    summaryLines.push(`${host} ${count}`);
    diffLines.push(`MATCHED ${host} ${count}`);
  }

  fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, summaryLines.join("\n") + "\n");
  fs.writeFileSync(DIFF_PATH, diffLines.join("\n") + "\n");
  fs.writeFileSync(
    DIFF_JSON_PATH,
    JSON.stringify(
      {
        totals: {
          geos: allGeos.length,
          refs: totalLinks,
          unique_domains: uniqueDomains,
          allowlisted_domains: allowlist.size,
          matched: officialHits,
          missing: missingLinks,
          invalid_urls: invalidUrls
        },
        topMissing: missingDomains,
        topMatched: matchedDomains
      },
      null,
      2
    ) + "\n"
  );

  const candidateLines = [];
  for (const geo of candidateGeos) {
    const geoKey = geo.toUpperCase();
    const counts = candidateDomainCounts.get(geoKey) || new Map();
    const examples = candidateExamples.get(geoKey) || new Map();
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20);
    candidateLines.push(
      `CANDIDATE_GEO geo=${geoKey} total_refs=${Array.from(counts.values()).reduce((a, b) => a + b, 0)} unique_domains=${counts.size}`
    );
    for (const [host, count] of sorted) {
      const example = String(examples.get(host) || "-").replace(/\s+/g, " ");
      candidateLines.push(
        `CANDIDATE_DOMAIN geo=${geoKey} host=${host} count=${count} example=${example}`
      );
    }
  }
  fs.writeFileSync(CANDIDATES_PATH, candidateLines.join("\n") + "\n");
  const geoBreakdown = [];
  for (const [geo, missingMap] of perGeoMissing.entries()) {
    const entries = Array.from(missingMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3);
    geoBreakdown.push({
      geo,
      missing: entries.reduce((sum, entry) => sum + entry[1], 0),
      top_missing: entries.map(([host, count]) => ({ host, count }))
    });
  }
  fs.writeFileSync(
    GEO_BREAKDOWN_PATH,
    JSON.stringify(geoBreakdown, null, 2) + "\n"
  );

  const stdoutLines = [
    summaryLines[0],
    summaryLines[1],
    summaryLines[2],
    summaryLines[3],
    summaryLines[4],
    summaryLines[5],
    coveredLine,
    diffTopLine,
    diffMatchedLine,
    diffGeoLine,
    geoTopLine,
    `OFFICIAL_DIFF_JSON file=${path.relative(ROOT, DIFF_JSON_PATH)}`,
    `OFFICIAL_GEO_BREAKDOWN file=${path.relative(ROOT, GEO_BREAKDOWN_PATH)}`,
    `OFFICIAL_CANDIDATES report=${path.relative(ROOT, CANDIDATES_PATH)}`,
    "TOP_ALLOWLIST_HITS",
    ...topAllowlist.slice(0, 10).map(([host, count]) => `${host} ${count}`),
    "TOP_MISSING_DOMAINS",
    ...missingDomains.slice(0, 10).map(([host, count]) => `${host} ${count}`),
    "TOP_MATCHED_DOMAINS",
    ...matchedDomains.slice(0, 10).map(([host, count]) => `${host} ${count}`),
  ];
  for (const line of stdoutLines) {
    console.log(line);
  }
  if (!guardOk || !coverageGuardOk || !refsGuardOk) process.exit(1);
}

main();

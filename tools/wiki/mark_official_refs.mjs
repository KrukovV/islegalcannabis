import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WIKI_REFS_PATH = path.join(ROOT, "data", "wiki", "wiki_refs.json");
const WIKI_CLAIMS_MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const OFFICIAL_EVAL_PATH = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");
const ALLOWLIST_PATH = path.join(ROOT, "data", "sources", "official_allowlist.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function patternToRegex(pattern) {
  const escaped = String(pattern || "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function buildAllowlist() {
  const allowlist = readJson(ALLOWLIST_PATH, { domains: [], patterns: [] });
  const domains = new Set(
    []
      .concat(allowlist?.domains || [])
      .map((entry) => String(entry).toLowerCase().replace(/^www\./, ""))
  );
  const patterns = []
    .concat(allowlist?.patterns || [])
    .map((entry) => patternToRegex(entry));
  return { domains, patterns };
}

function isOfficial(host, allowlist) {
  if (!host) return { ok: false, rule: "none" };
  if (allowlist.domains.has(host)) return { ok: true, rule: "allowlist_domain" };
  for (const regex of allowlist.patterns) {
    if (regex.test(host)) return { ok: true, rule: "allowlist_pattern" };
  }
  return { ok: false, rule: "none" };
}

function main() {
  const refsPayload = readJson(WIKI_REFS_PATH, { items: {} });
  const claimsMapPayload = readJson(WIKI_CLAIMS_MAP_PATH, { items: {} });
  const claimsMap = claimsMapPayload?.items || {};
  const items = refsPayload?.items || {};
  const allowlist = buildAllowlist();
  const outputItems = {};
  const notesByGeo = {};
  const officialEvalItems = {};
  let total = 0;
  let official = 0;
  let nonOfficial = 0;
  const nonOfficialDomains = new Map();

  for (const [geoKey, refs] of Object.entries(items)) {
    const list = Array.isArray(refs) ? refs : [];
    const isoKey = String(geoKey || "").toUpperCase();
    const claim = claimsMap?.[isoKey] || {};
    const notesText = String(claim.notes_text || claim.notes || "");
    const notesRaw = String(claim.notes_raw || "");
    const notesLen = Number(claim.notes_text_len || notesText.length || 0);
    const officialHosts = new Map();
    let geoTotal = 0;
    let geoOfficial = 0;
    const enriched = list.map((ref) => {
      const url = String(ref?.url || "");
      const host = normalizeHost(url);
      const verdict = isOfficial(host, allowlist);
      if (url) {
        total += 1;
        geoTotal += 1;
      }
      if (verdict.ok) {
        official += 1;
        geoOfficial += 1;
        if (host) officialHosts.set(host, (officialHosts.get(host) || 0) + 1);
      } else {
        nonOfficial += 1;
        if (host) nonOfficialDomains.set(host, (nonOfficialDomains.get(host) || 0) + 1);
      }
      return {
        url,
        host,
        title_hint: String(ref?.title_hint || ref?.title || ""),
        section_hint: String(ref?.section_hint || ""),
        source: String(ref?.source || ""),
        official: verdict.ok,
        matched_rule: verdict.ok ? verdict.rule : "non_official"
      };
    });
    outputItems[isoKey] = enriched;
    notesByGeo[isoKey] = {
      notes: notesText,
      notes_text: notesText,
      notes_text_len: notesLen,
      notes_raw: notesRaw
    };
    const topOfficialDomains = Array.from(officialHosts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([domain]) => domain);
    officialEvalItems[isoKey] = {
      geo_key: isoKey,
      sources_total: geoTotal,
      sources_official: geoOfficial,
      official_badge: geoOfficial > 0 ? 1 : 0,
      top_official_domains: topOfficialDomains,
      notes_text_len: notesLen
    };
  }

  const topNonOfficial = Array.from(nonOfficialDomains.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([domain]) => domain);

  const ratio = total ? (official / total).toFixed(3) : "0.000";
  const output = {
    generated_at: new Date().toISOString(),
    totals: {
      total_links: total,
      official_links: official,
      non_official_links: nonOfficial,
      official_ratio: ratio,
      top_non_official_domains: topNonOfficial
    },
    items: outputItems,
    notes: notesByGeo
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  fs.writeFileSync(
    OFFICIAL_EVAL_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        totals: {
          total_links: total,
          official_links: official,
          non_official_links: nonOfficial,
          official_ratio: ratio
        },
        items: officialEvalItems
      },
      null,
      2
    ) + "\n"
  );

  console.log(
    `OFFICIAL_BADGE: total_links=${total} official_links=${official} non_official_links=${nonOfficial} official_ratio=${ratio}`
  );
  console.log(`TOP_NON_OFFICIAL_DOMAINS: ${topNonOfficial.join(",") || "-"}`);

  if (process.argv.includes("--once") && total === 0) {
    console.error("ERROR: no wiki refs available for official badge");
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

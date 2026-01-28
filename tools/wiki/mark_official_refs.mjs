import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WIKI_REFS_PATH = path.join(ROOT, "data", "wiki", "wiki_refs.json");
const WIKI_CLAIMS_MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const OFFICIAL_EVAL_PATH = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");
const ALLOWLIST_PATH = path.join(ROOT, "data", "sources", "official_allowlist.json");

const SSOT_WRITE = process.env.SSOT_WRITE === "1";
let ssotReadonlyLogged = false;

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

function buildAllowlist() {
  const allowlist = readJson(ALLOWLIST_PATH, { domains: [], patterns: [] });
  const domains = new Set(
    []
      .concat(allowlist?.domains || [])
      .map((entry) => String(entry).toLowerCase().replace(/^www\./, ""))
  );
  return { domains };
}

function allowlistGuard(allowlistDomains) {
  const dir = path.dirname(ALLOWLIST_PATH);
  const base = path.basename(ALLOWLIST_PATH);
  const backup =
    fs.existsSync(dir) &&
    fs
      .readdirSync(dir)
      .filter((file) => file.startsWith(`${base}.bak.`))
      .map((file) => path.join(dir, file))
      .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0]?.file;
  const backupPayload = backup ? readJson(backup, { domains: [] }) : null;
  const prevDomains = Array.isArray(backupPayload?.domains)
    ? backupPayload.domains
    : null;
  const prevCount = prevDomains ? prevDomains.length : allowlistDomains;
  const expectedMin = Math.max(50, Math.floor(prevCount * 0.7));
  if (allowlistDomains < expectedMin) {
    console.log(
      `OFFICIAL_ALLOWLIST_GUARD_FAIL prev=${prevCount} new=${allowlistDomains} reason=SHRUNK_TOO_MUCH`
    );
    process.exit(1);
  }
  console.log(`OFFICIAL_ALLOWLIST_GUARD_OK prev=${prevCount} new=${allowlistDomains}`);
}

function isOfficial(host, allowlist) {
  if (!host) return { ok: false, rule: "none" };
  if (allowlist.domains.has(host)) return { ok: true, rule: "allowlist_domain" };
  return { ok: false, rule: "none" };
}

function main() {
  const refsPayload = readJson(WIKI_REFS_PATH, { items: {} });
  const claimsMapPayload = readJson(WIKI_CLAIMS_MAP_PATH, { items: {} });
  const claimsMap = claimsMapPayload?.items || {};
  const items = refsPayload?.items || {};
  const allowlist = buildAllowlist();
  allowlistGuard(allowlist.domains.size);
  const outputItems = {};
  const notesByGeo = {};
  const officialEvalItems = {};
  let total = 0;
  let official = 0;
  let nonOfficial = 0;
  const nonOfficialDomains = new Map();

  const addRef = (url, allowlist) => {
    const host = normalizeHost(url);
    const verdict = isOfficial(host, allowlist);
    if (url) total += 1;
    if (verdict.ok) {
      official += 1;
    } else {
      nonOfficial += 1;
      if (host) nonOfficialDomains.set(host, (nonOfficialDomains.get(host) || 0) + 1);
    }
    return { host, verdict };
  };

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
      const { host, verdict } = addRef(url, allowlist);
      if (url) geoTotal += 1;
      if (verdict.ok) {
        geoOfficial += 1;
        if (host) officialHosts.set(host, (officialHosts.get(host) || 0) + 1);
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

  for (const [geoKey, claim] of Object.entries(claimsMap)) {
    const isoKey = String(geoKey || "").toUpperCase();
    const existing = outputItems[isoKey];
    if (existing && existing.length > 0) continue;
    const hasNotes = String(claim?.notes_text || "").length > 0;
    const hasMain = Array.isArray(claim?.notes_main_articles) && claim.notes_main_articles.length > 0;
    const htmlRow = String(claim?.row_ref || "").includes(":html:");
    if (!hasNotes && !hasMain && !htmlRow) continue;
    const fallbackUrl =
      claim?.notes_main_articles?.[0]?.url || claim?.wiki_row_url || "";
    if (!fallbackUrl) continue;
    const { host, verdict } = addRef(fallbackUrl, allowlist);
    outputItems[isoKey] = [
      {
        url: fallbackUrl,
        host,
        title_hint: "Legality of cannabis (notes)",
        section_hint: "Notes",
        source: "wiki_notes",
        official: verdict.ok,
        matched_rule: verdict.ok ? verdict.rule : "non_official"
      }
    ];
    notesByGeo[isoKey] = {
      notes: String(claim.notes_text || claim.notes || ""),
      notes_text: String(claim.notes_text || claim.notes || ""),
      notes_text_len: Number(claim.notes_text_len || String(claim.notes_text || "").length || 0),
      notes_raw: String(claim.notes_raw || "")
    };
    officialEvalItems[isoKey] = {
      geo_key: isoKey,
      sources_total: 1,
      sources_official: verdict.ok ? 1 : 0,
      official_badge: verdict.ok ? 1 : 0,
      top_official_domains: verdict.ok && host ? [host] : [],
      notes_text_len: Number(claim.notes_text_len || 0)
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
  if (!SSOT_WRITE) {
    if (!ssotReadonlyLogged) {
      console.log("SSOT_READONLY=1");
      ssotReadonlyLogged = true;
    }
  } else {
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
  }

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

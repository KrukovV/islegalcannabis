import fs from "node:fs";
import path from "node:path";
import { isOfficialUrl } from "../sources/validate_official_url.mjs";

const ROOT = process.cwd();
const REFS_PATH = path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json");
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

function normalizeUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  if (parsed.protocol === "http:") parsed.protocol = "https:";
  parsed.hash = "";
  const blockedParams = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "yclid",
    "mc_cid",
    "mc_eid"
  ]);
  for (const key of [...parsed.searchParams.keys()]) {
    if (blockedParams.has(key)) parsed.searchParams.delete(key);
  }
  return parsed.toString();
}

function classifyDenyReason(host, pathname) {
  const haystack = `${host} ${pathname}`.toLowerCase();
  if (haystack.includes("wikipedia") || haystack.includes("wikidata") || haystack.includes("wiki")) {
    return "DENY_WIKI";
  }
  if (haystack.includes("researchgate") || haystack.includes("academia.edu")) {
    return "DENY_RESEARCH";
  }
  if (haystack.includes("twitter") || haystack.includes("x.com") || haystack.includes("facebook") || haystack.includes("instagram") || haystack.includes("tiktok") || haystack.includes("reddit")) {
    return "DENY_SOCIAL";
  }
  if (haystack.includes("blog")) return "DENY_BLOG";
  if (haystack.includes("forum")) return "DENY_FORUM";
  if (haystack.includes("news")) return "DENY_NEWS";
  return "";
}

async function validateUrl(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "islegalcannabis/wiki_eval" }
    });
    return { ok: res.status >= 200 && res.status < 400, status: res.status };
  } catch (error) {
    return { ok: false, status: 0, reason: error?.name === "AbortError" ? "timeout" : "fetch_error" };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const payload = readJson(REFS_PATH, null);
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : [];
  if (!items.length) {
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
  const validate = process.env.WIKI_VALIDATE === "1";
  const runAt = new Date().toISOString();
  const results = {};
  const hostCounts = new Map();
  const denyCounts = new Map();
  let totalRefs = 0;
  let officialTotal = 0;
  let nonOfficialTotal = 0;

  for (const item of items) {
    const geoKey = String(item?.geo_key || item?.geo || "").toUpperCase();
    if (!geoKey) continue;
    const refs = Array.isArray(item?.refs) ? item.refs : [];
    const officialMatches = [];
    const nonOfficial = [];
    for (const ref of refs) {
      const normalized = normalizeUrl(ref?.url || "");
      if (!normalized) continue;
      totalRefs += 1;
      let parsed;
      try {
        parsed = new URL(normalized);
      } catch {
        nonOfficialTotal += 1;
        nonOfficial.push({
          url: normalized,
          host: "",
          source: ref?.source || "",
          reason: "INVALID_URL"
        });
        continue;
      }
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const denyReason = classifyDenyReason(host, parsed.pathname);
      if (denyReason) {
        nonOfficialTotal += 1;
        nonOfficial.push({
          url: normalized,
          host,
          source: ref?.source || "",
          reason: denyReason
        });
        denyCounts.set(denyReason, (denyCounts.get(denyReason) || 0) + 1);
        continue;
      }
      const iso2 = geoKey.split("-")[0] || geoKey;
      const officialCheck = isOfficialUrl(normalized, undefined, { iso2 });
      if (!officialCheck.ok) {
        nonOfficialTotal += 1;
        nonOfficial.push({
          url: normalized,
          host,
          source: ref?.source || "",
          reason: "NOT_ALLOWED"
        });
        denyCounts.set("NOT_ALLOWED", (denyCounts.get("NOT_ALLOWED") || 0) + 1);
        continue;
      }
      let validation = null;
      if (validate) {
        validation = await validateUrl(normalized);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      officialTotal += 1;
      officialMatches.push({
        url: normalized,
        host,
        source: ref?.source || "",
        reason: "ALLOWLIST",
        status: validation?.status ?? null,
        validated: validation?.ok ?? null
      });
      hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
    }
    results[geoKey] = {
      geo_key: geoKey,
      total_refs: refs.length,
      official_count: officialMatches.length,
      non_official_count: nonOfficial.length,
      official_matches: officialMatches,
      non_official: nonOfficial,
      last_checked_at: runAt
    };
  }

  const topHosts = Array.from(hostCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([host]) => host);
  const topDenies = Array.from(denyCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([reason]) => reason);

  writeAtomic(OUTPUT_PATH, {
    fetched_at: runAt,
    totals: {
      total_refs: totalRefs,
      official: officialTotal,
      non_official: nonOfficialTotal
    },
    top_hosts: topHosts,
    top_denies: topDenies,
    items: results
  });

  console.log(
    `WIKI_OFFICIAL_EVAL: geo=ALL total_refs=${totalRefs} official=${officialTotal} non_official=${nonOfficialTotal} top_hosts=${topHosts.join(",") || "-"} top_denies=${topDenies.join(",") || "-"}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

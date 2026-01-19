import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SEED_PATH = path.join(ROOT, "data", "sources", "government_domains_seed.txt");
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const REPORT_PATH = path.join(ROOT, "Reports", "governmentof_scrape.json");
const BASE_URL = "https://governmentof.com/";
const MAX_COUNTRIES = Number(process.env.GOVERNMENTOF_MAX || 300);
const CONCURRENCY = Number(process.env.GOVERNMENTOF_CONCURRENCY || 6);
const FETCH_TIMEOUT_MS = Number(process.env.GOVERNMENTOF_TIMEOUT_MS || 12000);

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function readSeed() {
  if (!fs.existsSync(SEED_PATH)) return [];
  return fs
    .readFileSync(SEED_PATH, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadIsoMap() {
  if (!fs.existsSync(ISO_PATH)) return new Map();
  try {
    const payload = JSON.parse(fs.readFileSync(ISO_PATH, "utf8"));
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.entries)
        ? payload.entries
        : [];
    const map = new Map();
    for (const entry of list) {
      const name = normalizeName(entry?.name || entry?.official_name || "");
      const alpha2 = String(entry?.alpha2 || "").toUpperCase();
      if (name && alpha2) map.set(name, alpha2);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "islegalcannabis/auto_learn" }
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(html) {
  const matches = html.matchAll(/href=["']([^"']+)["']/gi);
  const results = [];
  for (const match of matches) {
    const href = String(match[1] || "").trim();
    if (!href) continue;
    results.push(href);
  }
  return results;
}

function toAbsolute(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

function isBlockedUrl(url) {
  const lower = String(url || "").toLowerCase();
  const blocked = ["wiki", "blog", "news", "forum", "reddit", "medium"];
  return blocked.some((token) => lower.includes(token));
}

function extractIso2(html, isoMap) {
  const match = String(html || "").match(/\bISO(?:\s*2|[\s-]*Code)?\s*[:\-]?\s*([A-Z]{2})\b/);
  if (match && match[1]) return match[1].toUpperCase();
  const titleMatch = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (titleMatch) {
    const name = normalizeName(titleMatch[1].replace(/<[^>]+>/g, " "));
    if (isoMap.has(name)) return isoMap.get(name);
  }
  const nameMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (nameMatch) {
    const name = normalizeName(nameMatch[1].replace(/<[^>]+>/g, " "));
    if (isoMap.has(name)) return isoMap.get(name);
  }
  return "";
}

function extractGovernmentWebsite(html) {
  const urls = extractLinks(html)
    .map((href) => toAbsolute(BASE_URL, href))
    .filter((href) => href.startsWith("https://"));
  for (const url of urls) {
    if (url.includes("governmentof.com")) continue;
    if (isBlockedUrl(url)) continue;
    return url;
  }
  return "";
}

async function main() {
  const isoMap = loadIsoMap();
  const baseHtml = await fetchUrl(BASE_URL);
  if (!baseHtml) {
    writeJson(REPORT_PATH, { total_found: 0, valid_https: 0, skipped: 0, by_iso: {} });
    console.log("ERROR: failed to fetch governmentof.com");
    process.exit(1);
  }
  const links = extractLinks(baseHtml)
    .map((href) => toAbsolute(BASE_URL, href))
    .filter((href) => href.startsWith("https://governmentof.com/"))
    .filter((href) => href !== BASE_URL);
  const uniqueLinks = Array.from(new Set(links)).slice(0, MAX_COUNTRIES);
  const byIso = {};
  const skipped = [];
  let totalFound = 0;
  let validHttps = 0;
  const queue = [...uniqueLinks];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const link = queue.shift();
      if (!link) break;
      const html = await fetchUrl(link);
      if (!html) {
        skipped.push({ url: link, reason: "FETCH_FAIL" });
        continue;
      }
      const iso2 = extractIso2(html, isoMap);
      const govUrl = extractGovernmentWebsite(html);
      totalFound += 1;
      if (!govUrl || !iso2) {
        skipped.push({ url: link, iso2, reason: "MISSING_FIELDS" });
        continue;
      }
      if (!govUrl.startsWith("https://")) {
        skipped.push({ url: link, iso2, reason: "NO_HTTPS" });
        continue;
      }
      if (isBlockedUrl(govUrl)) {
        skipped.push({ url: link, iso2, reason: "BLOCKED_DOMAIN" });
        continue;
      }
      validHttps += 1;
      byIso[iso2] = byIso[iso2] || [];
      byIso[iso2].push(govUrl);
    }
  });
  await Promise.all(workers);

  const seed = readSeed();
  const existing = new Set(seed.map((domain) => domain.toLowerCase()));
  const newDomains = [];
  for (const urls of Object.values(byIso)) {
    for (const url of urls) {
      const host = new URL(url).hostname.toLowerCase();
      if (existing.has(host)) continue;
      existing.add(host);
      newDomains.push(host);
    }
  }

  const nextSeed = [...seed, ...newDomains];
  fs.writeFileSync(SEED_PATH, nextSeed.join("\n") + "\n");

  writeJson(REPORT_PATH, {
    total_found: totalFound,
    valid_https: validHttps,
    skipped: skipped.length,
    by_iso: byIso,
    added_domains: newDomains.length
  });
  console.log(
    `OK scrape_governmentof total=${totalFound} https=${validHttps} added=${newDomains.length} skipped=${skipped.length}`
  );
}

main().catch(() => {
  writeJson(REPORT_PATH, { total_found: 0, valid_https: 0, skipped: 0, by_iso: {} });
  console.log("ERROR: scrape_governmentof failed");
  process.exit(1);
});

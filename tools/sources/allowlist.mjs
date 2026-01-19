import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DENYLIST_PATH = path.join(ROOT, "data", "sources", "domain_denylist.json");

const OFFICIAL_PATTERNS = [
  /\.gov(\.|$)/i,
  /\.gob(\.|$)/i,
  /\.go\.[a-z]{2}$/i,
  /\.gouv(\.|$)/i,
  /\.govt(\.|$)/i,
  /\.government(\.|$)/i,
  /\.admin\.ch$/i,
  /\.bund\.de$/i,
  /\.justice\.gc\.ca$/i,
  /\.legislation\.gov\./i,
  /\.parliament\./i,
  /\.justice\./i,
  /\.legislation\./i,
  /\.laws\./i,
  /\.lex\./i,
  /\.boe\./i,
  /\.dre\./i,
  /\.impo\./i,
  /\.court\./i,
  /\.courts\./i,
  /\.gazette\./i,
  /\.officialgazette\./i,
  /\.health\./i,
  /\.regulator\./i,
  /\.ministry\./i,
  /\.senat\./i,
  /\.senate\./i,
  /\.assembly\./i,
  /\.congress\./i,
  /\.assemblee-nationale\./i
];

const ALWAYS_BLOCK = [
  "wikipedia.org",
  "wikidata.org",
  "medium.com",
  "wordpress.com",
  "reddit.com",
  "fandom.com"
];

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function loadDenylist(filePath = DENYLIST_PATH) {
  const payload = readJson(filePath, { banned: [] });
  const banned = Array.isArray(payload.banned) ? payload.banned : [];
  return new Set(banned.map((host) => String(host || "").toLowerCase()));
}

function normalizeHost(hostname) {
  return String(hostname || "").toLowerCase().replace(/^www\./, "");
}

function isPslLike(hostname) {
  const host = normalizeHost(hostname);
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return false;
  const tld = parts[parts.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld)) return false;
  return true;
}

function isBannedHost(hostname, denylist) {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (!isPslLike(host)) return true;
  if (host.includes("blog")) return true;
  if (host.startsWith("reddit.")) return true;
  for (const blocked of ALWAYS_BLOCK) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return true;
  }
  for (const banned of denylist) {
    if (host === banned || host.endsWith(`.${banned}`)) return true;
  }
  return false;
}

function matchesOfficialPattern(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return false;
  return OFFICIAL_PATTERNS.some((pattern) => pattern.test(host));
}

function hasOfficialKeyword(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return false;
  const keywords = [
    "parliament",
    "parlament",
    "parlamento",
    "congress",
    "senate",
    "assembly",
    "regeringen",
    "lagtinget",
    "ministry",
    "health",
    "justice",
    "regulator",
    "legislation",
    "laws",
    "gazette",
    "lex",
    "official",
    "portal"
  ];
  return keywords.some((keyword) => host.includes(keyword));
}

export function isAllowedOfficialDomain(hostname, options = {}) {
  const denylist = options.denylist ?? loadDenylist(options.denylistPath);
  if (isBannedHost(hostname, denylist)) return false;
  return matchesOfficialPattern(hostname) || hasOfficialKeyword(hostname);
}

export function isAllowedOfficialUrl(url, options = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return isAllowedOfficialDomain(parsed.hostname, options);
}

export function buildDenylist(options = {}) {
  return options.denylist ?? loadDenylist(options.denylistPath);
}

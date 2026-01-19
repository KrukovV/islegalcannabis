import fs from "node:fs";
import path from "node:path";
import { collectOfficialUrls } from "./catalog_utils.mjs";

const ALLOWLIST_PATH = path.join(
  process.cwd(),
  "data",
  "sources",
  "allowlist_domains.json"
);
const ALLOW_DOMAINS_PATH = path.join(
  process.cwd(),
  "data",
  "sources",
  "allow_domains.json"
);
const DEFAULT_WHITELIST = path.join(
  process.cwd(),
  "data",
  "sources",
  "official_domains_whitelist.json"
);
const DENYLIST_PATH = path.join(
  process.cwd(),
  "data",
  "sources",
  "domain_denylist.json"
);
const DENY_SUBSTRINGS_PATH = path.join(
  process.cwd(),
  "data",
  "sources",
  "deny_substrings.json"
);
const OFFICIAL_CATALOG_PATH = path.join(
  process.cwd(),
  "data",
  "sources",
  "official_catalog.json"
);
const PORTALS_BY_ISO_PATH = path.join(
  process.cwd(),
  "data",
  "sources",
  "portals_by_iso2.validated.json"
);
const PORTALS_BY_ISO_FALLBACK_PATH = path.join(
  process.cwd(),
  "data",
  "sources",
  "portals_by_iso2.json"
);

let cachedCatalog = null;
let cachedCatalogMtime = 0;
let cachedPortals = null;
let cachedPortalsMtime = 0;

function readWhitelist() {
  const file = fs.existsSync(ALLOWLIST_PATH)
    ? ALLOWLIST_PATH
    : DEFAULT_WHITELIST;
  if (!fs.existsSync(file)) return { allowed: [] };
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { allowed: [] };
  }
}

function readAllowDomains() {
  if (!fs.existsSync(ALLOW_DOMAINS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(ALLOW_DOMAINS_PATH, "utf8"));
  } catch {
    return null;
  }
}

function readDenylist() {
  if (!fs.existsSync(DENYLIST_PATH)) return { banned: [] };
  try {
    return JSON.parse(fs.readFileSync(DENYLIST_PATH, "utf8"));
  } catch {
    return { banned: [] };
  }
}

function readDenySubstrings() {
  if (!fs.existsSync(DENY_SUBSTRINGS_PATH)) return { banned: [] };
  try {
    return JSON.parse(fs.readFileSync(DENY_SUBSTRINGS_PATH, "utf8"));
  } catch {
    return { banned: [] };
  }
}

function readOfficialCatalog() {
  if (!fs.existsSync(OFFICIAL_CATALOG_PATH)) return null;
  const stat = fs.statSync(OFFICIAL_CATALOG_PATH);
  if (cachedCatalog && cachedCatalogMtime === stat.mtimeMs) return cachedCatalog;
  try {
    cachedCatalog = JSON.parse(fs.readFileSync(OFFICIAL_CATALOG_PATH, "utf8"));
    cachedCatalogMtime = stat.mtimeMs;
    return cachedCatalog;
  } catch {
    return null;
  }
}

function readPortalsByIso() {
  const file = fs.existsSync(PORTALS_BY_ISO_PATH)
    ? PORTALS_BY_ISO_PATH
    : PORTALS_BY_ISO_FALLBACK_PATH;
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (cachedPortals && cachedPortalsMtime === stat.mtimeMs) return cachedPortals;
  try {
    cachedPortals = JSON.parse(fs.readFileSync(file, "utf8"));
    cachedPortalsMtime = stat.mtimeMs;
    return cachedPortals;
  } catch {
    return null;
  }
}

function collectPortalUrls(entry) {
  if (!entry || typeof entry !== "object") return [];
  const portals = Array.isArray(entry.government_portal)
    ? entry.government_portal
    : Array.isArray(entry.government_portals)
      ? entry.government_portals
      : [];
  return portals.map((value) => String(value || "").trim()).filter(Boolean);
}

function collectPortalsByIso(iso2) {
  const data = readPortalsByIso();
  if (!data || typeof data !== "object") return [];
  const record = data?.[iso2];
  if (!record || typeof record !== "object") return [];
  const portals = Array.isArray(record.portals) ? record.portals : [];
  const values = [];
  for (const portal of portals) {
    if (!portal || typeof portal !== "object") continue;
    const url = String(portal.url || "").trim();
    if (url) values.push(url);
    const domain = String(portal.domain || "").trim();
    if (domain) values.push(domain);
  }
  return values;
}

function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function hostMatches(host, allowed) {
  if (!host) return false;
  return allowed.some((pattern) => {
    if (!pattern) return false;
    if (pattern.includes("*")) {
      return patternToRegex(pattern).test(host);
    }
    return host === pattern;
  });
}

function matchesSuffix(host, suffix) {
  if (!host || !suffix) return false;
  if (suffix.includes("*")) {
    return patternToRegex(suffix).test(host);
  }
  const needle = suffix.toLowerCase();
  return host === needle || host.endsWith(`.${needle}`);
}

function allowDomainsMatch(host, allowDomains) {
  if (!allowDomains || !host) return false;
  const suffixes = Array.isArray(allowDomains.allow_suffixes)
    ? allowDomains.allow_suffixes
    : [];
  const countryMap = allowDomains.country_allow_domains || {};
  const explicit = [];
  for (const domains of Object.values(countryMap)) {
    if (!Array.isArray(domains)) continue;
    for (const domain of domains) {
      if (typeof domain === "string" && domain.trim()) explicit.push(domain.trim());
    }
  }
  for (const domain of explicit) {
    if (matchesSuffix(host, domain)) return true;
  }
  for (const suffix of suffixes) {
    if (matchesSuffix(host, suffix)) return true;
  }
  return false;
}

function matchesOfficialStructure(host) {
  if (!host) return false;
  const lowered = host.toLowerCase();
  if (lowered.startsWith("www.gov.") || lowered === "www.gov") return true;
  if (lowered.includes(".gov.") || lowered.endsWith(".gov")) return true;
  if (lowered.includes(".gouv.") || lowered.endsWith(".gouv")) return true;
  if (lowered.includes(".gob.") || lowered.endsWith(".gob")) return true;
  if (lowered.includes(".governo.") || lowered.endsWith(".governo")) return true;
  if (lowered.includes("administration")) return true;
  return false;
}

function matchesGovernPortal(host) {
  const lowered = String(host || "").toLowerCase();
  return /^govern\.[a-z]{2}$/.test(lowered);
}

function getRootDomain(host) {
  const cleaned = String(host || "").toLowerCase().replace(/^www\./, "");
  const parts = cleaned.split(".").filter(Boolean);
  if (parts.length <= 2) return cleaned;
  const suffix = parts[parts.length - 2];
  const needsThird = ["gov", "gouv", "gob", "govt", "go", "gv", "government"].includes(
    suffix
  );
  if (needsThird && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function extractHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    try {
      return new URL(`https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return raw.toLowerCase().replace(/^www\./, "");
    }
  }
}

function isOfficialCatalogDomain(host, iso2) {
  const upper = String(iso2 || "").toUpperCase();
  if (!upper || !host) return false;
  const catalog = readOfficialCatalog();
  if (!catalog || typeof catalog !== "object") return false;
  const entry = catalog?.[upper];
  if (!entry) return false;
  const officialUrls = collectOfficialUrls(entry);
  const portalUrls = collectPortalUrls(entry);
  const extraPortals = collectPortalsByIso(upper);
  const allUrls = [...officialUrls, ...portalUrls, ...extraPortals];
  if (!allUrls.length) return false;
  const hostRoot = getRootDomain(host);
  for (const url of allUrls) {
    const officialHost = extractHost(url);
    if (!officialHost) continue;
    if (host === officialHost) return true;
    const officialRoot = getRootDomain(officialHost);
    if (hostRoot && officialRoot && hostRoot === officialRoot) return true;
  }
  return false;
}

function hasDeniedSubstring(value) {
  const haystack = String(value || "").toLowerCase();
  const blocked = [
    "wiki",
    "wikipedia",
    "wikidata",
    "blog",
    "map",
    "maps",
    "forum",
    "news"
  ];
  const denyExtra = readDenySubstrings();
  const extra = Array.isArray(denyExtra.banned) ? denyExtra.banned : [];
  return [...blocked, ...extra].some((token) =>
    String(token || "").trim() ? haystack.includes(String(token).toLowerCase()) : false
  );
}

export function isOfficialUrl(url, whitelist = readWhitelist(), options = {}) {
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, reason: "empty_url" };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "https_only" };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const iso2 = String(options?.iso2 || "").toUpperCase();
  if (!host) {
    return { ok: false, reason: "missing_host" };
  }
  if (iso2 === "XK" && (host === "rks-gov.net" || host === "rks-gov.net.")) {
    return { ok: true };
  }
  const deny = readDenylist();
  const bannedHosts = Array.isArray(deny.banned) ? deny.banned : [];
  if (hasDeniedSubstring(host) || hasDeniedSubstring(parsed.pathname)) {
    return { ok: false, reason: "blog_domain" };
  }
  for (const banned of bannedHosts) {
    const blocked = String(banned || "").toLowerCase();
    if (!blocked) continue;
    if (host === blocked || host.endsWith(`.${blocked}`)) {
      return { ok: false, reason: "banned_domain" };
    }
  }
  const allowDomains = readAllowDomains();
  if (allowDomains) {
    if (
      !allowDomainsMatch(host, allowDomains) &&
      !matchesOfficialStructure(host) &&
      !matchesGovernPortal(host) &&
      !isOfficialCatalogDomain(host, iso2)
    ) {
      return { ok: false, reason: "not_whitelisted" };
    }
    return { ok: true };
  }
  const allowed = Array.isArray(whitelist.allowed) ? whitelist.allowed : [];
  if (!hostMatches(host, allowed) && !isOfficialCatalogDomain(host, iso2)) {
    return { ok: false, reason: "not_whitelisted" };
  }
  return { ok: true };
}

export function classifyOfficialUrl(url, whitelist = readWhitelist(), options = {}) {
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, reason: "empty_url" };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "https_only" };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const iso2 = String(options?.iso2 || "").toUpperCase();
  if (!host) {
    return { ok: false, reason: "missing_host" };
  }
  if (iso2 === "XK" && (host === "rks-gov.net" || host === "rks-gov.net.")) {
    return { ok: true, matched_rule: "gov_allowlist" };
  }
  const deny = readDenylist();
  const bannedHosts = Array.isArray(deny.banned) ? deny.banned : [];
  if (hasDeniedSubstring(host) || hasDeniedSubstring(parsed.pathname)) {
    return { ok: false, reason: "blog_domain" };
  }
  for (const banned of bannedHosts) {
    const blocked = String(banned || "").toLowerCase();
    if (!blocked) continue;
    if (host === blocked || host.endsWith(`.${blocked}`)) {
      return { ok: false, reason: "banned_domain" };
    }
  }
  if (isOfficialCatalogDomain(host, iso2)) {
    return { ok: true, matched_rule: "gov_portal_catalog" };
  }
  const allowDomains = readAllowDomains();
  const allowed = Array.isArray(whitelist.allowed) ? whitelist.allowed : [];
  if (allowDomains) {
    if (allowDomainsMatch(host, allowDomains) || hostMatches(host, allowed)) {
      return { ok: true, matched_rule: "gov_allowlist" };
    }
    if (matchesOfficialStructure(host) || matchesGovernPortal(host)) {
      return { ok: true, matched_rule: "official_tld" };
    }
    return { ok: false, reason: "not_whitelisted" };
  }
  if (hostMatches(host, allowed)) {
    return { ok: true, matched_rule: "gov_allowlist" };
  }
  if (matchesOfficialStructure(host) || matchesGovernPortal(host)) {
    return { ok: true, matched_rule: "official_tld" };
  }
  return { ok: false, reason: "not_whitelisted" };
}

export function validateOfficialUrl(url, whitelist = readWhitelist(), options = {}) {
  return isOfficialUrl(url, whitelist, options);
}

export function officialScopeForIso(iso2) {
  const upper = String(iso2 || "").toUpperCase();
  if (!upper) return { roots: [], hosts: [] };
  const catalog = readOfficialCatalog();
  const entry = catalog && typeof catalog === "object" ? catalog?.[upper] : null;
  const officialUrls = collectOfficialUrls(entry || {});
  const portalUrls = collectPortalUrls(entry || {});
  const extraPortals = collectPortalsByIso(upper);
  const roots = new Set();
  const hosts = new Set();
  const recordHost = (value) => {
    const host = extractHost(value);
    if (!host) return;
    hosts.add(host);
    const root = getRootDomain(host);
    if (root) roots.add(root);
  };
  for (const url of [...officialUrls, ...portalUrls, ...extraPortals]) {
    recordHost(url);
  }
  const allowDomains = readAllowDomains();
  if (allowDomains) {
    const suffixes = Array.isArray(allowDomains.allow_suffixes)
      ? allowDomains.allow_suffixes
      : [];
    const countryDomains = allowDomains.country_allow_domains || {};
    const perCountry = Array.isArray(countryDomains?.[upper])
      ? countryDomains[upper]
      : [];
    const addPattern = (pattern) => {
      const raw = String(pattern || "").trim().toLowerCase();
      if (!raw) return;
      const cleaned = raw
        .replace(/^\*\./, "")
        .replace(/\.\*$/, "")
        .replace(/\*$/g, "")
        .replace(/^\./, "");
      if (!cleaned || cleaned.includes("*")) return;
      hosts.add(cleaned);
      const root = getRootDomain(cleaned);
      if (root) roots.add(root);
    };
    for (const domain of perCountry) addPattern(domain);
    for (const suffix of suffixes) addPattern(suffix);
  }
  const whitelist = readWhitelist();
  const allowed = Array.isArray(whitelist.allowed) ? whitelist.allowed : [];
  for (const entry of allowed) {
    const raw = String(entry || "").trim().toLowerCase();
    if (!raw) continue;
    const cleaned = raw.replace(/^\*\./, "").replace(/\*$/g, "").replace(/^\./, "");
    if (!cleaned || cleaned.includes("*")) continue;
    hosts.add(cleaned);
    const root = getRootDomain(cleaned);
    if (root) roots.add(root);
  }
  return { roots: Array.from(roots), hosts: Array.from(hosts) };
}

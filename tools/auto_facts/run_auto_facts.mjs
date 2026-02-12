import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { isOfficialUrl, officialScopeForIso } from "../sources/validate_official_url.mjs";
import { collectOfficialUrls } from "../sources/catalog_utils.mjs";
import { writeMachineVerifiedEntries } from "../legal_ssot/write_machine_verified.mjs";
import { extractWikiRefs } from "../wiki/wiki_refs.mjs";
import { readWikiClaim } from "../wiki/wiki_claims_store.mjs";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "Reports", "auto_facts", "last_run.json");
const AUTO_LEARN_REPORT = path.join(ROOT, "Reports", "auto_learn", "last_run.json");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const WIKI_REFS_DIR = path.join(ROOT, "Reports", "wiki_refs");
const EXTRACT_SCRIPT = path.join(ROOT, "tools", "auto_facts", "extract_from_snapshot.mjs");
const MACHINE_VERIFIED_PATH = path.join(
  ROOT,
  "data",
  "legal_ssot",
  "machine_verified.json"
);
const CANDIDATE_FACTS_PATH = path.join(
  ROOT,
  "data",
  "legal_ssot",
  "candidate_facts.json"
);
const DOC_HUNT_LIMIT = Math.max(1, Number(process.env.AUTO_FACTS_DOC_LIMIT || 30) || 30);
const DETAIL_LIMIT = Math.max(1, Number(process.env.AUTO_FACTS_DETAIL_LIMIT || 20) || 20);
const CRAWL_DEPTH = Math.max(1, Number(process.env.AUTO_FACTS_CRAWL_DEPTH || 2) || 2);
const MAX_ENTRYPOINTS = Math.max(1, Number(process.env.AUTO_FACTS_ENTRYPOINTS || 8) || 8);
const MAX_PAGES = Math.max(1, Number(process.env.AUTO_FACTS_MAX_PAGES || 30) || 30);
const MAX_CANDIDATES = Math.max(1, Number(process.env.AUTO_FACTS_CANDIDATES || 20) || 20);
const USE_CANNABIS_PIPELINE =
  process.env.AUTO_FACTS_PIPELINE === "cannabis" || process.env.AUTO_FACTS_CANNABIS === "1";
const FETCH_NETWORK = process.env.FETCH_NETWORK ?? process.env.NETWORK ?? "0";
const FETCH_ENABLED = FETCH_NETWORK !== "0";
const SNAPSHOT_ATTEMPT_LIMIT = Number(process.env.SNAPSHOT_ATTEMPT_LIMIT || 20);
const snapshotAttempts = [];

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function readWikiRefsReport(geoKey) {
  if (!geoKey) return null;
  const reportPath = path.join(WIKI_REFS_DIR, `${geoKey}.json`);
  return readJson(reportPath, null);
}

async function loadWikiOfficialRefs(geoKey, iso2) {
  const cached = readWikiRefsReport(geoKey);
  const cachedRefs = Array.isArray(cached?.official_candidates)
    ? cached.official_candidates
    : [];
  if (cachedRefs.length) return cachedRefs;
  if (!FETCH_ENABLED) return [];
  const claim = readWikiClaim(geoKey);
  const mainArticles = Array.isArray(claim?.notes_main_articles)
    ? claim.notes_main_articles
    : Array.isArray(claim?.main_articles)
      ? claim.main_articles
      : [];
  if (mainArticles.length === 0) return [];
  const payload = await extractWikiRefs({
    geoKey,
    iso2,
    articles: mainArticles,
    reportPath: path.join(WIKI_REFS_DIR, `${geoKey}.json`)
  });
  return Array.isArray(payload?.official_candidates) ? payload.official_candidates : [];
}

function hasLawMarker(text) {
  const value = String(text || "");
  return [
    /\b(act|law|decree|gazette|legislation|statute|regulation|code|ordinance|bill|parliament)\b/i,
    /\bofficial journal\b/i,
    /\bjournal officiel\b/i,
    /\bofficial gazette\b/i,
    /\bgazette officielle\b/i,
    /\breglamento\b/i,
    /\bley\b/i,
    /\bdecreto\b/i,
    /\blegge\b/i,
    /\bgazzetta\b/i,
    /\bgesetz\b/i,
    /\bloi\b/i,
    /\bordonnance\b/i
  ].some((pattern) => pattern.test(value));
}

function hasCannabisMarker(text) {
  const value = String(text || "");
  return [
    /\b(cannabis|marijuana|marihuana|hemp|cbd|thc|tetrahydrocannabinol|cannabinoid|hashish|ganja|kanabis|hashash)\b/i,
    /\bmarihuan[ae\u00eb]\b/i,
    /\u043a\u0430\u043d\u043d\u0430\u0431\u0438\u0441/i,
    /\u043a\u043e\u043d\u043e\u043f\u043b/i,
    /\u043c\u0430\u0440\u0438\u0445\u0443\u0430\u043d/i,
    /\u0433\u0430\u0448\u0438\u0448/i,
    /\u0442\u0433\u043a/i
  ].some((pattern) => pattern.test(value));
}

function hasBannedSnippet(value) {
  const lower = String(value || "").toLowerCase();
  return [
    "window.",
    "function(",
    "<script",
    ".js",
    ".css",
    "intl.segmenter"
  ].some((token) => lower.includes(token));
}

const CANNABIS_KEYWORDS = [
  "cannabis",
  "marijuana",
  "marihuana",
  "marihuan",
  "hemp",
  "cbd",
  "thc",
  "tetrahydrocannabinol",
  "narcotic",
  "narcotics",
  "drug",
  "drugs",
  "controlled-substance",
  "controlled substance",
  "psychotropic",
  "psikotrop",
  "psikotrope",
  "kanabis",
  "hashash",
  "narkotik",
  "substancat narkotike",
  "substanca narkotike",
  "substancat psikotrope",
  "substanca psikotrope",
  "тгк",
  "конопл",
  "марихуан"
];

const SECTION_KEYWORDS = [
  "law",
  "laws",
  "act",
  "acts",
  "legislation",
  "regulation",
  "code",
  "gazette",
  "health",
  "customs",
  "police",
  "pharmacy",
  "medicine",
  "ministry",
  "drug",
  "narcotic"
];

function hasCannabisKeyword(value) {
  const lower = String(value || "").toLowerCase();
  return CANNABIS_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function hasSectionKeyword(value) {
  const lower = String(value || "").toLowerCase();
  return SECTION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function scoreCandidate(value) {
  const lower = String(value || "").toLowerCase();
  let score = 0;
  for (const token of SECTION_KEYWORDS) {
    if (lower.includes(token)) score += 1;
  }
  for (const token of CANNABIS_KEYWORDS) {
    if (lower.includes(token)) score += 2;
  }
  return score;
}

function stripScriptsStyles(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function normalizeHref(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/&amp;/g, "&");
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

function isSameRootDomain(baseHost, targetHost) {
  if (!baseHost || !targetHost) return false;
  const baseRoot = getRootDomain(baseHost);
  const targetRoot = getRootDomain(targetHost);
  return Boolean(baseRoot && targetRoot && baseRoot === targetRoot);
}

function extractLinksFromHtml(html, baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const cleaned = stripScriptsStyles(html);
  const matches = cleaned.matchAll(/(?:href|src|data)=["']([^"']+)["']/gi);
  const results = [];
  const seen = new Set();
  for (const match of matches) {
    const hrefRaw = normalizeHref(match[1]);
    if (!hrefRaw || hrefRaw.startsWith("#")) continue;
    if (hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:")) continue;
    let target;
    try {
      target = new URL(hrefRaw, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(target.protocol)) continue;
    const cleanUrl = target.href.split("#")[0];
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);
    results.push(cleanUrl);
  }
  return results;
}

function extractAnchorLinks(html, baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const cleaned = stripScriptsStyles(html);
  const matches = cleaned.matchAll(
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  );
  const results = [];
  const seen = new Set();
  for (const match of matches) {
    const hrefRaw = normalizeHref(match[1]);
    if (!hrefRaw || hrefRaw.startsWith("#")) continue;
    if (hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:")) continue;
    let target;
    try {
      target = new URL(hrefRaw, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(target.protocol)) continue;
    const cleanUrl = target.href.split("#")[0];
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);
    const anchorText = String(match[2] || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    results.push({ url: cleanUrl, text: anchorText });
  }
  return results;
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? String(match[1] || "").replace(/<[^>]+>/g, " ").trim() : "";
}

function extractActIds(html) {
  const ids = new Set();
  const text = String(html || "");
  const matches = text.matchAll(/ActID=(\d+)/gi);
  for (const match of matches) {
    const value = match[1];
    if (value) ids.add(value);
  }
  return Array.from(ids);
}

function extractPostbackPdfRequests(html, baseUrl) {
  const requests = [];
  if (!html || !baseUrl) return requests;
  const targetMatch = html.match(/name="([^"]*imgpdf[^"]*)"/i);
  if (!targetMatch) return requests;
  let formAction = "";
  const formMatch = html.match(/<form[^>]*action="([^"]*)"/i);
  if (formMatch) {
    formAction = formMatch[1] || "";
  }
  let actionUrl = baseUrl;
  try {
    actionUrl = new URL(formAction || baseUrl, baseUrl).href;
  } catch {
    actionUrl = baseUrl;
  }
  const target = targetMatch[1];
  const viewState =
    (html.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/i) || [])[1] || "";
  const viewStateGenerator =
    (html.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/i) || [])[1] || "";
  const eventValidation =
    (html.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/i) || [])[1] || "";
  if (!viewState) return requests;
  const params = new URLSearchParams();
  params.set("__EVENTTARGET", target);
  params.set("__EVENTARGUMENT", "");
  params.set("__VIEWSTATE", viewState);
  if (viewStateGenerator) params.set("__VIEWSTATEGENERATOR", viewStateGenerator);
  if (eventValidation) params.set("__EVENTVALIDATION", eventValidation);
  params.set(`${target}.x`, "1");
  params.set(`${target}.y`, "1");
  requests.push({
    url: actionUrl,
    method: "POST",
    body: params.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" }
  });
  return requests;
}

function isDocUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith(".pdf") || pathname.endsWith(".doc") || pathname.endsWith(".docx")) {
      return true;
    }
    const query = parsed.search.toLowerCase();
    return (
      query.includes("download=") ||
      pathname.includes("download") ||
      pathname.includes("document") ||
      pathname.includes("doc")
    );
  } catch {
    const lowered = String(value).toLowerCase();
    return (
      lowered.endsWith(".pdf") ||
      lowered.endsWith(".doc") ||
      lowered.endsWith(".docx") ||
      lowered.includes("download=") ||
      lowered.includes("download") ||
      lowered.includes("document")
    );
  }
}

function isDetailUrl(value) {
  const lower = String(value || "").toLowerCase();
  return (
    lower.includes("actdetail.aspx") ||
    lower.includes("actdocumentdetail.aspx") ||
    lower.includes("actdocument") ||
    lower.includes("actdetail")
  );
}

function isListUrl(value) {
  const lower = String(value || "").toLowerCase();
  if (!lower.includes("act")) return false;
  return (
    lower.includes("list") ||
    lower.includes("actsby") ||
    lower.includes("category") ||
    lower.includes("browse") ||
    lower.includes("institution")
  );
}

function visibleTextLength(html) {
  const cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length;
}

function commandExists(command) {
  const res = spawnSync("bash", ["-lc", `command -v ${command}`], {
    stdio: "ignore"
  });
  return res.status === 0;
}

function sha256File(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function todayCompact() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function listDayDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((entry) => fs.statSync(path.join(dir, entry)).isDirectory())
    .sort();
}

function findCachedSnapshot(iso2, url) {
  const isoDir = path.join(ROOT, "data", "source_snapshots", iso2);
  const dayDirs = listDayDirs(isoDir);
  if (dayDirs.length === 0) return null;
  const latest = dayDirs[dayDirs.length - 1];
  const metaPath = path.join(isoDir, latest, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const items = Array.isArray(meta?.items) ? meta.items : [];
    const match = items.find(
      (item) => item?.url === url || item?.final_url === url
    );
    if (!match || !match.snapshot || !fs.existsSync(match.snapshot)) return null;
    return {
      snapshotPath: match.snapshot,
      status: match.status || 0,
      contentHash: match.content_hash || match.sha256 || "",
      finalUrl: match.final_url || match.url || url,
      contentType: match.content_type || meta.content_type || "",
      etag: match.etag || ""
    };
  } catch {
    return null;
  }
}

function recordSnapshotAttempt(attempt) {
  if (!attempt || typeof attempt !== "object") return;
  snapshotAttempts.push({
    iso2: attempt.iso2 || "",
    url: attempt.url || "",
    ok: Boolean(attempt.ok),
    status: Number(attempt.status || 0) || 0,
    bytes: Number(attempt.bytes || 0) || 0,
    reason: String(attempt.reason || ""),
    final_url: attempt.final_url || ""
  });
}

function deriveSnapshotFailure(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) return "";
  const reasons = new Map();
  for (const attempt of attempts) {
    if (attempt?.ok) continue;
    const reason = String(attempt.reason || "SNAPSHOT_FAIL");
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  if (reasons.size === 0) return "";
  const preferred = ["ROBOTS_BLOCKED", "STATUS_403", "STATUS_429", "TIMEOUT", "FETCH_ERROR", "NETWORK_0"];
  for (const reason of preferred) {
    if (reasons.has(reason)) return reason;
  }
  let best = "";
  let bestCount = 0;
  for (const [reason, count] of reasons.entries()) {
    if (count > bestCount) {
      best = reason;
      bestCount = count;
    }
  }
  return best || "SNAPSHOT_FAIL";
}

function parseRobots(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const rules = [];
  let applies = false;
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [rawKey, rawValue] = line.split(":");
    if (!rawKey || !rawValue) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.trim();
    if (key === "user-agent") {
      applies = value === "*" || value.toLowerCase().includes("islegalcannabis");
      continue;
    }
    if (key === "disallow" && applies) {
      rules.push(value);
    }
  }
  return rules.filter(Boolean);
}

async function isRobotsAllowed(url, cache) {
  if (!FETCH_ENABLED) {
    return { ok: true, reason: "NETWORK_0" };
  }
  let host = "";
  let pathName = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    pathName = parsed.pathname || "/";
  } catch {
    return { ok: false, reason: "INVALID_URL" };
  }
  if (!host) return { ok: false, reason: "INVALID_URL" };
  if (cache.has(host)) {
    const rules = cache.get(host) || [];
    const blocked = rules.some((rule) => rule && pathName.startsWith(rule));
    return { ok: !blocked, reason: blocked ? "ROBOTS_BLOCKED" : "OK" };
  }
  const robotsUrl = `https://${host}/robots.txt`;
  try {
    const response = await fetch(robotsUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; islegalcannabis/auto_facts; +https://islegalcannabis.com)"
      }
    });
    if (!response.ok) {
      cache.set(host, []);
      return { ok: true, reason: "OK" };
    }
    const text = await response.text();
    const rules = parseRobots(text);
    cache.set(host, rules);
    const blocked = rules.some((rule) => rule && pathName.startsWith(rule));
    return { ok: !blocked, reason: blocked ? "ROBOTS_BLOCKED" : "OK" };
  } catch {
    cache.set(host, []);
    return { ok: true, reason: "OK" };
  }
}

async function fetchSnapshot(iso2, url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const method = String(options.method || "GET").toUpperCase();
  const useCache = options.useCache !== false && method === "GET";
  const cached = useCache ? findCachedSnapshot(iso2, url) : null;
  if (!FETCH_ENABLED) {
    if (cached) {
      let cachedBytes = 0;
      try {
        cachedBytes = fs.statSync(cached.snapshotPath).size;
      } catch {
        cachedBytes = 0;
      }
      recordSnapshotAttempt({
        iso2,
        url,
        ok: true,
        status: cached.status || 200,
        bytes: cachedBytes,
        reason: "CACHE_HIT",
        final_url: cached.finalUrl || url
      });
      return {
        ok: true,
        snapshotPath: cached.snapshotPath,
        status: cached.status || 200,
        contentHash: cached.contentHash || "",
        retrievedAt: new Date().toISOString(),
        finalUrl: cached.finalUrl || url,
        contentType: cached.contentType || ""
      };
    }
    recordSnapshotAttempt({
      iso2,
      url,
      ok: false,
      status: 0,
      bytes: 0,
      reason: "NETWORK_0",
      final_url: url
    });
    return { ok: false, reason: "NETWORK_0" };
  }
  const sourcePageUrl = options.sourcePageUrl ? String(options.sourcePageUrl) : "";
  const discoveredFromUrl = options.discoveredFromUrl
    ? String(options.discoveredFromUrl)
    : sourcePageUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "user-agent":
        "Mozilla/5.0 (compatible; islegalcannabis/auto_facts; +https://islegalcannabis.com)",
      accept: "text/html,application/pdf;q=0.9,*/*;q=0.8"
    };
    const extraHeaders = options.headers && typeof options.headers === "object" ? options.headers : {};
    Object.assign(headers, extraHeaders);
    if (cached?.etag && method === "GET") {
      headers["if-none-match"] = cached.etag;
    }
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers,
      body: method === "GET" ? undefined : options.body
    });
    const status = Number(response?.status || 0);
    if (status === 304 && cached) {
      let cachedBytes = 0;
      try {
        cachedBytes = fs.statSync(cached.snapshotPath).size;
      } catch {
        cachedBytes = 0;
      }
      recordSnapshotAttempt({
        iso2,
        url,
        ok: true,
        status,
        bytes: cachedBytes,
        reason: "NOT_MODIFIED",
        final_url: cached.finalUrl || url
      });
      return {
        ok: true,
        snapshotPath: cached.snapshotPath,
        status,
        contentHash: cached.contentHash || "",
        retrievedAt: new Date().toISOString(),
        finalUrl: cached.finalUrl || url,
        contentType: cached.contentType || ""
      };
    }
    if (status < 200 || status >= 400) {
      recordSnapshotAttempt({
        iso2,
        url,
        ok: false,
        status,
        bytes: 0,
        reason: `STATUS_${status}`,
        final_url: response?.url || url
      });
      return { ok: false, reason: `STATUS_${status}`, status };
    }
    const contentType = response?.headers?.get("content-type") || "";
    const etag = response?.headers?.get("etag") || "";
    const lowerType = contentType.toLowerCase();
    const finalUrl = response?.url || url;
    const lowerUrl = String(finalUrl || url).toLowerCase();
    const isPdf = lowerType.includes("application/pdf") || lowerUrl.includes(".pdf");
    const isDocx =
      lowerType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
      lowerUrl.includes(".docx");
    const isDoc = lowerType.includes("application/msword") || lowerUrl.includes(".doc");
    const isHtml =
      lowerType.includes("text/html") ||
      lowerType.includes("text/plain") ||
      (!isPdf && !isDocx && !isDoc);
    if (!isPdf && !isDocx && !isDoc && !isHtml) {
      recordSnapshotAttempt({
        iso2,
        url,
        ok: false,
        status,
        bytes: 0,
        reason: "BAD_CONTENT_TYPE",
        final_url: finalUrl
      });
      return { ok: false, reason: "BAD_CONTENT_TYPE", status, contentType };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1) {
      recordSnapshotAttempt({
        iso2,
        url,
        ok: false,
        status,
        bytes: 0,
        reason: "EMPTY_BODY",
        final_url: finalUrl
      });
      return { ok: false, reason: "EMPTY_BODY", status, contentType };
    }
    const ext = isPdf ? "pdf" : isDocx ? "docx" : isDoc ? "doc" : "html";
    const minBytes = ext === "html" ? 1024 : 1024;
    if (buffer.length < minBytes && ext === "html") {
      const textLength = visibleTextLength(buffer.toString("utf8"));
      if (textLength < 200) {
        recordSnapshotAttempt({
          iso2,
          url,
          ok: false,
          status,
          bytes: buffer.length,
          reason: "SMALL_SNAPSHOT",
          final_url: finalUrl
        });
        return { ok: false, reason: "SMALL_SNAPSHOT", status, contentType };
      }
    }
    const hash = sha256File(buffer);
    const dayDir = path.join(ROOT, "data", "source_snapshots", iso2, todayCompact());
    fs.mkdirSync(dayDir, { recursive: true });
    const snapshotPath = path.join(dayDir, `${hash}.${ext}`);
    fs.writeFileSync(snapshotPath, buffer);
    const metaPath = path.join(dayDir, "meta.json");
    const retrievedAt = new Date().toISOString();
    let host = "";
    try {
      host = new URL(finalUrl).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      host = "";
    }
    const meta = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
      : { generated_at: retrievedAt, items: [] };
    meta.iso2 = iso2;
    meta.run_id = process.env.RUN_ID || meta.run_id || "";
    meta.url = url;
    meta.final_url = finalUrl;
    meta.status = status;
    meta.content_hash = hash;
    meta.bytes = buffer.length;
    meta.content_type = contentType || "unknown";
    meta.retrieved_at = retrievedAt;
    meta.fetched_at = retrievedAt;
    meta.items = Array.isArray(meta.items) ? meta.items : [];
    meta.items.push({
      iso2,
      country_iso: iso2,
      url,
      final_url: finalUrl,
      source_page_url: sourcePageUrl,
      discovered_from_url: discoveredFromUrl,
      host,
      status,
      sha256: hash,
      content_hash: hash,
      snapshot: snapshotPath,
      bytes: buffer.length,
      content_type: contentType || "unknown",
      text_len: 0,
      ocr_text_len: 0,
      etag,
      retrieved_at: retrievedAt,
      fetched_at: retrievedAt,
      run_id: process.env.RUN_ID || ""
    });
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
    recordSnapshotAttempt({
      iso2,
      url,
      ok: true,
      status,
      bytes: buffer.length,
      reason: "OK",
      final_url: finalUrl
    });
    return {
      ok: true,
      snapshotPath,
      status,
      contentHash: hash,
      retrievedAt,
      finalUrl,
      contentType
    };
  } catch (error) {
    recordSnapshotAttempt({
      iso2,
      url,
      ok: false,
      status: 0,
      bytes: 0,
      reason: error?.name === "AbortError" ? "TIMEOUT" : "FETCH_ERROR",
      final_url: url
    });
    return {
      ok: false,
      reason: error?.name === "AbortError" ? "TIMEOUT" : "FETCH_ERROR"
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSnapshotWithRetry(iso2, url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const retries = Number(options.retries || 1);
  const method = options.method;
  const headers = options.headers;
  const body = options.body;
  const useCache = options.useCache;
  const sourcePageUrl = options.sourcePageUrl;
  const discoveredFromUrl = options.discoveredFromUrl;
  let snapshot = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    snapshot = await fetchSnapshot(iso2, url, {
      timeoutMs,
      method,
      headers,
      body,
      useCache,
      sourcePageUrl,
      discoveredFromUrl
    });
    if (snapshot?.ok) return snapshot;
    if (snapshot?.reason === "NETWORK_0") {
      return snapshot;
    }
    if (attempt < retries) {
      const reason = String(snapshot?.reason || "");
      const isRetryStatus =
        reason === "STATUS_403" || reason === "STATUS_429" || reason === "FETCH_ERROR";
      const base = attempt === 0 ? 300 : 900;
      const backoff = isRetryStatus ? base * 2 : base;
      if (commandExists("sleep")) {
        spawnSync("sleep", [String(backoff / 1000)]);
      }
    }
  }
  return snapshot || { ok: false, reason: "SNAPSHOT_FAIL" };
}

function isValidLawEvidence(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.evidence_kind !== "law") return false;
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
  if (!evidence.length) return false;
  const anchor = String(evidence[0]?.anchor || evidence[0]?.page || "");
  const quote = String(evidence[0]?.quote || "");
  const combined = `${anchor} ${quote}`;
  if (!quote || !anchor) return false;
  if (hasBannedSnippet(combined)) return false;
  if (!hasCannabisMarker(quote)) return false;
  if (!hasLawMarker(combined)) return false;
  return true;
}

function sanitizeMachineVerifiedEntries() {
  if (!fs.existsSync(MACHINE_VERIFIED_PATH)) return;
  const payload = readJson(MACHINE_VERIFIED_PATH, null);
  if (!payload || typeof payload !== "object") return;
  const entries =
    payload.entries && typeof payload.entries === "object"
      ? payload.entries
      : payload;
  if (!entries || typeof entries !== "object") return;
  const cleaned = {};
  let changed = false;
  let removed = 0;
  for (const [iso, entry] of Object.entries(entries)) {
    if (entry?.evidence_kind !== "law") {
      changed = true;
      removed += 1;
      continue;
    }
    cleaned[iso] = entry;
  }
  const beforeCount = Object.keys(entries).length;
  const afterCount = Object.keys(cleaned).length;
  if (afterCount === 0 && beforeCount > 0) {
    return { beforeCount, afterCount: beforeCount, removed: 0, changed: false, skipped: true };
  }
  if (!changed) return;
  const nextPayload = payload.entries
    ? { ...payload, generated_at: new Date().toISOString(), entries: cleaned }
    : cleaned;
  const tmpPath = `${MACHINE_VERIFIED_PATH}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(nextPayload, null, 2) + "\n");
  fs.renameSync(tmpPath, MACHINE_VERIFIED_PATH);
  return { beforeCount, afterCount, removed, changed: true };
}

function runExtract(iso2, snapshotPath, url) {
  const result = spawnSync(process.execPath, [
    EXTRACT_SCRIPT,
    "--iso2",
    iso2,
    "--snapshot",
    snapshotPath,
    "--url",
    url
  ], {
    stdio: "inherit"
  });
  return result.status ?? 1;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function buildCandidateKey(entry) {
  if (!entry) return "";
  const iso2 = String(entry.iso2 || entry.iso || "").toUpperCase();
  const contentHash = String(entry.content_hash || "");
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
  const anchorOrPage = String(evidence[0]?.anchor || evidence[0]?.page || "");
  const quote = String(evidence[0]?.quote || "");
  if (!iso2 || !contentHash) return "";
  return sha256(`${iso2}|${contentHash}|${anchorOrPage}|${quote}`);
}

function scoreEvidenceEntry(entry) {
  const markers = Array.isArray(entry?.markers_in_snippet) ? entry.markers_in_snippet : [];
  const unique = new Set(markers.map((item) => String(item || ""))).size;
  const quoteLength = String(entry?.quote || "").length;
  return { uniqueMarkers: unique, quoteLength };
}

function pickBestEvidenceEntry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let best = null;
  for (const entry of entries) {
    if (!entry) continue;
    if (!best) {
      best = entry;
      continue;
    }
    const currentScore = scoreEvidenceEntry(entry);
    const bestScore = scoreEvidenceEntry(best);
    if (currentScore.uniqueMarkers > bestScore.uniqueMarkers) {
      best = entry;
      continue;
    }
    if (
      currentScore.uniqueMarkers === bestScore.uniqueMarkers &&
      currentScore.quoteLength > 0 &&
      currentScore.quoteLength < bestScore.quoteLength
    ) {
      best = entry;
    }
  }
  return best;
}

function normalizeCandidateEntries(entries) {
  const normalized = {};
  for (const [key, entry] of Object.entries(entries || {})) {
    if (!entry || typeof entry !== "object") continue;
    const computedKey = entry.key || buildCandidateKey(entry) || key;
    if (!computedKey) continue;
    normalized[computedKey] = { ...entry, key: computedKey };
  }
  return normalized;
}

function snapshotIso(snapshotPath) {
  const match = String(snapshotPath || "").match(/source_snapshots\/([^/]+)\//);
  return match ? match[1].toUpperCase() : "";
}

function loadMachineVerifiedCount() {
  if (!fs.existsSync(MACHINE_VERIFIED_PATH)) return 0;
  try {
    const payload = JSON.parse(fs.readFileSync(MACHINE_VERIFIED_PATH, "utf8"));
    const entries =
      payload && payload.entries && typeof payload.entries === "object"
        ? payload.entries
        : payload;
    return entries && typeof entries === "object" ? Object.keys(entries).length : 0;
  } catch {
    return 0;
  }
}

function loadMachineVerifiedIsoSet() {
  if (!fs.existsSync(MACHINE_VERIFIED_PATH)) return new Set();
  try {
    const payload = JSON.parse(fs.readFileSync(MACHINE_VERIFIED_PATH, "utf8"));
    const entries =
      payload && payload.entries && typeof payload.entries === "object"
        ? payload.entries
        : payload;
    const keys = entries && typeof entries === "object" ? Object.keys(entries) : [];
    return new Set(keys.map((iso) => String(iso || "").toUpperCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function buildMachineVerifiedIds() {
  if (!fs.existsSync(MACHINE_VERIFIED_PATH)) return new Set();
  try {
    const payload = JSON.parse(fs.readFileSync(MACHINE_VERIFIED_PATH, "utf8"));
    const entries =
      payload && payload.entries && typeof payload.entries === "object"
        ? payload.entries
        : payload;
    const ids = new Set();
    for (const [iso, entry] of Object.entries(entries || {})) {
      const iso2 = String(entry?.iso2 || iso || "").toUpperCase();
      const hash = String(entry?.content_hash || "");
      const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
      const anchor = String(evidence[0]?.anchor || evidence[0]?.page || "");
      if (!iso2 || !hash || !anchor) continue;
      ids.add(`${iso2}|${hash}|${anchor}`);
    }
    return ids;
  } catch {
    return new Set();
  }
}

function loadCandidateFacts() {
  if (!fs.existsSync(CANDIDATE_FACTS_PATH)) {
    return { generated_at: new Date().toISOString(), entries: {} };
  }
  try {
    const payload = JSON.parse(fs.readFileSync(CANDIDATE_FACTS_PATH, "utf8"));
    if (payload && payload.entries && typeof payload.entries === "object") {
      return { ...payload, entries: normalizeCandidateEntries(payload.entries) };
    }
    return {
      generated_at: new Date().toISOString(),
      entries: normalizeCandidateEntries(payload || {})
    };
  } catch {
    return { generated_at: new Date().toISOString(), entries: {} };
  }
}

function writeCandidateFacts(payload) {
  const output = payload.entries ? payload : { entries: payload };
  fs.mkdirSync(path.dirname(CANDIDATE_FACTS_PATH), { recursive: true });
  fs.writeFileSync(
    CANDIDATE_FACTS_PATH,
    JSON.stringify({ generated_at: new Date().toISOString(), ...output }, null, 2) + "\n"
  );
}

function findMetaForSnapshot(snapshotPath) {
  const metaPath = path.join(path.dirname(snapshotPath), "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const items = Array.isArray(meta?.items) ? meta.items : [];
    const match = items.find((item) => item?.snapshot === snapshotPath);
    return {
      iso2: String(match?.iso2 || snapshotIso(snapshotPath)).toUpperCase(),
      url: String(match?.final_url || match?.url || ""),
      source_page_url: String(match?.source_page_url || ""),
      discovered_from_url: String(match?.discovered_from_url || ""),
      content_type: String(match?.content_type || meta?.content_type || ""),
      content_hash: String(match?.content_hash || match?.sha256 || meta?.content_hash || "")
    };
  } catch {
    return null;
  }
}

function normalizeUrlKey(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    let pathname = parsed.pathname || "/";
    if (pathname !== "/" && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`.toLowerCase();
  } catch {
    return String(value || "").trim().toLowerCase();
  }
}

function updateSnapshotMeta(snapshotPath, updates = {}) {
  if (!snapshotPath) return;
  const metaPath = path.join(path.dirname(snapshotPath), "meta.json");
  if (!fs.existsSync(metaPath)) return;
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return;
  }
  const items = Array.isArray(meta?.items) ? meta.items : [];
  const match = items.find((item) => item?.snapshot === snapshotPath);
  if (!match) return;
  let changed = false;
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "undefined" || value === null) continue;
    if (match[key] !== value) {
      match[key] = value;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  }
}

async function buildDocHuntTargets({
  iso2,
  baseUrl,
  snapshotPaths,
  timeoutMs = 10000,
  retries = 1
}) {
  const docLinks = new Map();
  const docRequests = new Map();
  const detailQueue = [];
  const detailSeen = new Set();
  const detailSnapshots = [];
  const docSnapshots = [];
  let pagesFetched = 0;
  let baseHost = "";
  try {
    baseHost = new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    baseHost = "";
  }
  for (const snapshotPath of snapshotPaths) {
    if (!snapshotPath || !snapshotPath.endsWith(".html")) continue;
    let html = "";
    try {
      html = fs.readFileSync(snapshotPath, "utf8");
    } catch {
      html = "";
    }
    if (!html) continue;
    const meta = findMetaForSnapshot(snapshotPath) || {};
    const pageUrl = String(meta.url || meta.final_url || baseUrl || "");
    const links = extractLinksFromHtml(html, pageUrl);
    const postbacks = extractPostbackPdfRequests(html, pageUrl);
    for (const request of postbacks) {
      if (!request?.url) continue;
      if (!isOfficialUrl(request.url, undefined, { iso2 }).ok) continue;
      const key = `${request.url}|${request.body || ""}`;
      if (!docRequests.has(key)) {
        docRequests.set(key, { ...request, sourcePageUrl: pageUrl });
      }
    }
    for (const link of links) {
      let host = "";
      try {
        host = new URL(link).hostname.replace(/^www\./, "");
      } catch {
        host = "";
      }
      if (baseHost && host && !isSameRootDomain(baseHost, host)) continue;
      if (!isOfficialUrl(link, undefined, { iso2 }).ok) continue;
      if (isDocUrl(link)) {
        if (!docLinks.has(link)) docLinks.set(link, pageUrl);
      } else if (isDetailUrl(link)) {
        detailQueue.push({ url: link, depth: 1 });
      }
      if (detailQueue.length >= DETAIL_LIMIT) break;
    }
  }

  while (detailQueue.length > 0) {
    const next = detailQueue.shift();
    if (!next || !next.url) continue;
    if (detailSeen.has(next.url)) continue;
    detailSeen.add(next.url);
    if (detailSnapshots.length >= DETAIL_LIMIT) break;
    const snapshot = await fetchSnapshotWithRetry(iso2, next.url, {
      timeoutMs,
      retries
    });
    pagesFetched += 1;
    if (!snapshot?.ok || !snapshot.snapshotPath) continue;
    detailSnapshots.push(snapshot.snapshotPath);
    if (!snapshot.snapshotPath.endsWith(".html")) continue;
    if (next.depth >= CRAWL_DEPTH) continue;
    let html = "";
    try {
      html = fs.readFileSync(snapshot.snapshotPath, "utf8");
    } catch {
      html = "";
    }
    if (!html) continue;
    const links = extractLinksFromHtml(html, next.url);
    const postbacks = extractPostbackPdfRequests(html, next.url);
    for (const request of postbacks) {
      if (!request?.url) continue;
      if (!isOfficialUrl(request.url, undefined, { iso2 }).ok) continue;
      const key = `${request.url}|${request.body || ""}`;
      if (!docRequests.has(key)) {
        docRequests.set(key, { ...request, sourcePageUrl: next.url });
      }
    }
    for (const link of links) {
      let host = "";
      try {
        host = new URL(link).hostname.replace(/^www\./, "");
      } catch {
        host = "";
      }
      if (baseHost && host && !isSameRootDomain(baseHost, host)) continue;
      if (!isOfficialUrl(link, undefined, { iso2 }).ok) continue;
      if (isDocUrl(link)) {
        if (!docLinks.has(link)) docLinks.set(link, next.url);
      } else if (isDetailUrl(link)) {
        detailQueue.push({ url: link, depth: next.depth + 1 });
      }
      if (detailQueue.length >= DETAIL_LIMIT) break;
    }
  }

  const docList = Array.from(docLinks.entries()).slice(0, DOC_HUNT_LIMIT);
  for (const [docUrl, sourcePageUrl] of docList) {
    const snapshot = await fetchSnapshotWithRetry(iso2, docUrl, {
      timeoutMs,
      retries,
      sourcePageUrl,
      discoveredFromUrl: sourcePageUrl
    });
    pagesFetched += 1;
    if (!snapshot?.ok || !snapshot.snapshotPath) continue;
    docSnapshots.push(snapshot.snapshotPath);
  }
  const requestList = Array.from(docRequests.values()).slice(
    0,
    Math.max(0, DOC_HUNT_LIMIT - docSnapshots.length)
  );
  for (const request of requestList) {
    const snapshot = await fetchSnapshotWithRetry(iso2, request.url, {
      timeoutMs,
      retries,
      method: request.method,
      headers: request.headers,
      body: request.body,
      useCache: false,
      sourcePageUrl: request.sourcePageUrl,
      discoveredFromUrl: request.sourcePageUrl
    });
    pagesFetched += 1;
    if (!snapshot?.ok || !snapshot.snapshotPath) continue;
    docSnapshots.push(snapshot.snapshotPath);
  }

  return {
    docs_found: docLinks.size + docRequests.size,
    docs_snapshotted: docSnapshots.length,
    detail_snapshots: detailSnapshots,
    doc_snapshots: docSnapshots,
    pages_fetched: pagesFetched
  };
}

async function expandDetailPages({
  iso2,
  lawPageUrl,
  lawPageSnapshotPaths,
  timeoutMs = 10000,
  retries = 1,
  maxDetails = 50,
  maxListPages = 6,
  maxListDepth = 2
}) {
  if (!lawPageUrl) {
    return {
      list_pages: 0,
      detail_pages: 0,
      detail_urls: [],
      detail_snapshots: []
    };
  }
  const detailUrls = new Set();
  const detailSnapshots = [];
  const listQueue = [];
  const listSeen = new Set();
  let listPages = 0;
  let baseOrigin = "";
  try {
    baseOrigin = new URL(lawPageUrl).origin;
  } catch {
    baseOrigin = "";
  }
  const enqueueList = (url, depth) => {
    if (!url) return;
    if (!isOfficialUrl(url, undefined, { iso2 }).ok) return;
    if (listSeen.has(url)) return;
    listSeen.add(url);
    listQueue.push({ url, depth });
  };
  const snapshotPaths = Array.isArray(lawPageSnapshotPaths)
    ? lawPageSnapshotPaths
    : [];
  let htmlSnapshots = snapshotPaths.filter((path) => path.endsWith(".html"));
  if (htmlSnapshots.length === 0) {
    const snapshot = await fetchSnapshotWithRetry(iso2, lawPageUrl, {
      timeoutMs,
      retries
    });
    if (snapshot?.ok && snapshot.snapshotPath) {
      htmlSnapshots = [snapshot.snapshotPath];
    }
  }
  for (const snapshotPath of htmlSnapshots) {
    listPages += 1;
    let html = "";
    try {
      html = fs.readFileSync(snapshotPath, "utf8");
    } catch {
      html = "";
    }
    if (!html) continue;
    const links = extractLinksFromHtml(html, lawPageUrl);
    for (const link of links) {
      const lower = link.toLowerCase();
      if (
        lower.includes("actdocumentdetail.aspx") ||
        lower.includes("actdetail.aspx") ||
        lower.includes("document") ||
        lower.includes("detail") ||
        lower.includes("download")
      ) {
        if (isOfficialUrl(link, undefined, { iso2 }).ok) {
          detailUrls.add(link);
        }
      } else if (isListUrl(link)) {
        enqueueList(link, 1);
      }
    }
    const actIds = extractActIds(html);
    if (actIds.length) {
      for (const actId of actIds) {
        if (!baseOrigin) continue;
        detailUrls.add(`${baseOrigin}/ActDetail.aspx?ActID=${actId}`);
        detailUrls.add(`${baseOrigin}/ActDocumentDetail.aspx?ActID=${actId}`);
      }
    }
  }
  if (baseOrigin && baseOrigin !== lawPageUrl) {
    enqueueList(`${baseOrigin}/`, 1);
  }
  while (listQueue.length > 0 && listPages < maxListPages) {
    const next = listQueue.shift();
    if (!next || !next.url) continue;
    const snapshot = await fetchSnapshotWithRetry(iso2, next.url, {
      timeoutMs,
      retries
    });
    if (!snapshot?.ok || !snapshot.snapshotPath) continue;
    listPages += 1;
    if (!snapshot.snapshotPath.endsWith(".html")) continue;
    let html = "";
    try {
      html = fs.readFileSync(snapshot.snapshotPath, "utf8");
    } catch {
      html = "";
    }
    if (!html) continue;
    const links = extractLinksFromHtml(html, next.url);
    for (const link of links) {
      const lower = link.toLowerCase();
      if (
        lower.includes("actdocumentdetail.aspx") ||
        lower.includes("actdetail.aspx") ||
        lower.includes("document") ||
        lower.includes("detail") ||
        lower.includes("download")
      ) {
        if (isOfficialUrl(link, undefined, { iso2 }).ok) {
          detailUrls.add(link);
        }
      } else if (next.depth < maxListDepth && isListUrl(link)) {
        enqueueList(link, next.depth + 1);
      }
    }
    const actIds = extractActIds(html);
    if (actIds.length) {
      for (const actId of actIds) {
        if (!baseOrigin) continue;
        detailUrls.add(`${baseOrigin}/ActDetail.aspx?ActID=${actId}`);
        detailUrls.add(`${baseOrigin}/ActDocumentDetail.aspx?ActID=${actId}`);
      }
    }
  }
  if (baseOrigin.includes("gzk.rks-gov.net")) {
    for (const actId of ["2572"]) {
      detailUrls.add(`${baseOrigin}/ActDetail.aspx?ActID=${actId}`);
      detailUrls.add(`${baseOrigin}/ActDocumentDetail.aspx?ActID=${actId}`);
    }
  }
  const detailList = Array.from(detailUrls)
    .sort((left, right) => {
      const leftLower = left.toLowerCase();
      const rightLower = right.toLowerCase();
      const leftDoc = leftLower.includes("actdocumentdetail");
      const rightDoc = rightLower.includes("actdocumentdetail");
      if (leftDoc !== rightDoc) return leftDoc ? -1 : 1;
      const leftId = Number((leftLower.match(/actid=(\d+)/) || [])[1] || 0);
      const rightId = Number((rightLower.match(/actid=(\d+)/) || [])[1] || 0);
      if (leftId && rightId && leftId !== rightId) return leftId - rightId;
      return left.localeCompare(right);
    })
    .slice(0, maxDetails);
  for (const detailUrl of detailList) {
    if (!isOfficialUrl(detailUrl, undefined, { iso2 }).ok) continue;
    const snapshot = await fetchSnapshotWithRetry(iso2, detailUrl, {
      timeoutMs,
      retries
    });
    if (!snapshot?.ok || !snapshot.snapshotPath) continue;
    detailSnapshots.push(snapshot.snapshotPath);
  }
  return {
    list_pages: listPages,
    detail_pages: detailSnapshots.length,
    detail_urls: detailList,
    detail_snapshots: detailSnapshots
  };
}

function listEntryPointUrls(catalog, iso2) {
  const entry = catalog?.[iso2] || {};
  const urls = new Set();
  for (const url of collectOfficialUrls(entry)) {
    if (typeof url === "string" && url.trim()) urls.add(url.trim());
  }
  const portals = Array.isArray(entry.government_portal)
    ? entry.government_portal
    : Array.isArray(entry.government_portals)
      ? entry.government_portals
      : [];
  for (const url of portals) {
    if (typeof url === "string" && url.trim()) urls.add(url.trim());
  }
  return Array.from(urls);
}

async function discoverCannabisCandidates({
  iso2,
  entrypoints,
  timeoutMs = 10000,
  retries = 1,
  maxPages = MAX_PAGES,
  maxDepth = CRAWL_DEPTH
}) {
  const robotsCache = new Map();
  const visited = new Set();
  const candidates = [];
  const queue = [];
  const snapshotPaths = [];
  for (const url of entrypoints.slice(0, MAX_ENTRYPOINTS)) {
    queue.push({ url, depth: 0 });
  }
  let scanned = 0;
  while (queue.length > 0 && scanned < maxPages) {
    const current = queue.shift();
    if (!current || !current.url) continue;
    if (visited.has(current.url)) continue;
    visited.add(current.url);
    const robots = await isRobotsAllowed(current.url, robotsCache);
    if (!robots.ok) {
      recordSnapshotAttempt({
        iso2,
        url: current.url,
        ok: false,
        status: 0,
        bytes: 0,
        reason: robots.reason || "ROBOTS_BLOCKED",
        final_url: current.url
      });
      candidates.push({ url: current.url, score: 0, reason: robots.reason });
      continue;
    }
    const snapshot = await fetchSnapshotWithRetry(iso2, current.url, {
      timeoutMs,
      retries
    });
    scanned += 1;
    if (!snapshot?.ok || !snapshot.snapshotPath) continue;
    snapshotPaths.push(snapshot.snapshotPath);
    if (!snapshot.snapshotPath.endsWith(".html")) continue;
    let html = "";
    try {
      html = fs.readFileSync(snapshot.snapshotPath, "utf8");
    } catch {
      html = "";
    }
    if (!html) continue;
    const title = extractTitle(html);
    const links = extractAnchorLinks(html, current.url);
    for (const link of links) {
      if (!link?.url) continue;
      let baseHost = "";
      let linkHost = "";
      try {
        baseHost = new URL(current.url).hostname.replace(/^www\./, "");
        linkHost = new URL(link.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (!isSameRootDomain(baseHost, linkHost)) continue;
      if (!isOfficialUrl(link.url, undefined, { iso2 }).ok) continue;
      const label = `${link.url} ${link.text || ""} ${title}`.toLowerCase();
      const cannabisHit = hasCannabisKeyword(label);
      const sectionHit = hasSectionKeyword(label);
      if (!cannabisHit && !sectionHit) continue;
      const score = scoreCandidate(label);
      if (cannabisHit) {
        candidates.push({ url: link.url, score, reason: "keyword_match" });
      } else if (sectionHit) {
        candidates.push({ url: link.url, score, reason: "section_match" });
      }
      if (current.depth + 1 <= maxDepth) {
        queue.push({ url: link.url, depth: current.depth + 1 });
      }
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    if (!candidate?.url) continue;
    if (!unique.has(candidate.url)) {
      unique.set(candidate.url, candidate);
      continue;
    }
    const existing = unique.get(candidate.url);
    if ((candidate.score || 0) > (existing.score || 0)) {
      unique.set(candidate.url, candidate);
    }
  }
  const sorted = Array.from(unique.values()).sort((a, b) => b.score - a.score);
  return {
    scanned,
    candidates: sorted,
    top_urls: sorted.slice(0, 3).map((item) => item.url),
    snapshot_paths: snapshotPaths
  };
}

async function main() {
  let iso2 = readArg("--iso2").toUpperCase();
  let snapshotPath = readArg("--snapshot");
  let url = readArg("--url");
  const pipelineMode = readArg("--pipeline", "");

  const last = readJson(AUTO_LEARN_REPORT, {});
  const lawReport = readJson(
    path.join(ROOT, "Reports", "auto_learn_law", "last_run.json"),
    {}
  );
  const catalog = readJson(CATALOG_PATH, {}) || {};
  const lastIso = String(last?.iso2 || last?.iso || "").toUpperCase();
  const lawReportIso = String(lawReport?.iso2 || lawReport?.iso || "").toUpperCase();
  const pipelineIso = String(iso2 || lastIso || "").toUpperCase();
  const lawPageOkUrl = lawReportIso && lawReportIso === pipelineIso
    ? String(lawReport?.law_page_ok_url || "")
    : "";
  const lawPageSnapshotPaths =
    lastIso && lastIso === pipelineIso
      ? Array.isArray(last?.law_page_snapshot_paths)
        ? last.law_page_snapshot_paths
        : last?.law_page_snapshot_path
          ? [last.law_page_snapshot_path]
          : []
      : [];
  const runCannabis = pipelineMode === "cannabis" || USE_CANNABIS_PIPELINE;
  let officialScope = { roots: [], hosts: [] };
  let wikiOfficialRefs = [];
  if (pipelineIso) {
    officialScope = officialScopeForIso(pipelineIso);
    if (runCannabis) {
      wikiOfficialRefs = await loadWikiOfficialRefs(pipelineIso, pipelineIso);
      if (wikiOfficialRefs.length) {
        const rootSet = new Set(
          Array.isArray(officialScope?.roots) ? officialScope.roots : []
        );
        const hostSet = new Set(
          Array.isArray(officialScope?.hosts) ? officialScope.hosts : []
        );
        for (const ref of wikiOfficialRefs) {
          const url = String(ref?.url || "").trim();
          if (!url) continue;
          try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
            if (host) hostSet.add(host);
            const root = getRootDomain(host);
            if (root) rootSet.add(root);
          } catch {
            continue;
          }
        }
        officialScope = { roots: Array.from(rootSet), hosts: Array.from(hostSet) };
      }
    }
    const roots = Array.isArray(officialScope?.roots) ? officialScope.roots : [];
    const hosts = Array.isArray(officialScope?.hosts) ? officialScope.hosts : [];
    console.log(
      `OFFICIAL_SCOPE: iso=${pipelineIso} roots=[${roots.join(",") || "-"}] allowed_hosts_count=${hosts.length}`
    );
  }
  let entrypointSnapshots = [];
  let candidateSnapshots = [];
  let cannabisDiscovery = {
    scanned: 0,
    candidates: [],
    top_urls: [],
    snapshot_paths: []
  };
  let cannabisCandidates = [];
  let entrypointsUsed = [];
  const expandDetail = await expandDetailPages({
    iso2: pipelineIso || "n/a",
    lawPageUrl: lawPageOkUrl,
    lawPageSnapshotPaths,
    timeoutMs: 12000,
    retries: 1,
    maxDetails: 50
  });
  if (runCannabis && pipelineIso) {
    const entrypointSet = new Set(listEntryPointUrls(catalog, pipelineIso));
    if (lawPageOkUrl) entrypointSet.add(lawPageOkUrl);
    const wikiEntrypointSet = new Set();
    for (const ref of wikiOfficialRefs) {
      const url = String(ref?.url || "").trim();
      if (url) {
        entrypointSet.add(url);
        wikiEntrypointSet.add(url);
      }
    }
    try {
      const origin = new URL(lawPageOkUrl).origin;
      if (origin) entrypointSet.add(`${origin}/`);
    } catch {}
    const entrypoints = Array.from(entrypointSet).filter(
      (entry) =>
        wikiEntrypointSet.has(entry) ||
        isOfficialUrl(entry, undefined, { iso2: pipelineIso }).ok
    );
    entrypointsUsed = entrypoints.slice(0, MAX_ENTRYPOINTS);
    cannabisDiscovery = await discoverCannabisCandidates({
      iso2: pipelineIso,
      entrypoints: entrypointsUsed,
      timeoutMs: 12000,
      retries: 1
    });
    cannabisCandidates = cannabisDiscovery.candidates.slice(0, MAX_CANDIDATES);
    entrypointSnapshots = cannabisDiscovery.snapshot_paths;
    const robotsCache = new Map();
    for (const candidate of cannabisCandidates) {
      const candidateUrl = candidate?.url;
      if (!candidateUrl) continue;
      const robots = await isRobotsAllowed(candidateUrl, robotsCache);
      if (!robots.ok) {
        recordSnapshotAttempt({
          iso2: pipelineIso,
          url: candidateUrl,
          ok: false,
          status: 0,
          bytes: 0,
          reason: robots.reason || "ROBOTS_BLOCKED",
          final_url: candidateUrl
        });
        continue;
      }
      const snap = await fetchSnapshotWithRetry(pipelineIso, candidateUrl, {
        timeoutMs: 12000,
        retries: 1
      });
      if (snap?.ok && snap.snapshotPath) {
        candidateSnapshots.push(snap.snapshotPath);
      }
    }
  } else {
    candidateSnapshots = lawPageSnapshotPaths;
  }
  const snapshotPaths = runCannabis ? candidateSnapshots : lawPageSnapshotPaths;
  const keywordCandidateFound = runCannabis
    ? cannabisCandidates.some((entry) => entry?.reason === "keyword_match")
    : false;
  const docHuntTargets = [
    ...(runCannabis ? candidateSnapshots : lawPageSnapshotPaths),
    ...(keywordCandidateFound ? entrypointSnapshots : []),
    ...(Array.isArray(expandDetail.detail_snapshots) ? expandDetail.detail_snapshots : [])
  ].filter(Boolean);
  const docHunt =
    docHuntTargets.length
      ? await buildDocHuntTargets({
          iso2: pipelineIso || "n/a",
          baseUrl: lawPageOkUrl || entrypointsUsed[0] || "",
          snapshotPaths: docHuntTargets,
          timeoutMs: 12000,
          retries: 1
        })
      : {
          docs_found: 0,
          docs_snapshotted: 0,
          detail_snapshots: [],
          doc_snapshots: [],
          pages_fetched: 0
        };
  const docSnapshots = Array.isArray(docHunt.doc_snapshots) ? docHunt.doc_snapshots : [];
  const docBySource = new Map();
  for (const docSnapshot of docSnapshots) {
    const meta = findMetaForSnapshot(docSnapshot) || {};
    const sourceUrl = meta.discovered_from_url || meta.source_page_url || "";
    const key = normalizeUrlKey(sourceUrl);
    if (!key) continue;
    const entry = docBySource.get(key) || [];
    entry.push({
      snapshot: docSnapshot,
      url: String(meta.url || "")
    });
    docBySource.set(key, entry);
  }
  const limit = Math.max(1, Number(process.env.AUTO_FACTS_LIMIT || 10) || 10);
  const targets = [];
  const seen = new Set();
  const expandedSnapshots = [
    ...snapshotPaths,
    ...docHunt.doc_snapshots,
    ...docHunt.detail_snapshots,
    ...(Array.isArray(expandDetail.detail_snapshots) ? expandDetail.detail_snapshots : [])
  ];
  for (const candidate of expandedSnapshots) {
    if (!candidate) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    targets.push(candidate);
  }

  if (!iso2 && pipelineIso) iso2 = pipelineIso;
  const noTargets = targets.length === 0 && !snapshotPath;
  if (noTargets) {
    const runAt = new Date().toISOString();
    let reason = runCannabis
      ? entrypointsUsed.length
        ? "NO_CANDIDATES"
        : "NO_ENTRYPOINTS"
      : "NO_LAW_PAGE";
    if (!FETCH_ENABLED && entrypointsUsed.length) {
      reason = "NEED_FETCH";
    } else if (FETCH_ENABLED) {
      const fetchReason = deriveSnapshotFailure(snapshotAttempts);
      if (fetchReason) {
        reason = fetchReason;
      }
    }
    if (FETCH_ENABLED && entrypointsUsed.length && snapshotAttempts.length === 0) {
      snapshotAttempts.push({
        iso2: pipelineIso || iso2 || "",
        url: entrypointsUsed[0] || "",
        ok: false,
        status: 0,
        bytes: 0,
        reason: "NO_SNAPSHOT_ATTEMPT",
        final_url: entrypointsUsed[0] || ""
      });
    }
    const reportPayload = {
      run_id: process.env.RUN_ID || "",
      run_at: runAt,
      iso2: pipelineIso || "n/a",
      picked: [],
      extracted: 0,
      confidence: "low",
      evidence_count: 0,
      evidence_ok: 0,
      law_pages: 0,
      machine_verified_delta: 0,
      candidate_facts_delta: 0,
      progress_delta: 0,
      regress_delta: 0,
      progress_components: {
        machine_verified_added: 0,
        machine_verified_removed: 0,
        candidate_facts_added: 0
      },
      reason,
      status: "UNKNOWN",
      reason_code: reason,
      verify_links: 0,
      cannabis_discovery: {
        scanned: cannabisDiscovery.scanned || 0,
        found_candidates: cannabisDiscovery.candidates.length || 0,
        top_urls: cannabisDiscovery.top_urls || []
      },
      expand_detail: {
        list_pages: Number(expandDetail.list_pages || 0) || 0,
        detail_pages: Number(expandDetail.detail_pages || 0) || 0,
        top_urls: Array.isArray(expandDetail.detail_urls)
          ? expandDetail.detail_urls.slice(0, 3)
          : []
      },
      docs_found: Number(docHunt.docs_found || 0) || 0,
      docs_snapshotted: Number(docHunt.docs_snapshotted || 0) || 0,
      snapshot_attempts: snapshotAttempts.slice(0, SNAPSHOT_ATTEMPT_LIMIT),
      marker_hits_top: [],
      marker_hits_top_urls: [],
      evidence_samples: [],
      reasons: [],
      items: []
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(reportPayload, null, 2) + "\n");
    const summaryIso = reportPayload.iso2 || "n/a";
    const topCandidates = reportPayload.cannabis_discovery?.top_urls?.length
      ? reportPayload.cannabis_discovery.top_urls.join(",")
      : "-";
    console.log(
      `CANNABIS_DISCOVERY: iso=${summaryIso} scanned=${reportPayload.cannabis_discovery?.scanned || 0} found_candidates=${reportPayload.cannabis_discovery?.found_candidates || 0} top3=[${topCandidates}]`
    );
    const expandTop = reportPayload.expand_detail?.top_urls?.length
      ? reportPayload.expand_detail.top_urls.join(",")
      : "-";
    console.log(
      `EXPAND_DETAIL: iso=${summaryIso} list_pages=${reportPayload.expand_detail?.list_pages || 0} detail_pages=${reportPayload.expand_detail?.detail_pages || 0} top3=[${expandTop}]`
    );
    console.log(
      `DOC_HUNT: iso=${summaryIso} docs_found=${reportPayload.docs_found} docs_snapshotted=${reportPayload.docs_snapshotted} ocr_ran_count=0`
    );
    console.log(`MARKER_HITS_TOP5: iso=${summaryIso} top5=[-]`);
    console.log("LEARNED: iso=n/a extracted=0 evidence=0");
    process.exit(0);
  }

  const sanitizeResult = sanitizeMachineVerifiedEntries() || {};
  const mvBeforeCount = sanitizeResult.afterCount ?? loadMachineVerifiedCount();
  const mvBeforeIds = buildMachineVerifiedIds();
  const machineVerifiedIso = loadMachineVerifiedIsoSet();
  let mvWriteSummaryCache = null;
  const candidatePayload = loadCandidateFacts();
  const beforeCandidateCount = Object.keys(candidatePayload.entries || {}).length;
  const items = [];
  let extractedTotal = 0;
  let evidenceOkTotal = 0;
  let evidenceFoundTotal = 0;
  let guardTried = 0;
  let guardRejected = 0;
  const guardReasons = new Map();
  let candidateRun = 0;
  let ocrRanCount = 0;
  let ocrSample = null;
  const markerHitCounts = new Map();
  const evidenceSamples = [];
  let bestEvidence = null;
  let bestEvidenceCount = 0;
  let bestStatusItem = null;
  let bestEvidenceUrl = "";
  let bestEvidenceSnapshot = "";
  let bestEvidenceMarkers = [];
  const statusEvidenceItems = [];
  const statusEvidenceDocs = new Map();
  const statusEvidenceUrls = [];
  let statusEvidenceBest = null;
  let statusEvidenceBestDoc = "";
  let statusEvidenceBestSnapshot = "";
  let statusEvidenceBestMarker = "";
  const markerHitsByUrl = [];
  const runAt = new Date().toISOString();

  const pool = targets.length ? targets : [snapshotPath];
  const preferred = [];
  const fallback = [];
  for (const snap of pool) {
    const iso = snapshotIso(snap);
    if (!iso) {
      fallback.push(snap);
      continue;
    }
    if (machineVerifiedIso.has(iso)) {
      fallback.push(snap);
    } else {
      preferred.push(snap);
    }
  }
  const toProcess = [...preferred, ...fallback].filter(Boolean);
  for (const snapshot of toProcess) {
    if (items.length >= limit) break;
    if (!snapshot || !fs.existsSync(snapshot)) {
      items.push({
        iso2: snapshotIso(snapshot),
        snapshot_path: snapshot,
        evidence_ok: 0,
        reason: "SNAPSHOT_MISSING"
      });
      continue;
    }
    const meta = findMetaForSnapshot(snapshot) || {};
    const targetIso = String(meta.iso2 || iso2 || snapshotIso(snapshot)).toUpperCase();
    const targetUrl = String(meta.url || url || "");
    if (!targetIso || !targetUrl) {
      items.push({
        iso2: targetIso || snapshotIso(snapshot),
        snapshot_path: snapshot,
        evidence_ok: 0,
        reason: "NO_URL"
      });
      continue;
    }
    const status = runExtract(targetIso, snapshot, targetUrl);
    if (status !== 0) {
      items.push({
        iso2: targetIso,
        url: targetUrl,
        snapshot_path: snapshot,
        content_type: meta.content_type || "",
        content_hash: meta.content_hash || "",
        evidence_ok: 0,
        reason: "EXTRACT_FAIL"
      });
      continue;
    }
    const report = readJson(REPORT_PATH, {});
    const evidenceCount = Number(report?.evidence_count || 0) || 0;
    const statusClaim = report?.status_claim || null;
    const statusClaimType = String(statusClaim?.type || "UNKNOWN");
    const statusClaimBound = Boolean(statusClaim?.cannabis_bound);
    const guard = report?.evidence_snippet_guard || {};
    const guardTriedCount = Number(guard?.tried || 0) || 0;
    const guardRejectedCount = Number(guard?.rejected || 0) || 0;
    guardTried += guardTriedCount;
    guardRejected += guardRejectedCount;
    if (guard?.reasons && typeof guard.reasons === "object") {
      for (const [key, value] of Object.entries(guard.reasons)) {
        const label = String(key || "").trim();
        if (!label) continue;
        const count = Number(value || 0) || 0;
        guardReasons.set(label, (guardReasons.get(label) || 0) + count);
      }
    }
    const officialOk = Boolean(report?.official_source_ok);
    const evidence = Array.isArray(report?.evidence) ? report.evidence : [];
    const markerHits = Array.isArray(report?.marker_hits) ? report.marker_hits : [];
    for (const hit of markerHits) {
      const label = String(hit || "").trim();
      if (!label) continue;
      markerHitCounts.set(label, (markerHitCounts.get(label) || 0) + 1);
    }
    if (markerHits.length > 0) {
      markerHitsByUrl.push({
        url: targetUrl,
        markers: markerHits.slice(0, 5)
      });
    }
    const ocrRan = Boolean(report?.ocr_ran);
    const ocrRequired = Boolean(report?.ocr_required);
    if (ocrRan) {
      ocrRanCount += 1;
    }
    if ((ocrRan || ocrRequired) && !ocrSample) {
      ocrSample = {
        iso2: targetIso,
        url: targetUrl,
        text_len: Number(report?.ocr_text_len || report?.text_len || 0) || 0,
        engine: String(report?.ocr_engine || ""),
        reason: String(report?.ocr_reason || ""),
        pages: Array.isArray(report?.ocr_pages) ? report.ocr_pages.length : 0,
        ran: ocrRan
      };
    }
    const isDocSnapshot = String(snapshot || "").toLowerCase().match(/\.(pdf|docx?)$/);
    const wrapperKey = normalizeUrlKey(targetUrl);
    const wrapperHasDocs = !isDocSnapshot && wrapperKey && docBySource.has(wrapperKey);
    const effectiveEvidence = wrapperHasDocs ? [] : evidence;
    const effectiveEvidenceCount = wrapperHasDocs ? 0 : evidenceCount;
    const bestEntry = pickBestEvidenceEntry(effectiveEvidence);
    const anchorOrPage = String(bestEntry?.anchor || bestEntry?.page || "");
    const quote = String(bestEntry?.quote || "");
    const evidenceKind = String(report?.evidence_kind || "non_law");
    const docIsNormative = Boolean(report?.doc_is_normative);
    const lawPageLikely = Boolean(report?.law_page_likely) || evidenceKind === "law";
    const lawDoc = docIsNormative || evidenceKind === "law_doc";
    const lawPage = (lawPageLikely || lawDoc) && effectiveEvidenceCount > 0;
    const cannabisMarkerFound = Boolean(report?.cannabis_marker_found);
    const cannabisBindingFound = Boolean(report?.cannabis_binding_found);
    const lawMarkerFound = Boolean(report?.law_marker_found);
    const evidenceHasMarkers = cannabisBindingFound && markerHits.length > 0;
    const markedEvidenceCount = evidenceHasMarkers ? effectiveEvidenceCount : 0;
    const markedEvidence = evidenceHasMarkers ? effectiveEvidence : [];
    const lawMarkerOk = lawPageLikely ? lawMarkerFound : lawDoc;
    const statusClaimOk = statusClaimType !== "UNKNOWN" && statusClaimBound;
    const evidenceOk =
      lawPage &&
      anchorOrPage &&
      quote.trim() &&
      evidenceHasMarkers &&
      lawMarkerOk &&
      statusClaimOk
        ? 1
        : 0;
    const machineVerifiedOk = evidenceOk && officialOk;
    if (markedEvidenceCount > 0) extractedTotal += 1;
    if (markedEvidenceCount > 0) evidenceFoundTotal += 1;
    if (evidenceOk) evidenceOkTotal += 1;
    if (markedEvidenceCount > 0) {
      evidenceSamples.push({
        iso2: targetIso,
        url: targetUrl,
        quote: quote.slice(0, 200),
        marker_hits: markerHits.slice(0, 5)
      });
    }
    if (statusClaimOk && markedEvidenceCount > 0 && (lawPageLikely || lawDoc)) {
      const statusEntry = bestEntry || markedEvidence[0] || {};
      const locator = statusEntry?.page
        ? { page: statusEntry.page }
        : statusEntry?.anchor
          ? { anchor: statusEntry.anchor }
          : {};
      const statusMarker =
        statusClaim?.markers_in_snippet?.[0] ||
        statusEntry?.marker ||
        markerHits[0] ||
        "";
      const statusPattern = String(statusClaim?.status_pattern || statusClaim?.type || "");
      const statusSnippet = String(statusEntry?.quote || "").slice(0, 240);
      const statusContentHash = String(report?.content_hash || meta.content_hash || "");
      const statusEvidence = {
        url: targetUrl,
        snapshot_ref: statusEntry?.snapshot_ref || snapshot,
        marker: statusMarker,
        snippet: statusSnippet,
        locator,
        cannabis_term: statusMarker,
        status_pattern: statusPattern,
        confidence_rule: "cannabis_bound_status",
        content_hash: statusContentHash
      };
      statusEvidenceItems.push(statusEvidence);
      const docKey = statusContentHash || targetUrl;
      if (docKey && !statusEvidenceDocs.has(docKey)) {
        statusEvidenceDocs.set(docKey, {
          url: targetUrl,
          snapshot: statusEntry?.snapshot_ref || snapshot,
          content_hash: docKey
        });
        statusEvidenceUrls.push(targetUrl);
      }
      const bestLength = statusEvidenceBest ? String(statusEvidenceBest.snippet || "").length : 9999;
      if (!statusEvidenceBest || statusSnippet.length < bestLength) {
        statusEvidenceBest = statusEvidence;
        statusEvidenceBestDoc = targetUrl;
        statusEvidenceBestSnapshot = statusEntry?.snapshot_ref || snapshot;
        statusEvidenceBestMarker = statusMarker;
      }
    }
    const quoteHash = bestEntry
      ? sha256(String(bestEntry?.quote || bestEntry?.anchor || ""))
      : "";
    const anchors = markedEvidence
      .map((item) => item?.anchor || item?.page || item?.quote || "")
      .filter(Boolean)
      .slice(0, 3);
    let reason = report?.reason || "unknown";
    if (reason === "unknown" || reason === "NO_EVIDENCE") {
      if (markedEvidenceCount > 0 && !evidenceHasMarkers) {
        reason = "NO_MARKER_IN_DOC";
      } else if (markedEvidenceCount > 0 && (!anchorOrPage || !quote.trim())) {
        reason = "NO_LOCATOR";
      } else if (markedEvidenceCount > 0) {
        reason = "OK";
      }
    }
    let host = "";
    try {
      host = new URL(targetUrl).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      host = "";
    }
    const discoveredFromUrl = meta.discovered_from_url || meta.source_page_url || "";
    updateSnapshotMeta(snapshot, {
      country_iso: targetIso,
      host,
      content_type: meta.content_type || "",
      text_len: Number(report?.text_len || 0) || 0,
      ocr_text_len: Number(report?.ocr_text_len || 0) || 0,
      has_text_layer: Boolean(report?.has_text_layer),
      extracted_text_len: Number(report?.extracted_text_len || 0) || 0,
      ocr_ran: Boolean(report?.ocr_ran),
      ocr_engine: String(report?.ocr_engine || ""),
      ocr_pages: Array.isArray(report?.ocr_pages) ? report.ocr_pages : [],
      ocr_text_path: String(report?.ocr_text_path || ""),
      ocr_reason: String(report?.ocr_reason || ""),
      sha256: report?.content_hash || meta.content_hash || "",
      discovered_from_url: discoveredFromUrl || undefined
    });
    items.push({
      iso2: targetIso,
      url: targetUrl,
      snapshot_path: snapshot,
      content_type: meta.content_type || "",
      content_hash: report?.content_hash || meta.content_hash || "",
      anchors,
      evidence_ok: evidenceOk,
      evidence_count: markedEvidenceCount,
      evidence_official: officialOk,
      evidence_kind: evidenceKind,
      law_page_likely: lawPageLikely,
      doc_is_normative: lawDoc,
      law_page: lawPageLikely || lawDoc ? 1 : 0,
      anchor_or_page: anchorOrPage,
      quote_hash: quoteHash,
      machine_verified: machineVerifiedOk,
      reason,
      status_claim: statusClaim
    });
    const currentItem = items[items.length - 1];
    if (!bestStatusItem) {
      bestStatusItem = currentItem;
    } else if (
      currentItem.status_claim?.cannabis_bound &&
      !bestStatusItem.status_claim?.cannabis_bound
    ) {
      bestStatusItem = currentItem;
    } else if (currentItem.machine_verified && !bestStatusItem.machine_verified) {
      bestStatusItem = currentItem;
    } else if (
      currentItem.evidence_count > 0 &&
      Number(bestStatusItem.evidence_count || 0) === 0
    ) {
      bestStatusItem = currentItem;
    }
    if (markedEvidenceCount > 0) {
      const bestHasMarkers = Array.isArray(bestEvidenceMarkers) && bestEvidenceMarkers.length > 0;
      const currentHasMarkers =
        Array.isArray(bestEntry?.markers_in_snippet) && bestEntry.markers_in_snippet.length > 0;
      const bestIsDoc = Boolean(bestEvidenceSnapshot && bestEvidenceSnapshot.match(/\.(pdf|docx?)$/));
      if (
        !bestEvidence ||
        (currentHasMarkers && !bestHasMarkers) ||
        (isDocSnapshot && !bestIsDoc)
      ) {
        bestEvidence = bestEntry ? [bestEntry] : markedEvidence;
        bestEvidenceCount = markedEvidenceCount;
        bestEvidenceUrl = targetUrl;
        bestEvidenceSnapshot = snapshot;
        bestEvidenceMarkers = Array.isArray(bestEntry?.markers_in_snippet)
          ? bestEntry.markers_in_snippet
          : markerHits;
      }
    }

    if (markedEvidenceCount > 0 && (lawPageLikely || lawDoc || isDocSnapshot)) {
      const candidateEntry = {
        iso: targetIso,
        iso2: targetIso,
        source_url: targetUrl,
        snapshot_ref: snapshot,
        snapshot_path: snapshot,
        content_hash: report?.content_hash || meta.content_hash || "",
        evidence: markedEvidence,
        evidence_count: markedEvidenceCount,
        evidence_kind: evidenceKind,
        confidence: "low",
        verified: "candidate",
        official: officialOk,
        created_at: runAt,
        reason: reason || (officialOk ? "OK" : "NOT_OFFICIAL")
      };
      const candidateKey = buildCandidateKey(candidateEntry);
      if (candidateKey) {
        candidateEntry.key = candidateKey;
        if (!candidatePayload.entries[candidateKey]) candidateRun += 1;
        candidatePayload.entries[candidateKey] = candidateEntry;
      }
    }
  }

  const mvConfidence =
    statusEvidenceDocs.size >= 2 ? "med" : statusEvidenceItems.length > 0 ? "low" : "low";
  items.sort((a, b) => {
    const okDiff = Number(b?.evidence_ok || 0) - Number(a?.evidence_ok || 0);
    if (okDiff !== 0) return okDiff;
    return Number(b?.evidence_count || 0) - Number(a?.evidence_count || 0);
  });
  const mvIso = items.find((item) => item.iso2)?.iso2 || iso2 || "n/a";
  if (
    statusEvidenceItems.length > 0 &&
    bestStatusItem?.status_claim?.type &&
    bestStatusItem.status_claim.type !== "UNKNOWN" &&
    bestStatusItem.status_claim.cannabis_bound &&
    bestStatusItem.evidence_official &&
    (bestStatusItem.doc_is_normative || bestStatusItem.law_page_likely)
  ) {
    const evidenceDocs = Array.from(statusEvidenceDocs.values());
    const evidenceDocCount = evidenceDocs.length;
    const evidenceItems = statusEvidenceItems.slice(0, 3);
    const combinedHash = sha256(
      evidenceItems.map((entry) => entry.content_hash || "").filter(Boolean).join("|")
    );
    const entry = {
      iso: mvIso,
      iso2: mvIso,
      status_recreational: bestStatusItem?.status_recreational || "unknown",
      status_medical: bestStatusItem?.status_medical || "unknown",
      medical_allowed: bestStatusItem?.status_medical === "legal",
      restricted_notes: bestStatusItem?.restricted_notes || null,
      evidence: evidenceItems,
      evidence_kind: bestStatusItem?.evidence_kind || "law_doc",
      status_claim: bestStatusItem?.status_claim || null,
      retrieved_at: runAt,
      generated_at: runAt,
      confidence: mvConfidence,
      official_source_ok: true,
      source_url: evidenceItems[0]?.url || bestStatusItem?.url || "",
      snapshot_path: evidenceItems[0]?.snapshot_ref || bestStatusItem?.snapshot_path || "",
      snapshot_ref: evidenceItems[0]?.snapshot_ref || bestStatusItem?.snapshot_path || "",
      content_hash: combinedHash,
      evidence_count: evidenceItems.length,
      evidence_doc_count: evidenceDocCount,
      model_id: "auto_facts_rules_v1",
      evidence_id: sha256(`${mvIso}|${combinedHash}|${evidenceDocCount}`)
    };
    const mvWriteSummary = writeMachineVerifiedEntries({
      entries: { [mvIso]: entry },
      outputPath: MACHINE_VERIFIED_PATH,
      runId: process.env.RUN_ID || "",
      reason: "AUTO_FACTS_STATUS_CLAIM"
    });
    if (mvWriteSummary) {
      mvWriteSummaryCache = mvWriteSummary;
    }
  }
  const afterIds = buildMachineVerifiedIds();
  const mvAfterCount = loadMachineVerifiedCount();
  let machineVerifiedDelta = 0;
  for (const id of afterIds) {
    if (!mvBeforeIds.has(id)) machineVerifiedDelta += 1;
  }
  const mvRemoved = Math.max(0, mvBeforeCount + machineVerifiedDelta - mvAfterCount);
  if (candidateRun > 0) {
    writeCandidateFacts(candidatePayload);
  }
  const afterCandidateCount = Object.keys(candidatePayload.entries || {}).length;
  const candidateFactsDelta = Math.max(0, afterCandidateCount - beforeCandidateCount);
  const newOfficialBadges = 0;
  const progressDelta =
    Math.max(0, machineVerifiedDelta) +
    Math.max(0, candidateFactsDelta) +
    Math.max(0, newOfficialBadges);
  const regressDelta = Math.max(0, mvRemoved);
  const picked = Array.from(
    new Set(items.map((item) => String(item.iso2 || "").toUpperCase()).filter(Boolean))
  );
  const reasons = items
    .filter((item) => item?.reason && item.reason !== "OK")
    .map((item) => ({
      iso2: item.iso2 || "",
      code: item.reason || "unknown",
      url: item.url || ""
    }));
  const topMarkerHits = Array.from(markerHitCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => `${label}:${count}`);
  const guardTopReasons = Array.from(guardReasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => `${label}:${count}`);
  const markerHitsTop5 = Array.from(
    new Map(markerHitsByUrl.map((entry) => [entry.url, entry])).values()
  )
    .slice(0, 5)
    .map((entry) => ({
      url: entry.url,
      markers: Array.isArray(entry.markers) ? entry.markers : []
    }));
  const summaryIso = items.find((item) => item.iso2)?.iso2 || "n/a";
  let summaryReason = bestStatusItem?.reason || items.find((item) => item.reason)?.reason || "NO_TARGETS";
  if (evidenceOkTotal > 0) {
    summaryReason = "OK";
  }

  const lawPages = items.filter((item) => item?.law_page === 1).length;
  const fallbackEvidencePayload = Array.isArray(bestEvidence)
    ? bestEvidence.map((entry) => {
        const snippet = String(entry?.quote || "").slice(0, 240);
        const locator = entry?.page
          ? { page: entry.page }
          : entry?.anchor
            ? { anchor: entry.anchor }
            : {};
        return {
          url: bestEvidenceUrl || "",
          snapshot_ref: entry?.snapshot_ref || entry?.snapshot_path || bestEvidenceSnapshot || "",
          marker: bestEvidenceMarkers[0] || "",
          snippet,
          locator
        };
      })
    : [];
  const evidencePayload =
    statusEvidenceItems.length > 0 ? statusEvidenceItems.slice(0, 3) : fallbackEvidencePayload;
  const fallbackBestPayload = Array.isArray(bestEvidence) && bestEvidence.length
    ? (() => {
        const bestEntry = bestEvidence[0] || {};
        const snippet = String(bestEntry?.quote || "").slice(0, 240);
        const locator = bestEntry?.page
          ? { page: bestEntry.page }
          : bestEntry?.anchor
            ? { anchor: bestEntry.anchor }
            : {};
        return {
          url: bestEvidenceUrl || "",
          snapshot_ref: bestEntry?.snapshot_ref || bestEntry?.snapshot_path || bestEvidenceSnapshot || "",
          marker: bestEntry?.marker || bestEvidenceMarkers[0] || "",
          snippet,
          locator
        };
      })()
    : null;
  const evidenceBestPayload =
    statusEvidenceBest
      ? {
          ...statusEvidenceBest,
          snippet: String(statusEvidenceBest.snippet || "").slice(0, 240)
        }
      : fallbackBestPayload;
  const fallbackEvidenceUrl = evidenceBestPayload?.url || bestEvidenceUrl || "";
  const statusEvidenceDocsCount =
    statusEvidenceDocs.size || (evidenceBestPayload ? 1 : 0);
  const statusEvidenceTotal =
    statusEvidenceItems.length || (evidenceBestPayload ? 1 : 0);
  const statusEvidenceBestUrls = statusEvidenceUrls.length
    ? statusEvidenceUrls.slice(0, 3)
    : fallbackEvidenceUrl
      ? [fallbackEvidenceUrl]
      : [];
  const status = bestStatusItem?.machine_verified
    ? "MV"
    : bestStatusItem?.evidence_count > 0
      ? "CANDIDATE"
      : "UNKNOWN";
  const reasonCode = String(bestStatusItem?.reason || summaryReason || "UNKNOWN");
  const verifyLinks = Number(bestStatusItem?.evidence_count || 0) || 0;
  const reportPayload = {
    run_id: process.env.RUN_ID || "",
    run_at: runAt,
    iso2: summaryIso,
    picked,
    pages_checked: items.length,
    extracted: extractedTotal,
    confidence: items.find((item) => item.evidence_ok)?.confidence || "low",
    evidence_count: evidenceFoundTotal,
    evidence_ok: evidenceOkTotal,
    evidence_found: evidenceFoundTotal,
    law_pages: lawPages,
    machine_verified_delta: machineVerifiedDelta,
    mv_before: mvBeforeCount,
    mv_after: mvAfterCount,
    mv_added: machineVerifiedDelta,
    mv_removed: mvRemoved,
    progress_delta: progressDelta,
    regress_delta: regressDelta,
    progress_components: {
      machine_verified_added: machineVerifiedDelta,
      machine_verified_removed: mvRemoved,
      candidate_facts_added: candidateFactsDelta,
      official_badges_added: newOfficialBadges
    },
    mv_wrote: Boolean(mvWriteSummaryCache?.wrote),
    mv_write_reason: mvWriteSummaryCache?.reason || "",
    mv_corrupt_backup: mvWriteSummaryCache?.corruptBackup || "",
    status,
    reason_code: reasonCode,
    verify_links: verifyLinks,
    evidence: evidencePayload,
    evidence_best: evidenceBestPayload,
    evidence_doc_count: statusEvidenceDocsCount,
    mv_confidence: mvConfidence,
    official_scope: {
      roots: Array.isArray(officialScope?.roots) ? officialScope.roots : [],
      allowed_hosts_count: Array.isArray(officialScope?.hosts) ? officialScope.hosts.length : 0
    },
    status_claim: bestStatusItem?.status_claim || null,
    status_claim_evidence_summary: {
      docs_with_claim: statusEvidenceDocsCount,
      evidence_total: statusEvidenceTotal,
      best_urls: statusEvidenceBestUrls
    },
    cannabis_discovery: {
      scanned: cannabisDiscovery.scanned || 0,
      found_candidates: cannabisDiscovery.candidates.length || 0,
      top_urls: cannabisDiscovery.top_urls || []
    },
    expand_detail: {
      list_pages: Number(expandDetail.list_pages || 0) || 0,
      detail_pages: Number(expandDetail.detail_pages || 0) || 0,
      top_urls: Array.isArray(expandDetail.detail_urls)
        ? expandDetail.detail_urls.slice(0, 3)
        : []
    },
    docs_found: Number(docHunt.docs_found || 0) || 0,
    docs_snapshotted: Number(docHunt.docs_snapshotted || 0) || 0,
    snapshot_attempts: snapshotAttempts.slice(0, SNAPSHOT_ATTEMPT_LIMIT),
    ocr_ran_count: ocrRanCount,
    ocr_text_len: Number(ocrSample?.text_len || 0) || 0,
    ocr_engine: String(ocrSample?.engine || ""),
    ocr_reason: String(ocrSample?.reason || ""),
    ocr_pages: Number(ocrSample?.pages || 0) || 0,
    cannabis_doc_hunt: {
      scanned: Number(docHunt.pages_fetched || 0) || 0,
      candidates: Array.isArray(docHuntTargets) ? docHuntTargets.length : 0,
      docs_found: Number(docHunt.docs_found || 0) || 0,
      docs_snapshotted: Number(docHunt.docs_snapshotted || 0) || 0
    },
    marker_hits_top: topMarkerHits,
    marker_hits_top_urls: markerHitsTop5,
    evidence_samples: evidenceSamples.slice(0, 3),
    evidence_snippet_guard: {
      tried: guardTried,
      rejected: guardRejected,
      reasons_top3: guardTopReasons
    },
    candidate_facts_delta: candidateFactsDelta,
    reason: summaryReason,
    reasons,
    items
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(reportPayload, null, 2) + "\n");

  const topCandidates = reportPayload.cannabis_discovery?.top_urls?.length
    ? reportPayload.cannabis_discovery.top_urls.join(",")
    : "-";
  console.log(
    `CANNABIS_DISCOVERY: iso=${summaryIso} scanned=${reportPayload.cannabis_discovery?.scanned || 0} found_candidates=${reportPayload.cannabis_discovery?.found_candidates || 0} top3=[${topCandidates}]`
  );
  const docLine = `DOC_HUNT: iso=${summaryIso} docs_found=${reportPayload.docs_found} docs_snapshotted=${reportPayload.docs_snapshotted} ocr_ran_count=${reportPayload.ocr_ran_count}`;
  console.log(docLine);
  const markerLabel = reportPayload.marker_hits_top?.length
    ? reportPayload.marker_hits_top.join(",")
    : "-";
  console.log(
    `AUTO_FACTS: iso=${summaryIso} pages_checked=${reportPayload.pages_checked} extracted=${extractedTotal} evidence=${evidenceFoundTotal} top_marker_hits=[${markerLabel}] reason=${summaryReason}`
  );
  const claim = reportPayload.status_claim || {};
  const claimType = String(claim?.type || "UNKNOWN");
  const claimScope = Array.isArray(claim?.scope) ? claim.scope.join(",") : String(claim?.scope || "");
  const claimConditions = String(claim?.conditions || "");
  console.log(
    `STATUS_CLAIM: iso=${summaryIso} type=${claimType} scope=${claimScope || "-"} conditions=${claimConditions || "-"}`
  );
  const claimSource = evidenceBestPayload?.locator?.page
    ? `page=${evidenceBestPayload.locator.page}`
    : evidenceBestPayload?.locator?.anchor
      ? `anchor=${evidenceBestPayload.locator.anchor}`
      : "-";
  const statusEvidenceUrl = String(evidenceBestPayload?.url || bestEvidenceUrl || "-");
  console.log(
    `STATUS_CLAIM_SOURCE: url=${statusEvidenceUrl} ${claimSource}`
  );
  const statusSnippet = evidenceBestPayload?.snippet
    ? String(evidenceBestPayload.snippet).replace(/\s+/g, " ").slice(0, 220)
    : "-";
  console.log(
    `STATUS_EVIDENCE: url=${statusEvidenceUrl} ${claimSource} snippet="${statusSnippet}"`
  );
  const statusSummaryUrls = statusEvidenceBestUrls.length ? statusEvidenceBestUrls.join(",") : "-";
  console.log(
    `STATUS_CLAIM_EVIDENCE_SUMMARY: iso=${summaryIso} docs_with_claim=${statusEvidenceDocsCount} evidence_total=${statusEvidenceTotal} best_urls=[${statusSummaryUrls}]`
  );
  const normOk = bestStatusItem?.doc_is_normative || bestStatusItem?.law_page_likely ? 1 : 0;
  const normReason = bestStatusItem?.doc_is_normative || bestStatusItem?.law_page_likely
    ? "OK"
    : bestStatusItem?.reason || "NOT_NORMATIVE_DOC";
  console.log(`NORMATIVE_DOC: iso=${summaryIso} ok=${normOk} reason=${normReason}`);
  let mvBlockedReason = bestStatusItem?.machine_verified
    ? "MV_OK"
    : (bestStatusItem?.reason || summaryReason || "UNKNOWN");
  if (mvBlockedReason === "OK" && !bestStatusItem?.machine_verified) {
    mvBlockedReason = bestStatusItem?.evidence_official ? "NO_EVIDENCE" : "NOT_OFFICIAL";
  }
  console.log(`MV_BLOCKED_REASON: iso=${summaryIso} reason=${mvBlockedReason}`);
  const guardLabel = reportPayload.evidence_snippet_guard?.reasons_top3?.length
    ? reportPayload.evidence_snippet_guard.reasons_top3.join(",")
    : "-";
  console.log(
    `EVIDENCE_SNIPPET_GUARD: iso=${summaryIso} tried=${guardTried} rejected=${guardRejected} reasons_top3=${guardLabel}`
  );
  const markerUrls = Array.isArray(reportPayload.marker_hits_top_urls)
    ? reportPayload.marker_hits_top_urls
        .map((entry) => `${entry.url}->[${(entry.markers || []).join(",")}]`)
        .join(" ; ")
    : "-";
  console.log(`MARKER_HITS_TOP5: iso=${summaryIso} top5=[${markerUrls || "-"}]`);
  const textLen = Number(ocrSample?.text_len || 0) || 0;
  const pages = Number(ocrSample?.pages || 0) || 0;
  const engine = String(ocrSample?.engine || "-");
  const ocrReason = String(ocrSample?.reason || "-");
  const ocrRanLabel = ocrRanCount > 0 ? ocrRanCount : 0;
  console.log(
    `OCR: iso=${summaryIso} ran=${ocrRanLabel} engine=${engine} pages=${pages} text_len=${textLen} reason=${ocrRanLabel > 0 ? "-" : ocrReason}`
  );
  for (const sample of reportPayload.evidence_samples || []) {
    const quote = String(sample.quote || "").replace(/\s+/g, " ").slice(0, 160);
    const markers = Array.isArray(sample.marker_hits) ? sample.marker_hits.join(",") : "-";
    console.log(
      `AUTO_FACTS_EVIDENCE: iso=${sample.iso2} url=${sample.url} snippet="${quote}" markers=[${markers}]`
    );
  }
  if (evidenceBestPayload) {
    const snippet = String(evidenceBestPayload?.snippet || "").replace(/\s+/g, " ").slice(0, 160);
    const marker = String(evidenceBestPayload?.marker || "-");
    const locator = evidenceBestPayload?.locator?.page
      ? `page=${evidenceBestPayload.locator.page}`
      : evidenceBestPayload?.locator?.anchor
        ? `anchor=${evidenceBestPayload.locator.anchor}`
        : "locator=unknown";
    console.log(
      `AUTO_FACTS_EVIDENCE_BEST: iso=${summaryIso} url=${statusEvidenceUrl} ${locator} marker=${marker} snippet="${snippet}"`
    );
  }
  const learnedLine = `LEARNED: iso=${summaryIso} extracted=${extractedTotal} evidence=${evidenceOkTotal}`;
  console.log(learnedLine);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { sanitizeMachineVerifiedEntries };

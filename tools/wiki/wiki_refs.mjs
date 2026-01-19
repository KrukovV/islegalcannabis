import fs from "node:fs";
import path from "node:path";
import { isOfficialUrl } from "../sources/validate_official_url.mjs";

const ROOT = process.cwd();
const API_BASE = "https://en.wikipedia.org/w/api.php";
const API_TIMEOUT_MS = Number(process.env.WIKI_API_TIMEOUT_MS || 10000);
const API_RETRIES = Number(process.env.WIKI_API_RETRIES || 2);
const API_BACKOFF_MS = Number(process.env.WIKI_API_BACKOFF_MS || 400);
const API_RATE_LIMIT_MS = Number(process.env.WIKI_API_RATE_LIMIT_MS || 1000);
let lastRequestAt = 0;

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sleepMs(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < API_RATE_LIMIT_MS) {
    await sleepMs(API_RATE_LIMIT_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

async function fetchWithRetry(url, options = {}) {
  const headers = {
    "user-agent": "islegalcannabis/wiki_refs",
    ...(options.headers || {})
  };
  for (let attempt = 0; attempt <= API_RETRIES; attempt += 1) {
    await rateLimit();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        const delay = API_BACKOFF_MS * Math.pow(2, attempt);
        await sleepMs(delay);
        continue;
      }
      return res;
    } catch (error) {
      if (attempt >= API_RETRIES) throw error;
      const delay = API_BACKOFF_MS * Math.pow(2, attempt);
      await sleepMs(delay);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("fetchWithRetry exhausted");
}

function stripWikiMarkup(value) {
  let text = String(value || "");
  text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<ref[^>]*\/?>/gi, " ");
  text = text.replace(/\{\{[^}]+\}\}/g, " ");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(text);
}

function buildWikiUrl(title) {
  if (!title) return "";
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function normalizeUrl(rawUrl, baseUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  let resolved = value;
  if (resolved.startsWith("//")) {
    resolved = `https:${resolved}`;
  }
  let parsed;
  try {
    parsed = baseUrl ? new URL(resolved, baseUrl) : new URL(resolved);
  } catch {
    return "";
  }
  if (parsed.protocol === "http:") parsed.protocol = "https:";
  parsed.hash = "";
  return parsed.toString();
}

function matchAllowRule(url, host, pathname) {
  const lowerHost = String(host || "").toLowerCase();
  const lowerPath = String(pathname || "").toLowerCase();
  if (lowerHost.includes(".gov.") || lowerHost.endsWith(".gov")) {
    return { ok: true, reason: "ALLOW_RULE_GOV" };
  }
  if (lowerHost.includes(".gouv.") || lowerHost.endsWith(".gouv")) {
    return { ok: true, reason: "ALLOW_RULE_GOUV" };
  }
  if (lowerHost.includes(".go.") || lowerHost.endsWith(".go")) {
    return { ok: true, reason: "ALLOW_RULE_GO" };
  }
  if (lowerHost.includes(".parliament.") || lowerHost.includes(".parl.") || lowerHost.includes(".parlament.")) {
    return { ok: true, reason: "ALLOW_RULE_PARLIAMENT" };
  }
  if (lowerHost.includes("gazette") || lowerHost.includes("officialjournal") || lowerHost.includes("official-journal")) {
    return { ok: true, reason: "ALLOW_RULE_GAZETTE" };
  }
  if (lowerHost.includes("ministry") || lowerHost.includes("ministere") || lowerHost.includes("ministerium") || lowerHost.includes("ministerio")) {
    return { ok: true, reason: "ALLOW_RULE_MINISTRY" };
  }
  if (lowerHost.includes("regulator") || lowerHost.includes("authority") || lowerHost.includes("commission")) {
    return { ok: true, reason: "ALLOW_RULE_REGULATOR" };
  }
  if (lowerHost.includes("court") || lowerHost.includes("judiciary") || lowerHost.includes("justice")) {
    return { ok: true, reason: "ALLOW_RULE_COURT" };
  }
  if (lowerPath.includes("gazette") || lowerPath.includes("official-journal") || lowerPath.includes("officialjournal")) {
    return { ok: true, reason: "ALLOW_RULE_GAZETTE" };
  }
  if (lowerPath.includes("ministry") || lowerPath.includes("ministere") || lowerPath.includes("ministerium") || lowerPath.includes("ministerio")) {
    return { ok: true, reason: "ALLOW_RULE_MINISTRY" };
  }
  if (lowerPath.includes("regulator") || lowerPath.includes("authority") || lowerPath.includes("commission")) {
    return { ok: true, reason: "ALLOW_RULE_REGULATOR" };
  }
  if (lowerPath.includes("court") || lowerPath.includes("judiciary") || lowerPath.includes("justice")) {
    return { ok: true, reason: "ALLOW_RULE_COURT" };
  }
  return { ok: false, reason: "" };
}

function denyReasonForValue(value) {
  const lowered = String(value || "").toLowerCase();
  if (!lowered) return "";
  if (lowered.includes("wiki")) return "DENY_WIKI";
  if (lowered.includes("researchgate")) return "DENY_RESEARCHGATE";
  if (lowered.includes("globsec")) return "DENY_GLOBSEC";
  if (lowered.includes("blog")) return "DENY_BLOG";
  if (lowered.includes("forum")) return "DENY_FORUM";
  if (lowered.includes("news")) return "DENY_NEWS";
  return "";
}

function evaluateOfficialCandidate(rawUrl, iso2) {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return { ok: false, reason: "DENY_INVALID_URL", normalized: "" };
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, reason: "DENY_INVALID_URL", normalized: "" };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const denyReason = denyReasonForValue(host) || denyReasonForValue(parsed.pathname);
  if (denyReason) {
    return { ok: false, reason: denyReason, normalized, host };
  }
  const allowRule = matchAllowRule(normalized, host, parsed.pathname);
  if (allowRule.ok) {
    return { ok: true, reason: allowRule.reason, normalized, host };
  }
  const officialCheck = isOfficialUrl(normalized, undefined, { iso2 });
  if (officialCheck.ok) {
    return { ok: true, reason: "ALLOW_RULE_OFFICIAL_LIST", normalized, host };
  }
  return { ok: false, reason: "DENY_NOT_OFFICIAL", normalized, host };
}

async function fetchWikiWikitext(pageTitle) {
  const fixtureDir = process.env.WIKI_FIXTURE_DIR || "";
  if (fixtureDir) {
    const fileName = `${pageTitle.replace(/[^a-z0-9]+/gi, "_")}.wikitext`;
    const fixturePath = path.join(fixtureDir, fileName);
    if (fs.existsSync(fixturePath)) {
      return {
        ok: true,
        wikitext: fs.readFileSync(fixturePath, "utf8"),
        revisionId: "fixture",
        url: buildWikiUrl(pageTitle)
      };
    }
  }
  const params = new URLSearchParams({
    action: "parse",
    page: pageTitle,
    prop: "wikitext|revid",
    format: "json",
    formatversion: "2"
  });
  const url = `${API_BASE}?${params.toString()}`;
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      return { ok: false, wikitext: "", revisionId: "", url: buildWikiUrl(pageTitle) };
    }
    const payload = await res.json();
    return {
      ok: Boolean(payload?.parse?.wikitext),
      wikitext: payload?.parse?.wikitext || "",
      revisionId: String(payload?.parse?.revid || ""),
      url: buildWikiUrl(pageTitle)
    };
  } catch {
    return { ok: false, wikitext: "", revisionId: "", url: buildWikiUrl(pageTitle) };
  }
}

const SECTION_PATTERNS = [
  /law/i,
  /legal status/i,
  /legalit(y|ies)/i,
  /legaliz(e|ation)/i,
  /medical cannabis/i,
  /medical marijuana/i,
  /medical use/i,
  /recreational/i,
  /recreational use/i,
  /decriminali[sz]ation/i,
  /policy/i,
  /regulation/i,
  /external links/i,
  /references/i,
  /правов/i,
  /закон/i,
  /медицин/i,
  /рекреацион/i,
  /декримин/i
];

function splitSections(wikitext) {
  const lines = String(wikitext || "").split("\n");
  const sections = [];
  let current = { title: "", lines: [] };
  for (const line of lines) {
    const heading = line.match(/^==+\s*(.+?)\s*==+$/);
    if (heading) {
      if (current.lines.length > 0) sections.push(current);
      current = { title: heading[1], lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.length > 0) sections.push(current);
  return sections;
}

function isRelevantSection(title) {
  const value = String(title || "").toLowerCase();
  return SECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function parseCiteTemplate(template) {
  const cleaned = template.replace(/^\{\{|\}\}$/g, "");
  const parts = cleaned.split("|").slice(1);
  const entry = { url: "", title: "", publisher: "" };
  for (const part of parts) {
    const [rawKey, ...rest] = part.split("=");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join("=").trim();
    if (key === "url") entry.url = value;
    if (key === "title") entry.title = stripWikiMarkup(value);
    if (key === "publisher") entry.publisher = stripWikiMarkup(value);
  }
  return entry;
}

function collectNamedRefs(wikitext) {
  const map = new Map();
  const regex = /<ref\s+[^>]*name\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/ref>/gi;
  let match = null;
  while ((match = regex.exec(wikitext))) {
    const name = String(match[1] || "").trim();
    const content = String(match[2] || "").trim();
    if (!name || !content) continue;
    if (!map.has(name)) map.set(name, content);
  }
  return map;
}

function expandNamedRefs(text, refMap) {
  if (!refMap || refMap.size === 0) return text;
  return String(text || "").replace(/<ref\s+[^>]*name\s*=\s*["']?([^"'\s>]+)["']?[^>]*\/>/gi, (match, name) => {
    const content = refMap.get(String(name || "").trim());
    if (!content) return match;
    return `<ref>${content}</ref>`;
  });
}

function extractReferencesFromSection(sectionText, refMap, baseUrl) {
  const expandedText = expandNamedRefs(sectionText, refMap);
  const refs = [];
  const citeMatches = expandedText.match(/\{\{cite[^}]+\}\}/gi) || [];
  for (const match of citeMatches) {
    const parsed = parseCiteTemplate(match);
    if (!parsed.url) continue;
    const normalized = normalizeUrl(parsed.url, baseUrl);
    if (!normalized) continue;
    refs.push({
      url: normalized,
      title: parsed.title || "",
      publisher: parsed.publisher || "",
      context_snippet: normalizeWhitespace(stripWikiMarkup(match)).slice(0, 180)
    });
  }
  const linkMatches = expandedText.match(/https?:\/\/[^\s\]|}]+/g) || [];
  for (const url of linkMatches) {
    const normalized = normalizeUrl(url, baseUrl);
    if (!normalized) continue;
    refs.push({
      url: normalized,
      title: "",
      publisher: "",
      context_snippet: normalizeWhitespace(stripWikiMarkup(expandedText)).slice(0, 180)
    });
  }
  return refs;
}

export async function extractWikiRefs({ geoKey, iso2, articles, reportPath }) {
  const allRefs = [];
  const relevantRefs = [];
  const errors = [];
  for (const article of articles) {
    const title = String(article?.title || "").trim();
    if (!title) continue;
    const payload = await fetchWikiWikitext(title);
    if (!payload.ok || !payload.wikitext) {
      errors.push({ title, reason: "FETCH_FAILED" });
      continue;
    }
    const sections = splitSections(payload.wikitext);
    const refMap = collectNamedRefs(payload.wikitext);
    for (const section of sections) {
      const sectionText = section.lines.join("\n");
      const extracted = extractReferencesFromSection(sectionText, refMap, payload.url);
      for (const ref of extracted) {
        const entry = {
          ...ref,
          article_title: title,
          article_url: payload.url,
          section: section.title
        };
        allRefs.push(entry);
        if (isRelevantSection(section.title)) {
          relevantRefs.push(entry);
        }
      }
    }
  }
  const evaluateRefs = (refList) => {
    const seen = new Set();
    const deduped = [];
    for (const ref of refList) {
      const key = String(ref.url || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(ref);
    }
    const official = [];
    const supporting = [];
    const denyCounts = new Map();
    const deniedSamples = [];
    for (const ref of deduped) {
      const verdict = evaluateOfficialCandidate(ref.url, iso2);
      if (verdict.ok) {
        official.push({
          ...ref,
          url: verdict.normalized || ref.url,
          host: verdict.host || "",
          reason: verdict.reason,
          source: "main_article",
          section_name: ref.section || ""
        });
        continue;
      }
      const reason = verdict.reason || "DENY_UNKNOWN";
      supporting.push({
        ...ref,
        url: verdict.normalized || ref.url,
        deny_reason: reason
      });
      denyCounts.set(reason, (denyCounts.get(reason) || 0) + 1);
      if (deniedSamples.length < 3 && verdict.normalized) {
        deniedSamples.push({ url: verdict.normalized, reason });
      }
    }
    const hostCounts = new Map();
    for (const ref of official) {
      const host = String(ref.host || "").trim();
      if (!host) continue;
      hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
    }
    const topHosts = Array.from(hostCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([host]) => host);
    const denyReasons = Array.from(denyCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([reason, count]) => ({ reason, count }));
    return {
      deduped,
      official,
      supporting,
      topHosts,
      denyReasons,
      deniedSamples
    };
  };

  const primaryRefs = relevantRefs.length ? relevantRefs : allRefs;
  let {
    deduped,
    official,
    supporting,
    topHosts,
    denyReasons,
    deniedSamples
  } = evaluateRefs(primaryRefs);
  if (official.length === 0 && allRefs.length > primaryRefs.length) {
    ({
      deduped,
      official,
      supporting,
      topHosts,
      denyReasons,
      deniedSamples
    } = evaluateRefs(allRefs));
  }
  const payload = {
    geo_key: geoKey,
    fetched_at: new Date().toISOString(),
    counts: {
      total: deduped.length,
      official: official.length,
      supporting: supporting.length
    },
    official_candidates: official,
    supporting_refs: supporting,
    top_hosts: topHosts,
    deny_reasons: denyReasons,
    denied_samples: deniedSamples,
    errors
  };
  if (reportPath) writeJson(reportPath, payload);
  return payload;
}

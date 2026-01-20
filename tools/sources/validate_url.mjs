import fs from "node:fs";
import path from "node:path";
import { isOfficialUrl } from "./validate_official_url.mjs";

const ROOT = process.cwd();
const DEFAULT_ALLOWLIST = path.join(ROOT, "data", "sources", "allowlist_domains.json");

function readAllowlist(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(payload.allowed) ? payload.allowed : [];
  } catch {
    return [];
  }
}

function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function isHostAllowlisted(host, patterns) {
  if (!host) return false;
  return patterns.some((pattern) => {
    if (!pattern) return false;
    if (pattern.includes("*")) return patternToRegex(pattern).test(host);
    return host.toLowerCase() === String(pattern).toLowerCase();
  });
}

function isAllowedContentType(contentType) {
  const ctype = String(contentType || "").toLowerCase();
  return ctype.includes("text/html") || ctype.includes("application/pdf");
}

function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "";
  }
  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }
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

function hasDeniedSubstring(value) {
  const haystack = String(value || "").toLowerCase();
  const blocked = [
    "wiki",
    "wikipedia",
    "wikidata",
    "blog",
    "forum",
    "maps",
    "news",
    "map"
  ];
  return blocked.some((token) => haystack.includes(token));
}

async function fetchWithRedirect(url, options) {
  return fetch(url, {
    method: options.method || "GET",
    redirect: "follow",
    signal: options.signal,
    headers: { "user-agent": "islegalcannabis/auto_learn" }
  });
}

export async function validateCandidateUrl(url, options = {}) {
  const normalized = normalizeUrl(url);
  if (!normalized) return { ok: false, reason: "invalid_url" };
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "https_only" };
  if (hasDeniedSubstring(parsed.hostname) || hasDeniedSubstring(parsed.pathname)) {
    return { ok: false, reason: "denied_substring" };
  }

  const allowlistPath = options.allowlistPath || DEFAULT_ALLOWLIST;
  const allowlist = readAllowlist(allowlistPath);
  const requireOfficial = options.requireOfficial !== false;
  const initialOfficial = isOfficialUrl(parsed.toString(), { allowed: allowlist }, {
    iso2: options.iso2
  });
  if (requireOfficial && !initialOfficial.ok) {
    return { ok: false, reason: "not_allowed" };
  }

  const timeoutMs = Number(options.timeoutMs || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetchWithRedirect(normalized, {
      signal: controller.signal,
      method: "HEAD"
    });
    let status = Number(response?.status || 0);
    const headContentType = response?.headers?.get("content-type") || "";
    const headLength = Number(response?.headers?.get("content-length") || 0);
    const headOk = status >= 200 && status < 400 && isAllowedContentType(headContentType);
    let contentType = headContentType;
    if (!headOk || headLength <= 0) {
      response = await fetchWithRedirect(normalized, {
        signal: controller.signal,
        method: "GET"
      });
      status = Number(response?.status || 0);
      if (status < 200 || status >= 400) {
        return { ok: false, reason: `status_${status}`, status };
      }
      contentType = response?.headers?.get("content-type") || "";
      if (!isAllowedContentType(contentType)) {
        return { ok: false, reason: "bad_content_type", status, contentType };
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1) {
        return { ok: false, reason: "empty_body", status, contentType };
      }
    }
    const finalUrl = response.url || normalized;
    if (hasDeniedSubstring(finalUrl)) {
      return { ok: false, reason: "denied_substring", status, finalUrl };
    }
    if (requireOfficial) {
      const officialCheck = isOfficialUrl(finalUrl, { allowed: allowlist }, {
        iso2: options.iso2
      });
      if (!officialCheck.ok) {
        return {
          ok: false,
          reason: "not_allowed_final",
          status,
          contentType,
          finalUrl
        };
      }
    }
    return {
      ok: true,
      status,
      finalUrl,
      contentType,
      official: requireOfficial
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "AbortError" ? "timeout" : "fetch_error"
    };
  } finally {
    clearTimeout(timer);
  }
}

export const VERCEL_BYPASS_HEADER = "x-vercel-protection-bypass";
export const VERCEL_SET_BYPASS_COOKIE_HEADER = "x-vercel-set-bypass-cookie";

const DEFAULT_ALLOWED_HOSTS = ["islegal.info", "www.islegal.info"];

export function normalizeBypassCookieMode(value = "samesitenone") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "true") return "true";
  if (normalized === "samesitenone") return "samesitenone";
  return "samesitenone";
}

export function isVercelBypassTarget(input, allowedHosts = DEFAULT_ALLOWED_HOSTS) {
  try {
    const hostname = new URL(input).hostname.toLowerCase();
    return allowedHosts.map((host) => host.toLowerCase()).includes(hostname);
  } catch {
    return false;
  }
}

export function stripVercelBypassQuery(input) {
  const url = new URL(input);
  url.searchParams.delete(VERCEL_BYPASS_HEADER);
  url.searchParams.delete(VERCEL_SET_BYPASS_COOKIE_HEADER);
  return url.toString();
}

export function buildVercelBypassCookieSeedUrl(input) {
  const url = new URL(stripVercelBypassQuery(input));
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function cookieIdentity(cookie) {
  return [
    String(cookie?.name || ""),
    String(cookie?.domain || ""),
    String(cookie?.path || ""),
    String(cookie?.value || "")
  ].join("\u0000");
}

export function diffBrowserCookies(before = [], after = []) {
  const beforeKeys = new Set(before.map((cookie) => cookieIdentity(cookie)));
  return after.filter((cookie) => !beforeKeys.has(cookieIdentity(cookie)));
}

export function isVercelBypassCookie(cookie) {
  const name = String(cookie?.name || "").trim().toLowerCase();
  if (!name) return false;
  if (name === "__vercel_bypass" || name === "_vercel_jwt") return true;
  return name.includes("vercel") && /(bypass|protection|jwt|auth)/.test(name);
}

export function diffVercelBypassCookies(before = [], after = []) {
  return diffBrowserCookies(before, after).filter((cookie) => isVercelBypassCookie(cookie));
}

export function buildVercelBypassHeaders(secret, cookieMode = "samesitenone") {
  const token = String(secret || "").trim();
  if (!token) return {};
  return {
    [VERCEL_BYPASS_HEADER]: token,
    [VERCEL_SET_BYPASS_COOKIE_HEADER]: normalizeBypassCookieMode(cookieMode)
  };
}

export function buildVercelBypassSeedRequest(
  input,
  secret,
  options = {}
) {
  const allowedHosts = options.allowedHosts || DEFAULT_ALLOWED_HOSTS;
  const cookieMode = normalizeBypassCookieMode(options.cookieMode);
  const url = stripVercelBypassQuery(input);
  if (!secret || !isVercelBypassTarget(url, allowedHosts)) {
    return { url, headers: {}, enabled: false, cookieMode };
  }
  return {
    url,
    headers: buildVercelBypassHeaders(secret, cookieMode),
    enabled: true,
    cookieMode
  };
}

export function redactVercelBypassSecret(value, secret) {
  const token = String(secret || "");
  if (!token) return value;
  return String(value).split(token).join("[redacted]");
}

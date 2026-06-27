export type LinkScope = "external" | "project";

const FALLBACK_BASE = "https://www.islegal.local";
const TRAILING_SLASH_RE = /\/{2,}$/;

function stripTrailingSlash(value: string): string {
  if (value === "/") return value;
  return value.replace(TRAILING_SLASH_RE, "/");
}

function ensureLeadingSlash(value: string): string {
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

export function getLinkScope(href: string): LinkScope {
  const normalized = String(href || "").trim();
  if (!normalized || normalized.startsWith("#")) return "project";
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(normalized)) return "external";
  return "project";
}

export function getComparableLinkPath(href: string, fallbackPath = "/", keepHash = false): string {
  const normalized = String(href || "").trim();
  if (!normalized) return "";

  const normalizedFallback = ensureLeadingSlash(String(fallbackPath || "/"));

  const baseHref = new URL(`${FALLBACK_BASE}${normalizedFallback}`);
  try {
    const parsed = new URL(normalized, baseHref.toString());
    const path = stripTrailingSlash(parsed.pathname.toLowerCase());
    const hash = keepHash ? (parsed.hash || "").toLowerCase() : "";
    return `${parsed.origin.toLowerCase()}${path}${parsed.search}${hash}`;
  } catch {
    return normalized.toLowerCase();
  }
}

export function isSameLinkWithoutHash(a: string, b: string, fallbackPath = "/"): boolean {
  return getComparableLinkPath(a, fallbackPath, false) === getComparableLinkPath(b, fallbackPath, false);
}

export function isSameLink(a: string, b: string, fallbackPath = "/"): boolean {
  return getComparableLinkPath(a, fallbackPath, true) === getComparableLinkPath(b, fallbackPath, true);
}

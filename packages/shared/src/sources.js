/**
 * @typedef {import("./types").Source} Source
 */

function isValidHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function normalizeDomain(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  return withoutPath.startsWith("www.") ? withoutPath.slice(4) : withoutPath;
}

function collectDomains(registry) {
  return new Set(
    Object.values(registry ?? {})
      .flat()
      .map((domain) => normalizeDomain(domain))
      .filter(Boolean)
  );
}

/**
 * @param {unknown} sources
 * @returns {Source[]}
 */
export function normalizeSourceList(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source) => ({
      title: typeof source?.title === "string" ? source.title.trim() : "",
      url: typeof source?.url === "string" ? source.url.trim() : ""
    }))
    .filter((source) => source.title && source.url && isValidHttpUrl(source.url));
}

/**
 * @param {unknown} sources
 * @param {{ officialRegistry?: Record<string, string[]>, neutralRegistry?: Record<string, string[]> }} registries
 * @returns {{ official: Source[], neutral: Source[] }}
 */
export function normalizeSources(
  sources,
  registries = { officialRegistry: {}, neutralRegistry: {} }
) {
  const normalized = normalizeSourceList(sources);
  const officialDomains = collectDomains(registries.officialRegistry);
  const neutralDomains = collectDomains(registries.neutralRegistry);
  const buckets = { official: [], neutral: [] };
  for (const source of normalized) {
    let host = "";
    try {
      host = normalizeDomain(new URL(source.url).hostname);
    } catch {
      host = "";
    }
    if (!host) continue;
    if (officialDomains.has(host)) {
      buckets.official.push(source);
      continue;
    }
    if (neutralDomains.has(host)) {
      buckets.neutral.push(source);
    }
  }
  return buckets;
}

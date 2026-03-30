import fs from "node:fs";
import path from "node:path";

export type OfficialSourceStatus = "active" | "redirected" | "unreachable" | "timeout" | "blocked";

export type OfficialSource = {
  url: string;
  status?: OfficialSourceStatus;
  title?: string;
  host?: string;
  updatedAt?: string;
};

export type OfficialRegistryEntry = {
  geo: string;
  sources: OfficialSource[];
};

export type OfficialRegistrySummary = {
  rawDomainCount: number;
  filteredDomainCount: number;
  floorProtected: boolean;
  filteredFloorProtected: boolean;
};

export const OFFICIAL_REGISTRY_RAW_FLOOR = 418;
export const OFFICIAL_REGISTRY_FILTERED_FLOOR = 418;

function normalizeUrl(value: string): string {
  return String(value || "").trim();
}

function normalizeGeo(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeDomain(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .replace(/^www\./, "");
}

function isBannedOfficialDomain(value: string): boolean {
  return /(?:^|\.)wikipedia\.org$|^books\.google\.|(?:^|\.)archive\.org$/i.test(normalizeDomain(value));
}

export function readOfficialRegistryDomains(rootDir: string): string[] {
  const filePath = path.join(rootDir, "data", "official", "official_domains.ssot.json");
  if (!fs.existsSync(filePath)) return [];
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const domains = Array.isArray(payload?.domains) ? payload.domains : [];
  return domains
    .map((value: unknown) => normalizeDomain(String(value || "")))
    .filter((value: string): value is string => Boolean(value) && !isBannedOfficialDomain(value));
}

export function isOfficialRegistryUrl(url: string, domains: Iterable<string>): boolean {
  const raw = String(url || "").trim();
  if (!raw) return false;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return false;
  }
  const normalizedHost = normalizeDomain(host);
  if (!normalizedHost) return false;
  const domainSet = domains instanceof Set ? domains : new Set(Array.from(domains, (value) => normalizeDomain(String(value))));
  if (domainSet.has(normalizedHost)) return true;
  for (const domain of domainSet) {
    if (normalizedHost === domain) return true;
    if (normalizedHost.endsWith(`.${domain}`)) return true;
  }
  return false;
}

export function mergeOfficialSources(
  previous: OfficialSource[],
  incoming: OfficialSource[]
): OfficialSource[] {
  const byUrl = new Map<string, OfficialSource>();
  for (const entry of previous) {
    const url = String(entry?.url || "").trim();
    if (!url) continue;
    byUrl.set(url, { ...entry, url });
  }
  for (const entry of incoming) {
    const url = String(entry?.url || "").trim();
    if (!url) continue;
    const prev = byUrl.get(url);
    byUrl.set(url, {
      ...(prev || {}),
      ...entry,
      url,
      status: (entry.status || prev?.status || "active") as OfficialSourceStatus
    });
  }
  return Array.from(byUrl.values()).sort((a, b) => a.url.localeCompare(b.url));
}

export function mergeOfficialRegistryEntries(
  previous: OfficialRegistryEntry[],
  incoming: OfficialRegistryEntry[]
): OfficialRegistryEntry[] {
  const byGeo = new Map<string, OfficialSource[]>();

  for (const entry of previous) {
    const geo = normalizeGeo(entry?.geo || "");
    if (!geo) continue;
    byGeo.set(geo, mergeOfficialSources([], Array.isArray(entry?.sources) ? entry.sources : []));
  }

  for (const entry of incoming) {
    const geo = normalizeGeo(entry?.geo || "");
    if (!geo) continue;
    const prevSources = byGeo.get(geo) || [];
    const nextSources = Array.isArray(entry?.sources) ? entry.sources : [];
    byGeo.set(geo, mergeOfficialSources(prevSources, nextSources));
  }

  return Array.from(byGeo.entries())
    .map(([geo, sources]) => ({
      geo,
      sources: sources
        .map((source) => ({
          ...source,
          url: normalizeUrl(source.url),
          host: source.host ? String(source.host).trim().toLowerCase() : source.host
        }))
        .filter((source) => source.url)
    }))
    .sort((a, b) => a.geo.localeCompare(b.geo));
}

export function summarizeOfficialRegistry(payload: {
  domains?: unknown[];
}): OfficialRegistrySummary {
  const domains = Array.isArray(payload?.domains) ? payload.domains.map((value) => String(value || "")) : [];
  const filtered = domains.filter((domain) => {
    const normalized = domain.toLowerCase();
    return normalized && !normalized.endsWith("wikipedia.org");
  });
  return {
    rawDomainCount: domains.length,
    filteredDomainCount: filtered.length,
    floorProtected: domains.length >= OFFICIAL_REGISTRY_RAW_FLOOR,
    filteredFloorProtected: filtered.length >= OFFICIAL_REGISTRY_FILTERED_FLOOR
  };
}

export function readOfficialRegistrySummary(rootDir: string): OfficialRegistrySummary {
  const filePath = path.join(rootDir, "data", "official", "official_domains.ssot.json");
  if (!fs.existsSync(filePath)) {
    return {
      rawDomainCount: 0,
      filteredDomainCount: 0,
      floorProtected: false,
      filteredFloorProtected: false
    };
  }
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return summarizeOfficialRegistry(payload);
}

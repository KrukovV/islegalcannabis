export type IpResolveResult = {
  country: string;
  region?: string;
  countryName?: string;
  lat?: number;
  lng?: number;
  provider?: "vercel" | "ipwho" | "ipinfo" | "stub";
  method: "ip";
};

function isLocalIp(ip: string) {
  const normalized = ip.trim().toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  );
}

function normalizeIso(value: string | null | undefined) {
  const iso = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(iso) && iso !== "XX" ? iso : null;
}

function normalizeNumber(value: string | number | null | undefined) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function formatCountryName(country: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(country) || country;
  } catch {
    return country;
  }
}

export function resolveIpToJurisdiction(ip: string | null): IpResolveResult {
  if (!ip || isLocalIp(ip)) {
    return { country: "UNKNOWN", method: "ip", provider: "stub" };
  }

  return { country: "UNKNOWN", method: "ip", provider: "stub" };
}

type IpWhoPayload = {
  success?: boolean;
  country?: string;
  country_code?: string;
  region?: string;
  region_code?: string;
  latitude?: number;
  longitude?: number;
};

type IpInfoPayload = {
  country?: string;
  region?: string;
  city?: string;
  loc?: string;
};

type CacheEntry = {
  expiresAt: number;
  result: IpResolveResult;
};

const IP_CACHE_TTL_MS = 10 * 60 * 1000;
const IP_FETCH_TIMEOUT_MS = 1800;
const ipCache = new Map<string, CacheEntry>();

export function getRequestIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const cloudflareIp = headers.get("cf-connecting-ip");
  const rawIp = forwardedFor ?? cloudflareIp ?? realIp ?? "";
  return rawIp.split(",")[0]?.trim() || null;
}

export function resolveVercelIpHeaders(headers: Headers): IpResolveResult | null {
  const country = normalizeIso(headers.get("x-vercel-ip-country"));
  if (!country) return null;

  const region = String(headers.get("x-vercel-ip-country-region") || "").trim().toUpperCase() || undefined;
  const lat = normalizeNumber(headers.get("x-vercel-ip-latitude"));
  const lng = normalizeNumber(headers.get("x-vercel-ip-longitude"));

  return {
      country,
      region,
      countryName: formatCountryName(country),
      lat,
      lng,
      provider: "vercel",
    method: "ip"
  };
}

async function fetchIpWho(ip: string | null): Promise<IpResolveResult | null> {
  const target = ip && !isLocalIp(ip)
    ? `https://ipwho.is/${encodeURIComponent(ip)}`
    : "https://ipwho.is/";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      cache: "no-store",
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as IpWhoPayload;
    if (payload.success === false) return null;
    const country = normalizeIso(payload.country_code);
    if (!country) return null;
    return {
      country,
      region: String(payload.region_code || payload.region || "").trim().toUpperCase() || undefined,
      countryName: String(payload.country || "").trim() || undefined,
      lat: normalizeNumber(payload.latitude),
      lng: normalizeNumber(payload.longitude),
      provider: "ipwho",
      method: "ip"
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseIpInfoLoc(loc: string | undefined) {
  const [rawLat, rawLng] = String(loc || "").split(",");
  return {
    lat: normalizeNumber(rawLat),
    lng: normalizeNumber(rawLng)
  };
}

async function fetchIpInfo(ip: string | null): Promise<IpResolveResult | null> {
  const target = ip && !isLocalIp(ip)
    ? `https://ipinfo.io/${encodeURIComponent(ip)}/json`
    : "https://ipinfo.io/json";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      cache: "no-store",
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as IpInfoPayload;
    const country = normalizeIso(payload.country);
    if (!country) return null;
    const { lat, lng } = parseIpInfoLoc(payload.loc);
    return {
      country,
      region: String(payload.region || "").trim().toUpperCase() || undefined,
      countryName: formatCountryName(country),
      lat,
      lng,
      provider: "ipinfo",
      method: "ip"
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resolveRequestIpToJurisdiction(headers: Headers): Promise<IpResolveResult> {
  const vercelResult = resolveVercelIpHeaders(headers);
  if (vercelResult) return vercelResult;

  const ip = getRequestIp(headers);
  const cacheKey = ip && !isLocalIp(ip) ? ip : "server-egress";
  const cached = ipCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const resolved = await fetchIpWho(ip) ?? await fetchIpInfo(ip);
  const result = resolved ?? resolveIpToJurisdiction(ip);
  ipCache.set(cacheKey, {
    expiresAt: Date.now() + IP_CACHE_TTL_MS,
    result
  });
  return result;
}

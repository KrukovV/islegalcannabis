import { resolveByBbox } from "@/lib/geo/bbox";

type ProviderMethod = "nominatim" | "geoapify" | "bbox";

export type ReverseGeocodeResult = {
  country: string;
  region?: string;
  method: ProviderMethod;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_UA = "isLegalCannabis/0.1 (contact: dev@local)";

type CacheEntry = { timestamp: number; value: ReverseGeocodeResult };
const cache = new Map<string, CacheEntry>();
let lastNominatimAt = 0;

function roundCoord(value: number) {
  return Number(value.toFixed(3));
}

function cacheKey(lat: number, lon: number) {
  return `${roundCoord(lat)},${roundCoord(lon)}`;
}

function getCached(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key: string, value: ReverseGeocodeResult) {
  cache.set(key, { timestamp: Date.now(), value });
}

function normalizeRegion(country: string, state?: string, stateCode?: string) {
  if (country !== "US") return undefined;
  const rawCode = stateCode?.toUpperCase();

  if (rawCode) {
    if (rawCode.startsWith("US-")) return rawCode.slice(3);
    if (rawCode.length === 2) return rawCode;
  }

  if (state && state.toUpperCase().includes("CALIFORNIA")) {
    return "CA";
  }

  return undefined;
}

function normalizeCountry(countryCode?: string) {
  if (!countryCode) return null;
  return countryCode.trim().toUpperCase();
}

function normalizeResult(countryCode?: string, state?: string, stateCode?: string) {
  const country = normalizeCountry(countryCode);
  if (!country) return null;

  const region = normalizeRegion(country, state, stateCode);
  return { country, region };
}

async function throttleNominatim() {
  const now = Date.now();
  const elapsed = now - lastNominatimAt;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastNominatimAt = Date.now();
}

async function fetchNominatim(lat: number, lon: number) {
  await throttleNominatim();
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": NOMINATIM_UA,
      "Accept-Language": "en"
    }
  });

  if (!response.ok) return null;
  const data = (await response.json()) as {
    address?: {
      country_code?: string;
      state?: string;
      state_code?: string;
      ["ISO3166-2-lvl4"]?: string;
    };
  };

  const address = data.address;
  if (!address) return null;

  const normalized = normalizeResult(
    address.country_code,
    address.state,
    address.state_code ?? address["ISO3166-2-lvl4"]
  );
  if (!normalized) return null;

  return { ...normalized, method: "nominatim" as const };
}

async function fetchGeoapify(lat: number, lon: number) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = (await response.json()) as {
    results?: Array<{
      country_code?: string;
      state?: string;
      state_code?: string;
    }>;
  };

  const first = data.results?.[0];
  if (!first) return null;

  const normalized = normalizeResult(
    first.country_code,
    first.state,
    first.state_code
  );
  if (!normalized) return null;

  return { ...normalized, method: "geoapify" as const };
}

function fallbackBbox(lat: number, lon: number): ReverseGeocodeResult {
  const resolved = resolveByBbox(lat, lon);
  return { ...resolved, method: "bbox" };
}

export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<ReverseGeocodeResult> {
  const key = cacheKey(lat, lon);
  const cached = getCached(key);
  if (cached) return cached;

  const nominatim = await fetchNominatim(lat, lon);
  if (nominatim) {
    setCached(key, nominatim);
    return nominatim;
  }

  const geoapify = await fetchGeoapify(lat, lon);
  if (geoapify) {
    setCached(key, geoapify);
    return geoapify;
  }

  const fallback = fallbackBbox(lat, lon);
  setCached(key, fallback);
  return fallback;
}

export function resetReverseGeocodeCacheForTests() {
  cache.clear();
  lastNominatimAt = 0;
}

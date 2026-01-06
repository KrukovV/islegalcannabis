import type { Source } from "@islegal/shared";

export type CachedCheck = {
  ts: string;
  jurisdictionKey: string;
  country: string;
  region?: string;
  statusCode: string;
  statusLevel: "green" | "yellow" | "red";
  profileHash: string;
  verifiedAt?: string;
  lawUpdatedAt?: string;
  sources: Source[];
  location: {
    method: "gps" | "ip" | "manual";
    confidence: "high" | "medium" | "low";
  };
  approxCell?: string;
};

const MAX_CACHE = 100;
const cache: CachedCheck[] = [];

function toMs(value: string) {
  return new Date(value).getTime();
}

export function resetNearbyCacheForTests() {
  cache.length = 0;
}

export function addCachedCheck(entry: CachedCheck) {
  cache.push(entry);
  if (cache.length > MAX_CACHE) {
    cache.splice(0, cache.length - MAX_CACHE);
  }
}

export function findNearbyCached(
  approxCell: string | null,
  jurisdictionKey: string,
  windowMinutes = 120,
  now = Date.now()
): CachedCheck | null {
  const windowMs = windowMinutes * 60 * 1000;
  for (let i = cache.length - 1; i >= 0; i -= 1) {
    const entry = cache[i];
    const ageMs = now - toMs(entry.ts);
    if (ageMs > windowMs) continue;
    if (approxCell) {
      if (entry.approxCell !== approxCell) continue;
    } else {
      if (entry.jurisdictionKey !== jurisdictionKey) continue;
    }
    const [hit] = cache.splice(i, 1);
    cache.push(hit);
    return hit;
  }
  return null;
}

export function buildApproxCell(input: {
  method?: "gps" | "ip" | "manual";
  country: string;
  region?: string;
  cell?: string | null;
}) {
  if (input.method === "gps" && input.cell) {
    return input.cell;
  }
  if (input.region) {
    return `adm1:${input.country}-${input.region}`;
  }
  return `country:${input.country}`;
}

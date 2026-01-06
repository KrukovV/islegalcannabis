"use client";

import type { ResultStatusLevel, Source } from "@islegal/shared";

export type CachedCheck = {
  ts: string;
  jurisdictionKey: string;
  country: string;
  region?: string;
  statusCode: string;
  statusLevel: ResultStatusLevel;
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

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const STORAGE_KEY = "ilc:nearby_cache";
const STORAGE_VERSION = 1;
const MAX_CACHE = 100;
const WINDOW_MINUTES = 120;
const memoryStore = new Map<string, string>();

function getStorage(): StorageLike {
  if (typeof window === "undefined" || !window.localStorage) {
    return {
      getItem: (key) => memoryStore.get(key) ?? null,
      setItem: (key, value) => {
        memoryStore.set(key, value);
      },
      removeItem: (key) => {
        memoryStore.delete(key);
      }
    };
  }
  return window.localStorage;
}

function toMs(value: string) {
  return new Date(value).getTime();
}

function loadAll(): CachedCheck[] {
  const storage = getStorage();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { v?: number; items?: CachedCheck[] };
    if (parsed?.v !== STORAGE_VERSION || !Array.isArray(parsed.items)) {
      storage.removeItem(STORAGE_KEY);
      return [];
    }
    return parsed.items;
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return [];
  }
}

function saveAll(items: CachedCheck[]) {
  const storage = getStorage();
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_VERSION, items })
    );
  } catch {
    // ignore
  }
}

export function resetNearbyCacheForTests() {
  memoryStore.clear();
}

export function purgeLRU(items: CachedCheck[]) {
  if (items.length <= MAX_CACHE) return items;
  return items.slice(items.length - MAX_CACHE);
}

export function saveCheck(entry: CachedCheck) {
  const items = loadAll();
  items.push(entry);
  saveAll(purgeLRU(items));
}

export function loadRecent(
  approxCell: string | null,
  jurisdictionKey: string,
  windowMinutes = WINDOW_MINUTES,
  now = Date.now()
): CachedCheck | null {
  const items = loadAll();
  const windowMs = windowMinutes * 60 * 1000;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const entry = items[i];
    const ageMs = now - toMs(entry.ts);
    if (ageMs > windowMs) continue;
    if (entry.jurisdictionKey !== jurisdictionKey) continue;
    if (approxCell && entry.approxCell !== approxCell) continue;
    return entry;
  }
  return null;
}

export function buildGpsCell(lat: number, lon: number) {
  return `cell:${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export function buildApproxCell(input: {
  method?: "gps" | "ip" | "manual";
  country: string;
  region?: string;
  cell?: string | null;
}) {
  if (input.method === "gps") {
    return input.cell ?? null;
  }
  if (input.region) {
    return `adm1:${input.country}-${input.region}`;
  }
  return `country:${input.country}`;
}

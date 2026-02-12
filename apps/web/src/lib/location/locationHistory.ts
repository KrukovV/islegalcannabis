"use client";

import type { ConfidenceLevel, LocationMethod } from "@islegal/shared";

const STORAGE_KEY = "ilc:location_history";
const STORAGE_VERSION = 1;
const MAX_HISTORY = 10;
const memoryStore = new Map<string, string>();

type HistoryEntry = {
  country: string;
  region?: string;
  method: LocationMethod;
  confidence: ConfidenceLevel;
  checkedAt: string;
};

type StorageLike = {
  getItem: (_key: string) => string | null;
  setItem: (_key: string, _value: string) => void;
  removeItem: (_key: string) => void;
};

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

function normalizeKey(entry: HistoryEntry) {
  return `${entry.country}:${entry.region ?? ""}:${entry.method}`;
}

export function loadLocationHistory(): HistoryEntry[] {
  const storage = getStorage();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      v?: number;
      items?: HistoryEntry[];
    };
    if (parsed?.v !== STORAGE_VERSION || !Array.isArray(parsed.items)) {
      storage.removeItem(STORAGE_KEY);
      return [];
    }
    return parsed.items;
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup failures.
    }
    return [];
  }
}

export function saveLocationHistory(entry: HistoryEntry) {
  const storage = getStorage();
  const items = loadLocationHistory();
  const next = [entry, ...items.filter((item) => normalizeKey(item) !== normalizeKey(entry))];
  const trimmed = next.slice(0, MAX_HISTORY);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, items: trimmed }));
  } catch {
    // Ignore storage failures.
  }
}

export function clearLocationHistory() {
  const storage = getStorage();
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function formatRecentEntry(entry: HistoryEntry): string {
  const region = entry.region ? `-${entry.region}` : "";
  const label = `${entry.country}${region}`;
  const dt = new Date(entry.checkedAt);
  const deltaMs = Date.now() - dt.getTime();
  const minutes = Math.max(0, Math.floor(deltaMs / 60000));
  if (minutes < 60) return `${label} · ${entry.method} · ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${label} · ${entry.method} · ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${label} · ${entry.method} · ${days}d ago`;
}

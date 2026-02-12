"use client";

import type { LocationContext } from "./locationContext";

const STORAGE_KEY = "ilc:last_location_context";
const STORAGE_VERSION = 1;
const memoryStore = new Map<string, string>();

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

export function saveLocationContext(context: LocationContext | null) {
  if (!context) return;
  if (context.mode === "query") return;
  const storage = getStorage();
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_VERSION, context })
    );
  } catch {
    // Ignore storage failures in UI.
  }
}

export function loadLocationContext(): LocationContext | null {
  const storage = getStorage();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      v?: number;
      context?: LocationContext;
    };
    if (parsed?.v !== STORAGE_VERSION || !parsed.context) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.context;
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup failures.
    }
    return null;
  }
}

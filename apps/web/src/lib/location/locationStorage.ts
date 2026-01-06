"use client";

import type { LocationContext } from "./locationContext";

const STORAGE_KEY = "ilc:last_location_context";
const memoryStore = new Map<string, string>();

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function getStorage(): StorageLike {
  if (typeof window === "undefined" || !window.localStorage) {
    return {
      getItem: (key) => memoryStore.get(key) ?? null,
      setItem: (key, value) => {
        memoryStore.set(key, value);
      }
    };
  }
  return window.localStorage;
}

export function saveLocationContext(context: LocationContext | null) {
  if (!context) return;
  if (context.mode === "query") return;
  const storage = getStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(context));
}

export function loadLocationContext(): LocationContext | null {
  const storage = getStorage();
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocationContext;
  } catch {
    return null;
  }
}

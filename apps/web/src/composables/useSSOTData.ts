"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const CACHE_KEY = "ssot_bootstrap_v1";
const REVALIDATE_MS = 4 * 60 * 60 * 1000;

export type SSOTBootstrapData = {
  fetchedAt: string;
  fromApiAt: string;
  coverage: Record<string, string>;
  wikiPagesCount: number;
  usStatesCount: number;
};

type CachePayload = {
  savedAt: number;
  data: SSOTBootstrapData;
};

function readCache(): CachePayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.data) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: SSOTBootstrapData) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const payload: CachePayload = { savedAt: Date.now(), data };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache write errors in private mode/storage-restricted browsers
  }
}

export function useSSOTData() {
  const [data, setData] = useState<SSOTBootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const fetchFresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ssot/bootstrap", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP_${res.status}`);
      }
      const payload = (await res.json()) as SSOTBootstrapData;
      setData(payload);
      setError(null);
      setFromCache(false);
      writeCache(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "UNKNOWN_FETCH_ERROR");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCache();
    if (cached?.data) {
      setData(cached.data);
      setFromCache(true);
      setLoading(false);
      const age = Date.now() - cached.savedAt;
      if (age > REVALIDATE_MS) {
        void fetchFresh();
      }
      return;
    }
    void fetchFresh();
  }, [fetchFresh]);

  return useMemo(
    () => ({ data, loading, error, fromCache }),
    [data, loading, error, fromCache]
  );
}


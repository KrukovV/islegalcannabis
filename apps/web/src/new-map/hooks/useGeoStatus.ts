"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveIp } from "@/lib/geo/resolveIp";

export type GeoStatus =
  | { status: "unknown" }
  | { status: "resolving" }
  | { status: "resolved" };

export type IpStatus =
  | { status: "idle"; message: string }
  | { status: "resolving"; message: string }
  | { status: "resolved"; country: string; iso2: string; message: string }
  | { status: "unknown"; message: string };

export type CurrentGeo = {
  iso2?: string;
  lat?: number;
  lng?: number;
  source: "ip" | "gps";
} | null;

const GEO_STORAGE_KEY = "geo";
let geoCache: CurrentGeo = null;

type ReverseGeoPayload = {
  iso?: string;
};

function unwrapIsoPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;
  const directIso = typeof root.iso === "string" ? root.iso : undefined;
  const data = root.data;
  if (data && typeof data === "object") {
    const nestedIso = typeof (data as Record<string, unknown>).iso === "string"
      ? (data as Record<string, unknown>).iso
      : undefined;
    return nestedIso || directIso;
  }
  return directIso;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSameGpsPoint(prev: CurrentGeo, lat: number, lng: number) {
  return (
    prev?.source === "gps" &&
    isFiniteNumber(prev.lat) &&
    isFiniteNumber(prev.lng) &&
    Math.abs(prev.lat - lat) < 0.0001 &&
    Math.abs(prev.lng - lng) < 0.0001
  );
}

function loadGeoFromStorage() {
  if (typeof window === "undefined") return geoCache;
  try {
    const raw = window.localStorage.getItem(GEO_STORAGE_KEY);
    if (!raw) return geoCache;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const lat = parsed.lat;
    const lng = parsed.lng;
    const source = parsed.source;
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || (source !== "gps" && source !== "ip")) {
      return geoCache;
    }
    geoCache = {
      lat,
      lng,
      source,
      iso2: typeof parsed.iso2 === "string" ? parsed.iso2 : undefined,
    };
  } catch {
    // Ignore malformed persisted geo.
  }
  return geoCache;
}

function persistGeo(next: CurrentGeo) {
  geoCache = next;
  if (typeof window === "undefined") return;
  try {
    if (!next) {
      window.localStorage.removeItem(GEO_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(GEO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage write failures.
  }
}

function readBrowserPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function acquireBrowserPosition() {
  try {
    return await readBrowserPosition({
      enableHighAccuracy: false,
      timeout: 15_000,
      maximumAge: 60_000
    });
  } catch (firstError) {
    try {
      return await readBrowserPosition({
        enableHighAccuracy: true,
        timeout: 25_000,
        maximumAge: 0
      });
    } catch (secondError) {
      throw secondError || firstError;
    }
  }
}

function logGeoFailure(error: unknown) {
  if (typeof console === "undefined") return;
  const geoError = error as Partial<GeolocationPositionError> | undefined;
  console.warn("GPS_POSITION_FAILED", {
    code: geoError?.code,
    message: geoError?.message || String(error || "")
  });
}

export function useGeoStatus() {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>({ status: "unknown" });
  const [currentGeo, setCurrentGeo] = useState<CurrentGeo>(null);
  const [geoReady, setGeoReady] = useState(false);
  const [ipStatus, setIpStatus] = useState<IpStatus>({
    status: "idle",
    message: ""
  });
  const setGeo = useCallback((next: CurrentGeo | ((_prev: CurrentGeo) => CurrentGeo)) => {
    setCurrentGeo((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (prev?.source === "gps" && resolved?.source === "ip") {
        return prev;
      }
      persistGeo(resolved);
      return resolved;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restored = loadGeoFromStorage();
    queueMicrotask(() => {
      if (cancelled) return;
      if (restored) {
        setCurrentGeo(restored);
        if (restored.source === "gps") {
          setGeoStatus({ status: "resolved" });
        }
        if (restored.source === "ip") {
          setIpStatus({
            status: "resolved",
            country: restored.iso2 || "Saved location",
            iso2: restored.iso2 || "",
            message: restored.iso2 ? `IP: ${restored.iso2} (approximate)` : "IP: saved approximate location"
          });
        }
      }
      setGeoReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshIpGeo = useCallback(async () => {
    if (currentGeo?.source === "gps") return;
    setIpStatus({
      status: "resolving",
      message: "Detecting approximate location via IP..."
    });
    try {
      const resolved = await resolveIp();
      if (!resolved) throw new Error("ip_lookup_failed");
      const iso = String(resolved.iso2 || "").trim().toUpperCase();
      const country = String(resolved.country || "").trim();
      const lat = resolved.lat;
      const lng = resolved.lng;
      setGeo((prev) => {
        if (prev?.source === "gps") return prev;
        return { iso2: iso, lat, lng, source: "ip" };
      });
      setIpStatus({
        status: "resolved",
        country,
        iso2: iso,
        message: `IP: ${country} (approximate)`
      });
    } catch {
      setIpStatus({
        status: "unknown",
        message: ""
      });
    }
  }, [currentGeo?.source, setGeo]);
  const requestGeo = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus({ status: "unknown" });
      return;
    }

    setGeoStatus({ status: "resolving" });
    try {
      const position = await acquireBrowserPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setGeo((prev) => ({
        iso2: isSameGpsPoint(prev, lat, lng) ? prev?.iso2 : undefined,
        lat,
        lng,
        source: "gps"
      }));
      setGeoStatus({ status: "resolved" });
      setIpStatus({
        status: "unknown",
        message: "GPS: current position"
      });
      try {
        const response = await fetch("/api/geo/resolve", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            lat,
            lon: lng,
            accuracy: position.coords.accuracy,
            permission: "granted"
          })
        });
        const payload = (await response.json()) as { data?: ReverseGeoPayload } | ReverseGeoPayload;
        if (!response.ok) {
          return;
        }
        const iso = String(unwrapIsoPayload(payload) || "").trim().toUpperCase();
        if (!iso) {
          return;
        }
        setGeo((prev) => ({
          iso2: iso,
          lat: prev?.lat ?? lat,
          lng: prev?.lng ?? lng,
          source: "gps"
        }));
        setIpStatus({
          status: "resolved",
          country: iso,
          iso2: iso,
          message: `GPS: ${iso}`
        });
      } catch {
        // Keep the GPS location owner and marker even if reverse-geocode fails.
      }
    } catch (error) {
      logGeoFailure(error);
      setGeoStatus({ status: "unknown" });
    }
  }, [setGeo]);

  return { geoStatus, retry: requestGeo, currentGeo, refreshIpGeo, ipStatus, geoReady };
}

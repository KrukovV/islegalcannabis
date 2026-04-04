"use client";

import { useCallback, useState } from "react";

export type GeoStatus =
  | { status: "unknown" }
  | { status: "resolving" }
  | { status: "resolved" };

export type IpStatus =
  | { status: "resolving"; message: string }
  | { status: "resolved"; country: string; iso2: string; message: string }
  | { status: "unknown"; message: string };

export type CurrentGeo = {
  iso2?: string;
  lat?: number;
  lng?: number;
  source: "ip" | "gps";
} | null;

type IpGeoPayload = {
  iso?: string;
};

type BrowserIpLookupPayload = {
  success?: boolean;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
};

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

export function useGeoStatus() {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>({ status: "unknown" });
  const [currentGeo, setCurrentGeo] = useState<CurrentGeo>(null);
  const [ipStatus, setIpStatus] = useState<IpStatus>({
    status: "resolving",
    message: "Detecting approximate location via IP..."
  });
  const refreshIpGeo = useCallback(async () => {
    setIpStatus({
      status: "resolving",
      message: "Detecting approximate location via IP..."
    });
    try {
      const response = await fetch("https://ipwho.is/", { cache: "no-store" });
      const payload = (await response.json()) as BrowserIpLookupPayload;
      const iso = String(payload?.country_code || "").trim().toUpperCase();
      const country = String(payload?.country || "").trim();
      const lat = typeof payload?.latitude === "number" ? payload.latitude : undefined;
      const lng = typeof payload?.longitude === "number" ? payload.longitude : undefined;
      if (!response.ok || payload?.success === false || !iso || !country) {
        throw new Error("ip_lookup_failed");
      }
      setCurrentGeo((prev) => {
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
      try {
        const fallbackResponse = await fetch("/api/geo/loc", { cache: "no-store" });
        if (!fallbackResponse.ok) throw new Error("ip_loc_fallback_failed");
        const fallbackPayload = (await fallbackResponse.json()) as { data?: IpGeoPayload } | IpGeoPayload;
        const iso = String(unwrapIsoPayload(fallbackPayload) || "").trim().toUpperCase();
        if (!iso || iso === "UNKNOWN") {
          throw new Error("ip_unknown");
        }
        setCurrentGeo((prev) => {
          if (prev?.source === "gps") return prev;
          return { iso2: iso, source: "ip" };
        });
        setIpStatus({
          status: "resolved",
          country: iso,
          iso2: iso,
          message: `IP: ${iso} (approximate)`
        });
      } catch {
        setIpStatus({
          status: "unknown",
          message: "IP unavailable: localhost/private network, VPN/proxy, network blocker, or lookup timeout."
        });
      }
    }
  }, []);
  const requestGeo = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus({ status: "unknown" });
      return;
    }

    setGeoStatus({ status: "resolving" });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCurrentGeo((prev) => ({
          iso2: prev?.iso2,
          lat,
          lng,
          source: "gps"
        }));
        setGeoStatus({ status: "resolved" });
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
          setCurrentGeo((prev) => ({
            iso2: iso,
            lat: prev?.lat ?? lat,
            lng: prev?.lng ?? lng,
            source: "gps"
          }));
        } catch {
          // Keep the GPS location owner and marker even if reverse-geocode fails.
        }
      },
      () => {
        setGeoStatus({ status: "unknown" });
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0
      }
    );
  }, []);

  return { geoStatus, retry: requestGeo, currentGeo, refreshIpGeo, ipStatus };
}

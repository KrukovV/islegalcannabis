"use client";

import { useCallback, useState } from "react";

export type GeoStatus =
  | { status: "unknown" }
  | { status: "resolving" }
  | { status: "resolved" };

export type CurrentGeo = {
  iso2: string;
  lat?: number;
  lng?: number;
  source: "ip" | "gps";
} | null;

type IpGeoPayload = {
  iso?: string;
};

type ReverseGeoPayload = {
  iso?: string;
};

export function useGeoStatus() {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>({ status: "unknown" });
  const [currentGeo, setCurrentGeo] = useState<CurrentGeo>(null);
  const refreshIpGeo = useCallback(async () => {
    try {
      const response = await fetch("/api/geo/loc", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { data?: IpGeoPayload } | IpGeoPayload;
      const iso = String(payload?.data?.iso || payload?.iso || "").trim().toUpperCase();
      if (!iso) return;
      setCurrentGeo((prev) => {
        if (prev?.source === "gps") return prev;
        return { iso2: iso, source: "ip" };
      });
    } catch {
      // Ignore IP refresh failures; existing map baseline stays usable.
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
        try {
          const response = await fetch("/api/geo/resolve", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy,
              permission: "granted"
            })
          });
          const payload = (await response.json()) as { data?: ReverseGeoPayload } | ReverseGeoPayload;
          if (!response.ok) {
            setGeoStatus({ status: "unknown" });
            return;
          }
          const iso = String(payload?.data?.iso || payload?.iso || "").trim().toUpperCase();
          if (!iso) {
            setGeoStatus({ status: "unknown" });
            return;
          }
          setCurrentGeo({
            iso2: iso,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            source: "gps"
          });
          setGeoStatus({ status: "resolved" });
        } catch {
          setGeoStatus({ status: "unknown" });
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

  return { geoStatus, retry: requestGeo, currentGeo, refreshIpGeo };
}

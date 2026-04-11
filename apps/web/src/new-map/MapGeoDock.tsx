"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CountryCardEntry } from "./map.types";
import AIBar from "./components/AIBar";
import { useGeoStatus } from "./hooks/useGeoStatus";
import { markNewMapTrace } from "./startupTrace";

type ActiveGeo = {
  country: string;
  iso2?: string;
  lat?: number;
  lng?: number;
} | null;

type Props = {
  mapReady: boolean;
  cardIndex: Record<string, CountryCardEntry>;
  selectedGeo: ActiveGeo;
  clearSelectedGeo: () => void;
  applyGeoToMap: (_geo: ActiveGeo, _options?: { recenter?: boolean }) => void;
  centerMapToGeo: (_geo: ActiveGeo) => void;
};

export default function MapGeoDock({
  mapReady,
  cardIndex,
  selectedGeo,
  clearSelectedGeo,
  applyGeoToMap,
  centerMapToGeo
}: Props) {
  const lastAutoCenterKeyRef = useRef<string | null>(null);
  const ipBootstrapStartedRef = useRef(false);
  const gpsCenterPendingRef = useRef(false);
  const { geoStatus, retry, currentGeo, refreshIpGeo, ipStatus, geoReady } = useGeoStatus();
  const currentGeoEntry = currentGeo?.iso2 ? cardIndex[currentGeo.iso2] : null;
  const currentGeoView: ActiveGeo = useMemo(() => {
    if (!currentGeo) return null;
    if (!currentGeoEntry && typeof currentGeo.lat !== "number" && typeof currentGeo.lng !== "number") {
      return null;
    }
    return {
      country: currentGeoEntry?.displayName || currentGeo.iso2 || "Current location",
      iso2: currentGeo.iso2,
      lat: currentGeo.lat ?? currentGeoEntry?.coordinates?.lat,
      lng: currentGeo.lng ?? currentGeoEntry?.coordinates?.lng
    };
  }, [currentGeo, currentGeoEntry]);
  const activeGeo: ActiveGeo = selectedGeo || currentGeoView;

  const handleGpsClick = useCallback(() => {
    if (geoStatus.status === "resolved" && currentGeoView) {
      gpsCenterPendingRef.current = false;
      clearSelectedGeo();
      centerMapToGeo(currentGeoView);
      return;
    }
    gpsCenterPendingRef.current = true;
    retry();
  }, [centerMapToGeo, clearSelectedGeo, currentGeoView, geoStatus.status, retry]);

  useEffect(() => {
    markNewMapTrace("NM_T11_AI_READY");
  }, []);

  useEffect(() => {
    if (!currentGeo?.source) return;
    markNewMapTrace("NM_T10_GEO_DONE");
  }, [currentGeo?.source]);

  useEffect(() => {
    if (!geoReady || !mapReady || currentGeo?.source === "gps" || ipBootstrapStartedRef.current) return;
    ipBootstrapStartedRef.current = true;
    void refreshIpGeo();
  }, [currentGeo?.source, geoReady, mapReady, refreshIpGeo]);

  useEffect(() => {
    if (!mapReady) return;
    if (
      typeof currentGeoView?.lng !== "number" ||
      typeof currentGeoView?.lat !== "number"
    ) {
      applyGeoToMap(null, { recenter: false });
      return;
    }
    applyGeoToMap(currentGeoView, { recenter: false });
  }, [applyGeoToMap, currentGeoView, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    if (selectedGeo) return;
    if (!currentGeoView) return;
    if (currentGeo?.source !== "gps") return;
    const autoCenterKey = `${currentGeo?.source || "none"}:${currentGeoView.iso2}:${currentGeoView.lat ?? "?"}:${currentGeoView.lng ?? "?"}`;
    if (lastAutoCenterKeyRef.current === autoCenterKey) return;
    lastAutoCenterKeyRef.current = autoCenterKey;
    applyGeoToMap(currentGeoView, { recenter: true });
  }, [applyGeoToMap, currentGeo?.source, currentGeoView, mapReady, selectedGeo]);

  useEffect(() => {
    if (!gpsCenterPendingRef.current) return;
    if (!mapReady) return;
    if (geoStatus.status !== "resolved") return;
    if (currentGeo?.source !== "gps") return;
    if (!currentGeoView) return;
    gpsCenterPendingRef.current = false;
    clearSelectedGeo();
    centerMapToGeo(currentGeoView);
  }, [centerMapToGeo, clearSelectedGeo, currentGeo?.source, currentGeoView, geoStatus.status, mapReady]);

  return (
    <AIBar
      activeGeo={activeGeo?.iso2 ? { country: activeGeo.country, iso2: activeGeo.iso2 } : null}
      geoStatus={geoStatus}
      ipStatus={ipStatus}
      onGpsClick={handleGpsClick}
    />
  );
}

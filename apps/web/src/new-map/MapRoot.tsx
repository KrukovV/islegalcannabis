"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import RuntimeParityBadge from "@/app/_components/RuntimeParityBadge";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import { useGeoStatus } from "./hooks/useGeoStatus";
import { createMap } from "./createMap";
import { attachHoverController } from "./hoverController";
import type { LegalCountryCollection } from "./map.types";
import AIBar from "./components/AIBar";
import CountryCard, { type CountryCardEntry } from "./components/CountryCard";
import styles from "./MapRoot.module.css";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  cardIndex: Record<string, CountryCardEntry>;
};

type NewMapDebug = {
  mounted: boolean;
  selectedId?: string | null;
  countriesUrl: string;
  map?: import("maplibre-gl").Map | null;
  labelGroups?: Record<string, string[]>;
  lastPointerLng?: number | null;
};

type SelectedGeo = {
  country: string;
  iso2: string;
} | null;

type ActiveGeo = {
  country: string;
  iso2: string;
  lat?: number;
  lng?: number;
} | null;

function setDebugState(partial: Partial<NewMapDebug>) {
  const host = globalThis as typeof globalThis & {
    __NEW_MAP_DEBUG__?: NewMapDebug;
  };
  const current = host.__NEW_MAP_DEBUG__ || {
    mounted: false,
    countriesUrl: ""
  };
  Object.assign(current, partial);
  host.__NEW_MAP_DEBUG__ = current;
}

export default function MapRoot({ countriesUrl, visibleStamp, runtimeIdentity, cardIndex }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const locationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const lastAutoCenterKeyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedGeo, setSelectedGeo] = useState<SelectedGeo>(null);
  const { geoStatus, retry, currentGeo, refreshIpGeo } = useGeoStatus();
  const currentGeoEntry = currentGeo?.iso2 ? cardIndex[currentGeo.iso2] : null;
  const currentGeoView: ActiveGeo =
    currentGeo && currentGeoEntry
      ? {
          country: currentGeoEntry.displayName,
          iso2: currentGeo.iso2,
          lat: currentGeo.lat ?? currentGeoEntry.coordinates?.lat,
          lng: currentGeo.lng ?? currentGeoEntry.coordinates?.lng
        }
      : null;
  const activeGeo: ActiveGeo = selectedGeo ?? currentGeoView;

  const centerMapToGeo = useCallback((geo: ActiveGeo) => {
    const map = mapRef.current;
    if (!map) return;
    if (typeof geo?.lng !== "number" || typeof geo?.lat !== "number") return;
    map.easeTo({
      center: [geo.lng, geo.lat],
      zoom: Math.max(map.getZoom(), 3.2),
      duration: 700,
      essential: true
    });
  }, []);

  const handleGpsClick = useCallback(() => {
    if (geoStatus.status === "resolved" && currentGeoView) {
      setSelectedGeo(null);
      centerMapToGeo(currentGeoView);
      return;
    }
    retry();
  }, [centerMapToGeo, currentGeoView, geoStatus.status, retry]);

  useEffect(() => {
    const host = globalThis as typeof globalThis & {
      __MAP_SELECTED_GEO__?: (_geo: SelectedGeo) => void;
    };
    host.__MAP_SELECTED_GEO__ = (geo) => {
      setSelectedGeo(geo);
      setDebugState({ selectedId: geo?.iso2 ?? null });
    };
    return () => {
      delete host.__MAP_SELECTED_GEO__;
    };
  }, []);

  useEffect(() => {
    refreshIpGeo();
  }, [refreshIpGeo]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    async function mount() {
      if (!containerRef.current) return;
      try {
        const [countriesResponse, adminResponse] = await Promise.all([
          fetch(countriesUrl, { cache: "no-store" }),
          fetch("/api/new-map/admin-boundaries", { cache: "no-store" })
        ]);
        if (!countriesResponse.ok) {
          throw new Error(`countries_fetch_failed:${countriesResponse.status}`);
        }
        if (!adminResponse.ok) {
          throw new Error(`admin_boundaries_fetch_failed:${adminResponse.status}`);
        }
        const countries = (await countriesResponse.json()) as LegalCountryCollection;
        const adminBoundaries = await adminResponse.json();
        if (cancelled || !containerRef.current) return;
        const runtime = createMap(containerRef.current, countries, adminBoundaries);
        await runtime.ready;
        if (cancelled) {
          runtime.destroy();
          return;
        }
        const hover = attachHoverController(runtime.map);
        mapRef.current = runtime.map;
        setDebugState({ mounted: true, countriesUrl, map: runtime.map, selectedId: null });
        cleanup = () => {
          hover.destroy();
          locationMarkerRef.current?.remove();
          locationMarkerRef.current = null;
          mapRef.current = null;
          runtime.destroy();
          setSelectedGeo(null);
          setDebugState({ mounted: false, selectedId: null, map: null });
        };
      } catch (mountError) {
        setError(mountError instanceof Error ? mountError.message : "new_map_boot_failed");
      }
    }

    mount();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [countriesUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (
      typeof currentGeoView?.lng !== "number" ||
      typeof currentGeoView?.lat !== "number"
    ) {
      locationMarkerRef.current?.remove();
      locationMarkerRef.current = null;
      return;
    }

    const markerElement = locationMarkerRef.current?.getElement() || document.createElement("div");
    markerElement.className = styles.locationMarker;
    markerElement.setAttribute("aria-hidden", "true");

    if (!locationMarkerRef.current) {
      const marker = new maplibregl.Marker({
        element: markerElement,
        anchor: "bottom"
      });
      marker.setLngLat([currentGeoView.lng, currentGeoView.lat]).addTo(map);
      locationMarkerRef.current = marker;
      return;
    }

    locationMarkerRef.current.setLngLat([currentGeoView.lng, currentGeoView.lat]);
  }, [currentGeoView?.lat, currentGeoView?.lng]);

  useEffect(() => {
    if (selectedGeo) return;
    if (!currentGeoView) return;
    const autoCenterKey = `${currentGeo?.source || "none"}:${currentGeoView.iso2}:${currentGeoView.lat ?? "?"}:${currentGeoView.lng ?? "?"}`;
    if (lastAutoCenterKeyRef.current === autoCenterKey) return;
    lastAutoCenterKeyRef.current = autoCenterKey;
    centerMapToGeo(currentGeoView);
  }, [centerMapToGeo, currentGeo?.source, currentGeoView, selectedGeo]);

  return (
    <section className={styles.root} data-testid="new-map-root">
      <div className={styles.overlay}>
        <div className={styles.card}>
          <div className={styles.eyebrow}>New Map Skeleton</div>
          <h2>MapLibre render + feature-state hover</h2>
          <p>MapLibre owns render. Leaflet is reduced to pointer-stream glue only. Truth colors still come from the current SSOT snapshot.</p>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <strong>Runtime</strong>
            <RuntimeParityBadge runtimeIdentity={runtimeIdentity} />
          </div>
          <div className={styles.runtime}>{visibleStamp}</div>
          <div className={styles.meta}>ROUTE=/new-map · OWNER=feature-state · WORLDCOPIES=ON</div>
        </div>
      </div>
      <div ref={containerRef} className={styles.mapSurface} data-testid="new-map-surface" />
      <CountryCard geo={activeGeo?.iso2 ?? null} cardIndex={cardIndex} />
      <AIBar activeGeo={activeGeo ? { country: activeGeo.country, iso2: activeGeo.iso2 } : null} geoStatus={geoStatus} onGpsClick={handleGpsClick} />
      {error ? (
        <div className={styles.errorBox} data-testid="new-map-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}

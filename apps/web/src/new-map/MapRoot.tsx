"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import RuntimeParityBadge from "@/app/_components/RuntimeParityBadge";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import { useGeoStatus } from "./hooks/useGeoStatus";
import { createMap } from "./createMap";
import { attachHoverController } from "./hoverController";
import type { LegalCountryCollection } from "./map.types";
import AIBar from "./components/AIBar";
import type { CountryCardEntry } from "./components/CountryCard";
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

type SelectedGeo = string | null;

type ActiveGeo = {
  country: string;
  iso2?: string;
  lat?: number;
  lng?: number;
} | null;

type NewMapPrefetchCache = {
  style?: Promise<StyleSpecification | null> | null;
  countries?: Promise<LegalCountryCollection | null> | null;
};

function getNewMapPrefetchCache(): NewMapPrefetchCache | null {
  if (typeof window === "undefined") return null;
  const host = window as typeof window & {
    __NEW_MAP_PREFETCH__?: NewMapPrefetchCache;
  };
  return host.__NEW_MAP_PREFETCH__ || null;
}

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCountryPopup(entry: CountryCardEntry) {
  return [
    `<div class="${styles.countryPopup}" data-testid="new-map-country-popup">`,
    `<div class="${styles.countryPopupTitle}">${escapeHtml(entry.displayName)}</div>`,
    `<div class="${styles.countryPopupMeta}">ISO2: ${escapeHtml(entry.iso2 || "Unknown")}</div>`,
    `<div class="${styles.countryPopupMeta}">Rec: ${escapeHtml(entry.legalStatus)}</div>`,
    `<div class="${styles.countryPopupMeta}">Med: ${escapeHtml(entry.medicalStatus)}</div>`,
    `<div class="${styles.countryPopupNotes}">${escapeHtml(entry.notes || "No notes available.")}</div>`,
    "</div>"
  ].join("");
}

export default function MapRoot({ countriesUrl, visibleStamp, runtimeIdentity, cardIndex }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const locationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const lastAutoCenterKeyRef = useRef<string | null>(null);
  const ipBootstrapStartedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedGeo, setSelectedGeo] = useState<SelectedGeo>(null);
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
  const selectedGeoEntry = selectedGeo ? cardIndex[selectedGeo] ?? null : null;
  const activeGeo: ActiveGeo = selectedGeoEntry
    ? {
        country: selectedGeoEntry.displayName,
        iso2: selectedGeoEntry.iso2 || undefined,
        lat: selectedGeoEntry.coordinates?.lat,
        lng: selectedGeoEntry.coordinates?.lng
      }
    : currentGeoView;

  const applyGeoToMap = useCallback((geo: ActiveGeo, options?: { recenter?: boolean }) => {
    const map = mapRef.current;
    if (!map) return;
    if (typeof geo?.lng !== "number" || typeof geo?.lat !== "number") return;

    const markerElement = locationMarkerRef.current?.getElement() || document.createElement("div");
    markerElement.className = styles.locationMarker;
    markerElement.setAttribute("aria-hidden", "true");
    markerElement.setAttribute("data-user-marker", "1");
    markerElement.setAttribute("data-user-marker-position", `${geo.lng},${geo.lat}`);

    if (!locationMarkerRef.current) {
      locationMarkerRef.current = new maplibregl.Marker({
        element: markerElement,
        anchor: "bottom"
      })
        .setLngLat([geo.lng, geo.lat])
        .addTo(map);
    } else {
      locationMarkerRef.current.setLngLat([geo.lng, geo.lat]);
    }

    if (options?.recenter) {
      map.jumpTo({
        center: [geo.lng, geo.lat],
        zoom: Math.max(map.getZoom(), 3.2)
      });
    }
  }, []);

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
    if (!geoReady || !mapReady || currentGeo?.source === "gps" || ipBootstrapStartedRef.current) return;
    ipBootstrapStartedRef.current = true;
    const timerId = window.setTimeout(() => {
      void refreshIpGeo();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [currentGeo?.source, geoReady, mapReady, refreshIpGeo]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    async function mount() {
      if (!containerRef.current) return;
      try {
        const prefetched = getNewMapPrefetchCache();
        const loadCountries = () =>
          fetch(countriesUrl, {
            cache: "force-cache",
            credentials: "same-origin"
          }).then((response) => {
            if (!response.ok) {
              throw new Error(`countries_fetch_failed:${response.status}`);
            }
            return response.json() as Promise<LegalCountryCollection>;
          });
        const loadStyle = () =>
          fetch("/api/new-map/basemap-style?v=20260331-host-header-same-origin", {
            cache: "force-cache",
            credentials: "same-origin"
          }).then((response) => {
            if (!response.ok) {
              throw new Error(`basemap_style_fetch_failed:${response.status}`);
            }
            return response.json() as Promise<StyleSpecification>;
          });
        const countriesPromise = prefetched?.countries
          ? prefetched.countries.then((value) => value || loadCountries())
          : loadCountries();
        const stylePromise = prefetched?.style
          ? prefetched.style.then((value) => value || loadStyle())
          : loadStyle();
        const adminPromise = fetch("/api/new-map/admin-boundaries", {
          cache: "force-cache",
          credentials: "same-origin"
        });
        const style = await stylePromise;
        const runtime = createMap(containerRef.current, {
          style,
          getCountryPopupHtml: (geo) => {
            const entry = cardIndex[geo];
            return entry ? renderCountryPopup(entry) : null;
          },
          onSelectGeo: (geo) => {
            setSelectedGeo(geo);
            setDebugState({ selectedId: geo });
          }
        });
        mapRef.current = runtime.map;
        await runtime.ready;
        if (cancelled) {
          runtime.destroy();
          return;
        }
        setMapReady(true);
        const hover = attachHoverController(runtime.map);
        setDebugState({ mounted: true, countriesUrl, map: runtime.map, selectedId: null });
        const [countries, adminResponse] = await Promise.all([countriesPromise, adminPromise]);
        if (!adminResponse.ok) {
          throw new Error(`admin_boundaries_fetch_failed:${adminResponse.status}`);
        }
        const adminBoundaries =
          await adminResponse.json() as import("./map.types").AdminBoundaryCollection;
        if (cancelled) {
          hover.destroy();
          runtime.destroy();
          return;
        }
        runtime.setData(countries, adminBoundaries);
        cleanup = () => {
          hover.destroy();
          locationMarkerRef.current?.remove();
          locationMarkerRef.current = null;
          mapRef.current = null;
          ipBootstrapStartedRef.current = false;
          setMapReady(false);
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
  }, [cardIndex, countriesUrl]);

  useEffect(() => {
    if (!mapReady) return;
    if (
      typeof currentGeoView?.lng !== "number" ||
      typeof currentGeoView?.lat !== "number"
    ) {
      locationMarkerRef.current?.remove();
      locationMarkerRef.current = null;
      return;
    }
    applyGeoToMap(currentGeoView, { recenter: false });
  }, [applyGeoToMap, currentGeoView, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    if (selectedGeo) return;
    if (!currentGeoView) return;
    const autoCenterKey = `${currentGeo?.source || "none"}:${currentGeoView.iso2}:${currentGeoView.lat ?? "?"}:${currentGeoView.lng ?? "?"}`;
    if (lastAutoCenterKeyRef.current === autoCenterKey) return;
    lastAutoCenterKeyRef.current = autoCenterKey;
    applyGeoToMap(currentGeoView, { recenter: true });
  }, [applyGeoToMap, currentGeo?.source, currentGeoView, mapReady, selectedGeo]);

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
      <div ref={containerRef} className={styles.mapSurface} data-testid="new-map-surface" data-map-ready={mapReady ? "1" : "0"} />
      <AIBar
        activeGeo={activeGeo?.iso2 ? { country: activeGeo.country, iso2: activeGeo.iso2 } : null}
        geoStatus={geoStatus}
        ipStatus={ipStatus}
        onGpsClick={handleGpsClick}
      />
      {error ? (
        <div className={styles.errorBox} data-testid="new-map-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import { createMap } from "./createMap";
import type { LegalCountryCollection } from "./map.types";
import type { CountryCardEntry } from "./components/CountryCard";
import styles from "./MapRoot.module.css";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
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
  cardIndex?: Promise<Record<string, CountryCardEntry> | null> | null;
};

const RuntimeParityBadge = dynamic(() => import("@/app/_components/RuntimeParityBadge"), { ssr: false });
const MapGeoDock = dynamic(() => import("./MapGeoDock"), { ssr: false });

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

export default function MapRoot({ countriesUrl, visibleStamp, runtimeIdentity }: Props) {
  const isDev = process.env.NODE_ENV !== "production";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const locationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const cardIndexRef = useRef<Record<string, CountryCardEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedGeo, setSelectedGeo] = useState<SelectedGeo>(null);
  const [cardIndex, setCardIndex] = useState<Record<string, CountryCardEntry>>({});
  const selectedGeoEntry = selectedGeo ? cardIndex[selectedGeo] ?? null : null;
  const selectedGeoView: ActiveGeo = useMemo(() => {
    if (!selectedGeoEntry) return null;
    return {
      country: selectedGeoEntry.displayName,
      iso2: selectedGeoEntry.iso2 || undefined,
      lat: selectedGeoEntry.coordinates?.lat,
      lng: selectedGeoEntry.coordinates?.lng
    };
  }, [selectedGeoEntry]);

  const applyGeoToMap = useCallback((geo: ActiveGeo, options?: { recenter?: boolean }) => {
    const map = mapRef.current;
    if (!map) return;
    if (typeof geo?.lng !== "number" || typeof geo?.lat !== "number") {
      locationMarkerRef.current?.remove();
      locationMarkerRef.current = null;
      return;
    }

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

  useEffect(() => {
    cardIndexRef.current = cardIndex;
  }, [cardIndex]);

  useEffect(() => {
    let cancelled = false;
    const prefetched = getNewMapPrefetchCache();
    const loadCardIndex = () =>
      fetch("/new-map-card-index.json", {
        cache: "force-cache",
        credentials: "same-origin"
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`card_index_fetch_failed:${response.status}`);
        }
        return response.json() as Promise<Record<string, CountryCardEntry>>;
      });
    const cardIndexPromise = prefetched?.cardIndex
      ? prefetched.cardIndex.then((value) => value || loadCardIndex())
      : loadCardIndex();

    void cardIndexPromise
      .then((nextCardIndex) => {
        if (!cancelled && nextCardIndex) {
          setCardIndex(nextCardIndex);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCardIndex({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
        const runtime = createMap(containerRef.current, {
          stylePromise,
          getCountryPopupHtml: (geo) => {
            const entry = cardIndexRef.current[geo];
            return entry ? renderCountryPopup(entry) : null;
          },
          onSelectGeo: (geo) => {
            const normalizedGeo = geo?.startsWith("US-") ? "US" : geo;
            setSelectedGeo(normalizedGeo);
            setDebugState({ selectedId: normalizedGeo });
          }
        });
        mapRef.current = runtime.map;
        await runtime.ready;
        if (cancelled) {
          runtime.destroy();
          return;
        }
        setMapReady(true);
        const { attachHoverController } = await import("./hoverController");
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
  }, [countriesUrl]);

  return (
    <section className={styles.root} data-testid="new-map-root">
      {isDev ? (
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
      ) : null}
      <div ref={containerRef} className={styles.mapSurface} data-testid="new-map-surface" data-map-ready={mapReady ? "1" : "0"} />
      <MapGeoDock
        mapReady={mapReady}
        cardIndex={cardIndex}
        selectedGeo={selectedGeoView}
        clearSelectedGeo={() => setSelectedGeo(null)}
        applyGeoToMap={applyGeoToMap}
        centerMapToGeo={centerMapToGeo}
      />
      {error ? (
        <div className={styles.errorBox} data-testid="new-map-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}

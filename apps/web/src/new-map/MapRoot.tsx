"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import { createMap } from "./createMap";
import type { CountryCardEntry, LegalCountryCollection } from "./map.types";
import styles from "./MapRoot.module.css";
import { NEW_MAP_WATER_COLOR } from "./mapPalette";
import { hasFirstVisualReady, onFirstVisualReady, resetFirstVisualReady } from "./startupTrace";
import AsciiOverlay from "./ascii/AsciiOverlay";
import ViewportCountryPopup from "./components/ViewportCountryPopup";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  initialGeoCode?: string | null;
  seoCountryData?: CountryPageData | null;
  seoCountryIndex?: Record<string, CountryPageData>;
};

const EMPTY_SEO_COUNTRY_INDEX: Record<string, CountryPageData> = {};

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

export default function MapRoot({
  countriesUrl,
  visibleStamp,
  runtimeIdentity,
  initialGeoCode = null,
  seoCountryData = null,
  seoCountryIndex = EMPTY_SEO_COUNTRY_INDEX
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const locationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const infoMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [visualReady, setVisualReady] = useState(false);
  const [selectedGeo, setSelectedGeo] = useState<SelectedGeo>(
    initialGeoCode ? String(initialGeoCode).trim().toUpperCase() : null
  );
  const [hoveredGeo, setHoveredGeo] = useState<SelectedGeo>(null);
  const [seoPanelOpen, setSeoPanelOpen] = useState(Boolean(initialGeoCode));
  const [cardIndex, setCardIndex] = useState<Record<string, CountryCardEntry>>({});
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
  const selectedFeatureStateRef = useRef<{ source: "legal-countries" | "us-states"; id: string } | null>(null);
  const showDebugOverlay = runtimeIdentity.runtimeMode !== "production";
  const initialGeoAppliedRef = useRef(false);
  const seoCountryCode = seoCountryData?.code || null;
  const seoRouteGeoCode = String(seoCountryData?.geo_code || "").trim().toUpperCase() || null;
  const activeSeoData = useMemo(() => {
    if (!seoCountryData) return null;
    if (seoRouteGeoCode && seoCountryIndex[seoRouteGeoCode]) {
      return seoCountryIndex[seoRouteGeoCode];
    }
    return seoCountryData;
  }, [seoCountryData, seoCountryIndex, seoRouteGeoCode]);
  const popupGeoCode = selectedGeo || (activeSeoData && seoPanelOpen ? activeSeoData.geo_code : null);
  const selectedGeoEntry = useMemo(() => {
    if (!popupGeoCode) return null;
    const indexed = cardIndex[popupGeoCode];
    if (indexed) return indexed;
    if (activeSeoData && popupGeoCode === activeSeoData.geo_code) {
      return deriveCountryCardEntryFromCountryPageData(activeSeoData);
    }
    return null;
  }, [activeSeoData, cardIndex, popupGeoCode]);
  const seoMarkerEntry = useMemo(() => {
    if (!activeSeoData) return null;
    const cardEntry = cardIndex[activeSeoData.geo_code];
    return {
      code: activeSeoData.geo_code,
      name: activeSeoData.name,
      coordinates: activeSeoData.coordinates || cardEntry?.coordinates || null
    };
  }, [activeSeoData, cardIndex]);
  const selectedGeoView: ActiveGeo = useMemo(() => {
    if (!selectedGeoEntry) return null;
    return {
      country: selectedGeoEntry.displayName,
      iso2: selectedGeoEntry.iso2 || undefined,
      lat: selectedGeoEntry.coordinates?.lat,
      lng: selectedGeoEntry.coordinates?.lng
    };
  }, [selectedGeoEntry]);

  const handleSeoMarkerToggle = useCallback(() => {
    if (!seoMarkerEntry) return;
    if (selectedGeo === seoMarkerEntry.code && seoPanelOpen) {
      setSeoPanelOpen(false);
      setSelectedGeo(null);
      return;
    }
    setSelectedGeo(seoMarkerEntry.code);
    setSeoPanelOpen(true);
  }, [seoMarkerEntry, selectedGeo]);

  const handleSeoPanelClose = useCallback(() => {
    setSeoPanelOpen(false);
    setSelectedGeo(null);
  }, []);

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
    const targetZoom = String(geo?.iso2 || "").toUpperCase().startsWith("US-") ? 4.8 : 3.2;
    map.easeTo({
      center: [geo.lng, geo.lat],
      zoom: Math.max(map.getZoom(), targetZoom),
      duration: 700,
      essential: true
    });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markerEntry = seoMarkerEntry;
    if (!map || !markerEntry?.coordinates) {
      infoMarkerRef.current?.remove();
      infoMarkerRef.current = null;
      return;
    }

    const button = (infoMarkerRef.current?.getElement() as HTMLButtonElement | null) || document.createElement("button");
    button.type = "button";
    button.className = styles.infoMarker;
    button.textContent = "i";
    button.setAttribute("aria-label", `Open info for ${markerEntry.name}`);
    button.dataset.active =
      String(
        seoPanelOpen ||
          selectedGeo === markerEntry.code ||
          hoveredGeo === markerEntry.code
      );
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleSeoMarkerToggle();
    };

    if (!infoMarkerRef.current) {
      infoMarkerRef.current = new maplibregl.Marker({
        element: button,
        anchor: "bottom"
      })
        .setLngLat([markerEntry.coordinates.lng, markerEntry.coordinates.lat])
        .addTo(map);
    } else {
      infoMarkerRef.current.setLngLat([markerEntry.coordinates.lng, markerEntry.coordinates.lat]);
    }

    return () => {
      if (!mapRef.current) return;
      button.onclick = null;
    };
  }, [handleSeoMarkerToggle, hoveredGeo, selectedGeo, seoMarkerEntry, seoPanelOpen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const clearSelected = () => {
      const current = selectedFeatureStateRef.current;
      if (!current) return;
      map.setFeatureState({ source: current.source, id: current.id }, { selected: false });
      selectedFeatureStateRef.current = null;
    };

    const nextGeo = String(selectedGeo || "").trim().toUpperCase();
    if (!nextGeo) {
      clearSelected();
      return;
    }

    const nextState = {
      source: (nextGeo.startsWith("US-") ? "us-states" : "legal-countries") as "legal-countries" | "us-states",
      id: nextGeo
    };
    const current = selectedFeatureStateRef.current;
    if (current && (current.source !== nextState.source || current.id !== nextState.id)) {
      map.setFeatureState({ source: current.source, id: current.id }, { selected: false });
    }
    map.setFeatureState({ source: nextState.source, id: nextState.id }, { selected: true });
    selectedFeatureStateRef.current = nextState;

    return () => {
      const active = selectedFeatureStateRef.current;
      if (!active || active.id !== nextState.id || active.source !== nextState.source) return;
      map.setFeatureState({ source: active.source, id: active.id }, { selected: false });
      selectedFeatureStateRef.current = null;
    };
  }, [selectedGeo]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    const coords = selectedGeoEntry?.coordinates;
    if (!map || !container || typeof coords?.lng !== "number" || typeof coords?.lat !== "number") {
      setPopupAnchor(null);
      return;
    }

    const updatePopupAnchor = () => {
      const rect = container.getBoundingClientRect();
      const point = map.project([coords.lng, coords.lat]);
      setPopupAnchor({
        x: rect.left + point.x,
        y: rect.top + point.y
      });
    };

    updatePopupAnchor();
    map.on("move", updatePopupAnchor);
    map.on("resize", updatePopupAnchor);

    return () => {
      map.off("move", updatePopupAnchor);
      map.off("resize", updatePopupAnchor);
    };
  }, [selectedGeoEntry?.geo, selectedGeoEntry?.coordinates?.lat, selectedGeoEntry?.coordinates?.lng]);

  useEffect(() => {
    if (!initialGeoCode || initialGeoAppliedRef.current || !mapReady) return;
    const entry = cardIndex[initialGeoCode];
    const seoEntry = activeSeoData && activeSeoData.geo_code === initialGeoCode
      ? {
          displayName: activeSeoData.name,
          iso2: activeSeoData.geo_code,
          coordinates: activeSeoData.coordinates || undefined
        }
      : null;
    const target = entry || seoEntry;
    if (!target) return;
    initialGeoAppliedRef.current = true;
    setSelectedGeo(initialGeoCode);
    const map = mapRef.current;
    const lat = target.coordinates?.lat;
    const lng = target.coordinates?.lng;
    if (!map || typeof lat !== "number" || typeof lng !== "number") return;
    const targetZoom = String(target.iso2 || "").toUpperCase().startsWith("US-") ? 4.8 : 3.2;
    map.jumpTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), targetZoom)
    });
  }, [activeSeoData, cardIndex, initialGeoCode, mapReady]);

  useEffect(() => {
    resetFirstVisualReady();
    setVisualReady(false);
    if (hasFirstVisualReady()) {
      setVisualReady(true);
      return;
    }
    return onFirstVisualReady(() => setVisualReady(true));
  }, [countriesUrl, seoCountryIndex]);

  useEffect(() => {
    if (seoCountryData) {
      setSeoPanelOpen(true);
    }
  }, [seoCountryCode, seoCountryData, seoCountryIndex]);

  useEffect(() => {
    let cancelled = false;
    const prefetched = getNewMapPrefetchCache();
    const loadCardIndex = () =>
      fetch("/api/new-map/card-index", {
        cache: "no-store",
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
            cache: "no-store",
            credentials: "same-origin"
          }).then((response) => {
            if (!response.ok) {
              throw new Error(`countries_fetch_failed:${response.status}`);
            }
            return response.json() as Promise<LegalCountryCollection>;
          });
        const loadStyle = () =>
          fetch("/api/new-map/basemap-style?v=20260331-host-header-same-origin", {
            cache: "no-store",
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
        const runtime = createMap(containerRef.current, {
          stylePromise,
          onSelectGeo: (geo) => {
            setSelectedGeo(geo);
            if (geo && String(geo).trim().toUpperCase() === seoRouteGeoCode) {
              setSeoPanelOpen(true);
            }
            setDebugState({ selectedId: geo });
          }
        });
        mapRef.current = runtime.map;
        void countriesPromise.then((countries) => {
          if (cancelled) return;
          for (const feature of countries.features) {
            const status = feature.properties?.result?.status;
            if (!status) {
              throw new Error(`MAP_WITHOUT_STATUS: ${String(feature.properties?.geo || "UNKNOWN")}`);
            }
          }
          console.warn(
            `MAP_RENDER_STATUS sample=${countries.features
              .slice(0, 5)
              .map((feature) => `${feature.properties.geo}:${feature.properties.result.status}:${feature.properties.baseColor}:${feature.properties.hoverColor}`)
              .join(",")}`
          );
          runtime.setData(countries);
        });
        await runtime.ready;
        if (cancelled) {
          runtime.destroy();
          return;
        }
        setVisualReady(true);
        setMapReady(true);
        const { attachHoverController } = await import("./hoverController");
        const { bindAsciiMapTriggers } = await import("./ascii/ascii-triggers");
        const hover = attachHoverController(runtime.map, {
          onHoverChange: (geo) => setHoveredGeo(geo)
        });
        const unbindAsciiTriggers = bindAsciiMapTriggers(runtime.map);
        setDebugState({ mounted: true, countriesUrl, map: runtime.map, selectedId: null });
        await countriesPromise;
        if (cancelled) {
          unbindAsciiTriggers();
          hover.destroy();
          runtime.destroy();
          return;
        }
        cleanup = () => {
          unbindAsciiTriggers();
          hover.destroy();
          locationMarkerRef.current?.remove();
          locationMarkerRef.current = null;
          infoMarkerRef.current?.remove();
          infoMarkerRef.current = null;
          mapRef.current = null;
          setMapReady(false);
          setVisualReady(false);
          runtime.destroy();
          setSelectedGeo(null);
          setHoveredGeo(null);
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
  }, [countriesUrl, seoCountryIndex, seoRouteGeoCode]);

  return (
    <section
      className={styles.root}
      data-testid="new-map-root"
      style={{ ["--new-map-water-color" as string]: NEW_MAP_WATER_COLOR }}
    >
      <div
        data-testid="runtime-stamp"
        data-build-id={runtimeIdentity.buildId}
        data-commit={runtimeIdentity.commit}
        data-built-at={runtimeIdentity.builtAt}
        data-dataset-hash={runtimeIdentity.datasetHash}
        data-final-snapshot-id={runtimeIdentity.finalSnapshotId}
        data-snapshot-built-at={runtimeIdentity.snapshotBuiltAt}
        data-runtime-mode={runtimeIdentity.runtimeMode}
        data-map-renderer={runtimeIdentity.mapRenderer}
        data-map-runtime={runtimeIdentity.mapRuntime}
        data-expected-origin={runtimeIdentity.expectedOrigin}
        data-dev-server-pid={runtimeIdentity.devServerPid}
        data-session-marker={runtimeIdentity.sessionMarker}
        hidden
      />
      {showDebugOverlay ? (
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
            <div className={styles.runtime} data-testid="visible-runtime-stamp">{visibleStamp}</div>
            <div className={styles.meta}>ROUTE=/new-map · OWNER=feature-state · WORLDCOPIES=ON</div>
          </div>
        </div>
      ) : null}
      {selectedGeoEntry && popupAnchor ? (
        <ViewportCountryPopup entry={selectedGeoEntry} anchor={popupAnchor} onClose={handleSeoPanelClose} />
      ) : null}
      <div
        ref={containerRef}
        className={`${styles.mapSurface} ${visualReady ? styles.mapSurfaceReady : ""}`.trim()}
        data-testid="new-map-surface"
        data-map-ready={mapReady ? "1" : "0"}
      />
      <AsciiOverlay />
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

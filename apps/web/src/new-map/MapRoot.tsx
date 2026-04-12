"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { createMap } from "./createMap";
import type { CountryCardEntry, LegalCountryCollection } from "./map.types";
import styles from "./MapRoot.module.css";
import { NEW_MAP_WATER_COLOR } from "./mapPalette";
import { hasFirstVisualReady, onFirstVisualReady, resetFirstVisualReady } from "./startupTrace";
import AsciiOverlay from "./ascii/AsciiOverlay";
import { formatDistributionDetail, formatFlags, formatMedicalDetail, formatRecreationalDetail } from "./statusPresentation";

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCountryPopup(entry: CountryCardEntry) {
  const flags = formatFlags(entry.statusFlags);
  return [
    `<div class="${styles.countryPopup}" data-testid="new-map-country-popup">`,
    `<div class="${styles.countryPopupTitle}">${escapeHtml(entry.displayName)}</div>`,
    `<div class="${styles.countryPopupMeta}">ISO2: ${escapeHtml(entry.iso2 || "Unknown")}</div>`,
    `<div class="${styles.countryPopupMeta}">${escapeHtml(entry.normalizedStatusSummary)}</div>`,
    `<div class="${styles.countryPopupMeta}">Recreational: ${escapeHtml(formatRecreationalDetail(entry))}</div>`,
    `<div class="${styles.countryPopupMeta}">Medical: ${escapeHtml(formatMedicalDetail(entry))}</div>`,
    `<div class="${styles.countryPopupMeta}">Distribution: ${escapeHtml(formatDistributionDetail(entry))}</div>`,
    (entry.distributionFlags.length
      ? `<div class="${styles.countryPopupMeta}">Distribution flags: ${escapeHtml(formatFlags(entry.distributionFlags))}</div>`
      : ""),
    (flags ? `<div class="${styles.countryPopupMeta}">Flags: ${escapeHtml(flags)}</div>` : ""),
    `<div class="${styles.countryPopupNotes}">${escapeHtml(entry.notes || "No notes available.")}</div>`,
    "</div>"
  ].join("");
}

function formatCountryPageLegalModel(data: CountryPageData) {
  return [
    `Recreational: ${data.legal_model.recreational.status.toLowerCase().replaceAll("_", " ")}`,
    `enforcement ${data.legal_model.recreational.enforcement.toLowerCase()}`,
    `scope ${data.legal_model.recreational.scope.toLowerCase().replaceAll("_", " ")}.`
  ].join(", ");
}

function formatCountryPageMedicalModel(data: CountryPageData) {
  return [
    `Medical: ${data.legal_model.medical.status.toLowerCase().replaceAll("_", " ")}`,
    `enforcement ${data.legal_model.medical.enforcement.toLowerCase()}`,
    `scope ${data.legal_model.medical.scope.toLowerCase().replaceAll("_", " ")}.`
  ].join(", ");
}

function formatSeoPanelEyebrow(data: CountryPageData) {
  return data.node_type === "state" ? "State View" : "Country View";
}

function formatSeoPanelTitle(data: CountryPageData) {
  return data.node_type === "state"
    ? `Is cannabis legal in ${data.name}?`
    : `Is cannabis legal in ${data.name}?`;
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
  const cardIndexRef = useRef<Record<string, CountryCardEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [visualReady, setVisualReady] = useState(false);
  const [selectedGeo, setSelectedGeo] = useState<SelectedGeo>(
    initialGeoCode ? String(initialGeoCode).trim().toUpperCase() : null
  );
  const [hoveredGeo, setHoveredGeo] = useState<SelectedGeo>(null);
  const [seoPanelOpen, setSeoPanelOpen] = useState(Boolean(initialGeoCode));
  const [cardIndex, setCardIndex] = useState<Record<string, CountryCardEntry>>({});
  const selectedFeatureStateRef = useRef<{ source: "legal-countries" | "us-states"; id: string } | null>(null);
  const selectedGeoEntry = selectedGeo ? cardIndex[selectedGeo] ?? null : null;
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
    setSelectedGeo(seoMarkerEntry.code);
    setSeoPanelOpen((current) => {
      if (selectedGeo === seoMarkerEntry.code) return !current;
      return true;
    });
  }, [seoMarkerEntry, selectedGeo]);

  const handleSeoPanelClose = useCallback(() => {
    setSeoPanelOpen(false);
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
    cardIndexRef.current = cardIndex;
  }, [cardIndex]);

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
          getCountryPopupHtml: (geo) => {
            const entry = cardIndexRef.current[geo];
            return entry ? renderCountryPopup(entry) : null;
          },
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
      {activeSeoData && seoPanelOpen ? (
        <aside className={styles.seoOverlayPanel} data-testid="new-map-seo-overlay">
          <div className={styles.seoPanelHeader}>
            <div>
              <div className={styles.eyebrow}>{formatSeoPanelEyebrow(activeSeoData)}</div>
              <h1 className={styles.seoPanelTitle}>{formatSeoPanelTitle(activeSeoData)}</h1>
            </div>
            <button type="button" className={styles.seoPanelClose} onClick={handleSeoPanelClose} aria-label="Close country info">
              ×
            </button>
          </div>
          <p className={styles.seoPanelIntro}>{activeSeoData.notes_normalized}</p>

          <section className={styles.seoPanelSection}>
            <h2>{activeSeoData.node_type === "state" ? "Legal status in state" : "Legal status"}</h2>
            <p>{formatCountryPageLegalModel(activeSeoData)}</p>
          </section>

          {activeSeoData.node_type === "state" && activeSeoData.state_modifiers?.federal_conflict ? (
            <section className={styles.seoPanelSection}>
              <h2>Federal vs state conflict</h2>
              <p>{activeSeoData.state_modifiers.federal_conflict}</p>
            </section>
          ) : null}

          <section className={styles.seoPanelSection}>
            <h2>Medical cannabis</h2>
            <p>{formatCountryPageMedicalModel(activeSeoData)}</p>
          </section>

          <section className={styles.seoPanelSection}>
            <h2>Personal use</h2>
            <ul className={styles.seoPanelList}>
              <li>Possession: {activeSeoData.facts.possession_limit || "No stable possession limit found in normalized notes."}</li>
              <li>Cultivation: {activeSeoData.facts.cultivation || "No stable cultivation rule found in normalized notes."}</li>
              <li>Penalty: {activeSeoData.facts.penalty || "No stable penalty rule found in normalized notes."}</li>
            </ul>
          </section>

          <section className={styles.seoPanelSection}>
            <h2>{activeSeoData.node_type === "state" ? "Related places" : "Related countries"}</h2>
            {activeSeoData.graph.federal_parent ? (
              <>
                <h3 className={styles.seoPanelSubheading}>Federal parent</h3>
                <ul className={styles.seoPanelList}>
                  <li>
                    <Link href={`/c/${activeSeoData.graph.federal_parent.code}`}>
                      Cannabis laws in {activeSeoData.graph.federal_parent.name}
                    </Link>
                  </li>
                </ul>
              </>
            ) : null}
            {activeSeoData.graph.same_country_states.length > 0 ? (
              <>
                <h3 className={styles.seoPanelSubheading}>Other U.S. states</h3>
                <ul className={styles.seoPanelList}>
                  {activeSeoData.graph.same_country_states.map((item) => (
                    <li key={`state-${item.code}`}>
                      <Link href={`/c/${item.code}`}>Cannabis laws in {item.name}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {activeSeoData.graph.geo_neighbors.length > 0 ? (
              <>
                <h3 className={styles.seoPanelSubheading}>Geo neighbors</h3>
                <ul className={styles.seoPanelList}>
                  {activeSeoData.graph.geo_neighbors.map((item) => (
                    <li key={`geo-${item.code}`}>
                      <Link href={`/c/${item.code}`}>Cannabis laws in {item.name}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {activeSeoData.graph.legal_similarity.length > 0 ? (
              <>
                <h3 className={styles.seoPanelSubheading}>Similar laws</h3>
                <ul className={styles.seoPanelList}>
                  {activeSeoData.graph.legal_similarity.map((item) => (
                    <li key={`legal-${item.code}`}>
                      <Link href={`/c/${item.code}`}>Cannabis laws in {item.name}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {activeSeoData.graph.cluster_links.length > 0 ? (
              <>
                <h3 className={styles.seoPanelSubheading}>Same region cluster</h3>
                <ul className={styles.seoPanelList}>
                  {activeSeoData.graph.cluster_links.map((item) => (
                    <li key={`cluster-${item.code}`}>
                      <Link href={`/c/${item.code}`}>Cannabis laws in {item.name}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          {activeSeoData.sources.citations.length > 0 ? (
            <section className={styles.seoPanelSection}>
              <h2>Sources of truth</h2>
              <ul className={styles.seoPanelList}>
                {activeSeoData.sources.citations.map((source) => (
                  <li key={source.id}>
                    <a href={source.url} rel="nofollow noopener noreferrer" target="_blank">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
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

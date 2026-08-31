"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import { createMap, NEW_MAP_SOURCE_ID, NEW_MAP_US_STATES_SOURCE_ID } from "@/new-map/createMap";
import ViewportCountryPopup from "@/new-map/components/ViewportCountryPopup";
import UnifiedSeoStatusPanel from "@/new-map/components/UnifiedSeoStatusPanel";
import AsciiOverlay from "@/new-map/ascii/AsciiOverlay";
import { attachHoverController } from "@/new-map/hoverController";
import type { CountryCardEntry, LegalCountryCollection, NewMapBootResult } from "@/new-map/map.types";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { NEW_MAP_BASEMAP_STYLE_URL } from "@/new-map/runtimeUrls";
import {
  readVisualViewportKeyboardOffset,
  readVisualViewportSnapshot,
  subscribeToVisualViewportChanges,
} from "@/new-map/viewportMetrics";
import styles from "@/new-map/MapRoot.module.css";
import truthStyles from "./TruthMapRoot.module.css";
import {
  STORE_COUNTRY_SUMMARY_LAYER_ID,
  STORE_GEO_SUMMARY_LAYER_ID,
  STORE_CLUSTER_LAYER_ID,
  STORE_MARKER_HITBOX_LAYER_ID,
  STORE_MARKER_LAYER_ID,
  PUBLIC_STORE_MAP_LAYER_ENDPOINTS,
  useStoreMapLayer
} from "@/new-map/stores/StoreLayer";
import type { TruthMapCollection, TruthMapDatasetMeta, TruthMapFeatureProperties } from "./truthMapSource";
import { projectTruthMapRichCard, TRUTH_MAP_CONTEXT_LABELS, TRUTH_MAP_PROFILE_SECTION_LABELS } from "./truthMapRichCard";

type Props = {
  countriesUrl: string;
  usStatesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  initialMapView?: { lat: number; lng: number; zoom: number } | null;
  initialGeoCode?: string | null;
  presentation?: "audit" | "public";
  showPublicMapNotice?: boolean;
  interactiveOverlayLayerIds?: readonly string[];
  auditMapLayer?: ReactNode;
  auditDock?: ReactNode;
  auditPanel?: ReactNode;
  publicLocalDock?: ReactNode;
};

const NO_INTERACTIVE_OVERLAY_LAYERS: readonly string[] = [];

type TruthMapQaController = {
  jumpTo: (_lng: number, _lat: number, _zoom: number) => Promise<void>;
  openGeo: (_geo: string) => Promise<boolean>;
  getCamera: () => { lng: number; lat: number; zoom: number };
  getStoreVisibilityLevel: () => string | undefined;
  getStoreGeoSummaryCount: () => string | undefined;
  getStoreCountrySummaryCount: () => string | undefined;
  getSocialVisibilityLevel: () => string | undefined;
};

type TruthMapWindow = Window & typeof globalThis & {
  __TRUTH_MAP_DEBUG__?: { map: maplibregl.Map };
  __TRUTH_MAP_QA__?: TruthMapQaController;
};

export type ActiveGeo = {
  country: string;
  iso2?: string;
  lat?: number;
  lng?: number;
} | null;

export type TruthMapAuditState = {
  map: maplibregl.Map | null;
  mapReady: boolean;
  cardIndex: Record<string, CountryCardEntry>;
  selectedGeo: ActiveGeo;
  clearSelectedGeo: () => void;
  applyGeoToMap: (_geo: ActiveGeo, _options?: { recenter?: boolean }) => void;
};

const TruthMapAuditContext = createContext<TruthMapAuditState | null>(null);

export function useTruthMapAuditContext() {
  const context = useContext(TruthMapAuditContext);
  if (!context) throw new Error("TRUTH_MAP_AUDIT_CONTEXT_REQUIRED");
  return context;
}

type TruthMapPopupSelection = {
  properties: TruthMapFeatureProperties;
  lngLat: { lng: number; lat: number };
};

async function fetchTruthMapCollection(url: string): Promise<TruthMapCollection> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`truth_map_dataset_fetch:${response.status}`);
  return response.json() as Promise<TruthMapCollection>;
}

function parseLegalEvidenceCitations(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]")) as Array<Record<string, unknown>>;
    return Array.isArray(parsed)
      ? parsed
        .map((citation) => ({
          title: String(citation.title || "Official legal source"),
          url: String(citation.url || ""),
          publisher: String(citation.publisher || ""),
          annotation: String(citation.annotation || ""),
          quote: String(citation.quote || "")
        }))
        .filter((citation) => Boolean(citation.url))
      : [];
  } catch {
    return [];
  }
}

function TruthMapLegalEvidence({ properties, auditOnly }: { properties: TruthMapFeatureProperties; auditOnly: boolean }) {
  const citations = parseLegalEvidenceCitations(properties.legalEvidenceCitationsJson);
  const displayDirection = properties.displayIsResearchDirection
    ? properties.truthMapDisplayColor === "GRAY"
      ? <><div data-testid="truth-map-research-direction">Map display: GRAY — polar scope exception.</div><div>Display basis: {properties.displayColorBasis}</div><div>This map display is not a final legal conclusion.</div></>
      : <><div data-testid="truth-map-research-direction">Map display: research direction {properties.truthMapDisplayColor} — not a final legal conclusion.</div><div>Display basis: {properties.displayColorBasis}</div></>
    : <div>Map display: legal verdict {properties.truthMapDisplayColor}.</div>;
  return (
    <section className="truth-map-legal-evidence" data-testid="truth-map-legal-evidence" data-legal-evidence-status={properties.legalEvidenceStatus}>
      <div className="truth-map-current-legal-title">Current legal conclusion: {properties.legalTruthColor} · {properties.truthConfidence}</div>
      <div className="truth-map-legal-evidence-heading">
        <span className="truth-map-legal-evidence-icon" aria-hidden="true">{properties.legalEvidenceIcon}</span>
        <div>
          <strong>{properties.legalEvidenceLabel}</strong>
          <div className="truth-map-legal-evidence-summary">{properties.legalEvidenceSummary}</div>
        </div>
      </div>
      <div className="truth-map-display-direction">{displayDirection}</div>
      {citations.length ? (
        <ol className="truth-map-legal-citations">
          {citations.map((citation) => (
            <li key={`${citation.url}-${citation.title}`}>
              <a href={citation.url} target="_blank" rel="nofollow noopener noreferrer">{citation.title}</a>
              <div className="truth-map-legal-annotation">{[citation.publisher, citation.annotation].filter(Boolean).join(" · ")}</div>
              {citation.quote ? <blockquote>{citation.quote}</blockquote> : null}
            </li>
          ))}
        </ol>
      ) : <p className="truth-map-legal-annotation">No official link is retained for this record.</p>}
      <details className="truth-map-popup-details">
        <summary>Current reconciliation rationale</summary>
        <div>Rule: {properties.truthRuleId}</div>
        <div>{properties.truthReason}</div>
        <div>Apply state: {properties.applyState}</div>
      </details>
      <small>{auditOnly ? "Audit preview only — not applied to SSOT, production map, SEO, or deployment." : "Legal conclusion and the retained official evidence are shown above."}</small>
    </section>
  );
}

function popupAnchorFor(map: maplibregl.Map, lngLat: { lng: number; lat: number }) {
  const point = map.project([lngLat.lng, lngLat.lat]);
  const rect = map.getCanvas().getBoundingClientRect();
  return { x: rect.left + point.x, y: rect.top + point.y };
}

function metaSummary(meta: TruthMapDatasetMeta | null) {
  if (!meta) return "Loading final reconciliation…";
  const colors = meta.colors;
  const display = meta.displayColors;
  return `Legal 307-GEO: GREEN ${colors.GREEN} · YELLOW ${colors.YELLOW} · RED ${colors.RED} · UNKNOWN ${colors.UNKNOWN}. Display: GREEN ${display.GREEN} · YELLOW ${display.YELLOW} · RED ${display.RED} · GRAY ${display.GRAY} · unpainted ${meta.displayUncoloredGeos.length}. Geometry ${meta.rowsWithGeometry}/${meta.rowsTotal}.`;
}

function parseSeoCodeFromHref(href: string) {
  if (!href) return null;
  try {
    const url = new URL(href, typeof window !== "undefined" ? window.location.origin : "https://www.islegal.info");
    const match = url.pathname.match(/^\/c\/([^/?#]+)$/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function resolveEntryDetailsCode(entry: CountryCardEntry) {
  const sources = [entry.pageHref, entry.detailsHref].filter(Boolean) as string[];
  for (const href of sources) {
    const code = parseSeoCodeFromHref(href);
    if (code) return code;
  }
  return entry.parentCountry?.code ? String(entry.parentCountry.code).trim().toLowerCase() : null;
}

export default function TruthMapRoot({ countriesUrl, usStatesUrl, visibleStamp, runtimeIdentity, initialMapView = null, initialGeoCode = null, presentation = "audit", showPublicMapNotice = false, interactiveOverlayLayerIds = NO_INTERACTIVE_OVERLAY_LAYERS, auditMapLayer, auditDock, auditPanel, publicLocalDock }: Props) {
  const publicPresentation = presentation === "public";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const runtimeRef = useRef<NewMapBootResult | null>(null);
  const locationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const seoInfoMarkerRef = useRef<maplibregl.Marker | null>(null);
  const cardEntryRequestsRef = useRef<Record<string, Promise<CountryCardEntry | null>>>({});
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [visibleViewportHeight, setVisibleViewportHeight] = useState<number | null>(null);
  const [dockHeight, setDockHeight] = useState(72);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<TruthMapDatasetMeta | null>(null);
  const [selectedGeo, setSelectedGeo] = useState<ActiveGeo>(null);
  const [selectedPopup, setSelectedPopup] = useState<TruthMapPopupSelection | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
  const [cardIndex, setCardIndex] = useState<Record<string, CountryCardEntry>>({});
  const [activeSeoData, setActiveSeoData] = useState<CountryPageData | null>(null);
  const [activeSeoSelection, setActiveSeoSelection] = useState<TruthMapPopupSelection | null>(null);
  const [seoPanelOpen, setSeoPanelOpen] = useState(false);
  const [storesEnabled, setStoresEnabled] = useState(true);
  const initialMapViewRef = useRef(initialMapView);
  const initialGeoCodeRef = useRef(initialGeoCode);

  useStoreMapLayer(mapInstance, mapReady, storesEnabled, publicPresentation ? PUBLIC_STORE_MAP_LAYER_ENDPOINTS : undefined);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.newMapRoute = "1";
    return () => {
      if (document.body.dataset.newMapRoute === "1") delete document.body.dataset.newMapRoute;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewportMetrics = () => {
      setKeyboardOffset(readVisualViewportKeyboardOffset());
      const snapshot = readVisualViewportSnapshot();
      setVisibleViewportHeight(Math.round(snapshot.height || window.innerHeight));
    };
    syncViewportMetrics();
    return subscribeToVisualViewportChanges(syncViewportMetrics);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    let frameId = 0;
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => scheduleMeasure()) : null;

    const measure = () => {
      const dockNode = document.querySelector('[data-testid="new-map-ai-dock"]') as HTMLElement | null;
      resizeObserver?.disconnect();
      if (dockNode) resizeObserver?.observe(dockNode);
      const nextHeight = dockNode ? Math.max(72, Math.ceil(dockNode.getBoundingClientRect().height)) : 72;
      setDockHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    const mutationObserver = typeof MutationObserver === "function" ? new MutationObserver(scheduleMeasure) : null;
    mutationObserver?.observe(document.body, { childList: true, subtree: true });
    scheduleMeasure();

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const clearSelectedGeo = useCallback(() => {
    setSelectedPopup(null);
    setPopupAnchor(null);
    setSelectedGeo(null);
  }, []);

  const openTruthPopup = useCallback((properties: TruthMapFeatureProperties, lngLat: { lng: number; lat: number }) => {
    const map = mapRef.current;
    if (!map) return;
    setSelectedGeo({
      country: properties.displayName || properties.geo,
      iso2: properties.geo,
      lat: lngLat.lat,
      lng: lngLat.lng,
    });
    setSelectedPopup({ properties, lngLat });
    setPopupAnchor(popupAnchorFor(map, lngLat));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/new-map/card-index", { credentials: "same-origin" })
      .then(async (response) => response.ok ? response.json() as Promise<Record<string, CountryCardEntry>> : null)
      .then((nextIndex) => {
        if (!cancelled && nextIndex) setCardIndex(nextIndex);
      })
      .catch(() => {
        // A clicked card below still retries its one territory entry. Map data remains usable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const geo = selectedPopup?.properties.geo;
    if (!geo || cardIndex[geo]) return;
    const existingRequest = cardEntryRequestsRef.current[geo];
    const request = existingRequest || fetch(`/api/new-map/card-entry?geo=${encodeURIComponent(geo)}`, { credentials: "same-origin" })
      .then(async (response) => response.ok ? response.json() as Promise<CountryCardEntry> : null)
      .catch(() => null);
    cardEntryRequestsRef.current[geo] = request;
    let cancelled = false;
    void request.then((entry) => {
      if (!cancelled && entry) {
        setCardIndex((current) => current[geo] ? current : { ...current, [geo]: entry });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cardIndex, selectedPopup]);

  useEffect(() => {
    if (!selectedPopup || !mapInstance) return;
    const updateAnchor = () => setPopupAnchor(popupAnchorFor(mapInstance, selectedPopup.lngLat));
    updateAnchor();
    mapInstance.on("move", updateAnchor);
    mapInstance.on("resize", updateAnchor);
    return () => {
      mapInstance.off("move", updateAnchor);
      mapInstance.off("resize", updateAnchor);
    };
  }, [mapInstance, selectedPopup]);

  const selectedRichEntry = useMemo(() => {
    if (!selectedPopup) return null;
    const entry = cardIndex[selectedPopup.properties.geo];
    return entry ? projectTruthMapRichCard(entry, selectedPopup.properties) : null;
  }, [cardIndex, selectedPopup]);

  const activeSeoEntry = useMemo(() => {
    if (!activeSeoSelection) return null;
    const seoGeo = activeSeoSelection.properties.geo;
    const sourceEntry = cardIndex[seoGeo]
      || (selectedRichEntry?.geo === seoGeo ? selectedRichEntry : null);
    return sourceEntry ? projectTruthMapRichCard(sourceEntry, activeSeoSelection.properties) : null;
  }, [activeSeoSelection, cardIndex, selectedRichEntry]);

  const showSeoOverlay = Boolean(seoPanelOpen && activeSeoSelection && activeSeoEntry);

  const loadSeoCountryData = useCallback(async (code: string) => {
    const normalizedCode = String(code || "").trim().toLowerCase();
    if (!normalizedCode) return null;
    const response = await fetch(`/api/new-map/country-page?code=${encodeURIComponent(normalizedCode)}`, {
      cache: "no-store",
      credentials: "same-origin"
    });
    return response.ok ? response.json() as Promise<CountryPageData> : null;
  }, []);

  const handleOpenDetails = useCallback(async (entry: CountryCardEntry) => {
    const selection = selectedPopup;
    if (!selection) return;
    const code = resolveEntryDetailsCode(entry);
    if (!code) return;
    const targetHref = `/c/${code}`;
    if (typeof window !== "undefined" && window.location.pathname !== targetHref) {
      window.history.pushState({ seoCode: code }, "", targetHref);
    }
    // The map feature is the canonical current legal record.  country-page is
    // deliberately loaded only as supporting SEO navigation data below, never
    // as the source of a legal category, colour or conclusion.
    setActiveSeoData(null);
    setActiveSeoSelection(selection);
    setSeoPanelOpen(true);
    const map = mapRef.current;
    if (map) {
      map.easeTo({
        center: [selection.lngLat.lng, selection.lngLat.lat],
        // The selected country is centred in the shared unobscured map column:
        // it sits between the optional local notice on the left and SEO panel
        // on the right, so the persistent info marker remains usable on both
        // public shells.
        duration: 420,
        essential: true
      });
    }
    const data = await loadSeoCountryData(code);
    if (data) setActiveSeoData(data);
  }, [loadSeoCountryData, selectedPopup]);

  const handleSeoPanelClose = useCallback(() => {
    setSeoPanelOpen(false);
    setActiveSeoData(null);
    setActiveSeoSelection(null);
  }, []);

  const handleSeoMarkerToggle = useCallback(() => {
    if (!activeSeoSelection) return;
    if (seoPanelOpen) {
      handleSeoPanelClose();
      return;
    }
    setSelectedGeo({
      country: activeSeoSelection.properties.displayName || activeSeoSelection.properties.geo,
      iso2: activeSeoSelection.properties.geo,
      lat: activeSeoSelection.lngLat.lat,
      lng: activeSeoSelection.lngLat.lng,
    });
    setSelectedPopup(activeSeoSelection);
    const map = mapRef.current;
    if (map) setPopupAnchor(popupAnchorFor(map, activeSeoSelection.lngLat));
    setSeoPanelOpen(true);
  }, [activeSeoSelection, handleSeoPanelClose, seoPanelOpen]);

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
    markerElement.setAttribute("role", "img");
    markerElement.setAttribute("aria-label", "Where I am");
    markerElement.setAttribute("title", "Where I am");
    markerElement.setAttribute("data-user-marker", "1");
    markerElement.setAttribute("data-user-marker-label", "Where I am");
    markerElement.setAttribute("data-user-marker-position", `${geo.lng},${geo.lat}`);

    if (!locationMarkerRef.current) {
      locationMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: "bottom" })
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

  useEffect(() => {
    const map = mapRef.current;
    const selection = activeSeoSelection;
    if (!mapReady || !map || !selection) {
      seoInfoMarkerRef.current?.remove();
      seoInfoMarkerRef.current = null;
      return;
    }

    const button = (seoInfoMarkerRef.current?.getElement() as HTMLButtonElement | null) || document.createElement("button");
    button.type = "button";
    button.className = styles.infoMarker;
    button.textContent = "i";
    button.setAttribute("aria-label", `Open info for ${selection.properties.displayName || selection.properties.geo}`);
    button.setAttribute("data-seo-marker", "1");
    button.setAttribute("data-seo-marker-geo", selection.properties.geo);
    button.dataset.active = String(seoPanelOpen);
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleSeoMarkerToggle();
    };

    if (!seoInfoMarkerRef.current) {
      seoInfoMarkerRef.current = new maplibregl.Marker({ element: button, anchor: "bottom" })
        .setLngLat([selection.lngLat.lng, selection.lngLat.lat])
        .addTo(map);
    } else {
      seoInfoMarkerRef.current.setLngLat([selection.lngLat.lng, selection.lngLat.lat]);
    }

    return () => {
      button.onclick = null;
    };
  }, [activeSeoSelection, handleSeoMarkerToggle, mapReady, seoPanelOpen]);

  const auditContext = useMemo<TruthMapAuditState>(() => ({
    map: mapInstance,
    mapReady,
    cardIndex,
    selectedGeo,
    clearSelectedGeo,
    applyGeoToMap,
  }), [applyGeoToMap, cardIndex, clearSelectedGeo, mapInstance, mapReady, selectedGeo]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    const runtime = createMap(container, {
      style: NEW_MAP_BASEMAP_STYLE_URL,
      usStatesUrl,
      shouldSelectFeature: (point) => {
        const map = mapRef.current;
        if (!map) return true;
        const mountedOverlayLayers = [
          STORE_MARKER_LAYER_ID,
          STORE_CLUSTER_LAYER_ID,
          STORE_MARKER_HITBOX_LAYER_ID,
          STORE_GEO_SUMMARY_LAYER_ID,
          STORE_COUNTRY_SUMMARY_LAYER_ID,
          ...(!publicPresentation ? interactiveOverlayLayerIds : []),
        ].filter((layerId) => Boolean(map.getLayer(layerId)));
        if (mountedOverlayLayers.length === 0) return true;
        try {
          return map.queryRenderedFeatures([point.x, point.y], { layers: mountedOverlayLayers }).length === 0;
        } catch {
          // A style reload may remove an overlay between getLayer and the query. Country selection stays usable.
          return true;
        }
      },
      onSelectFeature: (feature, lngLat) => {
        const map = mapRef.current;
        if (!map) return;
        const properties = feature.properties as unknown as TruthMapFeatureProperties | undefined;
        if (!properties?.geo || properties.truthDataset !== "FINAL_307_RECONCILIATION") return;
        openTruthPopup(properties, lngLat);
      }
    });
    runtime.map.setMaxZoom(15);
    runtimeRef.current = runtime;
    mapRef.current = runtime.map;
    setMapInstance(runtime.map);
    const host = window as TruthMapWindow;
    if (!publicPresentation) host.__TRUTH_MAP_DEBUG__ = { map: runtime.map };

    let asciiCleanup: (() => void) | null = null;
    const load = async () => {
      let hover: ReturnType<typeof attachHoverController> | null = null;
      try {
        const [countries, usStates] = await Promise.all([
          fetchTruthMapCollection(countriesUrl),
          fetchTruthMapCollection(usStatesUrl),
        ]);
        if (disposed) return;
        // The basemap phase has installed the shared feature layers. Attach the
        // same controller as /new-map before waiting for all reconciliation data,
        // so the pointer feedback is never contingent on a delayed idle event.
        await runtime.basemapReady;
        if (disposed) return;
        hover = attachHoverController(runtime.map, {
          onHoverChange: (geo) => {
            runtime.map.getCanvas().dataset.truthMapHoveredGeo = geo || "";
          }
        });
        // Reuse the established map-trigger binding for both shells.  The
        // canvas itself is visual-only; this keeps the local audit preview's
        // Antarctica animation in the same state as the public display map.
        const { bindAsciiMapTriggers } = await import("@/new-map/ascii/ascii-triggers");
        if (disposed) {
          hover.destroy();
          return null;
        }
        asciiCleanup = bindAsciiMapTriggers(runtime.map);
        runtime.setData(countries as LegalCountryCollection);
        setMeta(countries.meta || null);
        await runtime.ready;
        if (disposed) return;
        const initialView = initialMapViewRef.current;
        if (initialView) {
          runtime.map.jumpTo({ center: [initialView.lng, initialView.lat], zoom: initialView.zoom, pitch: 0, bearing: 0 });
        } else {
          const normalizedGeo = String(initialGeoCodeRef.current || "").trim().toUpperCase();
          const initialFeature = normalizedGeo
            ? [...countries.features, ...usStates.features].find((feature) => String(feature.properties?.geo || "").toUpperCase() === normalizedGeo)
            : null;
          const initialProperties = initialFeature?.properties as TruthMapFeatureProperties | undefined;
          const lng = Number(initialProperties?.labelAnchorLng);
          const lat = Number(initialProperties?.labelAnchorLat);
          if (initialProperties?.truthDataset === "FINAL_307_RECONCILIATION" && Number.isFinite(lng) && Number.isFinite(lat)) {
            runtime.map.jumpTo({ center: [lng, lat], zoom: 3.2, pitch: 0, bearing: 0 });
            openTruthPopup(initialProperties, { lng, lat });
          }
        }
        setMapReady(true);
        if (!publicPresentation && new URLSearchParams(window.location.search).get("qa") === "1") host.__TRUTH_MAP_QA__ = {
          jumpTo: (lng, lat, zoom) => new Promise<void>((resolve) => {
            let complete = false;
            const finish = () => {
              if (complete) return;
              complete = true;
              runtime.map.off("idle", finish);
              resolve();
            };
            runtime.map.once("idle", finish);
            runtime.map.jumpTo({ center: [lng, lat], zoom, pitch: 0, bearing: 0 });
            window.setTimeout(finish, 1200);
          }),
          openGeo: async (geo) => {
            const normalizedGeo = String(geo || "").trim().toUpperCase();
            if (!normalizedGeo) return false;
            const getFeature = () => {
              const loadedFeature = [NEW_MAP_SOURCE_ID, NEW_MAP_US_STATES_SOURCE_ID]
                .flatMap((sourceId) => runtime.map.querySourceFeatures(sourceId))
                .find((feature) => String(feature.properties?.geo || "").toUpperCase() === normalizedGeo);
              // MapLibre only exposes source features for tiles already loaded in the
              // viewport. The fetched, route-local reconciliation collection remains
              // the canonical audit lookup for small territories outside those tiles.
              return loadedFeature
                || countries.features.find((candidate) => String(candidate.properties?.geo || "").toUpperCase() === normalizedGeo)
                || usStates.features.find((candidate) => String(candidate.properties?.geo || "").toUpperCase() === normalizedGeo);
            };
            let feature = getFeature();
            if (!feature && normalizedGeo.startsWith("US-")) {
              await new Promise<void>((resolve) => {
                runtime.map.once("idle", resolve);
                runtime.map.jumpTo({ center: [-98.5, 39.8], zoom: 4.6, pitch: 0, bearing: 0 });
                window.setTimeout(resolve, 1200);
              });
              feature = getFeature();
            }
            const properties = feature?.properties as TruthMapFeatureProperties | undefined;
            const lng = Number(properties?.labelAnchorLng);
            const lat = Number(properties?.labelAnchorLat);
            if (!properties || properties.truthDataset !== "FINAL_307_RECONCILIATION" || !Number.isFinite(lng) || !Number.isFinite(lat)) return false;
            runtime.map.jumpTo({ center: [lng, lat], zoom: Math.max(runtime.map.getZoom(), 3.2), pitch: 0, bearing: 0 });
            openTruthPopup(properties, { lng, lat });
            return true;
          },
          getCamera: () => {
            const center = runtime.map.getCenter();
            return { lng: center.lng, lat: center.lat, zoom: runtime.map.getZoom() };
          },
          getStoreVisibilityLevel: () => runtime.map.getCanvas().dataset.storeVisibilityLevel,
          getStoreGeoSummaryCount: () => runtime.map.getCanvas().dataset.storeGeoSummaryCount,
          getStoreCountrySummaryCount: () => runtime.map.getCanvas().dataset.storeCountrySummaryCount,
          getSocialVisibilityLevel: () => runtime.map.getCanvas().dataset.socialVisibilityLevel,
        };
        if (disposed) {
          asciiCleanup?.();
          hover.destroy();
          return null;
        }
        return hover;
      } catch (loadError) {
        asciiCleanup?.();
        hover?.destroy();
        if (!disposed) setError(loadError instanceof Error ? loadError.message : "truth_map_dataset_fetch_failed");
      }
    };
    let hoverCleanup: (() => void) | null = null;
    void load().then((hover) => {
      hoverCleanup = hover ? () => {
        asciiCleanup?.();
        hover.destroy();
      } : null;
      if (disposed) hoverCleanup?.();
    });

    return () => {
      disposed = true;
      hoverCleanup?.();
      if (!hoverCleanup) asciiCleanup?.();
      locationMarkerRef.current?.remove();
      locationMarkerRef.current = null;
      seoInfoMarkerRef.current?.remove();
      seoInfoMarkerRef.current = null;
      if (!publicPresentation && host.__TRUTH_MAP_DEBUG__?.map === runtime.map) delete host.__TRUTH_MAP_DEBUG__;
      if (!publicPresentation && host.__TRUTH_MAP_QA__) delete host.__TRUTH_MAP_QA__;
      setMapReady(false);
      setMapInstance(null);
      mapRef.current = null;
      runtimeRef.current = null;
      runtime.destroy();
    };
  }, [countriesUrl, interactiveOverlayLayerIds, publicPresentation, usStatesUrl, openTruthPopup]);

  return (
    <TruthMapAuditContext.Provider value={auditContext}>
      <main
      className={`${styles.root} ${truthStyles.root}`}
      data-testid={publicPresentation ? "public-map-root" : "truth-map-root"}
      data-truth-map-source="FINAL_307_RECONCILIATION"
      data-store-layer-enabled={String(storesEnabled)}
      data-keyboard-open={keyboardOffset > 24 ? "1" : "0"}
      data-keyboard-offset={keyboardOffset}
      style={{
        ["--new-map-keyboard-offset" as string]: `${keyboardOffset}px`,
        ["--new-map-visible-height" as string]: visibleViewportHeight ? `${visibleViewportHeight}px` : undefined,
        ["--new-map-dock-height" as string]: `${dockHeight}px`,
      }}
    >
      <div ref={containerRef} className={styles.mapSurface} data-testid={publicPresentation ? "public-map-canvas" : "truth-map-canvas"} data-map-ready={mapReady ? "1" : "0"} />
      <AsciiOverlay surfaceTestId={publicPresentation ? "public-map-canvas" : "truth-map-canvas"} />
      <section className={styles.overlay} aria-live="polite">
        {publicPresentation && showPublicMapNotice ? (
          <div className={styles.card} data-testid="public-map-notice">
            <div className={styles.eyebrow}>Cannabis law map</div>
            <h1>Current legal status by country and U.S. state</h1>
            <p>Explore the current legal status, retained official evidence and verified regulated cannabis locations.</p>
            <div className={truthStyles.evidenceGuide} data-testid="public-map-legal-evidence-guide">
              <strong>Legal information in every popup</strong>
              <span>✅ GREEN: verified lawful access · ⚠️ YELLOW: limited or qualified status · ❌ RED: prohibition evidenced in applicable law. UNKNOWN never means a confirmed prohibition.</span>
            </div>
            <p className={styles.meta}>{metaSummary(meta)}</p>
            <p className={styles.meta}>Zoom in to explore verified store counts, clusters and individual cannabis leaves.</p>
          </div>
        ) : !publicPresentation ? (
          <div className={styles.card} data-testid="truth-map-audit-notice">
            <div className={styles.eyebrow}>Truth Map · Audit Preview</div>
            <h2>Current independently reconciled colours</h2>
            <p>Proposal-only layer from the final 307-GEO reconciliation. It does not replace the existing map or apply any SSOT, SEO, production, or deployment mutation.</p>
            <p className={styles.meta}>{metaSummary(meta)}</p>
            <div className={truthStyles.evidenceGuide} data-testid="truth-map-legal-evidence-guide">
              <strong>Legal information in every popup</strong>
              <span>✅ GREEN: verified lawful access · ⚠️ YELLOW: limited or qualified status · ❌ RED: prohibition evidenced in applicable law. For UNKNOWN, ⚠️/❌ only describe evidence direction; UNKNOWN is never presented as a confirmed prohibition.</span>
            </div>
            <p className={styles.meta}>World view groups verified Store Truth counts by country. Zoom in for country, state and territory counts, then the existing local clusters and individual cannabis leaves.</p>
            <div className={styles.truthMapStoreControl} data-testid="truth-map-store-control">
              <span><strong>Verified stores</strong> · cannabis leaves</span>
              <button
                type="button"
                data-testid="truth-map-store-toggle"
                aria-pressed={storesEnabled}
                onClick={() => setStoresEnabled((current) => !current)}
              >
                {storesEnabled ? "Hide stores" : "Show stores"}
              </button>
            </div>
            <p className={styles.runtime}>{visibleStamp} · SOURCE=FINAL_307_RECONCILIATION · APPLY_ALLOWED=false</p>
          </div>
        ) : null}
        {error ? <div className={styles.errorBox}>Truth map unavailable: {error}</div> : null}
      </section>
      {publicPresentation ? publicLocalDock : auditDock}
      {!publicPresentation ? auditMapLayer : null}
      {selectedPopup && !selectedRichEntry ? (
        <div className={truthStyles.richPopupLoading} data-testid="truth-map-rich-popup-loading" role="status">
          Opening the full territory record…
        </div>
      ) : null}
      {showSeoOverlay && activeSeoEntry ? (
        <UnifiedSeoStatusPanel
          data={activeSeoData}
          entry={activeSeoEntry}
          locale="en"
          onClose={handleSeoPanelClose}
          truthMapPresentation
        />
      ) : null}
      {selectedPopup && selectedRichEntry && popupAnchor && (
        !showSeoOverlay || selectedPopup.properties.geo !== activeSeoSelection?.properties.geo
      ) ? (
        <ViewportCountryPopup
          entry={selectedRichEntry}
          locale="en"
          anchor={popupAnchor}
          onClose={clearSelectedGeo}
          className={truthStyles.richPopup}
          rootTestId={publicPresentation ? "public-map-root" : "truth-map-root"}
          popupVariant="truth-map"
          supplementalContent={<TruthMapLegalEvidence properties={selectedPopup.properties} auditOnly={!publicPresentation} />}
          sectionLabels={TRUTH_MAP_CONTEXT_LABELS}
          profileSectionLabels={TRUTH_MAP_PROFILE_SECTION_LABELS}
          onOpenDetails={handleOpenDetails}
        />
      ) : null}
      {!publicPresentation ? auditPanel : null}
      <div hidden data-testid="truth-map-runtime" data-source={runtimeIdentity.dataSource} data-snapshot={runtimeIdentity.finalSnapshotId} />
      </main>
    </TruthMapAuditContext.Provider>
  );
}

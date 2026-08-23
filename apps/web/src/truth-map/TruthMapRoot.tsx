"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import { createMap, NEW_MAP_SOURCE_ID, NEW_MAP_US_STATES_SOURCE_ID } from "@/new-map/createMap";
import MapGeoDock from "@/new-map/MapGeoDock";
import type { CountryCardEntry, LegalCountryCollection, NewMapBootResult } from "@/new-map/map.types";
import { NEW_MAP_BASEMAP_STYLE_URL } from "@/new-map/runtimeUrls";
import styles from "@/new-map/MapRoot.module.css";
import truthStyles from "./TruthMapRoot.module.css";
import {
  STORE_CLUSTER_COUNT_LAYER_ID,
  STORE_CLUSTER_LAYER_ID,
  STORE_MARKER_LAYER_ID,
  useStoreMapLayer
} from "@/new-map/stores/StoreLayer";
import {
  SOCIAL_MAP_ACTIVITY_COUNT_LAYER_ID,
  SOCIAL_MAP_ACTIVITY_LAYER_ID,
  useSocialMapLayer,
} from "@/new-map/social/SocialLayer";
import type { SocialRuntimeConfig } from "@/social/runtimeConfig";
import TruthMapSocialPanel from "./TruthMapSocialPanel";
import type { TruthMapCollection, TruthMapDatasetMeta, TruthMapFeatureProperties } from "./truthMapSource";

type Props = {
  countriesUrl: string;
  usStatesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  initialMapView?: { lat: number; lng: number; zoom: number } | null;
  socialConfig: SocialRuntimeConfig;
  socialPanelInitiallyOpen?: boolean;
};

type TruthMapQaController = {
  jumpTo: (_lng: number, _lat: number, _zoom: number) => Promise<void>;
  openGeo: (_geo: string) => Promise<boolean>;
  getCamera: () => { lng: number; lat: number; zoom: number };
  getStoreVisibilityLevel: () => string | undefined;
  getSocialVisibilityLevel: () => string | undefined;
};

type TruthMapWindow = Window & typeof globalThis & {
  __TRUTH_MAP_DEBUG__?: { map: maplibregl.Map };
  __TRUTH_MAP_QA__?: TruthMapQaController;
};

type ActiveGeo = {
  country: string;
  iso2?: string;
  lat?: number;
  lng?: number;
} | null;

const EMPTY_CARD_INDEX: Record<string, CountryCardEntry> = {};

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function renderTruthPopup(properties: TruthMapFeatureProperties) {
  const citations = parseLegalEvidenceCitations(properties.legalEvidenceCitationsJson);
  const legalEvidence = `<section class="truth-map-legal-evidence" data-testid="truth-map-legal-evidence"><div class="truth-map-legal-evidence-heading"><span class="truth-map-legal-evidence-icon" aria-hidden="true">${escapeHtml(properties.legalEvidenceIcon)}</span><div><strong>${escapeHtml(properties.legalEvidenceLabel)}</strong><div class="truth-map-legal-evidence-summary">${escapeHtml(properties.legalEvidenceSummary)}</div></div></div>${citations.length ? `<ol class="truth-map-legal-citations">${citations.map((citation) => `<li><a href="${escapeHtml(citation.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(citation.title)}</a><div class="truth-map-legal-annotation">${escapeHtml(citation.publisher)} · ${escapeHtml(citation.annotation)}</div>${citation.quote ? `<blockquote>${escapeHtml(citation.quote)}</blockquote>` : ""}</li>`).join("")}</ol>` : `<p class="truth-map-legal-annotation">No link is retained for this record.</p>`}</section>`;
  const displayDirection = properties.displayIsResearchDirection
    ? properties.truthMapDisplayColor === "GRAY"
      ? `<div data-testid="truth-map-research-direction">Map display: GRAY — polar scope exception.</div><div>Display basis: ${escapeHtml(properties.displayColorBasis)}</div><div>This map display is not a final legal conclusion.</div>`
      : `<div data-testid="truth-map-research-direction">Map display: research direction ${escapeHtml(properties.truthMapDisplayColor)} — not a final legal conclusion.</div><div>Display basis: ${escapeHtml(properties.displayColorBasis)}</div>`
    : `<div>Map display: legal verdict ${escapeHtml(properties.truthMapDisplayColor)}.</div>`;
  return `<section class="truth-map-country-popup" data-testid="truth-map-country-popup"><div class="truth-map-popup-title"><strong>${escapeHtml(properties.displayName)}</strong><span>${escapeHtml(properties.geo)}</span></div><div>Legal conclusion: ${escapeHtml(properties.legalTruthColor)} · ${escapeHtml(properties.truthConfidence)}</div>${displayDirection}${legalEvidence}<details class="truth-map-popup-details"><summary>Reconciliation rationale</summary><div>Rule: ${escapeHtml(properties.truthRuleId)}</div><div>${escapeHtml(properties.truthReason)}</div><div>Apply state: ${escapeHtml(properties.applyState)}</div></details><small>Audit preview only — not applied to SSOT, production map, SEO, or deployment.</small></section>`;
}

function metaSummary(meta: TruthMapDatasetMeta | null) {
  if (!meta) return "Loading final reconciliation…";
  const colors = meta.colors;
  const display = meta.displayColors;
  return `Legal 307-GEO: GREEN ${colors.GREEN} · YELLOW ${colors.YELLOW} · RED ${colors.RED} · UNKNOWN ${colors.UNKNOWN}. Display: GREEN ${display.GREEN} · YELLOW ${display.YELLOW} · RED ${display.RED} · GRAY ${display.GRAY} · unpainted ${meta.displayUncoloredGeos.length}. Geometry ${meta.rowsWithGeometry}/${meta.rowsTotal}.`;
}

export default function TruthMapRoot({ countriesUrl, usStatesUrl, visibleStamp, runtimeIdentity, initialMapView = null, socialConfig, socialPanelInitiallyOpen = false }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const runtimeRef = useRef<NewMapBootResult | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const locationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<TruthMapDatasetMeta | null>(null);
  const [selectedGeo, setSelectedGeo] = useState<ActiveGeo>(null);
  const [storesEnabled, setStoresEnabled] = useState(true);
  const initialMapViewRef = useRef(initialMapView);

  useStoreMapLayer(mapInstance, mapReady, storesEnabled);
  useSocialMapLayer(mapInstance, mapReady, socialConfig);

  const clearSelectedGeo = useCallback(() => {
    popupRef.current?.remove();
    popupRef.current = null;
    setSelectedGeo(null);
  }, []);

  const openTruthPopup = useCallback((properties: TruthMapFeatureProperties, lngLat: { lng: number; lat: number }) => {
    const map = mapRef.current;
    if (!map) return;
    const mapPoint = map.project([lngLat.lng, lngLat.lat]);
    const popupAnchor: "top" | "bottom" = mapPoint.y > map.getContainer().clientHeight / 2 ? "bottom" : "top";
    setSelectedGeo({
      country: properties.displayName || properties.geo,
      iso2: properties.geo,
      lat: lngLat.lat,
      lng: lngLat.lng,
    });
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "truth-map-popup-shell", anchor: popupAnchor, offset: 12 })
      .setLngLat(lngLat)
      .setHTML(renderTruthPopup(properties))
      .addTo(map);
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
    markerElement.setAttribute("role", "img");
    markerElement.setAttribute("aria-label", "Where I am");
    markerElement.setAttribute("title", "Where I am");
    markerElement.setAttribute("data-user-marker", "1");

    if (!locationMarkerRef.current) {
      locationMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: "bottom" })
        .setLngLat([geo.lng, geo.lat])
        .addTo(map);
    } else {
      locationMarkerRef.current.setLngLat([geo.lng, geo.lat]);
    }

    if (options?.recenter) {
      map.easeTo({
        center: [geo.lng, geo.lat],
        zoom: Math.max(map.getZoom(), 3.2),
        duration: 500,
        essential: true,
      });
    }
  }, []);

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
          STORE_CLUSTER_COUNT_LAYER_ID,
          SOCIAL_MAP_ACTIVITY_LAYER_ID,
          SOCIAL_MAP_ACTIVITY_COUNT_LAYER_ID,
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
    host.__TRUTH_MAP_DEBUG__ = { map: runtime.map };

    const load = async () => {
      try {
        const [response, statesResponse] = await Promise.all([
          fetch(countriesUrl, { cache: "no-store", credentials: "same-origin" }),
          fetch(usStatesUrl, { cache: "no-store", credentials: "same-origin" }),
        ]);
        if (!response.ok) throw new Error(`truth_map_dataset_fetch:${response.status}`);
        if (!statesResponse.ok) throw new Error(`truth_map_states_dataset_fetch:${statesResponse.status}`);
        const [countries, usStates] = await Promise.all([
          response.json() as Promise<TruthMapCollection>,
          statesResponse.json() as Promise<TruthMapCollection>,
        ]);
        if (disposed) return;
        runtime.setData(countries as LegalCountryCollection);
        setMeta(countries.meta || null);
        await runtime.ready;
        if (disposed) return;
        const initialView = initialMapViewRef.current;
        if (initialView) {
          runtime.map.jumpTo({ center: [initialView.lng, initialView.lat], zoom: initialView.zoom, pitch: 0, bearing: 0 });
        }
        setMapReady(true);
        if (new URLSearchParams(window.location.search).get("qa") !== "1") return;
        host.__TRUTH_MAP_QA__ = {
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
          getSocialVisibilityLevel: () => runtime.map.getCanvas().dataset.socialVisibilityLevel,
        };
      } catch (loadError) {
        if (!disposed) setError(loadError instanceof Error ? loadError.message : "truth_map_dataset_fetch_failed");
      }
    };
    void load();

    return () => {
      disposed = true;
      popupRef.current?.remove();
      popupRef.current = null;
      locationMarkerRef.current?.remove();
      locationMarkerRef.current = null;
      if (host.__TRUTH_MAP_DEBUG__?.map === runtime.map) delete host.__TRUTH_MAP_DEBUG__;
      if (host.__TRUTH_MAP_QA__) delete host.__TRUTH_MAP_QA__;
      setMapReady(false);
      setMapInstance(null);
      mapRef.current = null;
      runtimeRef.current = null;
      runtime.destroy();
    };
  }, [countriesUrl, usStatesUrl, openTruthPopup]);

  return (
    <main className={`${styles.root} ${truthStyles.root}`} data-testid="truth-map-root" data-truth-map-source="FINAL_307_RECONCILIATION" data-store-layer-enabled={String(storesEnabled)}>
      <div ref={containerRef} className={styles.mapSurface} data-testid="truth-map-canvas" />
      <section className={styles.overlay} aria-live="polite">
        <div className={styles.card} data-testid="truth-map-audit-notice">
          <div className={styles.eyebrow}>Truth Map · Audit Preview</div>
          <h2>Current independently reconciled colours</h2>
          <p>Proposal-only layer from the final 307-GEO reconciliation. It does not replace the existing map or apply any SSOT, SEO, production, or deployment mutation.</p>
          <p className={styles.meta}>{metaSummary(meta)}</p>
          <div className={truthStyles.evidenceGuide} data-testid="truth-map-legal-evidence-guide">
            <strong>Legal information in every popup</strong>
            <span>✅ verified applicable evidence · ⚠️ evidence needs qualification · ❌ no confirmed applicable conclusion — not a prohibition finding.</span>
          </div>
          <p className={styles.meta}>Verified regulated stores load only in a suitable viewport and zoom. World view intentionally shows no individual markers.</p>
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
        {error ? <div className={styles.errorBox}>Truth map unavailable: {error}</div> : null}
      </section>
      <MapGeoDock
        mapReady={mapReady}
        cardIndex={EMPTY_CARD_INDEX}
        selectedGeo={selectedGeo}
        routeGeo={null}
        clearSelectedGeo={clearSelectedGeo}
        applyGeoToMap={applyGeoToMap}
      />
      <TruthMapSocialPanel config={socialConfig} map={mapInstance} mapReady={mapReady} initiallyOpen={socialPanelInitiallyOpen} />
      <div hidden data-testid="truth-map-runtime" data-source={runtimeIdentity.dataSource} data-snapshot={runtimeIdentity.finalSnapshotId} />
    </main>
  );
}

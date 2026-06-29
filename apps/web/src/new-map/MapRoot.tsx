"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import type { CountryPageData } from "@/lib/countryPageStorage";
import type { SeoLocale } from "@/lib/seo/i18n";
import { createMap } from "./createMap";
import type { CountryCardEntry, CountryCardSeed, LegalCountryCollection, NewMapBootResult } from "./map.types";
import styles from "./MapRoot.module.css";
import { NEW_MAP_WATER_COLOR } from "./mapPalette";
import { NEW_MAP_BASEMAP_STYLE_URL } from "./runtimeUrls";
import { hasFirstVisualReady, markNewMapTrace, onFirstVisualReady, resetFirstVisualReady, setNewMapMetric } from "./startupTrace";
import {
  readVisualViewportKeyboardOffset,
  readVisualViewportSnapshot,
  subscribeToVisualViewportChanges
} from "./viewportMetrics";
import AsciiOverlay from "./ascii/AsciiOverlay";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  initialGeoCode?: string | null;
  seoCountryData?: CountryPageData | null;
  seoCountryIndex?: Record<string, CountryPageData>;
  locale?: SeoLocale;
};

const EMPTY_SEO_COUNTRY_INDEX: Record<string, CountryPageData> = {};

function parseGeoFromPathOrQuery(pathnameOrHref: string): string | null {
  try {
    const url = new URL(pathnameOrHref, typeof window !== "undefined" ? window.location.origin : "https://www.islegal.info");
    const queryCode = url.searchParams.get("geo") || url.searchParams.get("code");
    if (queryCode) return queryCode.toLowerCase().trim() || null;
    const match = url.pathname.match(/^\/(?:[a-z]{2}\/)?c\/([a-z0-9-]+)$/i);
    return match?.[1]?.toLowerCase() || null;
  } catch {
    const match = pathnameOrHref.match(/^\/(?:[a-z]{2}\/)?c\/([a-z0-9-]+)$/i);
    return match?.[1]?.toLowerCase() || null;
  }
}

function parseSeoCodeFromHref(href: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, typeof window !== "undefined" ? window.location.origin : "https://www.islegal.info");
    return parseGeoFromPathOrQuery(url.href);
  } catch {
    return parseGeoFromPathOrQuery(href);
  }
}

function resolveEntryDetailsCode(entry: CountryCardEntry): string | null {
  const sources: Array<string> = [entry.pageHref, entry.detailsHref].filter(Boolean) as string[];
  for (const href of sources) {
    const code = parseSeoCodeFromHref(href);
    if (code) return code;
  }
  if (entry.parentCountry?.code) {
    return String(entry.parentCountry.code).trim().toLowerCase();
  }
  return null;
}

type NewMapDebug = {
  mounted: boolean;
  selectedId?: string | null;
  setSelectedGeo?: (_geo: string | null) => void;
  countriesUrl: string;
  map?: import("maplibre-gl").Map | null;
  labelGroups?: Record<string, string[]>;
  lastPointerLng?: number | null;
};

type NewMapQaController = {
  jumpTo: (_lng: number, _lat: number, _zoom: number) => Promise<void>;
  getCamera: () => { lng: number; lat: number; zoom: number };
  getCanvasBox: () => { width: number; height: number };
};

type SelectedGeo = string | null;

type ActiveGeo = {
  country: string;
  iso2?: string;
  lat?: number;
  lng?: number;
} | null;

type NewMapPrefetchCache = {
  countries?: Promise<LegalCountryCollection | null> | null;
  style?: Promise<StyleSpecification | null> | null;
  cardIndex?: Promise<Record<string, CountryCardEntry> | null> | null;
};

const RuntimeParityBadge = dynamic(() => import("@/app/_components/RuntimeParityBadge"), { ssr: false });
const MapGeoDock = dynamic(() => import("./MapGeoDock"), { ssr: false });
const UnifiedSeoStatusPanel = dynamic(() => import("./components/UnifiedSeoStatusPanel"), { ssr: false });
const ViewportCountryPopup = dynamic(() => import("./components/ViewportCountryPopup"), { ssr: false });

function getNewMapPrefetchCache(): NewMapPrefetchCache | null {
  if (typeof window === "undefined") return null;
  const host = window as typeof window & {
    __NEW_MAP_PREFETCH__?: NewMapPrefetchCache;
  };
  return host.__NEW_MAP_PREFETCH__ || null;
}

async function fetchJsonWithRetry<T>(url: string, init: RequestInit, errorPrefix: string): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        throw new Error(`${errorPrefix}:${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(errorPrefix);
}

function markCountriesCacheState(countriesUrl: string) {
  if (typeof performance === "undefined") return;
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const match = entries
    .filter((entry) => entry.name.endsWith(countriesUrl) || entry.name.includes("/static/countries/countries."))
    .at(-1);
  if (!match) return;
  const transferSize = Math.round(match.transferSize || 0);
  const decodedBodySize = Math.round(match.decodedBodySize || 0);
  setNewMapMetric("NM_COUNTRIES_TRANSFER_SIZE", transferSize);
  setNewMapMetric("NM_COUNTRIES_DECODED_BODY_SIZE", decodedBodySize);
  if (transferSize === 0 && decodedBodySize > 0) {
    return;
  }
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

function seedSummary(mapCategory: CountryCardEntry["mapCategory"]) {
  return (
    {
      LEGAL_OR_DECRIM: "Legal access.",
      LIMITED_OR_MEDICAL: "Restricted access.",
      ILLEGAL: "Prohibited access.",
      UNKNOWN: "Status unknown."
    }[mapCategory || "UNKNOWN"] || "Status unknown."
  );
}

function buildSeedCardEntry(seed: CountryCardSeed): CountryCardEntry {
  const geo = String(seed.geo || "").trim().toUpperCase();
  const displayName = String(seed.displayName || geo).trim() || geo;
  const summary = seedSummary(seed.mapCategory);
  const levelTitle =
    seed.mapCategory === "LEGAL_OR_DECRIM"
      ? "GREEN"
      : seed.mapCategory === "ILLEGAL"
        ? "RED"
        : seed.mapCategory === "LIMITED_OR_MEDICAL"
          ? "YELLOW"
          : "UNKNOWN";
  return {
    geo,
    code: geo.toLowerCase(),
    pageHref: `/new-map?geo=${encodeURIComponent(geo)}`,
    displayName,
    iso2: geo,
    result: {
      status: seed.mapCategory === "LEGAL_OR_DECRIM" ? "LEGAL" : seed.mapCategory === "UNKNOWN" ? "UNKNOWN" : "ILLEGAL",
      color: levelTitle
    },
    mapCategory: seed.mapCategory,
    panel: {
      levelTitle,
      summary,
      critical: [],
      info: [],
      why: []
    },
    sources: []
  } as unknown as CountryCardEntry;
}

function seedPopupPosition(anchor: { x: number; y: number }) {
  if (typeof window === "undefined") {
    return { left: 16, top: 16 };
  }
  const width = Math.min(420, Math.max(280, window.innerWidth - 32));
  const preferRight = anchor.x < window.innerWidth * 0.5;
  const left = Math.min(Math.max(16, preferRight ? anchor.x + 18 : anchor.x - width - 18), Math.max(16, window.innerWidth - width - 16));
  const top = Math.min(Math.max(16, anchor.y - 120), Math.max(16, window.innerHeight - 260));
  return { left, top };
}

function showImmediateSeedPopup(seed: CountryCardSeed | null | undefined, anchor: { x: number; y: number } | null | undefined) {
  if (!seed?.geo || !anchor || typeof document === "undefined") return;
  document.getElementById("new-map-immediate-seed-popup")?.remove();
  const entry = buildSeedCardEntry(seed);
  const position = seedPopupPosition(anchor);
  const panel = document.createElement("aside");
  panel.id = "new-map-immediate-seed-popup";
  panel.className = styles.viewportPopupPanel;
  panel.dataset.testid = "new-map-country-popup";
  panel.style.left = `${position.left}px`;
  panel.style.top = `${position.top}px`;
  panel.style.zIndex = "31";
  panel.textContent = `${entry.displayName}\nISO2: ${entry.iso2 || entry.geo}\n${entry.panel.levelTitle}\nStatus\n${entry.panel.summary}`;
  document.body.append(panel);
  window.setTimeout(() => panel.remove(), 15000);
}

function isNewMapQaEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("qa") === "1";
}

function installNewMapQaHook(map: maplibregl.Map) {
  if (!isNewMapQaEnabled()) return () => {};
  const host = window as typeof window & {
    __NEW_MAP_QA__?: NewMapQaController;
  };
  host.__NEW_MAP_QA__ = {
    jumpTo: (lng: number, lat: number, zoom: number) =>
      new Promise<void>((resolve) => {
        let settled = false;
        let timeoutId = 0;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve();
        };
        timeoutId = window.setTimeout(finish, 1200);
        map.once("idle", finish);
        map.jumpTo({
          center: [lng, lat],
          zoom,
          pitch: 0,
          bearing: 0
        });
      }),
    getCamera: () => {
      const center = map.getCenter();
      return { lng: center.lng, lat: center.lat, zoom: map.getZoom() };
    },
    getCanvasBox: () => {
      const rect = map.getCanvas().getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    }
  };
  return () => {
    if (host.__NEW_MAP_QA__) delete host.__NEW_MAP_QA__;
  };
}

function safeSetFeatureState(
  map: maplibregl.Map | null,
  target: { source: "legal-countries" | "us-states"; id: string },
  state: { selected: boolean }
) {
  if (!map) return;
  try {
    const style = typeof map.getStyle === "function" ? map.getStyle() : null;
    const hasSource = Boolean(style?.sources && target.source in style.sources);
    if (!hasSource) return;
    map.setFeatureState({ source: target.source, id: target.id }, state);
  } catch {
    return;
  }
}

export default function MapRoot({
  countriesUrl,
  visibleStamp,
  runtimeIdentity,
  initialGeoCode = null,
  seoCountryData = null,
  seoCountryIndex = EMPTY_SEO_COUNTRY_INDEX,
  locale = "en"
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const runtimeRef = useRef<NewMapBootResult | null>(null);
  const locationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const infoMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [visualReady, setVisualReady] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [visibleViewportHeight, setVisibleViewportHeight] = useState<number | null>(null);
  const [dockHeight, setDockHeight] = useState(72);
  const [selectedGeo, setSelectedGeo] = useState<SelectedGeo>(
    initialGeoCode ? String(initialGeoCode).trim().toUpperCase() : null
  );
  const [hoveredGeo, setHoveredGeo] = useState<SelectedGeo>(null);
  const [seoPanelOpen, setSeoPanelOpen] = useState(Boolean(initialGeoCode));
  const [cardIndex, setCardIndex] = useState<Record<string, CountryCardEntry>>({});
  const [selectedGeoSeedEntry, setSelectedGeoSeedEntry] = useState<CountryCardEntry | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
  const [activeRouteSeoData, setActiveRouteSeoData] = useState<CountryPageData | null>(seoCountryData);
  const [activeSeoDerivedEntry, setActiveSeoDerivedEntry] = useState<CountryCardEntry | null>(null);
  const cardIndexRequestedRef = useRef(false);
  const cardEntryRequestsRef = useRef<Record<string, Promise<CountryCardEntry | null>>>({});
  const selectedFeatureStateRef = useRef<{ source: "legal-countries" | "us-states"; id: string } | null>(null);
  const seoDataByCodeRef = useRef<Record<string, CountryPageData>>({});
  const showDebugOverlay = runtimeIdentity.runtimeMode !== "production";
  const lastAppliedRouteGeoRef = useRef<string | null>(null);
  const seoCountryCode = activeRouteSeoData?.code || null;
  const seoRouteGeoCode = String(activeRouteSeoData?.geo_code || "").trim().toUpperCase() || null;
  const shouldLockDocumentScroll = !seoCountryData;

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (shouldLockDocumentScroll) {
      document.body.dataset.newMapRoute = "1";
    } else {
      delete document.body.dataset.newMapRoute;
    }
    return () => {
      if (document.body.dataset.newMapRoute === "1") {
        delete document.body.dataset.newMapRoute;
      }
    };
  }, [shouldLockDocumentScroll]);

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
      if (dockNode) {
        resizeObserver?.observe(dockNode);
      }
      const nextHeight = dockNode ? Math.max(72, Math.ceil(dockNode.getBoundingClientRect().height)) : 72;
      setDockHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    const mutationObserver = typeof MutationObserver === "function" ? new MutationObserver(scheduleMeasure) : null;
    mutationObserver?.observe(document.body, {
      childList: true,
      subtree: true
    });
    scheduleMeasure();

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (!seoCountryData) return;
    let cancelled = false;
    seoDataByCodeRef.current[seoCountryData.code.toLowerCase()] = seoCountryData;
    seoDataByCodeRef.current[String(seoCountryData.geo_code || "").trim().toUpperCase()] = seoCountryData;
    queueMicrotask(() => {
      if (!cancelled) setActiveRouteSeoData(seoCountryData);
    });
    return () => {
      cancelled = true;
    };
  }, [seoCountryData]);
  const activeSeoData = useMemo(() => {
    if (!activeRouteSeoData) return null;
    if (seoRouteGeoCode && seoCountryIndex[seoRouteGeoCode]) {
      return seoCountryIndex[seoRouteGeoCode];
    }
    return activeRouteSeoData;
  }, [activeRouteSeoData, seoCountryIndex, seoRouteGeoCode]);

  useEffect(() => {
    if (!activeSeoData) {
      setActiveSeoDerivedEntry(null);
      return;
    }
    let cancelled = false;
    import("@/lib/countryCardEntry")
      .then(({ deriveCountryCardEntryFromCountryPageData }) => {
        if (!cancelled) setActiveSeoDerivedEntry(deriveCountryCardEntryFromCountryPageData(activeSeoData));
      })
      .catch(() => {
        if (!cancelled) setActiveSeoDerivedEntry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSeoData]);

  const activeSeoEntry = useMemo(() => {
    if (activeSeoData) return activeSeoDerivedEntry;
    if (!seoPanelOpen || !selectedGeo) return null;
    return cardIndex[selectedGeo] || null;
  }, [activeSeoData, activeSeoDerivedEntry, cardIndex, selectedGeo, seoPanelOpen]);
  const showSeoOverlay = Boolean(activeSeoEntry && seoPanelOpen);
  const popupGeoCode =
    selectedGeo &&
    !(showSeoOverlay && selectedGeo === String(activeSeoEntry?.geo || activeSeoData?.geo_code || "").trim().toUpperCase())
      ? selectedGeo
      : null;
  const selectedGeoEntry = useMemo(() => {
    if (!popupGeoCode) return null;
    const indexed = cardIndex[popupGeoCode];
    if (indexed) return indexed;
    if (selectedGeoSeedEntry?.geo === popupGeoCode) return selectedGeoSeedEntry;
    if (activeSeoData && popupGeoCode === activeSeoData.geo_code) {
      return activeSeoDerivedEntry;
    }
    return null;
  }, [activeSeoData, activeSeoDerivedEntry, cardIndex, popupGeoCode, selectedGeoSeedEntry]);
  const seoMarkerEntry = useMemo(() => {
    if (!activeSeoEntry) return null;
    const geoCode = activeSeoData?.geo_code || activeSeoEntry.geo;
    const cardEntry = cardIndex[geoCode];
    return {
      code: geoCode,
      name: activeSeoData?.name || activeSeoEntry.displayName,
      coordinates: activeSeoData?.coordinates || activeSeoEntry.coordinates || cardEntry?.coordinates || null
    };
  }, [activeSeoData, activeSeoEntry, cardIndex]);
  const selectedGeoView: ActiveGeo = useMemo(() => {
    if (!selectedGeoEntry) return null;
    return {
      country: selectedGeoEntry.displayName,
      iso2: selectedGeoEntry.iso2 || undefined,
      lat: selectedGeoEntry.coordinates?.lat,
      lng: selectedGeoEntry.coordinates?.lng
    };
  }, [selectedGeoEntry]);

  useEffect(() => {
    if (!popupGeoCode) return;
    if (!selectedGeoEntry || !popupAnchor) return;
    markNewMapTrace("NM_POPUP_RENDER_READY");
    if (selectedGeoSeedEntry && selectedGeoEntry !== selectedGeoSeedEntry) {
      document.getElementById("new-map-immediate-seed-popup")?.remove();
    }
  }, [popupAnchor, popupGeoCode, selectedGeoEntry, selectedGeoSeedEntry]);

  const handleSeoMarkerToggle = useCallback(() => {
    if (!seoMarkerEntry) return;
    if (selectedGeo === seoMarkerEntry.code && seoPanelOpen) {
      setSeoPanelOpen(false);
      setSelectedGeo(null);
      return;
    }
    setSelectedGeo(seoMarkerEntry.code);
    setSeoPanelOpen(true);
  }, [seoMarkerEntry, selectedGeo, seoPanelOpen]);

  const handleSeoPanelClose = useCallback(() => {
    setSeoPanelOpen(false);
    setSelectedGeo(null);
  }, []);

  const loadSeoCountryData = useCallback(async (code: string) => {
    const normalizedCode = String(code || "").trim().toLowerCase();
    if (!normalizedCode) return null;
    const cached = seoDataByCodeRef.current[normalizedCode];
    if (cached) return cached;
    const response = await fetch(`/api/new-map/country-page?code=${encodeURIComponent(normalizedCode)}`, {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) return null;
    const data = (await response.json()) as CountryPageData;
    seoDataByCodeRef.current[normalizedCode] = data;
    seoDataByCodeRef.current[String(data.geo_code || "").trim().toUpperCase()] = data;
    return data;
  }, []);

  const activateSeoRoute = useCallback(
    async (code: string, options?: { pushUrl?: boolean }) => {
      const data = await loadSeoCountryData(code);
      if (!data) return false;
      const targetHref = `/c/${data.code}`;
      if (options?.pushUrl && typeof window !== "undefined" && window.location.pathname !== targetHref) {
        window.history.pushState({ seoCode: data.code }, "", targetHref);
      }
      setActiveRouteSeoData(data);
      setSeoPanelOpen(true);
      setSelectedGeo(data.geo_code);
      const lat = data.coordinates?.lat;
      const lng = data.coordinates?.lng;
      const map = mapRef.current;
      if (map && typeof lat === "number" && typeof lng === "number") {
        const targetZoom = String(data.geo_code || "").toUpperCase().startsWith("US-") ? 4.8 : 3.2;
        map.easeTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), targetZoom),
          duration: 700,
          essential: true
        });
      }
      return true;
    },
    [loadSeoCountryData]
  );

  const handleCountryPopupClose = useCallback(() => {
    document.getElementById("new-map-immediate-seed-popup")?.remove();
    setSelectedGeo(null);
  }, []);

  const loadCardIndex = useCallback(async () => {
    if (cardIndexRequestedRef.current) return null;
    cardIndexRequestedRef.current = true;
    const prefetched = getNewMapPrefetchCache();
    const requestCardIndex = async () => {
      const response = await fetch("/api/new-map/card-index", {
        credentials: "same-origin"
      });
      if (!response.ok) {
        throw new Error(`card_index_fetch_failed:${response.status}`);
      }
      const json = (await response.json()) as Record<string, CountryCardEntry>;
      return json;
    };
    try {
      const nextCardIndex = prefetched?.cardIndex
        ? await prefetched.cardIndex.then((value) => value || requestCardIndex())
        : await requestCardIndex();
      setCardIndex(nextCardIndex || {});
      return nextCardIndex || {};
    } catch {
      cardIndexRequestedRef.current = false;
      setCardIndex({});
      return null;
    }
  }, []);

  const loadCardEntry = useCallback(async (geo: string) => {
    const normalizedGeo = String(geo || "").trim().toUpperCase();
    if (!normalizedGeo) return null;
    const existingRequest = cardEntryRequestsRef.current[normalizedGeo];
    if (existingRequest) return existingRequest;

    const request = fetch(`/api/new-map/card-entry?geo=${encodeURIComponent(normalizedGeo)}`, {
      credentials: "same-origin"
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const entry = (await response.json()) as CountryCardEntry;
        setCardIndex((current) => {
          const entryGeo = String(entry?.geo || normalizedGeo).trim().toUpperCase();
          if (!entryGeo || current[entryGeo]) return current;
          return {
            ...current,
            [entryGeo]: entry
          };
        });
        return entry || null;
      })
      .catch(() => {
        delete cardEntryRequestsRef.current[normalizedGeo];
        return null;
      });

    cardEntryRequestsRef.current[normalizedGeo] = request;
    return request;
  }, []);

  const handleOpenDetails = useCallback(
    async (entry: CountryCardEntry) => {
      const code = resolveEntryDetailsCode(entry);
      if (!code) {
        if (entry.detailsHref) {
          window.location.assign(entry.detailsHref);
        }
        return;
      }
      const activated = await activateSeoRoute(code, { pushUrl: true });
      if (!activated && typeof window !== "undefined") {
        const fallbackTarget = /^\/new-map\?/i.test(entry.pageHref)
          ? `/new-map?geo=${encodeURIComponent(code.toUpperCase())}`
          : entry.pageHref || "/";
        window.location.assign(fallbackTarget);
      }
    },
    [activateSeoRoute]
  );

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

  useEffect(() => {
    const map = mapRef.current;
    const markerEntry = seoMarkerEntry;
    if (!mapReady || !map || !markerEntry?.coordinates) {
      infoMarkerRef.current?.remove();
      infoMarkerRef.current = null;
      return;
    }

    const button = (infoMarkerRef.current?.getElement() as HTMLButtonElement | null) || document.createElement("button");
    button.type = "button";
    button.className = styles.infoMarker;
    button.textContent = "i";
    button.setAttribute("aria-label", `Open info for ${markerEntry.name}`);
    button.setAttribute("data-seo-marker", "1");
    button.setAttribute("data-seo-marker-geo", markerEntry.code);
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
  }, [handleSeoMarkerToggle, hoveredGeo, mapReady, selectedGeo, seoMarkerEntry, seoPanelOpen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const clearSelected = () => {
      const current = selectedFeatureStateRef.current;
      if (!current) return;
      safeSetFeatureState(map, current, { selected: false });
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
    if (nextState.source === "us-states") {
      runtimeRef.current?.loadUsStates();
    }
    const current = selectedFeatureStateRef.current;
    if (current && (current.source !== nextState.source || current.id !== nextState.id)) {
      safeSetFeatureState(map, current, { selected: false });
    }
    safeSetFeatureState(map, nextState, { selected: true });
    selectedFeatureStateRef.current = nextState;

    return () => {
      const active = selectedFeatureStateRef.current;
      if (!active || active.id !== nextState.id || active.source !== nextState.source) return;
      safeSetFeatureState(map, active, { selected: false });
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
  }, [selectedGeoEntry?.geo, selectedGeoEntry?.coordinates, selectedGeoEntry?.coordinates?.lat, selectedGeoEntry?.coordinates?.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;
    let frameId = 0;
    const scheduleResize = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => map.resize());
    };
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleResize) : null;
    resizeObserver?.observe(container);
    const unsubscribeViewport = subscribeToVisualViewportChanges(scheduleResize);
    return () => {
      resizeObserver?.disconnect();
      unsubscribeViewport();
      window.cancelAnimationFrame(frameId);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!initialGeoCode) {
      lastAppliedRouteGeoRef.current = null;
      return;
    }
    if (!mapReady) return;
    if (lastAppliedRouteGeoRef.current === initialGeoCode) return;
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
    lastAppliedRouteGeoRef.current = initialGeoCode;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || lastAppliedRouteGeoRef.current !== initialGeoCode) return;
      setSelectedGeo(initialGeoCode);
      setSeoPanelOpen(true);
    });
    const map = mapRef.current;
    const lat = target.coordinates?.lat;
    const lng = target.coordinates?.lng;
    if (!map || typeof lat !== "number" || typeof lng !== "number") {
      return () => {
        cancelled = true;
      };
    }
    const targetZoom = String(target.iso2 || "").toUpperCase().startsWith("US-") ? 4.8 : 3.2;
    map.jumpTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), targetZoom)
    });
    return () => {
      cancelled = true;
    };
  }, [activeSeoData, cardIndex, initialGeoCode, mapReady]);

  useEffect(() => {
    let cancelled = false;
    resetFirstVisualReady();
    if (hasFirstVisualReady()) {
      queueMicrotask(() => {
        if (!cancelled) setVisualReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    queueMicrotask(() => {
      if (!cancelled) setVisualReady(false);
    });
    const unsubscribe = onFirstVisualReady(() => setVisualReady(true));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [countriesUrl]);

  useEffect(() => {
    if (!seoCountryData) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setSeoPanelOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [seoCountryCode, seoCountryData, seoCountryIndex]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      const code =
        parseGeoFromPathOrQuery(window.location.pathname) ||
        parseGeoFromPathOrQuery(window.location.href);
      if (!code) {
        setActiveRouteSeoData(null);
        setSeoPanelOpen(false);
        setSelectedGeo(null);
        lastAppliedRouteGeoRef.current = null;
        return;
      }
      void activateSeoRoute(code, { pushUrl: false });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activateSeoRoute]);

  useEffect(() => {
    if (!initialGeoCode && !seoCountryData) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadCardIndex();
    });
    return () => {
      cancelled = true;
    };
  }, [initialGeoCode, loadCardIndex, seoCountryData]);

  useEffect(() => {
    if (!selectedGeo || cardIndex[selectedGeo]) return;
    let cancelled = false;
    let timeoutId = 0;
    queueMicrotask(() => {
      if (!cancelled) {
        void loadCardEntry(selectedGeo);
        timeoutId = window.setTimeout(() => {
          if (!cancelled) void loadCardIndex();
        }, 800);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [cardIndex, loadCardEntry, loadCardIndex, selectedGeo]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    async function mount() {
      if (!containerRef.current) return;
      try {
        const prefetched = getNewMapPrefetchCache();
        const loadCountries = () =>
          fetchJsonWithRetry<LegalCountryCollection>(countriesUrl, {
            credentials: "same-origin"
          }, "countries_fetch_failed");
        const loadStyle = () =>
          fetchJsonWithRetry<StyleSpecification>(NEW_MAP_BASEMAP_STYLE_URL, {
            credentials: "same-origin"
          }, "basemap_style_fetch_failed");
        const countriesPromise = prefetched?.countries
          ? prefetched.countries.then((value) => value || loadCountries())
          : loadCountries();
        const style = await (prefetched?.style
          ? prefetched.style.then((value) => value || loadStyle())
          : loadStyle()).catch(() => null);
        const runtime = createMap(containerRef.current, {
          style,
          onSelectGeo: (geo, anchor, seed) => {
            showImmediateSeedPopup(seed, anchor);
            if (anchor) setPopupAnchor(anchor);
            setSelectedGeoSeedEntry(seed?.geo ? buildSeedCardEntry(seed) : null);
            setSelectedGeo(geo);
            setDebugState({ selectedId: geo });
          }
        });
        mapRef.current = runtime.map;
        runtimeRef.current = runtime;
        const countriesDataPromise = countriesPromise.then((countries) => {
          if (cancelled) return;
          markCountriesCacheState(countriesUrl);
          for (const feature of countries.features) {
            const status = feature.properties?.result?.status;
            if (!status) {
              throw new Error(`MAP_WITHOUT_STATUS: ${String(feature.properties?.geo || "UNKNOWN")}`);
            }
          }
          runtime.setData(countries);
          return countries;
        });
        await runtime.basemapReady;
        if (cancelled) {
          runtime.destroy();
          runtimeRef.current = null;
          return;
        }
        setMapReady(true);
        await runtime.ready;
        if (cancelled) {
          runtime.destroy();
          runtimeRef.current = null;
          return;
        }
        setVisualReady(true);
        const { attachHoverController } = await import("./hoverController");
        const { bindAsciiMapTriggers } = await import("./ascii/ascii-triggers");
        const hover = attachHoverController(runtime.map, {
          onHoverChange: (geo) => setHoveredGeo(geo)
        });
        const unbindAsciiTriggers = bindAsciiMapTriggers(runtime.map);
        const uninstallQaHook = installNewMapQaHook(runtime.map);
        setDebugState({
          mounted: true,
          countriesUrl,
          map: runtime.map,
          selectedId: null,
          setSelectedGeo
        });
        await countriesDataPromise;
        if (cancelled) {
          uninstallQaHook();
          unbindAsciiTriggers();
          hover.destroy();
          runtime.destroy();
          runtimeRef.current = null;
          return;
        }
        cleanup = () => {
          uninstallQaHook();
          unbindAsciiTriggers();
          hover.destroy();
          locationMarkerRef.current?.remove();
          locationMarkerRef.current = null;
          infoMarkerRef.current?.remove();
          infoMarkerRef.current = null;
          mapRef.current = null;
          runtimeRef.current = null;
          setMapReady(false);
          setVisualReady(false);
          runtime.destroy();
          setSelectedGeo(null);
          setHoveredGeo(null);
          setDebugState({ mounted: false, selectedId: null, map: null, setSelectedGeo: undefined });
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
    <section
      className={styles.root}
      data-testid="new-map-root"
      data-keyboard-open={keyboardOffset > 24 ? "1" : "0"}
      data-keyboard-offset={keyboardOffset}
      style={{
        ["--new-map-water-color" as string]: NEW_MAP_WATER_COLOR,
        ["--new-map-keyboard-offset" as string]: `${keyboardOffset}px`,
        ["--new-map-visible-height" as string]: visibleViewportHeight ? `${visibleViewportHeight}px` : undefined,
        ["--new-map-dock-height" as string]: `${dockHeight}px`
      }}
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
            <p>MapLibre owns render. Pointer-stream glue uses native browser events. Truth colors still come from the current SSOT snapshot.</p>
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
      {showSeoOverlay && activeSeoEntry ? (
        <UnifiedSeoStatusPanel data={activeSeoData} entry={activeSeoEntry} locale={locale} onClose={handleSeoPanelClose} />
      ) : null}
      {selectedGeoEntry && popupAnchor ? (
        <ViewportCountryPopup
          entry={selectedGeoEntry}
          locale={locale}
          anchor={popupAnchor}
          onClose={handleCountryPopupClose}
          onOpenDetails={handleOpenDetails}
        />
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
        routeGeo={
          seoMarkerEntry
            ? {
                country: seoMarkerEntry.name,
                iso2: seoMarkerEntry.code || undefined,
                lat: seoMarkerEntry.coordinates?.lat,
                lng: seoMarkerEntry.coordinates?.lng
              }
            : null
        }
        clearSelectedGeo={() => setSelectedGeo(null)}
        applyGeoToMap={applyGeoToMap}
      />
      {error ? (
        <div className={styles.errorBox} data-testid="new-map-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}

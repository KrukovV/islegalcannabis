"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./LeafletMap.module.css";

type LeafletLayer = {
  addTo?: (map: LeafletMapInstance) => LeafletLayer;
  addLayer?: (layer: LeafletLayer | LeafletLayerGroup) => LeafletLayer;
  clearLayers?: () => void;
  bindPopup?: (html: string) => void;
};

type LeafletLayerGroup = LeafletLayer & {
  addLayer: (layer: LeafletLayer) => LeafletLayerGroup;
  clearLayers: () => void;
};

type LeafletMapInstance = {
  setView: (coords: [number, number], zoom: number, options?: { animate?: boolean }) => LeafletMapInstance;
  on: (event: string, handler: () => void) => void;
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  invalidateSize: () => void;
};

type LeafletModule = {
  map: (node: HTMLElement, options: { zoomControl: boolean; worldCopyJump: boolean }) => LeafletMapInstance;
  tileLayer: (url: string, options: { attribution: string }) => LeafletLayer;
  layerGroup: () => LeafletLayerGroup;
  control: {
    layers: (base: Record<string, LeafletLayer>, overlays: Record<string, LeafletLayer>, options: { collapsed: boolean }) => LeafletLayer;
  };
  geoJSON: (data: GeoJsonPayload, options: Record<string, unknown>) => LeafletLayer;
  circleMarker: (latlng: unknown, options: Record<string, unknown>) => LeafletLayer;
  marker: (coords: [number, number]) => LeafletLayer;
  circle: (coords: [number, number], options: Record<string, unknown>) => LeafletLayer;
  markerClusterGroup?: () => LeafletLayerGroup;
};

type RegionFeature = {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: number[];
  };
  properties: {
    geo: string;
    name?: string;
    type?: string;
    legalStatusGlobal?: string;
    medicalStatusGlobal?: string;
    notes?: string | null;
    wikiSources?: string[];
    updatedAt?: string;
  };
};

type GeoJsonPayload = {
  type: "FeatureCollection";
  features: RegionFeature[];
};

type RegionResponse = {
  regions: Array<{
    geo: string;
    type: string;
    legalStatusGlobal: string;
    medicalStatusGlobal: string;
    notes?: string | null;
    wikiSources?: string[];
    coordinates?: { lat: number; lng: number };
    updatedAt?: string;
    name?: string;
  }>;
};

type Retailer = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type?: string;
  license?: string;
  website?: string;
  updatedAt?: string;
};

type RetailerResponse = {
  retailers: Retailer[];
};

type CachePayload<T> = {
  storedAt: number;
  payload: T;
};

const REGION_TTL_MS = 48 * 60 * 60 * 1000;
const RETAILER_TTL_MS = 4 * 60 * 60 * 1000;
const GEOJSON_TTL_MS = 48 * 60 * 60 * 1000;

function readCache<T>(key: string, ttlMs: number) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachePayload<T>;
    if (!parsed?.storedAt || !parsed?.payload) return null;
    if (Date.now() - parsed.storedAt > ttlMs) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, payload: T) {
  if (typeof window === "undefined") return;
  const value: CachePayload<T> = { storedAt: Date.now(), payload };
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function fetchWithCache<T>(url: string, cacheKey: string, ttlMs: number) {
  const cached = readCache<T>(cacheKey, ttlMs);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const payload = (await res.json()) as T;
    writeCache(cacheKey, payload);
    return { payload, fromCache: false };
  } catch {
    if (cached) {
      return { payload: cached, fromCache: true };
    }
    throw new Error("FETCH_FAILED");
  }
}

function statusColor(status: string | undefined) {
  switch (String(status || "").toLowerCase()) {
    case "legal":
      return "#3AAE6B";
    case "decriminalized":
      return "#E4B94A";
    case "illegal":
      return "#D05C5C";
    case "limited":
      return "#4E7BE6";
    default:
      return "#9B9B9B";
  }
}

function resolvePrimaryStatus(legal: string | undefined, medical: string | undefined) {
  const legalText = String(legal || "").toLowerCase();
  if (legalText === "legal") return "Legal";
  if (legalText === "decriminalized") return "Decriminalized";
  if (legalText === "illegal") return "Illegal";
  const medicalText = String(medical || "").toLowerCase();
  if (medicalText === "legal" || medicalText === "limited") return "Limited";
  return "Unknown";
}

function mapHashToView(hash: string) {
  const match = hash.match(/map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { zoom: Number(match[1]), lat: Number(match[2]), lng: Number(match[3]) };
}

export default function LeafletMap() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<LeafletMapInstance | null>(null);
  const layersRef = useRef<{ regions?: LeafletLayer; states?: LeafletLayer; retailers?: LeafletLayer; heat?: LeafletLayer }>({});
  const [offline, setOffline] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string>("");
  const [regionOptions, setRegionOptions] = useState<Array<{ id: string; name: string; lat: number; lng: number }>>(
    []
  );
  const [geojsonData, setGeojsonData] = useState<GeoJsonPayload | null>(null);
  const [stateGeojsonData, setStateGeojsonData] = useState<GeoJsonPayload | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({
    recreational: true,
    medical: true,
    decrim: true,
    illegal: true,
    unknown: true
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const baseView = useMemo(() => ({ lat: 20, lng: 0, zoom: 2 }), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setOffline(!navigator.onLine);
    handler();
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!mapRef.current || mapInstance.current) return;
    const leaflet = (window as Window & { L?: LeafletModule }).L;
    if (!leaflet) return;
    const L: LeafletModule = leaflet;

    const hashView = mapHashToView(window.location.hash);
    const startView = hashView ?? baseView;
    const map = L.map(mapRef.current, {
      zoomControl: true,
      worldCopyJump: true
    }).setView([startView.lat, startView.lng], startView.zoom);

    // @ts-expect-error Leaflet globals are injected at runtime.
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    map.on("moveend", () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      window.location.hash = `map=${zoom}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`;
    });

    mapInstance.current = map;
    const layerGroup = L.layerGroup;
    if (!layerGroup) return;
    // @ts-expect-error Leaflet globals are injected at runtime.
    const regions = layerGroup().addTo(map);
    // @ts-expect-error Leaflet globals are injected at runtime.
    const states = layerGroup().addTo(map);
    // @ts-expect-error Leaflet globals are injected at runtime.
    const retailers = layerGroup().addTo(map);
    const heat = layerGroup();
    layersRef.current = { regions, states, retailers, heat };

    const overlays: Record<string, LeafletLayer> = {};
    if (layersRef.current.regions) overlays.Regions = layersRef.current.regions;
    if (layersRef.current.states) overlays.States = layersRef.current.states;
    if (layersRef.current.retailers) overlays.Retailers = layersRef.current.retailers;
    if (layersRef.current.heat) overlays["Heat (demo)"] = layersRef.current.heat;
    // @ts-expect-error Leaflet globals are injected at runtime.
    L.control.layers({}, overlays, { collapsed: false }).addTo(map);
  }, [baseView]);

  useEffect(() => {
    const map = mapInstance.current;
    const L = typeof window !== "undefined" ? (window as Window & { L?: LeafletModule }).L : null;
    if (!map || !L) return;

    const loadRegions = async () => {
      const result = await fetchWithCache<GeoJsonPayload>(
        "/api/v1/map/geojson?type=countries",
        "ilc_geojson_countries_v1",
        GEOJSON_TTL_MS
      );
      if (result.fromCache) setCacheNotice("Using cached map data.");
      const geojson = result.payload;
      setGeojsonData(geojson);
    };

    const loadStates = async () => {
      const result = await fetchWithCache<GeoJsonPayload>(
        "/api/v1/map/geojson?type=states",
        "ilc_geojson_states_v1",
        GEOJSON_TTL_MS
      );
      if (result.fromCache) setCacheNotice((prev) => prev || "Using cached map data.");
      setStateGeojsonData(result.payload);
    };

    const loadRetailers = async () => {
      const result = await fetchWithCache<RetailerResponse>(
        "/api/v1/map/retailers",
        "ilc_retailers_v1",
        RETAILER_TTL_MS
      );
      if (result.fromCache) setCacheNotice((prev) => prev || "Using cached retailer data.");
      const list = result.payload.retailers;
      const cluster = typeof L.markerClusterGroup === "function" ? L.markerClusterGroup() : L.layerGroup();
      list.forEach((store) => {
        const marker = L.marker([store.lat, store.lng]);
        marker.bindPopup?.(
          `<div class="${styles.popup}"><strong>${store.name}</strong><div>${store.type ?? "Retailer"}</div><div>${store.license ?? ""}</div><div>${store.updatedAt ?? ""}</div></div>`
        );
        cluster.addLayer(marker);
      });
      layersRef.current.retailers?.clearLayers?.();
      layersRef.current.retailers?.addLayer?.(cluster);
    };

    const loadHeat = async () => {
      const result = await fetchWithCache<RegionResponse>(
        "/api/v1/map/regions",
        "ilc_regions_v1",
        REGION_TTL_MS
      );
      const list = result.payload.regions;
      setRegionOptions(
        list
          .filter((entry) => entry.coordinates)
          .map((entry) => ({
            id: entry.geo,
            name: entry.name || entry.geo,
            lat: entry.coordinates!.lat,
            lng: entry.coordinates!.lng
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      const points = list.filter((entry) => entry.coordinates);
      const group = L.layerGroup();
      points.forEach((entry) => {
        const color = statusColor(resolvePrimaryStatus(entry.legalStatusGlobal, entry.medicalStatusGlobal));
        const marker = L.circle([entry.coordinates!.lat, entry.coordinates!.lng], {
          radius: 200000,
          color,
          weight: 0,
          fillColor: color,
          fillOpacity: 0.2
        });
        group.addLayer(marker);
      });
      layersRef.current.heat?.clearLayers?.();
      layersRef.current.heat?.addLayer?.(group);
    };

    loadRegions().catch(() => setCacheNotice("Map data unavailable."));
    loadStates().catch(() => setCacheNotice("State map data unavailable."));
    loadRetailers().catch(() => setCacheNotice("Retailer data unavailable."));
    loadHeat().catch(() => undefined);
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const L = typeof window !== "undefined" ? (window as Window & { L?: LeafletModule }).L : null;
    if (!map || !L || !geojsonData) return;
    const categoryFor = (feature: RegionFeature) => {
      const legal = String(feature.properties.legalStatusGlobal || "").toLowerCase();
      const medical = String(feature.properties.medicalStatusGlobal || "").toLowerCase();
      if (legal === "legal") return "recreational";
      if (legal === "decriminalized") return "decrim";
      if (legal === "illegal") return "illegal";
      if (["legal", "limited"].includes(medical)) return "medical";
      return "unknown";
    };
    const styleFor = (feature: RegionFeature) => {
      const status = resolvePrimaryStatus(
        feature.properties.legalStatusGlobal,
        feature.properties.medicalStatusGlobal
      );
      const color = statusColor(status);
      return {
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.45
      };
    };
    const layer = L.geoJSON(geojsonData, {
      filter: (feature: RegionFeature) => {
        const category = categoryFor(feature);
        return Boolean(activeFilters[category]);
      },
      style: styleFor,
      pointToLayer: (feature: RegionFeature, latlng: unknown) => {
        const color = statusColor(
          resolvePrimaryStatus(feature.properties.legalStatusGlobal, feature.properties.medicalStatusGlobal)
        );
        return L.circleMarker(latlng, {
          radius: 6,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.75
        });
      },
      onEachFeature: (feature: RegionFeature, layerItem: LeafletLayer) => {
        const props = feature.properties;
        const label = props.name || props.geo;
        const legal = props.legalStatusGlobal || "Unknown";
        const medical = props.medicalStatusGlobal || "Unknown";
        const updated = props.updatedAt ? `Updated: ${props.updatedAt}` : "";
        const notes = props.notes ? `<div class="${styles.popupNotes}">${props.notes}</div>` : "";
        layerItem.bindPopup?.(
          `<div class="${styles.popup}"><strong>${label}</strong><div>Recreational: ${legal}</div><div>Medical: ${medical}</div>${notes}<div>${updated}</div></div>`
        );
      }
    });
    layersRef.current.regions?.clearLayers?.();
    layersRef.current.regions?.addLayer?.(layer);
  }, [geojsonData, activeFilters]);

  useEffect(() => {
    const map = mapInstance.current;
    const L = typeof window !== "undefined" ? (window as Window & { L?: LeafletModule }).L : null;
    if (!map || !L || !stateGeojsonData) return;
    const categoryFor = (feature: RegionFeature) => {
      const legal = String(feature.properties.legalStatusGlobal || "").toLowerCase();
      const medical = String(feature.properties.medicalStatusGlobal || "").toLowerCase();
      if (legal === "legal") return "recreational";
      if (legal === "decriminalized") return "decrim";
      if (legal === "illegal") return "illegal";
      if (["legal", "limited"].includes(medical)) return "medical";
      return "unknown";
    };
    const styleFor = (feature: RegionFeature) => {
      const status = resolvePrimaryStatus(
        feature.properties.legalStatusGlobal,
        feature.properties.medicalStatusGlobal
      );
      const color = statusColor(status);
      return {
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.45
      };
    };
    const layer = L.geoJSON(stateGeojsonData, {
      filter: (feature: RegionFeature) => {
        const category = categoryFor(feature);
        return Boolean(activeFilters[category]);
      },
      style: styleFor,
      pointToLayer: (feature: RegionFeature, latlng: unknown) => {
        const color = statusColor(
          resolvePrimaryStatus(feature.properties.legalStatusGlobal, feature.properties.medicalStatusGlobal)
        );
        return L.circleMarker(latlng, {
          radius: 5,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.75
        });
      },
      onEachFeature: (feature: RegionFeature, layerItem: LeafletLayer) => {
        const props = feature.properties;
        const label = props.name || props.geo;
        const legal = props.legalStatusGlobal || "Unknown";
        const medical = props.medicalStatusGlobal || "Unknown";
        layerItem.bindPopup?.(
          `<div class="${styles.popup}"><strong>${label}</strong><div>Recreational: ${legal}</div><div>Medical: ${medical}</div></div>`
        );
      }
    });
    layersRef.current.states?.clearLayers?.();
    layersRef.current.states?.addLayer?.(layer);
  }, [stateGeojsonData, activeFilters]);

  const handleSearch = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const targetId = event.target.value;
    const item = regionOptions.find((entry) => entry.id === targetId);
    if (!item || !mapInstance.current) return;
    mapInstance.current.setView([item.lat, item.lng], 5, { animate: true });
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    setTimeout(() => mapInstance.current?.invalidateSize(), 150);
  };

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section className={`${styles.mapWrap} ${isFullscreen ? styles.fullscreen : ""}`}>
      <header className={styles.mapHeader}>
        <div>
          <h2>Global Cannabis Map</h2>
          <p>Toggle layers, explore legality, and inspect verified sources.</p>
        </div>
        <div className={styles.mapActions}>
          <label className={styles.search}>
            <span>Jump to</span>
            <select onChange={handleSearch} defaultValue="">
              <option value="" disabled>
                Choose a region
              </option>
              {regionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.filterGroup}>
            <label>
              <input type="checkbox" checked={activeFilters.recreational} onChange={() => toggleFilter("recreational")} />
              Recreational
            </label>
            <label>
              <input type="checkbox" checked={activeFilters.medical} onChange={() => toggleFilter("medical")} />
              Medical
            </label>
            <label>
              <input type="checkbox" checked={activeFilters.decrim} onChange={() => toggleFilter("decrim")} />
              Decrim
            </label>
            <label>
              <input type="checkbox" checked={activeFilters.illegal} onChange={() => toggleFilter("illegal")} />
              Illegal
            </label>
            <label>
              <input type="checkbox" checked={activeFilters.unknown} onChange={() => toggleFilter("unknown")} />
              Unknown
            </label>
          </div>
          <button type="button" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </header>
      <div className={styles.legend}>
        <span><i className={styles.legal} />Legal</span>
        <span><i className={styles.medical} />Medical/Limited</span>
        <span><i className={styles.decrim} />Decriminalized</span>
        <span><i className={styles.illegal} />Illegal</span>
        <span><i className={styles.unknown} />Unknown</span>
        <span className={styles.status}>{offline ? "Offline" : "Online"}</span>
        {cacheNotice ? <span className={styles.cache}>{cacheNotice}</span> : null}
      </div>
      <div ref={mapRef} className={styles.map} />
    </section>
  );
}

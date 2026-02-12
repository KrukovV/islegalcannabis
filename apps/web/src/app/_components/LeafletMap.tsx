"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./LeafletMap.module.css";
import { SSOTStatusText, statusColorKey, statusLabelRu, statusTruthBadge, type TruthLevel } from "@/lib/statusUi";
import { explainSSOT } from "@/lib/ssotExplain";

type LeafletLayer = {
  addTo?: (_map: LeafletMapInstance) => LeafletLayer;
  addLayer?: (_layer: LeafletLayer | LeafletLayerGroup) => LeafletLayer;
  clearLayers?: () => void;
  bindPopup?: (_html: string) => void;
  on?: (_event: string, _handler: () => void) => void;
};

type LeafletLayerGroup = LeafletLayer & {
  addLayer: (_layer: LeafletLayer) => LeafletLayerGroup;
  clearLayers: () => void;
};

type LeafletMapInstance = {
  setView: (_coords: [number, number], _zoom: number, _options?: { animate?: boolean }) => LeafletMapInstance;
  on: (_event: string, _handler: () => void) => void;
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  invalidateSize: () => void;
  attributionControl?: { setPrefix: (_value: boolean) => void; setPosition: (_pos: string) => void };
};

type LeafletModule = {
  map: (_node: HTMLElement, _options: { zoomControl: boolean; worldCopyJump: boolean; attributionControl?: boolean }) => LeafletMapInstance;
  tileLayer: (_url: string, _options: { attribution: string }) => LeafletLayer;
  gridLayer?: (_options: { attribution?: string; tileSize?: number; opacity?: number }) => LeafletLayer;
  layerGroup: () => LeafletLayerGroup;
  control: {
    layers: (_base: Record<string, LeafletLayer>, _overlays: Record<string, LeafletLayer>, _options: { collapsed: boolean }) => LeafletLayer;
  };
  geoJSON: (_data: GeoJsonPayload, _options: Record<string, unknown>) => LeafletLayer;
  circleMarker: (_latlng: unknown, _options: Record<string, unknown>) => LeafletLayer;
  marker: (_coords: [number, number]) => LeafletLayer;
  circle: (_coords: [number, number], _options: Record<string, unknown>) => LeafletLayer;
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
    officialOverrideRec?: string | null;
    officialOverrideMed?: string | null;
    hasOfficialOverride?: boolean;
    recEffective?: string;
    medEffective?: string;
    recDerived?: string;
    medDerived?: string;
    truthLevel?: TruthLevel;
    officialLinksCount?: number;
    reasons?: string[];
    wikiPage?: string | null;
    sources?: string[];
    notesOur?: string | null;
    notesWiki?: string | null;
    updatedAt?: string;
  };
};

export type GeoJsonPayload = {
  type: "FeatureCollection";
  features: RegionFeature[];
};

type MapProps = {
  geojsonData: GeoJsonPayload;
  stateGeojsonData: GeoJsonPayload;
  regionOptions: Array<{ id: string; name: string; lat: number; lng: number }>;
  statusIndex: Record<string, {
    geo: string;
    name?: string;
    recEffective?: string;
    medEffective?: string;
    recDerived?: string;
    medDerived?: string;
    truthLevel?: TruthLevel;
    officialOverride?: boolean;
    officialLinksCount?: number;
    reasons?: string[];
    wikiPage?: string | null;
    sources?: string[];
  }>;
  mapMode: "CI" | "DEV";
  dataSource: string;
  dataOk: boolean;
};

function mapColorKeyToHex(key: "green" | "yellow" | "red" | "gray") {
  if (key === "green") return "#3AAE6B";
  if (key === "yellow") return "#E4B94A";
  if (key === "red") return "#D05C5C";
  return "#9B9B9B";
}

function primaryEffectiveStatus(legal: string | undefined, medical: string | undefined) {
  const legalText = String(legal || "");
  if (legalText && legalText !== "Unknown") return legalText;
  const medicalText = String(medical || "");
  if (medicalText === "Legal" || medicalText === "Limited") return "Limited";
  return "Unknown";
}

function statusFillColor(truthLevel: TruthLevel, legal: string | undefined, medical: string | undefined) {
  const primary = primaryEffectiveStatus(legal, medical);
  const key = statusColorKey(truthLevel, primary);
  return mapColorKeyToHex(key);
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildWikiLink(title: string) {
  const slug = encodeURIComponent(title.trim().replace(/\s+/g, "_"));
  return `https://en.wikipedia.org/wiki/${slug}`;
}

function linkifyUrls(text: string) {
  const safe = escapeHtml(text);
  const re = /(https?:\/\/[^\s<>"')\]]+)/g;
  const parts = safe.split(re);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        return `<a class="${styles.mapLink}" href="${part}" target="_blank" rel="noreferrer noopener">${part}</a>`;
      }
      return part;
    })
    .join("");
}

function renderNoteLinks(raw: string | null | undefined) {
  const text = String(raw || "");
  if (!text) return "";
  const lead = text.match(/^\s*/) ? text.match(/^\s*/)![0] : "";
  const trimmed = text.slice(lead.length);
  const prefixMatch = trimmed.match(/^Main articles?:\s*/i);
  if (!prefixMatch) {
    return linkifyUrls(text);
  }
  const rest = trimmed.slice(prefixMatch[0].length);
  const dotIndex = rest.indexOf(".");
  const newlineIndex = rest.search(/\r?\n/);
  const marker = rest.match(
    /\s+(?=(Production|Prohibited|Illegal|Decriminal|Legal|Allowed|Permitted|Medical|Enforced|Banned|Cultivation|Possession)\b)/i
  );
  const markerIndex = marker && marker.index !== undefined ? marker.index : -1;
  const cutCandidates = [dotIndex, newlineIndex, markerIndex].filter((i) => i !== -1);
  const cutIndex = cutCandidates.length ? Math.min(...cutCandidates) : -1;
  const articlePart = cutIndex !== -1 ? rest.slice(0, cutIndex).trim() : rest.trim();
  const tail = cutIndex !== -1 ? rest.slice(cutIndex) : "";
  if (!articlePart) return linkifyUrls(text);
  const hasAnd = /\s+and\s+/i.test(articlePart);
  const titles = articlePart
    .split(/\s+and\s+|,/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const links = titles.map((title, idx) => {
    const sep = idx === 0 ? "" : hasAnd && idx === titles.length - 1 ? " and " : ", ";
    const href = buildWikiLink(title);
    return `${sep}<a class="${styles.mapLink}" href="${href}" target="_blank" rel="noreferrer noopener">${escapeHtml(title)}</a>`;
  });
  return `${escapeHtml(lead)}${escapeHtml(prefixMatch[0])}${links.join("")}${linkifyUrls(tail)}`;
}

function mapHashToView(hash: string) {
  const match = hash.match(/map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { zoom: Number(match[1]), lat: Number(match[2]), lng: Number(match[3]) };
}

async function fetchGeoLoc() {
  try {
    const res = await fetch("/api/geo/loc", { cache: "no-store" });
    if (!res.ok) return { geo: "-" };
    const json = await res.json();
    const iso = String(json?.iso || "-").toUpperCase();
    const region = String(json?.region || "-").toUpperCase();
    const geo = iso && region && region !== "-" ? `${iso}-${region}` : iso;
    return { geo };
  } catch {
    return { geo: "-" };
  }
}

export default function LeafletMap({
  geojsonData,
  stateGeojsonData,
  regionOptions,
  statusIndex,
  mapMode: _mapMode,
  dataSource: _dataSource,
  dataOk
}: MapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<LeafletMapInstance | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const layersRef = useRef<{ regions?: LeafletLayer; states?: LeafletLayer }>({});
  const geoMarkerRef = useRef<LeafletLayer | null>(null);
  const mapLogRef = useRef<{ rendered?: boolean; missing?: boolean }>({});
  const [offline, setOffline] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({
    recreational: true,
    medical: true,
    decrim: true,
    illegal: true,
    unenforced: true,
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

  void _mapMode;
  const mapTiles = _dataSource.includes("TILES_OFFLINE") ? "OFFLINE" : "NETWORK";
  const legendColor = (status: string) =>
    mapColorKeyToHex(statusColorKey("OFFICIAL", status));

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!mapRef.current || mapInstance.current) return;
    if (!dataOk) return;
    const leaflet = (window as Window & { L?: LeafletModule }).L;
    if (!leaflet) {
      if (!mapLogRef.current.missing) {
        mapLogRef.current.missing = true;
        console.warn("MAP_LEAFLET_GLOBAL_MISSING=1");
        console.warn("MAP_RENDERED=NO MAP_DATA_SOURCE=SSOT_ONLY");
      }
      return;
    }
    const L: LeafletModule = leaflet;
    leafletRef.current = L;
    if (!mapLogRef.current.rendered) {
      mapLogRef.current.rendered = true;
      console.warn("MAP_LEAFLET_GLOBAL_MISSING=0");
      console.warn("MAP_RENDERED=YES MAP_DATA_SOURCE=SSOT_ONLY");
    }

    const hashView = mapHashToView(window.location.hash);
    const startView = hashView ?? baseView;
    const map = L.map(mapRef.current as HTMLElement, {
      zoomControl: true,
      worldCopyJump: true,
      attributionControl: true
    }).setView([startView.lat, startView.lng], startView.zoom);
    map.attributionControl?.setPrefix(false);
    map.attributionControl?.setPosition("bottomright");

    if (mapTiles === "NETWORK") {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);
    } else if (typeof L.gridLayer === "function") {
      const grid = L.gridLayer({ opacity: 0.15 });
      // @ts-expect-error Leaflet grid layer supports createTile at runtime.
      grid.createTile = () => {
        const tile = document.createElement("div");
        tile.style.border = "1px solid rgba(80, 90, 90, 0.3)";
        tile.style.boxSizing = "border-box";
        return tile;
      };
      grid.addTo(map);
    }

    map.on("moveend", () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      window.location.hash = `map=${zoom}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`;
    });

      mapInstance.current = map;
    const layerGroup = L.layerGroup;
    if (!layerGroup) return;
    const regions = layerGroup().addTo(map);
    const states = layerGroup().addTo(map);
      layersRef.current = { regions, states };

    const overlays: Record<string, LeafletLayer> = {};
    if (layersRef.current.regions) overlays.Regions = layersRef.current.regions;
    if (layersRef.current.states) overlays.States = layersRef.current.states;
    L.control.layers({}, overlays, { collapsed: false }).addTo(map);
  }, [baseView, dataOk, mapTiles]);

  useEffect(() => {
    const map = mapInstance.current;
    const L = leafletRef.current;
    if (!map || !L || !geojsonData) return;
    const resolveEffective = (props: RegionFeature["properties"], fallback?: typeof statusIndex[string]) => {
      const derivedRec =
        props.recDerived || fallback?.recDerived || props.recEffective || fallback?.recEffective || "Unknown";
      const derivedMed =
        props.medDerived || fallback?.medDerived || props.medEffective || fallback?.medEffective || "Unknown";
      const truthLevel = props.truthLevel || fallback?.truthLevel || "WIKI_ONLY";
      return { derivedRec, derivedMed, truthLevel };
    };
    const categoryFor = (feature: RegionFeature) => {
      const resolved = resolveEffective(feature.properties, statusIndex[feature.properties.geo]);
      const legal = String(resolved.derivedRec || "").toLowerCase();
      const medical = String(resolved.derivedMed || "").toLowerCase();
      if (legal === "legal") return "recreational";
      if (legal === "decriminalized") return "decrim";
      if (legal === "illegal") return "illegal";
      if (legal === "unenforced") return "unenforced";
      if (["legal", "limited"].includes(medical)) return "medical";
      return "unknown";
    };
    const styleFor = (feature: RegionFeature) => {
      const resolved = resolveEffective(feature.properties, statusIndex[feature.properties.geo]);
      const color = statusFillColor(
        resolved.truthLevel || "WIKI_ONLY",
        resolved.derivedRec,
        resolved.derivedMed
      );
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
        const resolved = resolveEffective(feature.properties, statusIndex[feature.properties.geo]);
        const color = statusFillColor(
          resolved.truthLevel || "WIKI_ONLY",
          resolved.derivedRec,
          resolved.derivedMed
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
        const statusFallback = statusIndex[props.geo] || {};
        const label = escapeHtml(props.name || props.geo || "");
        const resolved = resolveEffective(props, statusFallback);
        const derivedRec = resolved.derivedRec || "Unknown";
        const derivedMed = resolved.derivedMed || "Unknown";
        const truthLevel = resolved.truthLevel || "WIKI_ONLY";
        SSOTStatusText({
          truthLevel,
          recEffective: derivedRec,
          medEffective: derivedMed
        });
        const overrideRec = props.officialOverrideRec || null;
        const overrideMed = props.officialOverrideMed || null;
        const wikiPage = props.wikiPage || statusFallback.wikiPage || "";
        const wikiLink = wikiPage
          ? `<div>Wiki Page: <a class="${styles.mapLink}" href="${escapeHtml(
              wikiPage
            )}" target="_blank" rel="noreferrer noopener">${escapeHtml(wikiPage)}</a></div>`
          : `<div>Wiki Page: -</div>`;
        const officialCount = typeof props.officialLinksCount === "number"
          ? props.officialLinksCount
          : statusFallback.officialLinksCount || 0;
        const explain = explainSSOT({
          truthLevel,
          officialLinksCount: officialCount,
          recEffective: derivedRec,
          medEffective: derivedMed,
          reasons
        });
        const officialBadge = officialCount > 0 ? `YES (${officialCount})` : "NO";
        const notesOurText = props.notesOur || statusFallback.notesOur || "";
        const notesWikiText = props.notesWiki || statusFallback.notesWiki || "";
        const notesOur = notesOurText
          ? `<div class="${styles.popupNotes}"><strong>Notes (SSOT):</strong> ${renderNoteLinks(notesOurText)}</div>`
          : "";
        const notesWiki = notesWikiText
          ? `<div class="${styles.popupNotes}"><strong>Notes (Wiki):</strong> ${renderNoteLinks(notesWikiText)}</div>`
          : "";
        const dataMissing =
          String(derivedRec || "").toLowerCase() === "unknown" &&
          String(derivedMed || "").toLowerCase() === "unknown" &&
          !notesOur &&
          !notesWiki
            ? `<div class="${styles.popupNotes}"><strong>DATA_MISSING</strong></div>`
            : "";
        const updated = props.updatedAt ? `Updated: ${escapeHtml(props.updatedAt)}` : "";
        const reasons = Array.isArray(props.reasons) && props.reasons.length
          ? props.reasons
          : Array.isArray(statusFallback.reasons) && statusFallback.reasons.length
            ? statusFallback.reasons
            : [];
        const truthBadge = statusTruthBadge(truthLevel);
        const sourceLine = `<div>SSOT truth level: ${escapeHtml(
          String(truthLevel)
        )} ${escapeHtml(truthBadge.icon)} ${escapeHtml(truthBadge.label)}</div>`;
        const reasonLine = `<div>Почему: ${escapeHtml(explain.whyText)}</div>`;
        const reliabilityLine = `<div>Уверенность: ${escapeHtml(explain.reliabilityText)}</div>`;
        const truthReasonsLine = reasons.length
          ? `<div>Truth reasons: ${escapeHtml(reasons.join(", "))}</div>`
          : `<div>Truth reasons: -</div>`;
        const overrideRecLine = overrideRec
          ? `<div>Rec (Official Override): ${escapeHtml(overrideRec)}</div>`
          : "";
        const overrideMedLine = overrideMed
          ? `<div>Med (Official Override): ${escapeHtml(overrideMed)}</div>`
          : "";
        layerItem.bindPopup?.(
          `<div class="${styles.popup}"><strong>${label}</strong>${sourceLine}${reliabilityLine}<div>Статус: ${escapeHtml(
            explain.recStatusShort
          )}</div><div>Статус (medical): ${escapeHtml(
            explain.medStatusShort
          )}</div>${reasonLine}${truthReasonsLine}${overrideRecLine}${overrideMedLine}${wikiLink}<div>Official: ${escapeHtml(
            officialBadge
          )}</div>${notesOur}${notesWiki}${dataMissing}<div>${updated}</div></div>`
        );
        if (wikiPage) {
          layerItem.on?.("click", () => {
            window.open(wikiPage, "_blank", "noopener");
          });
        }
      }
    });
    layersRef.current.regions?.clearLayers?.();
    layersRef.current.regions?.addLayer?.(layer);
  }, [geojsonData, activeFilters, statusIndex]);

  useEffect(() => {
    const map = mapInstance.current;
    const L = leafletRef.current;
    if (!map || !L || !stateGeojsonData) return;
    const resolveEffective = (props: RegionFeature["properties"], fallback?: typeof statusIndex[string]) => {
      const derivedRec =
        props.recDerived || fallback?.recDerived || props.recEffective || fallback?.recEffective || "Unknown";
      const derivedMed =
        props.medDerived || fallback?.medDerived || props.medEffective || fallback?.medEffective || "Unknown";
      const truthLevel = props.truthLevel || fallback?.truthLevel || "WIKI_ONLY";
      return { derivedRec, derivedMed, truthLevel };
    };
    const categoryFor = (feature: RegionFeature) => {
      const resolved = resolveEffective(feature.properties, statusIndex[feature.properties.geo]);
      const legal = String(resolved.derivedRec || "").toLowerCase();
      const medical = String(resolved.derivedMed || "").toLowerCase();
      if (legal === "legal") return "recreational";
      if (legal === "decriminalized") return "decrim";
      if (legal === "illegal") return "illegal";
      if (legal === "unenforced") return "unenforced";
      if (["legal", "limited"].includes(medical)) return "medical";
      return "unknown";
    };
    const styleFor = (feature: RegionFeature) => {
      const resolved = resolveEffective(feature.properties, statusIndex[feature.properties.geo]);
      const color = statusFillColor(
        resolved.truthLevel || "WIKI_ONLY",
        resolved.derivedRec,
        resolved.derivedMed
      );
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
        const resolved = resolveEffective(feature.properties, statusIndex[feature.properties.geo]);
        const color = statusFillColor(
          resolved.truthLevel || "WIKI_ONLY",
          resolved.derivedRec,
          resolved.derivedMed
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
        const resolved = resolveEffective(props, statusIndex[props.geo]);
        const legal = resolved.derivedRec || "Unknown";
        const medical = resolved.derivedMed || "Unknown";
        const truthLevel = resolved.truthLevel || "WIKI_ONLY";
        const ssotText = SSOTStatusText({
          truthLevel,
          recEffective: legal,
          medEffective: medical
        });
        const overrideRec = props.officialOverrideRec || null;
        const overrideMed = props.officialOverrideMed || null;
        const reasonText = Array.isArray(props.reasons) && props.reasons.length
          ? props.reasons.join(", ")
          : "-";
        const reasonLine = `<div>Truth reasons: ${escapeHtml(reasonText)}</div>`;
        const overrideRecLine = overrideRec
          ? `<div>Rec (Official Override): ${escapeHtml(overrideRec)}</div>`
          : "";
        const overrideMedLine = overrideMed
          ? `<div>Med (Official Override): ${escapeHtml(overrideMed)}</div>`
          : "";
        const truthBadge = statusTruthBadge(truthLevel);
        layerItem.bindPopup?.(
          `<div class="${styles.popup}"><strong>${label}</strong><div>SSOT truth level: ${escapeHtml(
            String(truthLevel)
          )} ${escapeHtml(truthBadge.icon)} ${escapeHtml(truthBadge.label)}</div><div>${escapeHtml(
            ssotText.recText
          )}</div><div>${escapeHtml(
            ssotText.medText
          )}</div>${reasonLine}${overrideRecLine}${overrideMedLine}</div>`
        );
      }
    });
    layersRef.current.states?.clearLayers?.();
    layersRef.current.states?.addLayer?.(layer);
  }, [stateGeojsonData, activeFilters, statusIndex]);

  useEffect(() => {
    const map = mapInstance.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    fetchGeoLoc().then((loc) => {
      const geo = loc.geo;
      const target = regionOptions.find((entry) => entry.id === geo);
      if (!target) return;
      if (geoMarkerRef.current?.addTo) {
        geoMarkerRef.current.addTo(map);
        return;
      }
      const marker = L.marker([target.lat, target.lng]);
      marker.bindPopup?.(
        `<div class="${styles.popup}"><strong>You are here</strong><div>${target.name}</div></div>`
      );
      geoMarkerRef.current = marker.addTo(map);
    });
  }, [regionOptions]);

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

  const cacheNotice = "";

  return (
    <section className={`${styles.mapWrap} ${isFullscreen ? styles.fullscreen : ""}`}>
      <header className={styles.mapHeader}>
        <div>
          <h2>Where am I right now?</h2>
          <p>Recreational + medical legality from cached SSOT data.</p>
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
              <input type="checkbox" checked={activeFilters.unenforced} onChange={() => toggleFilter("unenforced")} />
              Unenforced
            </label>
            <label>
              <input type="checkbox" checked={activeFilters.unknown} onChange={() => toggleFilter("unknown")} />
              {statusLabelRu("Unknown")}
            </label>
          </div>
          <button type="button" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </header>
      <div className={styles.legend}>
        <span><i style={{ backgroundColor: legendColor("Legal") }} />Legal</span>
        <span><i style={{ backgroundColor: legendColor("Limited") }} />Medical/Limited</span>
        <span><i style={{ backgroundColor: legendColor("Decrim") }} />Decriminalized</span>
        <span><i style={{ backgroundColor: legendColor("Illegal") }} />Illegal</span>
        <span><i style={{ backgroundColor: legendColor("Unenforced") }} />Unenforced</span>
        <span><i style={{ backgroundColor: legendColor("Unknown") }} />{statusLabelRu("Unknown")}</span>
        <span className={styles.status}>{offline ? "Offline" : "Online"}</span>
        {cacheNotice ? <span className={styles.cache}>{cacheNotice}</span> : null}
      </div>
      <div ref={mapRef} className={styles.map} data-testid="leaflet-map" />
    </section>
  );
}

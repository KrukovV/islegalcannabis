import maplibregl from "maplibre-gl";
import type { AdminBoundaryCollection, LegalCountryCollection, NewMapBootResult } from "./map.types";
export const NEW_MAP_ADMIN_SOURCE_ID = "admin-boundaries";
export const NEW_MAP_ADMIN_LAYER_ID = "admin-boundary-line";

export const NEW_MAP_SOURCE_ID = "legal-countries";
export const NEW_MAP_FILL_LAYER_ID = "legal-fill";
export const NEW_MAP_HOVER_LAYER_ID = "legal-hover";
const NEW_MAP_SUPPLEMENTAL_SEA_SOURCE_ID = "new-map-supplemental-seas";
const NEW_MAP_SUPPLEMENTAL_SEA_LAYER_ID = "new-map-supplemental-seas";

const BASEMAP_STYLE_URL = "/api/new-map/basemap-style?v=20260331-origin-header-same-origin";

const DEFAULT_CENTER: [number, number] = [25, 50];
const DEFAULT_ZOOM = 1.55;
const FLAT_CAMERA = {
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  bearing: 0,
  pitch: 0
} as const;
const CAMERA_EPSILON = 0.001;

function buildNativeTextField() {
  return ["coalesce", ["get", "name_en"], ["get", "name"]];
}

function buildCountryTextField() {
  return [
    "case",
    [
      "==",
      ["coalesce", ["get", "name_en"], ["get", "name"]],
      ["coalesce", ["get", "name"], ["get", "name_en"]]
    ],
    ["coalesce", ["get", "name_en"], ["get", "name"]],
    [
      "format",
      ["coalesce", ["get", "name_en"], ["get", "name"]],
      {},
      "\n",
      {},
      ["coalesce", ["get", "name"], ["get", "name_en"]],
      { "font-scale": 0.82 }
    ]
  ];
}

function findFirstSymbolLayerId(map: maplibregl.Map) {
  const layers = map.getStyle().layers || [];
  const symbolLayer = layers.find((layer) => layer.type === "symbol");
  return symbolLayer?.id;
}

function addSupplementalSeaLayer(map: maplibregl.Map) {
  if (map.getLayer(NEW_MAP_SUPPLEMENTAL_SEA_LAYER_ID)) return;
  map.addSource(NEW_MAP_SUPPLEMENTAL_SEA_SOURCE_ID, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Black Sea" },
          geometry: { type: "Point", coordinates: [34.9, 43.35] }
        }
      ]
    }
  });
  map.addLayer(
    {
      id: NEW_MAP_SUPPLEMENTAL_SEA_LAYER_ID,
      type: "symbol",
      source: NEW_MAP_SUPPLEMENTAL_SEA_SOURCE_ID,
      minzoom: 1.5,
      maxzoom: 24,
      layout: {
        "text-field": ["get", "name"],
        "symbol-placement": "point",
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1.5,
          9,
          3,
          11,
          5,
          12.5,
          7,
          13.5
        ],
        "text-font": [
          "Montserrat Medium Italic",
          "Open Sans Italic",
          "Noto Sans Regular",
          "HanWangHeiLight Regular",
          "NanumBarunGothic Regular"
        ],
        "text-line-height": 1.2,
        "text-padding": 2,
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-pitch-alignment": "auto",
        "text-rotation-alignment": "auto",
        "text-max-width": 6,
        "text-letter-spacing": 0.1
      },
      paint: {
        "text-color": "#4a4a4a",
        "text-halo-color": "rgba(255,255,255,0.95)",
        "text-halo-width": 1.55,
        "text-halo-blur": 0,
        "text-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1.5,
          0.72,
          3.0,
          0.9,
          5.0,
          1,
          6.5,
          0.94,
          7.5,
          0.88,
          10,
          0.82
        ]
      }
    },
    "place_country_1"
  );
}

function findLabelGroups(map: maplibregl.Map) {
  const layers = map.getStyle().layers || [];
  return {
    marine: layers
      .filter((layer) => layer.type === "symbol" && /(watername|marine|ocean|sea)/i.test(layer.id))
      .map((layer) => layer.id),
    country: layers
      .filter((layer) => layer.type === "symbol" && /(country|admin_0|place_country)/i.test(layer.id))
      .map((layer) => layer.id),
    city: layers
      .filter((layer) => layer.type === "symbol" && /(place_city|place_town|place_villages|place_hamlet)/.test(layer.id))
      .map((layer) => layer.id),
    roads: layers.filter((layer) => layer.type === "symbol" && /roadname_/.test(layer.id)).map((layer) => layer.id)
  };
}

function tuneNativeBasemapLayers(map: maplibregl.Map) {
  const layers = map.getStyle().layers || [];
  const nativeTextField = buildNativeTextField();
  for (const layer of layers) {
    if (layer.type === "symbol") {
      if (/watername_ocean/i.test(layer.id)) {
        map.setLayerZoomRange(layer.id, 0, 24);
        map.setLayoutProperty(layer.id, "text-field", nativeTextField);
        map.setLayoutProperty(layer.id, "text-allow-overlap", false);
        map.setLayoutProperty(layer.id, "text-ignore-placement", false);
        map.setLayoutProperty(layer.id, "text-size", [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          14,
          2,
          18,
          4,
          22
        ]);
        map.setPaintProperty(layer.id, "text-opacity", [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.65,
          2,
          0.85,
          4,
          1
        ]);
        map.setPaintProperty(layer.id, "text-color", "#4a4a4a");
        map.setPaintProperty(layer.id, "text-halo-color", "rgba(255,255,255,0.95)");
        map.setPaintProperty(layer.id, "text-halo-width", 1.6);
      } else if (/(watername_sea|marine_label)/i.test(layer.id)) {
        map.setLayerZoomRange(layer.id, 1.5, 24);
        map.setLayoutProperty(layer.id, "text-field", nativeTextField);
        map.setLayoutProperty(layer.id, "text-allow-overlap", false);
        map.setLayoutProperty(layer.id, "text-ignore-placement", false);
        map.setLayoutProperty(layer.id, "text-size", [
          "interpolate",
          ["linear"],
          ["zoom"],
          1.5,
          10,
          3,
          12,
          5,
          14
        ]);
        map.setPaintProperty(layer.id, "text-opacity", [
          "interpolate",
          ["linear"],
          ["zoom"],
          1.5,
          0.6,
          3,
          0.85,
          5,
          1,
          6.5,
          0.85,
          7.5,
          0.65
        ]);
        map.setPaintProperty(layer.id, "text-color", "#4a4a4a");
        map.setPaintProperty(layer.id, "text-halo-color", "rgba(255,255,255,0.95)");
        map.setPaintProperty(layer.id, "text-halo-width", 1.4);
      } else if (/place_country_/i.test(layer.id)) {
        const minZoom = /place_country_1/.test(layer.id) ? 2.1 : 2.4;
        map.setLayerZoomRange(layer.id, minZoom, 24);
        map.setLayoutProperty(layer.id, "text-field", buildCountryTextField());
        map.setLayoutProperty(layer.id, "text-line-height", 1.05);
        map.setLayoutProperty(layer.id, "text-max-width", 9);
        map.setLayoutProperty(layer.id, "text-size", [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          12,
          3,
          14,
          4,
          16,
          5,
          18
        ]);
        map.setLayoutProperty(layer.id, "text-allow-overlap", false);
        map.setLayoutProperty(layer.id, "text-ignore-placement", false);
        map.setPaintProperty(layer.id, "text-opacity", [
          "interpolate",
          ["linear"],
          ["zoom"],
          minZoom,
          0.86,
          minZoom + 0.35,
          0.94,
          minZoom + 0.8,
          1
        ]);
        map.setPaintProperty(layer.id, "text-color", "#3a3a3a");
        map.setPaintProperty(layer.id, "text-halo-color", "rgba(255,255,255,0.95)");
        map.setPaintProperty(layer.id, "text-halo-width", 1.5);
      } else if (/place_state/i.test(layer.id)) {
        map.setLayerZoomRange(layer.id, 4.9, 24);
        map.setPaintProperty(layer.id, "text-opacity", 0.78);
      } else if (/place_city/i.test(layer.id)) {
        map.setLayerZoomRange(layer.id, 5.8, 24);
        map.setPaintProperty(layer.id, "text-opacity", 0.8);
      } else if (/(place_town|place_villages|place_hamlet|place_suburb)/i.test(layer.id)) {
        map.setLayerZoomRange(layer.id, 6.6, 24);
        map.setPaintProperty(layer.id, "text-opacity", 0.78);
      } else if (/place_continent/i.test(layer.id)) {
        map.setLayerZoomRange(layer.id, 0, 2.12);
      } 
      continue;
    }

    if (layer.type === "line" && /(boundary_state|boundary_country_inner|boundary_county)/i.test(layer.id)) {
      if (/boundary_state/i.test(layer.id)) {
        map.setLayerZoomRange(layer.id, 1, 24);
        map.setPaintProperty(layer.id, "line-color", "#7f8d9b");
        map.setPaintProperty(layer.id, "line-opacity", 0.4);
        map.setPaintProperty(layer.id, "line-width", [
          "interpolate",
          ["linear"],
          ["zoom"],
          1,
          0.55,
          4,
          0.75,
          8,
          1.05
        ]);
      } else if (/boundary_country_inner/i.test(layer.id)) {
        map.setPaintProperty(layer.id, "line-color", "#8d9aa8");
        map.setPaintProperty(layer.id, "line-opacity", 0.34);
      } else if (/boundary_county/i.test(layer.id)) {
        map.setPaintProperty(layer.id, "line-opacity", 0.22);
      }
    }
  }
}

export function createMap(
  container: HTMLElement,
  countries: LegalCountryCollection,
  adminBoundaries: AdminBoundaryCollection
): NewMapBootResult {
  let resolveReady = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE_URL,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    bearing: 0,
    pitch: 0,
    maxPitch: 0,
    minZoom: 1,
    maxZoom: 14,
    renderWorldCopies: true,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false
  });

  map.dragPan.enable();
  map.scrollZoom.enable();
  map.doubleClickZoom.enable();
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  const ensureFlatCamera = () => {
    const pitch = map.getPitch();
    const bearing = map.getBearing();
    if (Math.abs(pitch) > CAMERA_EPSILON || Math.abs(bearing) > CAMERA_EPSILON) {
      const center = map.getCenter();
      map.jumpTo({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        pitch: 0,
        bearing: 0
      });
    }
  };

  const onLoad = () => {
    map.jumpTo(FLAT_CAMERA);
    tuneNativeBasemapLayers(map);
    addSupplementalSeaLayer(map);
    const beforeId = findFirstSymbolLayerId(map);
    map.addSource(NEW_MAP_SOURCE_ID, {
      type: "geojson",
      data: countries,
      promoteId: "geo"
    });
    map.addSource(NEW_MAP_ADMIN_SOURCE_ID, {
      type: "geojson",
      data: adminBoundaries
    });

    map.addLayer({
      id: NEW_MAP_FILL_LAYER_ID,
      type: "fill",
      source: NEW_MAP_SOURCE_ID,
      paint: {
        "fill-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          ["to-color", ["get", "hoverColor"]],
          ["to-color", ["get", "legalColor"]]
        ],
        "fill-antialias": false,
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          ["get", "hoverOpacity"],
          ["get", "fillOpacity"]
        ]
      }
    }, beforeId);

    map.addLayer({
      id: NEW_MAP_ADMIN_LAYER_ID,
      type: "line",
      source: NEW_MAP_ADMIN_SOURCE_ID,
      minzoom: 1.2,
      paint: {
        "line-color": "#8896a4",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1.2,
          0.28,
          3,
          0.42,
          6,
          0.62,
          10,
          0.92
        ],
        "line-opacity": 0.34
      }
    }, beforeId);

    map.addLayer({
      id: NEW_MAP_HOVER_LAYER_ID,
      type: "fill",
      source: NEW_MAP_SOURCE_ID,
      paint: {
        "fill-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          ["to-color", ["get", "hoverColor"]],
          ["to-color", ["get", "legalColor"]]
        ],
        "fill-antialias": false,
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          ["get", "hoverOpacity"],
          0
        ],
        "fill-outline-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          "#314b6b",
          "rgba(0,0,0,0)"
        ]
      }
    }, beforeId);
    const labelGroups = findLabelGroups(map);
    const host = globalThis as typeof globalThis & {
      __NEW_MAP_DEBUG__?: Record<string, unknown>;
    };
    if (host.__NEW_MAP_DEBUG__) {
      host.__NEW_MAP_DEBUG__.labelGroups = labelGroups;
    }
    resolveReady();
  };

  map.on("load", onLoad);
  map.on("moveend", ensureFlatCamera);

  return {
    map,
    ready,
    destroy: () => {
      map.off("load", onLoad);
      map.off("moveend", ensureFlatCamera);
      if (map.getLayer(NEW_MAP_HOVER_LAYER_ID)) map.removeLayer(NEW_MAP_HOVER_LAYER_ID);
      if (map.getLayer(NEW_MAP_SUPPLEMENTAL_SEA_LAYER_ID)) map.removeLayer(NEW_MAP_SUPPLEMENTAL_SEA_LAYER_ID);
      if (map.getLayer(NEW_MAP_ADMIN_LAYER_ID)) map.removeLayer(NEW_MAP_ADMIN_LAYER_ID);
      if (map.getLayer(NEW_MAP_FILL_LAYER_ID)) map.removeLayer(NEW_MAP_FILL_LAYER_ID);
      if (map.getSource(NEW_MAP_SUPPLEMENTAL_SEA_SOURCE_ID)) map.removeSource(NEW_MAP_SUPPLEMENTAL_SEA_SOURCE_ID);
      if (map.getSource(NEW_MAP_ADMIN_SOURCE_ID)) map.removeSource(NEW_MAP_ADMIN_SOURCE_ID);
      if (map.getSource(NEW_MAP_SOURCE_ID)) map.removeSource(NEW_MAP_SOURCE_ID);
      map.remove();
    }
  };
}

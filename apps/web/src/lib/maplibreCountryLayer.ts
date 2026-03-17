import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  VectorSourceSpecification
} from "maplibre-gl";
import {
  MAP_GEOMETRY_SOURCE,
  MAP_VECTOR_TILE_SOURCE,
  MAP_VECTOR_TILE_SOURCE_LAYER
} from "@/config/mapConfig";
import { getPreparedChoroplethSource } from "@/lib/map/preparedCountrySources";
import { MAP_STATUS_COLOR_BY_KEY } from "@/lib/map/statusPalette";
import type { TruthLevel } from "@/lib/statusUi";
import type { MapPaintStatus } from "@/lib/truth/mapTruthDataset";

export const MAPLIBRE_CHOROPLETH_SOURCE_ID = "ilc-choropleth";
export const MAPLIBRE_CHOROPLETH_MASK_LAYER_ID = "ilc-choropleth-mask";
export const MAPLIBRE_CHOROPLETH_FILL_LAYER_ID = "ilc-choropleth-fill";
export const MAPLIBRE_CHOROPLETH_LINE_LAYER_ID = "ilc-choropleth-line";
export const MAPLIBRE_CHOROPLETH_MASK_POINT_LAYER_ID = "ilc-choropleth-mask-point";
export const MAPLIBRE_CHOROPLETH_POINT_LAYER_ID = "ilc-choropleth-point";
export const MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID = "ilc-choropleth-hover-line";
export const MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID = "ilc-choropleth-selected-line";
export const MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID = "ilc-state-choropleth";
export const MAPLIBRE_STATE_CHOROPLETH_FILL_LAYER_ID = "ilc-state-choropleth-fill";
export const MAPLIBRE_STATE_CHOROPLETH_LINE_LAYER_ID = "ilc-state-choropleth-line";
export const MAPLIBRE_STATE_CHOROPLETH_HOVER_LAYER_ID = "ilc-state-choropleth-hover-line";
export const MAPLIBRE_STATE_CHOROPLETH_SELECTED_LAYER_ID = "ilc-state-choropleth-selected-line";

type GeoJsonFeature = { type: "Feature"; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> };
type GeoJsonFeatureCollection = { type: "FeatureCollection"; features: GeoJsonFeature[] };

function getChoroplethSourceLayer() {
  if (MAP_GEOMETRY_SOURCE !== "vector") return {};
  return { "source-layer": MAP_VECTOR_TILE_SOURCE_LAYER } as const;
}

export function buildChoroplethFeatureCollection(
  geojsonData: GeoJsonFeatureCollection,
  statusIndex: Record<string, { recEffective?: string; truthLevel?: TruthLevel; mapPaintStatus?: MapPaintStatus }>
): FeatureCollection {
  const prepared = getPreparedChoroplethSource(geojsonData, statusIndex);
  const features = prepared.featureCollection.features as Array<Feature<Geometry, GeoJsonProperties>>;

  return {
    type: "FeatureCollection",
    features
  } satisfies FeatureCollection;
}

export function buildChoroplethSource(
  geojsonData: GeoJsonFeatureCollection,
  statusIndex: Record<string, { recEffective?: string; truthLevel?: TruthLevel; mapPaintStatus?: MapPaintStatus }>
): GeoJSONSourceSpecification | VectorSourceSpecification {
  if (MAP_GEOMETRY_SOURCE === "vector") {
    return {
      ...MAP_VECTOR_TILE_SOURCE
    };
  }

  const featureCollection = buildChoroplethFeatureCollection(geojsonData, statusIndex);
  return {
    type: "geojson",
    promoteId: "geo",
    buffer: 8,
    data: {
      ...featureCollection
    } satisfies FeatureCollection
  };
}

export function buildChoroplethLayers(): Array<FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification> {
  return [
    {
      id: MAPLIBRE_CHOROPLETH_MASK_LAYER_ID,
      type: "fill",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-antialias": true,
        "fill-color": ["coalesce", ["get", "fillColor"], MAP_STATUS_COLOR_BY_KEY.gray],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.26,
          2.349,
          0.26,
          2.35,
          ["case", ["==", ["get", "geo"], "US"], 0, 0.26]
        ]
      }
    },
    {
      id: MAPLIBRE_CHOROPLETH_FILL_LAYER_ID,
      type: "fill",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-antialias": true,
        "fill-color": ["coalesce", ["get", "fillColor"], MAP_STATUS_COLOR_BY_KEY.gray],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.4,
          2.349,
          0.4,
          2.35,
          ["case", ["==", ["get", "geo"], "US"], 0, 0.4]
        ]
      }
    },
    {
      id: MAPLIBRE_CHOROPLETH_LINE_LAYER_ID,
      type: "line",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": ["coalesce", ["get", "fillColor"], MAP_STATUS_COLOR_BY_KEY.gray],
        "line-width": 1.1,
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.88,
          2.349,
          0.88,
          2.35,
          ["case", ["==", ["get", "geo"], "US"], 0, 0.88]
        ]
      },
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    },
    {
      id: MAPLIBRE_CHOROPLETH_MASK_POINT_LAYER_ID,
      type: "circle",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": ["coalesce", ["get", "fillColor"], MAP_STATUS_COLOR_BY_KEY.gray],
        "circle-radius": 6,
        "circle-opacity": 0.22
      }
    },
    {
      id: MAPLIBRE_CHOROPLETH_POINT_LAYER_ID,
      type: "circle",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": ["coalesce", ["get", "fillColor"], MAP_STATUS_COLOR_BY_KEY.gray],
        "circle-stroke-color": "#f8fafc",
        "circle-stroke-width": 1,
        "circle-radius": 5,
        "circle-opacity": 0.9
      }
    }
  ];
}

export function buildStateChoroplethSource(
  geojsonData: GeoJsonFeatureCollection,
  statusIndex: Record<string, { recEffective?: string; truthLevel?: TruthLevel; mapPaintStatus?: MapPaintStatus }>
): GeoJSONSourceSpecification {
  const prepared = getPreparedChoroplethSource(geojsonData, statusIndex);
  const features = prepared.featureCollection.features as Array<Feature<Geometry, GeoJsonProperties>>;

  return {
    type: "geojson",
    promoteId: "geo",
    buffer: 8,
    data: {
      type: "FeatureCollection",
      features
    } satisfies FeatureCollection
  };
}

export function buildStateChoroplethLayers(): Array<FillLayerSpecification | LineLayerSpecification> {
  return [
    {
      id: MAPLIBRE_STATE_CHOROPLETH_FILL_LAYER_ID,
      type: "fill",
      source: MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID,
      minzoom: 2.35,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-antialias": true,
        "fill-color": ["coalesce", ["get", "fillColor"], MAP_STATUS_COLOR_BY_KEY.gray],
        "fill-opacity": 0.4
      }
    },
    {
      id: MAPLIBRE_STATE_CHOROPLETH_LINE_LAYER_ID,
      type: "line",
      source: MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID,
      minzoom: 2.35,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": ["coalesce", ["get", "fillColor"], MAP_STATUS_COLOR_BY_KEY.gray],
        "line-width": 0.95,
        "line-opacity": 0.82
      },
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    },
    {
      id: MAPLIBRE_STATE_CHOROPLETH_HOVER_LAYER_ID,
      type: "line",
      source: MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID,
      minzoom: 2.35,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "geo"], ""]],
      paint: {
        "line-color": "#475569",
        "line-width": 1.15,
        "line-opacity": 0.62
      },
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    },
    {
      id: MAPLIBRE_STATE_CHOROPLETH_SELECTED_LAYER_ID,
      type: "line",
      source: MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID,
      minzoom: 2.35,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "geo"], ""]],
      paint: {
        "line-color": "#334155",
        "line-width": 1.3,
        "line-opacity": 0.72
      },
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    }
  ];
}

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
  MAP_VECTOR_TILE_SOURCE_ID,
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
export const MAPLIBRE_CHOROPLETH_RENDER_STACK = [
  MAPLIBRE_CHOROPLETH_MASK_LAYER_ID,
  MAPLIBRE_CHOROPLETH_FILL_LAYER_ID,
  MAPLIBRE_CHOROPLETH_LINE_LAYER_ID,
  MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID
] as const;

type GeoJsonFeature = { type: "Feature"; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> };
type GeoJsonFeatureCollection = { type: "FeatureCollection"; features: GeoJsonFeature[] };

function getChoroplethSourceLayer() {
  if (MAP_GEOMETRY_SOURCE !== "vector") return {};
  return { "source-layer": MAP_VECTOR_TILE_SOURCE_LAYER } as const;
}

function isVectorGeometrySource() {
  return MAP_GEOMETRY_SOURCE === "vector";
}

function toSoftFillColor(color: string) {
  if (color === MAP_STATUS_COLOR_BY_KEY.green) return "rgba(123,207,159,0.48)";
  if (color === MAP_STATUS_COLOR_BY_KEY.yellow) return "rgba(244,200,120,0.48)";
  if (color === MAP_STATUS_COLOR_BY_KEY.red) return "rgba(238,154,148,0.48)";
  return "rgba(203,213,225,0.48)";
}

function getSoftFillColorExpression(): FillLayerSpecification["paint"]["fill-color"] {
  return [
    "match",
    ["coalesce", ["get", "fillColor"], MAP_STATUS_COLOR_BY_KEY.gray],
    MAP_STATUS_COLOR_BY_KEY.green,
    toSoftFillColor(MAP_STATUS_COLOR_BY_KEY.green),
    MAP_STATUS_COLOR_BY_KEY.yellow,
    toSoftFillColor(MAP_STATUS_COLOR_BY_KEY.yellow),
    MAP_STATUS_COLOR_BY_KEY.red,
    toSoftFillColor(MAP_STATUS_COLOR_BY_KEY.red),
    MAP_STATUS_COLOR_BY_KEY.gray,
    toSoftFillColor(MAP_STATUS_COLOR_BY_KEY.gray),
    toSoftFillColor(MAP_STATUS_COLOR_BY_KEY.gray)
  ];
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
  if (isVectorGeometrySource()) {
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
  const fillPaint: FillLayerSpecification["paint"] = {
    "fill-antialias": true,
    "fill-color": getSoftFillColorExpression(),
    "fill-opacity": 1,
    "fill-outline-color": "transparent"
  };

  const polygonMaskPaint: FillLayerSpecification["paint"] = {
    "fill-antialias": true,
    "fill-color": "#ffffff",
    "fill-opacity": 1
  };

  const polygonOutlinePaint: LineLayerSpecification["paint"] = {
    "line-color": "#c7d2dd",
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      0,
      0.55,
      2.35,
      0.7
    ],
    "line-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      0,
      0.52,
      2.35,
      0.7
    ]
  };

  const hoverOutlinePaint: LineLayerSpecification["paint"] = {
    "line-color": "#64748b",
    "line-width": 1.05,
    "line-opacity": 0.72
  };

  const selectedOutlinePaint: LineLayerSpecification["paint"] = {
    "line-color": "#334155",
    "line-width": 1.2,
    "line-opacity": 0.82
  };

  return [
    {
      id: MAPLIBRE_CHOROPLETH_MASK_LAYER_ID,
      type: "fill",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: polygonMaskPaint
    },
    {
      id: MAPLIBRE_CHOROPLETH_FILL_LAYER_ID,
      type: "fill",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: fillPaint
    },
    {
      id: MAPLIBRE_CHOROPLETH_LINE_LAYER_ID,
      type: "line",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: polygonOutlinePaint,
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    },
    {
      id: MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID,
      type: "line",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "geo"], ""]],
      paint: hoverOutlinePaint,
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    },
    {
      id: MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID,
      type: "line",
      source: MAPLIBRE_CHOROPLETH_SOURCE_ID,
      ...getChoroplethSourceLayer(),
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "geo"], ""]],
      paint: selectedOutlinePaint,
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

export function getGeometrySourceDiagnosticsConfig() {
  return {
    geometrySource: MAP_GEOMETRY_SOURCE,
    sourceId: isVectorGeometrySource() ? MAP_VECTOR_TILE_SOURCE_ID : MAPLIBRE_CHOROPLETH_SOURCE_ID,
    sourceLayer: isVectorGeometrySource() ? MAP_VECTOR_TILE_SOURCE_LAYER : null
  };
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

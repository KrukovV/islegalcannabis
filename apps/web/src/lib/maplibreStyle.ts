import type { StyleSpecification } from "maplibre-gl";

export const MAPLIBRE_BASE_STYLE_URL = "https://tiles.stadiamaps.com/styles/alidade_smooth.json";
export const MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS = ["place_country_other", "place_country_major"] as const;
export const MAPLIBRE_PROVIDER_DETAIL_LABEL_LAYER_IDS = [
  "place_other",
  "place_suburb",
  "place_village",
  "place_town",
  "place_city",
  "place_city_large",
  "place_capital_gen1",
  "place_capital_gen0",
  "place_state",
  ...MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS
] as const;
export const MAPLIBRE_PROVIDER_BASEMAP_LAND_LAYER_IDS = [
  "landcover_ice_shelf",
  "landcover_glacier",
  "landuse_residential",
  "landcover_wood",
  "landcover_park"
] as const;
export const MAPLIBRE_PROVIDER_BASEMAP_WATER_LAYER_IDS = ["water", "waterway"] as const;
export const MAPLIBRE_PROVIDER_BASEMAP_TERRAIN_LAYER_IDS = ["hillshade", "terrain", "relief"] as const;
const MAPLIBRE_PROVIDER_CITY_STYLE_SOURCE_LAYER_ID = "place_city_large";

let styleCache: StyleSpecification | null = null;

function cloneStyle<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getCountryLabelBeforeLayerId(style: StyleSpecification | undefined | null) {
  if (!style) return undefined;
  const ids = new Set((style.layers || []).map((layer) => layer.id));
  return ids.has("place_state") ? "place_state" : ids.has("place_suburb") ? "place_suburb" : undefined;
}

export function getCountryOverlayBeforeLayerId(style: StyleSpecification | undefined | null) {
  if (!style) return undefined;
  return (style.layers || []).find((layer) => layer.type === "symbol")?.id;
}

export function getCountryMaskBeforeLayerId(style: StyleSpecification | undefined | null) {
  if (!style) return undefined;
  const ids = new Set((style.layers || []).map((layer) => layer.id));
  return (
    MAPLIBRE_PROVIDER_BASEMAP_LAND_LAYER_IDS.find((layerId) => ids.has(layerId)) ||
    MAPLIBRE_PROVIDER_BASEMAP_WATER_LAYER_IDS.find((layerId) => ids.has(layerId)) ||
    getCountryOverlayBeforeLayerId(style)
  );
}

export async function loadMapLibreStyle(): Promise<StyleSpecification> {
  if (styleCache) return cloneStyle(styleCache);
  const response = await fetch(MAPLIBRE_BASE_STYLE_URL, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load MapLibre style: ${response.status} ${response.statusText}`);
  }
  const style = (await response.json()) as StyleSpecification;
  const cityReferenceLayer = (style.layers || []).find((layer) => layer.id === MAPLIBRE_PROVIDER_CITY_STYLE_SOURCE_LAYER_ID);
  if (cityReferenceLayer?.type === "symbol") {
    style.layers = (style.layers || []).map((layer) => {
      if (!MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS.includes(layer.id as (typeof MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS)[number])) {
        return layer;
      }
      if (layer.type !== "symbol") return layer;
      return {
        ...layer,
        layout: {
          ...(layer.layout || {}),
          "text-font": cityReferenceLayer.layout?.["text-font"],
          "text-size": cityReferenceLayer.layout?.["text-size"],
          "text-transform": cityReferenceLayer.layout?.["text-transform"],
          "text-letter-spacing": cityReferenceLayer.layout?.["text-letter-spacing"] ?? 0.02
        },
        paint: {
          ...(layer.paint || {}),
          "text-color": cityReferenceLayer.paint?.["text-color"],
          "text-halo-color": cityReferenceLayer.paint?.["text-halo-color"],
          "text-halo-width": cityReferenceLayer.paint?.["text-halo-width"],
          "text-halo-blur": cityReferenceLayer.paint?.["text-halo-blur"]
        }
      };
    });
  }
  styleCache = style;
  return cloneStyle(style);
}

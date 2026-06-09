import type { Feature, FeatureCollection, Geometry, MultiPolygon, Point, Polygon } from "geojson";
import { buildGeoJson } from "@/lib/mapData";
import {
  buildCountryCardIndexFromStorage,
  getCountryPageIndexByGeoCode,
} from "@/lib/countryPageStorage";
import type { AdminBoundaryCollection, CountryCardEntry, LegalCountryCollection, LegalCountryFeatureProperties } from "./map.types";
import {
  resolveLegalFillColor,
  resolveLegalFillOpacity,
  resolveLegalHoverColor,
  resolveLegalHoverOpacity
} from "./legalStyle";

const ANTARCTICA_FILL_COLOR = "#c5ccd3";
const ANTARCTICA_HOVER_COLOR = "#d4dae0";

type SnapshotMapCategory = "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN";

function resultStatusFromMapCategory(mapCategory: SnapshotMapCategory) {
  if (mapCategory === "LEGAL_OR_DECRIM") return "LEGAL" as const;
  if (mapCategory === "UNKNOWN") return "UNKNOWN" as const;
  return "ILLEGAL" as const;
}

let countrySourceCache: LegalCountryCollection | null = null;
let adminBoundaryCache: AdminBoundaryCollection | null = null;
let usStateSourceCache: LegalCountryCollection | null = null;
let cardIndexCache: Record<string, CountryCardEntry> | null = null;

function isRenderableCountryGeometry(geometry: Geometry | null | undefined): geometry is Polygon | MultiPolygon | Point {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon" || geometry?.type === "Point";
}

function isPolygonGeometry(geometry: Geometry | null | undefined): geometry is Polygon | MultiPolygon {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

export function buildCountrySourceSnapshot(): LegalCountryCollection {
  if (countrySourceCache) return countrySourceCache;
  const snapshot = buildGeoJson("countries") as FeatureCollection;
  const features = snapshot.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon | Point> => isRenderableCountryGeometry(feature.geometry))
    .map((feature) => {
      const geo = String(feature.properties?.geo || "").trim().toUpperCase();
      const mapCategory = String(feature.properties?.mapCategory || "UNKNOWN") as
        SnapshotMapCategory;
      const resultStatus = resultStatusFromMapCategory(mapCategory);
      const baseColor = geo === "AQ" ? ANTARCTICA_FILL_COLOR : resolveLegalFillColor(mapCategory);
      const hoverColor = geo === "AQ" ? ANTARCTICA_HOVER_COLOR : resolveLegalHoverColor(mapCategory);
      const nextProperties: LegalCountryFeatureProperties = {
        geo,
        displayName: String(feature.properties?.displayName || feature.properties?.name || geo),
        status: resultStatus,
        result: {
          status: resultStatus,
          color: baseColor
        },
        mapCategory: (geo === "AQ" && !feature.properties?.mapCategory ? "UNKNOWN" : mapCategory) as
          "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN",
        baseColor,
        hoverColor,
        fillOpacity: geo === "AQ" ? 1 : resolveLegalFillOpacity(mapCategory),
        hoverOpacity: geo === "AQ" ? 1 : resolveLegalHoverOpacity(mapCategory),
        pointFallbackVisibility:
          feature.properties?.pointFallbackVisibility === "hidden"
            ? "hidden"
            : feature.properties?.pointFallbackVisibility === "visible"
              ? "visible"
              : undefined,
        labelAnchorLng: Number.isFinite(Number(feature.properties?.labelAnchorLng))
          ? Number(feature.properties?.labelAnchorLng)
          : null,
        labelAnchorLat: Number.isFinite(Number(feature.properties?.labelAnchorLat))
          ? Number(feature.properties?.labelAnchorLat)
          : null
      };
      return {
        ...feature,
        properties: nextProperties
      };
    });

  countrySourceCache = {
    ...snapshot,
    features
  };
  return countrySourceCache;
}

export function buildAdminBoundarySnapshot(): AdminBoundaryCollection {
  if (adminBoundaryCache) return adminBoundaryCache;
  const geojson = buildGeoJson("states") as FeatureCollection;
  const features = geojson.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon> => isPolygonGeometry(feature.geometry))
    .map((feature) => ({
      type: "Feature" as const,
      id: String(feature.properties?.geo || feature.properties?.displayName || feature.properties?.name || ""),
      geometry: feature.geometry,
      properties: {
        geo: String(feature.properties?.geo || "").trim().toUpperCase(),
        displayName: String(feature.properties?.displayName || feature.properties?.name || feature.properties?.geo || "")
      }
    }))
    .filter((feature) => Boolean(feature.properties.geo));
  adminBoundaryCache = {
    type: "FeatureCollection",
    features
  };
  return adminBoundaryCache;
}

export function buildUsStateSourceSnapshot(): LegalCountryCollection {
  if (usStateSourceCache) return usStateSourceCache;
  const geojson = buildGeoJson("states") as FeatureCollection;
  const statePageByGeo = getCountryPageIndexByGeoCode();
  const features = geojson.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon> => isPolygonGeometry(feature.geometry))
    .map((feature) => {
      const geo = String(feature.properties?.geo || feature.properties?.iso_3166_2 || "").trim().toUpperCase();
      if (!geo.startsWith("US-")) return null;
      const statePageData = statePageByGeo.get(geo);
      if (!statePageData) {
        throw new Error(`MAP_WITHOUT_STATUS: ${geo}`);
      }
      const stateCategory = String(feature.properties?.mapCategory || "UNKNOWN") as
        SnapshotMapCategory;
      const resultStatus = resultStatusFromMapCategory(stateCategory);
      const baseColor = resolveLegalFillColor(stateCategory);
      const displayName = statePageData?.name || String(feature.properties?.displayName || feature.properties?.name || geo);
      const labelAnchorLng = Number(feature.properties?.labelAnchorLng);
      const labelAnchorLat = Number(feature.properties?.labelAnchorLat);
      return {
        type: "Feature" as const,
        id: geo,
        geometry: feature.geometry,
        properties: {
          geo,
          displayName,
          status: resultStatus,
          result: {
            status: resultStatus,
            color: baseColor
          },
          mapCategory: stateCategory as "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN",
          baseColor,
          hoverColor: resolveLegalHoverColor(stateCategory),
          fillOpacity: resolveLegalFillOpacity(stateCategory),
          hoverOpacity: resolveLegalHoverOpacity(stateCategory),
          labelAnchorLng: Number.isFinite(labelAnchorLng) ? labelAnchorLng : null,
          labelAnchorLat: Number.isFinite(labelAnchorLat) ? labelAnchorLat : null
        }
      };
    })
    .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature));

  usStateSourceCache = {
    type: "FeatureCollection",
    features
  };
  return usStateSourceCache;
}

export function buildCardIndexSnapshot() {
  if (cardIndexCache) return cardIndexCache;
  const entries = Object.values(buildCountryCardIndexFromStorage());

  cardIndexCache = Object.fromEntries(entries.map((entry) => [entry.geo, entry]));
  return cardIndexCache;
}

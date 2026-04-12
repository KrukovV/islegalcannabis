import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { buildGeoJson } from "@/lib/mapData";
import {
  buildCountryCardIndexFromStorage,
  deriveMapCategoryFromCountryPageData,
  getCountryPageIndexByGeoCode,
  getCountryPageIndexByIso2
} from "@/lib/countryPageStorage";
import { deriveResultStatusFromCountryPageData } from "@/lib/resultStatus";
import type { AdminBoundaryCollection, LegalCountryCollection, LegalCountryFeatureProperties } from "./map.types";
import {
  resolveLegalFillColor,
  resolveLegalFillOpacity,
  resolveLegalHoverColor,
  resolveLegalHoverOpacity
} from "./legalStyle";

const ANTARCTICA_FILL_COLOR = "#c5ccd3";
const ANTARCTICA_HOVER_COLOR = "#d4dae0";

function isPolygonGeometry(geometry: Geometry | null | undefined): geometry is Polygon | MultiPolygon {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

export function buildCountrySourceSnapshot(): LegalCountryCollection {
  const snapshot = buildGeoJson("countries") as FeatureCollection;
  const countryPageByIso2 = getCountryPageIndexByIso2();
  const missingGeos: string[] = [];
  const features = snapshot.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon> => isPolygonGeometry(feature.geometry))
    .flatMap((feature) => {
      const geo = String(feature.properties?.geo || "").trim().toUpperCase();
      const countryPageData = countryPageByIso2.get(geo);
      if (!countryPageData) {
        missingGeos.push(geo);
        return [];
      }
      const resultStatus = deriveResultStatusFromCountryPageData(countryPageData);
      const mapCategory = deriveMapCategoryFromCountryPageData(countryPageData);
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
        labelAnchorLng: Number.isFinite(Number(feature.properties?.labelAnchorLng))
          ? Number(feature.properties?.labelAnchorLng)
          : null,
        labelAnchorLat: Number.isFinite(Number(feature.properties?.labelAnchorLat))
          ? Number(feature.properties?.labelAnchorLat)
          : null
      };
      return [{
        ...feature,
        properties: nextProperties
      }];
    });

  if (missingGeos.length) {
    console.warn(`NEW_MAP_FILTERED_MISSING_STATUS count=${missingGeos.length} geos=${missingGeos.join(",")}`);
  }

  return {
    ...snapshot,
    features
  };
}

export function buildAdminBoundarySnapshot(): AdminBoundaryCollection {
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
  return {
    type: "FeatureCollection",
    features
  };
}

export function buildUsStateSourceSnapshot(): LegalCountryCollection {
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
      const resultStatus = deriveResultStatusFromCountryPageData(statePageData);
      const stateCategory = deriveMapCategoryFromCountryPageData(statePageData);
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

  return {
    type: "FeatureCollection",
    features
  };
}

export function buildCardIndexSnapshot() {
  const entries = Object.values(buildCountryCardIndexFromStorage());

  return Object.fromEntries(entries.map((entry) => [entry.geo, entry]));
}

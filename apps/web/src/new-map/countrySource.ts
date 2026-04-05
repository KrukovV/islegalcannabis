import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import legalSnapshot from "@/data/legalSnapshot.json";
import { buildGeoJson } from "@/lib/mapData";
import type { AdminBoundaryCollection, LegalCountryCollection } from "./map.types";
import {
  resolveLegalFillColor,
  resolveLegalFillOpacity,
  resolveLegalHoverColor,
  resolveLegalHoverOpacity
} from "./legalStyle";

function isPolygonGeometry(geometry: Geometry | null | undefined): geometry is Polygon | MultiPolygon {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

export function buildCountrySourceSnapshot(): LegalCountryCollection {
  return legalSnapshot as LegalCountryCollection;
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
  const features = geojson.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon> => isPolygonGeometry(feature.geometry))
    .map((feature) => {
      const geo = String(feature.properties?.geo || feature.properties?.iso_3166_2 || "").trim().toUpperCase();
      if (!geo.startsWith("US-")) return null;
      const mapCategory = String(feature.properties?.mapCategory || feature.properties?.finalMapCategory || "UNKNOWN");
      const labelAnchorLng = Number(feature.properties?.labelAnchorLng);
      const labelAnchorLat = Number(feature.properties?.labelAnchorLat);
      return {
        type: "Feature" as const,
        id: geo,
        geometry: feature.geometry,
        properties: {
          geo,
          displayName: String(feature.properties?.displayName || feature.properties?.name || geo),
          mapCategory: mapCategory as "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN",
          legalColor: resolveLegalFillColor(mapCategory),
          hoverColor: resolveLegalHoverColor(mapCategory),
          fillOpacity: resolveLegalFillOpacity(mapCategory),
          hoverOpacity: resolveLegalHoverOpacity(mapCategory),
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

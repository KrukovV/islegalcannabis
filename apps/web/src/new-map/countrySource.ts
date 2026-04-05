import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import legalSnapshot from "@/data/legalSnapshot.json";
import { buildGeoJson } from "@/lib/mapData";
import type { AdminBoundaryCollection, LegalCountryCollection } from "./map.types";

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

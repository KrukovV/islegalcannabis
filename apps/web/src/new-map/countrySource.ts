import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import legalSnapshot from "@/data/legalSnapshot.json";
import { buildGeoJson } from "@/lib/mapData";
import {
  loadCentroids,
  loadUsStatesSsot,
  loadUsStateWikiTableIndex,
  resolveDataPath
} from "@/lib/mapDataSources";
import { deriveUsStateStatusOverrideFromWikiTable } from "@/lib/mapStatusProjection";
import { resolveMapCategoryFromPair } from "@/lib/statusPairMatrix";
import type { AdminBoundaryCollection, LegalCountryCollection } from "./map.types";
import {
  resolveLegalFillColor,
  resolveLegalHoverColor,
} from "./legalStyle";

const ANTARCTICA_FILL_COLOR = "#c5ccd3";
const ANTARCTICA_HOVER_COLOR = "#d4dae0";

function isPolygonGeometry(geometry: Geometry | null | undefined): geometry is Polygon | MultiPolygon {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

export function buildCountrySourceSnapshot(): LegalCountryCollection {
  const snapshot = legalSnapshot as LegalCountryCollection;
  return {
    ...snapshot,
    features: snapshot.features.map((feature) => {
      const geo = String(feature.properties?.geo || "").trim().toUpperCase();
      const mapCategory = String(feature.properties?.mapCategory || "UNKNOWN");
      const legalColor = geo === "AQ" ? ANTARCTICA_FILL_COLOR : resolveLegalFillColor(mapCategory);
      const hoverColor = geo === "AQ" ? ANTARCTICA_HOVER_COLOR : resolveLegalHoverColor(mapCategory);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          mapCategory: (geo === "AQ" && !feature.properties?.mapCategory ? "UNKNOWN" : mapCategory) as
            "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN",
          legalColor,
          hoverColor,
          fillOpacity: 1,
          hoverOpacity: 1
        }
      };
    })
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
  const stateCentroids = loadCentroids(resolveDataPath("data", "centroids", "us_adm1.json"));
  const stateEntries = loadUsStatesSsot();
  const stateWikiTableIndex = loadUsStateWikiTableIndex(stateCentroids, stateEntries);
  const features = geojson.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon> => isPolygonGeometry(feature.geometry))
    .map((feature) => {
      const geo = String(feature.properties?.geo || feature.properties?.iso_3166_2 || "").trim().toUpperCase();
      if (!geo.startsWith("US-")) return null;
      const wikiTableRow = stateWikiTableIndex.get(geo);
      const wikiTableOverride = deriveUsStateStatusOverrideFromWikiTable({
        recreational_raw: wikiTableRow?.recreational_raw ?? undefined
      });
      const stateCategory = wikiTableOverride
        ? resolveMapCategoryFromPair(wikiTableOverride.rec, wikiTableOverride.med)
        : String(feature.properties?.mapCategory || feature.properties?.finalMapCategory || "UNKNOWN");
      const labelAnchorLng = Number(feature.properties?.labelAnchorLng);
      const labelAnchorLat = Number(feature.properties?.labelAnchorLat);
      return {
        type: "Feature" as const,
        id: geo,
        geometry: feature.geometry,
        properties: {
          geo,
          displayName: String(feature.properties?.displayName || feature.properties?.name || geo),
          mapCategory: stateCategory as "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN",
          legalColor: resolveLegalFillColor(stateCategory),
          hoverColor: resolveLegalHoverColor(stateCategory),
          fillOpacity: 1,
          hoverOpacity: 1,
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

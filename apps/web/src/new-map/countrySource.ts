import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { buildGeoJson } from "@/lib/mapData";
import {
  loadCentroids,
  loadUsStatesSsot,
  loadUsStateWikiTableIndex,
  resolveDataPath
} from "@/lib/mapDataSources";
import {
  buildCountryCardIndexFromStorage,
  deriveMapCategoryFromCountryPageData,
  getCountryPageIndexByGeoCode,
  getCountryPageIndexByIso2
} from "@/lib/countryPageStorage";
import { deriveUsStateStatusOverrideFromWikiTable } from "@/lib/mapStatusProjection";
import { resolveMapCategoryFromPair } from "@/lib/statusPairMatrix";
import type { AdminBoundaryCollection, LegalCountryCollection, LegalCountryFeatureProperties } from "./map.types";
import {
  resolveLegalFillColor,
  resolveLegalHoverColor,
} from "./legalStyle";

const ANTARCTICA_FILL_COLOR = "#c5ccd3";
const ANTARCTICA_HOVER_COLOR = "#d4dae0";

function isPolygonGeometry(geometry: Geometry | null | undefined): geometry is Polygon | MultiPolygon {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function resolveNormalizedMapCategory(properties: Record<string, unknown>) {
  const status = String(properties.normalizedRecreationalStatus || "").trim().toUpperCase();
  const enforcement = String(properties.normalizedRecreationalEnforcement || "").trim().toUpperCase();
  const medicalStatus = String(properties.normalizedMedicalStatus || "").trim().toUpperCase();
  const flags = Array.isArray(properties.statusFlags)
    ? properties.statusFlags.map((value) => String(value || "").trim().toUpperCase())
    : [];

  if (status === "LEGAL" || status === "TOLERATED" || status === "DECRIMINALIZED" || status === "TECHNICALLY_LEGAL") {
    return "LEGAL_OR_DECRIM" as const;
  }
  if (flags.includes("HAS_FINE") || enforcement === "FINES") {
    return "LIMITED_OR_MEDICAL" as const;
  }
  if (status === "ILLEGAL_UNENFORCED" || enforcement === "UNENFORCED") {
    return "LIMITED_OR_MEDICAL" as const;
  }
  if (status === "LIMITED_LEGAL" || medicalStatus === "LEGAL" || medicalStatus === "LIMITED") {
    return "LIMITED_OR_MEDICAL" as const;
  }
  if (status === "ILLEGAL_ENFORCED") {
    return "ILLEGAL" as const;
  }
  return "ILLEGAL" as const;
}

export function buildCountrySourceSnapshot(): LegalCountryCollection {
  const snapshot = buildGeoJson("countries") as FeatureCollection;
  const countryPageByIso2 = getCountryPageIndexByIso2();
  return {
    ...snapshot,
    features: snapshot.features.filter((feature): feature is Feature<Polygon | MultiPolygon> => isPolygonGeometry(feature.geometry)).map((feature) => {
      const geo = String(feature.properties?.geo || "").trim().toUpperCase();
      const countryPageData = countryPageByIso2.get(geo);
      const mapCategory = countryPageData
        ? deriveMapCategoryFromCountryPageData(countryPageData)
        : resolveNormalizedMapCategory(feature.properties || {});
      const legalColor = geo === "AQ" ? ANTARCTICA_FILL_COLOR : resolveLegalFillColor(mapCategory);
      const hoverColor = geo === "AQ" ? ANTARCTICA_HOVER_COLOR : resolveLegalHoverColor(mapCategory);
      const nextProperties: LegalCountryFeatureProperties = {
        geo,
        displayName: String(feature.properties?.displayName || feature.properties?.name || geo),
        mapCategory: (geo === "AQ" && !feature.properties?.mapCategory ? "UNKNOWN" : mapCategory) as
          "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN",
        legalColor,
        hoverColor,
        fillOpacity: 1,
        hoverOpacity: 1,
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
  const statePageByGeo = getCountryPageIndexByGeoCode();
  const stateCentroids = loadCentroids(resolveDataPath("data", "centroids", "us_adm1.json"));
  const stateEntries = loadUsStatesSsot();
  const stateWikiTableIndex = loadUsStateWikiTableIndex(stateCentroids, stateEntries);
  const features = geojson.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon> => isPolygonGeometry(feature.geometry))
    .map((feature) => {
      const geo = String(feature.properties?.geo || feature.properties?.iso_3166_2 || "").trim().toUpperCase();
      if (!geo.startsWith("US-")) return null;
      const statePageData = statePageByGeo.get(geo);
      const wikiTableRow = stateWikiTableIndex.get(geo);
      const wikiTableOverride = deriveUsStateStatusOverrideFromWikiTable({
        recreational_raw: wikiTableRow?.recreational_raw ?? undefined
      });
      const stateCategory = statePageData
        ? deriveMapCategoryFromCountryPageData(statePageData)
        : wikiTableOverride
          ? resolveMapCategoryFromPair(wikiTableOverride.rec, wikiTableOverride.med)
          : String(feature.properties?.mapCategory || feature.properties?.finalMapCategory || "UNKNOWN");
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

export function buildCardIndexSnapshot() {
  const entries = Object.values(buildCountryCardIndexFromStorage());

  return Object.fromEntries(entries.map((entry) => [entry.geo, entry]));
}

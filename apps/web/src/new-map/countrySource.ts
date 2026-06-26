import type { Feature, FeatureCollection, Geometry, MultiPolygon, Point, Polygon } from "geojson";
import { buildGeoJson } from "@/lib/mapData";
import {
  buildCountryCardIndexFromStorage,
  deriveMapCategoryFromCountryPageData,
  getCountryPageIndexByGeoCode,
} from "@/lib/countryPageStorage";
import { getStatusReviewOverride } from "@/lib/statusReviewOverrides";
import {
  buildTerritoryParentLawSummary,
  inferJurisdictionContextNotes,
  inferParentCountryFromGeoCode
} from "./territoryParent";
import type { AdminBoundaryCollection, CountryCardEntry, LegalCountryCollection, LegalCountryFeatureProperties } from "./map.types";
import {
  resolveLegalFillColor,
  resolveLegalFillOpacity,
  resolveLegalHoverColor,
  resolveLegalHoverOpacity
} from "./legalStyle";
import { getHumanStatusHeadline, getHumanStatusLevel, getHumanStatusSummary } from "@/lib/statusHumanText";

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

function buildMapFeatureFallbackCardEntry(
  feature: Feature<Polygon | MultiPolygon | Point, LegalCountryFeatureProperties>
): CountryCardEntry | null {
  const geo = String(feature.properties?.geo || "").trim().toUpperCase();
  if (!geo) return null;

  const displayName = String(feature.properties?.displayName || geo).trim() || geo;
  const pointFallbackLabel = String(feature.properties?.pointFallbackLabel || "").trim();
  const popupDisplayName = pointFallbackLabel || displayName;
  const mapCategory = String(feature.properties?.mapCategory || "UNKNOWN") as CountryCardEntry["mapCategory"];
  const statusReviewOverride = getStatusReviewOverride(geo);
  const parentCountry = inferParentCountryFromGeoCode(geo);
  const parentLawSummary = parentCountry
    ? buildTerritoryParentLawSummary(parentCountry.name, popupDisplayName)
    : null;
  const fallbackTargetCode = parentCountry?.code?.toLowerCase() || geo.toLowerCase();
  const fallbackPageHref = parentCountry ? `/c/${fallbackTargetCode}` : `/new-map?geo=${encodeURIComponent(geo)}`;
  const fallbackNotes = [
    statusReviewOverride?.notes,
    getHumanStatusSummary(mapCategory),
    parentLawSummary
  ]
    .filter((item) => typeof item === "string" && item.trim())
    .join(" ");
  const jurisdictionContextNotes = inferJurisdictionContextNotes(
    { countryName: popupDisplayName },
    parentCountry
  );
  const overrideSources =
    statusReviewOverride?.sources
      ?.map((url, index) => ({ id: `${geo.toLowerCase()}-override-${index}`, title: "Status review source", url })) || [];

  const labelCoordinates = {
    lng: Number(feature.properties?.labelAnchorLng),
    lat: Number(feature.properties?.labelAnchorLat)
  };
  const pointCoordinates =
    feature.geometry.type === "Point" && Array.isArray(feature.geometry.coordinates)
      ? {
          lng: Number(feature.geometry.coordinates[0]),
          lat: Number(feature.geometry.coordinates[1])
        }
      : null;
  const rawCoordinates =
    Number.isFinite(labelCoordinates.lat) && Number.isFinite(labelCoordinates.lng)
      ? labelCoordinates
      : pointCoordinates;
  const coordinates =
    rawCoordinates && Number.isFinite(rawCoordinates.lat) && Number.isFinite(rawCoordinates.lng)
      ? rawCoordinates
      : null;

  return {
    geo,
    code: geo.toLowerCase(),
    pageHref: fallbackPageHref,
    detailsHref: null,
    displayName: popupDisplayName,
    iso2: geo,
    type: "country",
    result: {
      status: resultStatusFromMapCategory(mapCategory as SnapshotMapCategory),
      color: String(
        feature.properties?.result?.color ||
          feature.properties?.baseColor ||
          resolveLegalFillColor(mapCategory as SnapshotMapCategory)
      )
    },
    mapCategory,
    mapReason: getHumanStatusSummary(mapCategory),
    normalizedStatusSummary: `${popupDisplayName}. ${getHumanStatusSummary(mapCategory)}`,
    recreationalSummary: getHumanStatusHeadline(mapCategory),
    medicalSummary: getHumanStatusSummary(mapCategory),
    distributionSummary: parentCountry
      ? `${popupDisplayName} follows ${parentCountry.name} for legal references.`
      : getHumanStatusHeadline(mapCategory),
    normalizedRecreationalStatus: "Unknown",
    normalizedRecreationalEnforcement: "Unknown",
    normalizedRecreationalScope: "Unknown",
    normalizedMedicalStatus: "Unknown",
    normalizedMedicalScope: "Unknown",
    normalizedDistributionStatus: "unknown",
    distributionFlags: [],
    statusFlags: [],
    cannabisProfile: null,
    parentCountry: parentCountry || undefined,
    parentLawSummary,
    jurisdictionContextNotes,
    notes: fallbackNotes,
    panel: {
      levelTitle: getHumanStatusLevel(mapCategory),
      summary: getHumanStatusHeadline(mapCategory),
      critical: [],
      info: [],
      why: [
        {
          id: `why-${geo.toLowerCase()}`,
          text: getHumanStatusSummary(mapCategory),
          href: parentCountry ? `/c/${fallbackTargetCode}` : `/new-map?geo=${encodeURIComponent(geo)}`
        }
      ]
    },
    sources: overrideSources,
    ...(coordinates ? { coordinates } : {})
  };
}

export function buildCountrySourceSnapshot(): LegalCountryCollection {
  if (countrySourceCache) return countrySourceCache;
  const snapshot = buildGeoJson("countries") as FeatureCollection;
  const countryPageByGeo = getCountryPageIndexByGeoCode();
  const features = snapshot.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon | Point> => isRenderableCountryGeometry(feature.geometry))
    .map((feature) => {
      const geo = String(feature.properties?.geo || "").trim().toUpperCase();
      const countryPageData = countryPageByGeo.get(geo);
      const derivedMapCategory = countryPageData
        ? deriveMapCategoryFromCountryPageData(countryPageData)
        : null;
      const mapCategory = String(
        derivedMapCategory || feature.properties?.mapCategory || "UNKNOWN"
      ) as SnapshotMapCategory;
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
        pointFallbackLabel:
          typeof feature.properties?.pointFallbackLabel === "string" && feature.properties.pointFallbackLabel.trim()
            ? feature.properties.pointFallbackLabel.trim()
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

export function buildCardIndexSnapshot(options?: { fresh?: boolean }) {
  const fresh = Boolean(options?.fresh);
  if (!fresh && cardIndexCache) return cardIndexCache;
  const entries = Object.values(buildCountryCardIndexFromStorage());
  const nextEntries = [...entries];
  const existingGeos = new Set(entries.map((entry) => entry.geo));
  for (const feature of buildCountrySourceSnapshot().features) {
    const geo = String(feature.properties?.geo || "").trim().toUpperCase();
    if (!geo || existingGeos.has(geo)) continue;
    const fallbackEntry = buildMapFeatureFallbackCardEntry(feature as Feature<Polygon | MultiPolygon | Point, LegalCountryFeatureProperties>);
    if (!fallbackEntry) continue;
    nextEntries.push(fallbackEntry);
    existingGeos.add(geo);
  }

  const snapshot = Object.fromEntries(nextEntries.map((entry) => [entry.geo, entry]));
  if (!fresh) {
    cardIndexCache = snapshot;
  }
  return snapshot;
}

import type { CountryCardEntry } from "@/new-map/map.types";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { buildCardIndexSnapshot } from "@/new-map/countrySource";
import { getStaticTruthMapAsset } from "./staticTruthMap";
import { projectTruthMapRichCard } from "./truthMapRichCard";
import type { TruthMapCollection, TruthMapFeatureProperties } from "./truthMapSource";

export type TruthMapCountryPageProjection = {
  properties: TruthMapFeatureProperties;
  card: CountryCardEntry;
};

let propertiesByGeo: Map<string, TruthMapFeatureProperties> | null = null;

/**
 * Resolves public country pages from the same committed, content-addressed
 * final-reconciliation payload that the public map reads. CountryPageData
 * remains supporting material only; it cannot supply a current legal colour,
 * headline, title, summary or legal conclusion.
 */
function getPropertiesByGeo() {
  if (propertiesByGeo) return propertiesByGeo;
  const next = new Map<string, TruthMapFeatureProperties>();
  for (const layer of ["countries", "us-states"] as const) {
    const collection = JSON.parse(getStaticTruthMapAsset(layer).json) as TruthMapCollection;
    for (const feature of collection.features) {
      const properties = feature.properties as unknown as TruthMapFeatureProperties;
      const geo = String(properties?.geo || "").trim().toUpperCase();
      if (geo && properties?.truthDataset === "FINAL_307_RECONCILIATION") {
        next.set(geo, properties);
      }
    }
  }
  propertiesByGeo = next;
  return next;
}

export function getTruthMapCountryPageProjection(data: CountryPageData): TruthMapCountryPageProjection | null {
  const geo = String(data.geo_code || "").trim().toUpperCase();
  return getTruthMapCountryPageProjectionForGeo(geo, deriveCountryCardEntryFromCountryPageData(data));
}

/**
 * The 19 map-only territories have no legacy CountryPageData page and are not
 * added to the protected sitemap baseline. They still receive the same
 * current legal projection when an existing map Details link addresses them.
 */
export function getTruthMapCountryPageProjectionForGeo(
  geo: string,
  supportingCard?: CountryCardEntry | null
): TruthMapCountryPageProjection | null {
  const normalizedGeo = String(geo || "").trim().toUpperCase();
  const properties = getPropertiesByGeo().get(normalizedGeo);
  if (!properties) return null;
  const baseCard = supportingCard || buildCardIndexSnapshot()[normalizedGeo];
  if (!baseCard) return null;
  return {
    properties,
    card: projectTruthMapRichCard(baseCard, properties)
  };
}

export function listTruthMapCountryPageProjectionGeos() {
  return [...getPropertiesByGeo().keys()].sort();
}

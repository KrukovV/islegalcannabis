import { createHash } from "node:crypto";
import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import { simplifyMapFeatureGeometry } from "@/new-map/staticCountries";
import { buildTruthMapDataset, type TruthMapCollection, type TruthMapDatasetMeta } from "./truthMapSource";

const STATIC_METADATA_GENERATED_AT = "CONTENT_ADDRESSED_STATIC_TRUTH_MAP";

function staticMetadata(
  meta: TruthMapDatasetMeta & { layer: "countries" | "us-states" },
  features: Array<Feature<Polygon | MultiPolygon | Point>>
) {
  // `generatedAt` and the raw reconciliation-file hash are audit build metadata:
  // each is intentionally regenerated outside the public Git deployment. They do
  // not describe a popup fact. Replacing only these volatile fields keeps the
  // content-address stable when the same legal/popup payload is reprojected.
  const featureHash = createHash("sha256").update(JSON.stringify(features)).digest("hex");
  return {
    ...meta,
    generatedAt: STATIC_METADATA_GENERATED_AT,
    datasetHash: featureHash
  };
}

/**
 * The public static payload preserves every feature property used by rich legal
 * popups. Only geometry is compacted, plus non-user-facing volatile collection
 * metadata is normalized for a deterministic content address.
 */
export function buildStaticTruthMapSnapshot(layer: "countries" | "us-states"): TruthMapCollection {
  const collection = layer === "countries" ? buildTruthMapDataset().countries : buildTruthMapDataset().usStates;
  const features = collection.features.map((feature) => simplifyMapFeatureGeometry(feature));
  return {
    ...collection,
    features,
    meta: staticMetadata(collection.meta as TruthMapDatasetMeta & { layer: "countries" | "us-states" }, features)
  } as TruthMapCollection;
}

export function buildStaticTruthMapMetadata(
  collection: TruthMapCollection
): TruthMapCollection["meta"] {
  const features = collection.features.map((feature) => simplifyMapFeatureGeometry(feature));
  return staticMetadata(
    collection.meta as TruthMapDatasetMeta & { layer: "countries" | "us-states" },
    features
  );
}

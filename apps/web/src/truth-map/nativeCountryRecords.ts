import type { TruthMapCollection, TruthMapFeatureProperties } from "./truthMapSource";

export type NativeCountryDescriptor = {
  version: string;
  sourceSha256: string;
  recordsSha256: string;
  recordCount: number;
  recordIndex: string;
  sourceLayer: string;
  maxzoom: number;
  recordsUrl: string;
  tilesUrl: string;
};

export type NativeCountryRecords = {
  schema: "PUBLIC_COUNTRY_RECORD_INDEX_V1";
  sourceSha256: string;
  collection: Omit<TruthMapCollection, "features">;
  records: Array<Omit<TruthMapCollection["features"][number], "geometry">>;
};

export function readNativeCountryRecords(value: unknown, descriptor: NativeCountryDescriptor): NativeCountryRecords {
  const index = value as Partial<NativeCountryRecords> | null;
  if (!index || index.schema !== "PUBLIC_COUNTRY_RECORD_INDEX_V1"
    || index.sourceSha256 !== descriptor.sourceSha256
    || index.collection?.type !== "FeatureCollection"
    || !Array.isArray(index.records) || index.records.length !== descriptor.recordCount
    || index.records.some((record) => !record?.properties?.geo
      || (record.properties as TruthMapFeatureProperties).truthDataset !== "FINAL_307_RECONCILIATION")) {
    throw new Error("NATIVE_COUNTRY_RECORD_INDEX_INVALID");
  }
  return index as NativeCountryRecords;
}

export function resolveNativeCountryProperties(
  properties: Record<string, unknown>, index: NativeCountryRecords, descriptor: NativeCountryDescriptor
): TruthMapFeatureProperties {
  const ordinal = properties[descriptor.recordIndex];
  if (typeof ordinal !== "number" || !Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= index.records.length) {
    throw new Error("NATIVE_COUNTRY_RECORD_REFERENCE_INVALID");
  }
  const complete = index.records[ordinal].properties as TruthMapFeatureProperties;
  if (complete.geo !== properties.geo) throw new Error("NATIVE_COUNTRY_RECORD_GEO_MISMATCH");
  return complete;
}

import { describe, expect, it } from "vitest";
import { getNativeCountryDescriptor, getNativeCountryRecords } from "./nativeCountryProjection";
import { getStaticTruthMapAsset } from "./staticTruthMap";
import { readNativeCountryRecords, resolveNativeCountryProperties } from "./nativeCountryRecords";

const descriptor = getNativeCountryDescriptor();
const original = JSON.parse(getStaticTruthMapAsset("countries").json);
const index = readNativeCountryRecords(JSON.parse(getNativeCountryRecords().json), descriptor);

describe("native country complete-record resolution", () => {
  it("retains exact metadata and all properties, including duplicate GEO records", () => {
    const { features, ...metadata } = original;
    expect(index.collection).toEqual(metadata);
    expect(new Set(index.records.map((record) => record.properties.geo)).size).toBeLessThan(index.records.length);
    for (const [ordinal, feature] of features.entries()) {
      const properties = resolveNativeCountryProperties({ geo: feature.properties.geo, [descriptor.recordIndex]: ordinal }, index, descriptor);
      expect(properties).toEqual(feature.properties);
      expect(properties).toBe(index.records[ordinal].properties);
    }
  });

  it.each([undefined, -1, 0.5, descriptor.recordCount, "0"])("rejects invalid record ordinal %s", (ordinal) => {
    expect(() => resolveNativeCountryProperties({ geo: index.records[0].properties.geo, [descriptor.recordIndex]: ordinal }, index, descriptor))
      .toThrow("NATIVE_COUNTRY_RECORD_REFERENCE_INVALID");
  });

  it("rejects mismatched geometry GEO without substituting another record", () => {
    expect(() => resolveNativeCountryProperties({ geo: "WRONG", [descriptor.recordIndex]: 0 }, index, descriptor))
      .toThrow("NATIVE_COUNTRY_RECORD_GEO_MISMATCH");
  });

  it("rejects another source, incomplete records and an invalid schema", () => {
    for (const invalid of [null, { ...index, sourceSha256: "other" }, { ...index, records: index.records.slice(1) }, { ...index, schema: "old" },
      { ...index, records: [{ properties: { geo: "TEST" } }, ...index.records.slice(1)] }]) {
      expect(() => readNativeCountryRecords(invalid, descriptor)).toThrow("NATIVE_COUNTRY_RECORD_INDEX_INVALID");
    }
  });
});

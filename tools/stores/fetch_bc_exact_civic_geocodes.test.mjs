import assert from "node:assert/strict";
import test from "node:test";
import { selectBcCivicCandidates, selectExactBcCivicCoordinateRecords } from "./fetch_bc_exact_civic_geocodes.mjs";

const row = { source_record_id: "450001", address: "245 Birch Avenue", city: "100 Mile House", region: "BC", country: "CA", postal_code: "V0K2E0" };

test("selects only unseen simple BC civic-address rows", () => {
  const selected = selectBcCivicCandidates({ source: {}, rows: [row, { ...row, source_record_id: "450002", address: "Unit 2 - 245 Birch Avenue" }], existingRecords: [], limit: 25 });
  assert.deepEqual(selected.map((item) => item.source_record_id), ["450001"]);
  assert.deepEqual(selectBcCivicCandidates({ source: {}, rows: [row], existingRecords: [{ source_record_id: "450001" }], limit: 25 }), []);
});

test("accepts one exact official parcel point among nonmatching API alternatives", () => {
  const response = { baseDataDate: "2026-07-07", searchTimestamp: "2026-08-21", features: [{ geometry: { coordinates: [-121.2950617, 51.6447284] }, properties: { fullAddress: "245 Birch Ave, 100 Mile House, BC", civicNumber: 245, streetAddress: "245 Birch Ave", localityName: "100 Mile House", provinceCode: "BC", matchPrecision: "CIVIC_NUMBER", locationPositionalAccuracy: "high", locationDescriptor: "parcelPoint", siteStatus: "active", isOfficial: "true" } }, { geometry: { coordinates: [-121.28, 51.65] }, properties: { fullAddress: "245 Birch Pl, 100 Mile House, BC", civicNumber: 245, streetAddress: "245 Birch Pl", localityName: "100 Mile House", provinceCode: "BC", matchPrecision: "BLOCK", locationPositionalAccuracy: "low", locationDescriptor: "accessPoint", siteStatus: "", isOfficial: "true" } }] };
  const selected = selectExactBcCivicCoordinateRecords({ candidates: [row], responsesBySourceRecordId: { "450001": response } });
  assert.equal(selected.records.length, 1);
  assert.deepEqual([selected.records[0].latitude, selected.records[0].longitude], [51.6447284, -121.2950617]);
  const rejected = selectExactBcCivicCoordinateRecords({ candidates: [row], responsesBySourceRecordId: { "450001": { ...response, features: [{ ...response.features[0], properties: { ...response.features[0].properties, locationDescriptor: "accessPoint" } }] } } });
  assert.equal(rejected.records.length, 0);
  assert.equal(rejected.blocked, 1);
});

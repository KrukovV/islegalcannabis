import assert from "node:assert/strict";
import test from "node:test";
import { selectExactOnelineCensusGeocodes, selectOnelineRequestRows } from "./fetch_census_exact_oneline_address_geocodes.mjs";

test("builds a bounded oneline request from declared official address columns", () => {
  const rows = selectOnelineRequestRows({
    source: {
      records: [{ id: "CO-1", street: "1301 N Marion Street", city: "Denver", region: "CO", postal_code: "80218" }],
    },
    limit: 1,
    recordIdField: "id",
    addressField: "",
    addressFields: ["street", "city", "region", "postal_code"],
  });
  assert.deepEqual(rows, [{ source_record_id: "CO-1", physical_address: "1301 N Marion Street, Denver, CO, 80218" }]);
});

test("rejects ambiguous single-field and composite-address configuration", () => {
  assert.throws(
    () => selectOnelineRequestRows({
      source: [{ id: "CO-1", address: "1301 N Marion Street", city: "Denver" }],
      limit: 1,
      recordIdField: "id",
      addressField: "address",
      addressFields: ["address", "city"],
    }),
    /CENSUS_ONELINE_SOURCE_ADDRESS_FIELDS_AMBIGUOUS/,
  );
});

test("excludes previously augmented official records before applying the bounded limit", () => {
  const rows = selectOnelineRequestRows({
    source: [
      { id: "CO-1", address: "1 Main St" },
      { id: "CO-2", address: "2 Main St" },
    ],
    limit: 1,
    recordIdField: "id",
    addressField: "address",
    excludedSourceRecordIds: ["CO-1"],
  });
  assert.deepEqual(rows, [{ source_record_id: "CO-2", physical_address: "2 Main St" }]);
});

test("accepts Census ZIP+4 only when the rest of the official oneline address matches", () => {
  const result = selectExactOnelineCensusGeocodes({
    source: [{ id: "CO-1", address: "1301 N Marion Street, Denver, CO, 80218" }],
    responsesById: {
      "CO-1": {
        result: {
          addressMatches: [{
            matchedAddress: "1301 N MARION ST, DENVER, CO, 80218-1234",
            coordinates: { x: -104.971, y: 39.738 },
            matchType: "Exact",
          }],
        },
      },
    },
    limit: 1,
    recordIdField: "id",
    addressField: "address",
    bounds: { region: "CO", west: -109.1, east: -102, south: 36.8, north: 41.1 },
  });
  assert.equal(result.accepted.length, 1);
});

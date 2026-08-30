import assert from "node:assert/strict";
import test from "node:test";
import { buildCensusAddressBatch, parseCsv, selectExactCensusBatchGeocodes } from "./fetch_census_address_batch_geocodes.mjs";

const bounds = { west: -83, east: -80, south: 24, north: 31 };
const records = [
  { source_record_id: "mmtc-1", address: "1931 Tamiami Trail", city: "Port Charlotte", region: "FL", postal_code: "33948" },
  { source_record_id: "mmtc-2", address: "999 Blanding Boulevard", city: "Orange Park", region: "FL", postal_code: "32065" },
];

test("builds a bounded quoted Census batch from public address records", () => {
  assert.equal(buildCensusAddressBatch(records), '"mmtc-1","1931 Tamiami Trail","Port Charlotte","FL","33948"\n"mmtc-2","999 Blanding Boulevard","Orange Park","FL","32065"\n');
});

test("retains only exact same-city/state/ZIP/house-number in-bounds Census matches", () => {
  const result = selectExactCensusBatchGeocodes({
    records,
    censusCsv: [
      '"mmtc-1","1931 Tamiami Trail, Port Charlotte, FL, 33948","Match","Exact","1931 TAMIAMI TRL, PORT CHARLOTTE, FL, 33948","-82.130113111136,27.004492973649","647559855","L"',
      '"mmtc-2","999 Blanding Boulevard, Orange Park, FL, 32065","Match","Exact","999 BLANDING BLVD, ORANGE PARK, FL, 99999","-81.7,30.2","x","L"',
    ].join("\n"),
    bounds,
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].coordinates_source, "OFFICIAL_ADDRESS_GEOCODED");
  assert.equal(result.counts.blocked_census_no_exact_in_jurisdiction_match, 1);
});

test("allows an unpublished official ZIP only when the input declares the exact street-city-state policy", () => {
  const recordsWithoutPublishedZip = [{
    source_record_id: "nd-1",
    address: "1809 13th Ave North",
    city: "Grand Forks",
    region: "ND",
    postal_code: "",
    allow_missing_source_postal_code: true,
  }];
  const censusCsv = '"nd-1","1809 13th Ave North, Grand Forks, ND, 58203","Match","Exact","1809 13TH AVE N, GRAND FORKS, ND, 58203","-97.074,47.940","1","L"\n';
  const result = selectExactCensusBatchGeocodes({
    records: recordsWithoutPublishedZip,
    censusCsv,
    bounds: { west: -105, east: -96, south: 45, north: 49 },
  });
  assert.equal(result.records[0].postal_code, "");
  assert.equal(result.records[0].census_matched_postal_code, "58203");
  assert.equal(result.records[0].public_source_fields.census_matched_address, "1809 13TH AVE N, GRAND FORKS, ND, 58203");
  assert.throws(
    () => buildCensusAddressBatch([{ ...recordsWithoutPublishedZip[0], allow_missing_source_postal_code: false }]),
    /CENSUS_BATCH_ADDRESS_FIELDS_INVALID/,
  );
});

test("fails closed for a duplicate response identity or malformed CSV", () => {
  assert.throws(() => selectExactCensusBatchGeocodes({
    records: [records[0]],
    censusCsv: '"mmtc-1","input"\n',
    bounds,
  }), /RESPONSE_ROW_INVALID/);
  assert.throws(() => parseCsv('"unterminated'), /UNTERMINATED_QUOTE/);
});

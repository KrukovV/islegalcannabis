import assert from "node:assert/strict";
import test from "node:test";
import { selectCensusEligibleOfficialAddressRecords } from "./build_census_address_input.mjs";

const source = {
  source_id: "official-example",
  geo_id: "US-CO",
  authority: "Example regulator",
  source_url: "https://example.gov/registry",
  source_type: "JSON",
  store_types: ["ADULT_USE_RETAIL"],
  source_classification: "OFFICIAL_REGULATOR",
  official: true,
  jurisdiction_validation: "VALID",
  status: "ACTIVE",
  discovered_at: "2026-08-14T00:00:00.000Z",
  checked_at: "2026-08-14T00:00:00.000Z",
  parser: "JSON_REGISTRY_V1",
  refresh_policy: "MANUAL",
  provenance_evidence: "Current official registry.",
  independent_validation: "PROVEN",
  inspection: {
    evaluated_at: "2026-08-14T00:00:00.000Z",
    authority_match: "PROVEN",
    jurisdiction_match: "PROVEN",
    cannabis_specificity: "PROVEN",
    store_semantics_match: "PROVEN",
    license_semantics_match: "PROVEN",
    data_extractability: "PROVEN",
    freshness: "PROVEN",
    coverage: "PROVEN",
    source_stability: "STRONG",
  },
  confidence: "STRONG",
};

function row(overrides = {}) {
  return {
    source_record_id: "LIC-1",
    address: "1 Main Street",
    city: "Denver",
    region: "CO",
    postal_code: "80202",
    ...overrides,
  };
}

test("selects only complete official address rows that lack all source coordinates", () => {
  const result = selectCensusEligibleOfficialAddressRecords({
    source,
    extractedRecords: [
      row({ source_record_id: "LIC-2" }),
      row({ source_record_id: "LIC-1", latitude: null, longitude: null }),
      row({ source_record_id: "LIC-3", latitude: 39.7, longitude: -104.9 }),
      row({ source_record_id: "LIC-4", address: "" }),
    ],
  });
  assert.deepEqual(result, [
    { source_record_id: "LIC-1", address: "1 Main Street", city: "Denver", region: "CO", postal_code: "80202" },
    { source_record_id: "LIC-2", address: "1 Main Street", city: "Denver", region: "CO", postal_code: "80202" },
  ]);
});

test("fails closed for an unvalidated source", () => {
  assert.throws(
    () => selectCensusEligibleOfficialAddressRecords({ source: { ...source, inspection: { ...source.inspection, coverage: "UNPROVEN" } }, extractedRecords: [row()] }),
    /CENSUS_INPUT_SOURCE_NOT_INDEPENDENTLY_VALIDATED:official-example/,
  );
});

test("retains a declared no-ZIP official address and collapses byte-identical licence rows", () => {
  const result = selectCensusEligibleOfficialAddressRecords({
    source: { ...source, coordinate_augmentation: { allow_missing_source_postal_code: true } },
    extractedRecords: [
      row({ postal_code: "" }),
      row({ postal_code: "" }),
    ],
  });
  assert.deepEqual(result, [{
    source_record_id: "LIC-1",
    address: "1 Main Street",
    city: "Denver",
    region: "CO",
    postal_code: "",
    allow_missing_source_postal_code: true,
  }]);
});

test("fails closed when repeated official licence rows disagree on the geocoding address", () => {
  assert.throws(
    () => selectCensusEligibleOfficialAddressRecords({
      source,
      extractedRecords: [row(), row({ address: "2 Main Street" })],
    }),
    /CENSUS_INPUT_DUPLICATE_SOURCE_RECORD:LIC-1/,
  );
});

test("parses only a declaratively configured combined official US address", () => {
  const result = selectCensusEligibleOfficialAddressRecords({
    source: {
      ...source,
      coordinate_augmentation: {
        source_address_parser: "US_COMBINED_STREET_CITY_STATE_ZIP_V1",
      },
    },
    extractedRecords: [row({ address: "9300 Telegraph, Redford MI 48239", city: "", region: "MI", postal_code: "" })],
  });
  assert.deepEqual(result, [{
    source_record_id: "LIC-1",
    address: "9300 Telegraph",
    city: "Redford",
    region: "MI",
    postal_code: "48239",
  }]);
});

test("parses a comma-delimited official address only with its declared region and complete ZIP", () => {
  const result = selectCensusEligibleOfficialAddressRecords({
    source: {
      ...source,
      coordinate_augmentation: {
        source_address_parser: "US_COMMA_DELIMITED_ADDRESS_WITH_DECLARED_REGION_V1",
      },
    },
    extractedRecords: [
      row({ source_record_id: "LOC-1", address: "870 W 1150 S, Suite C, Brigham City, 84302", city: "", region: "UT", postal_code: "" }),
      row({ source_record_id: "LOC-2", address: "1991 S 3600 W, Salt Lake City, UT, 84104", city: "", region: "UT", postal_code: "" }),
      row({ source_record_id: "LOC-3", address: "20 E Main Street, Price, UT 84501", city: "", region: "UT", postal_code: "" }),
      row({ source_record_id: "LOC-4", address: "6041 State St, Murray, UT 84107484", city: "", region: "UT", postal_code: "" }),
    ],
  });
  assert.deepEqual(result.map((record) => [record.source_record_id, record.address, record.city, record.region, record.postal_code]), [
    ["LOC-1", "870 W 1150 S, Suite C", "Brigham City", "UT", "84302"],
    ["LOC-2", "1991 S 3600 W", "Salt Lake City", "UT", "84104"],
    ["LOC-3", "20 E Main Street", "Price", "UT", "84501"],
  ]);
});

test("fails closed when a configured source parser cannot produce a bounded Census input", () => {
  assert.throws(
    () => selectCensusEligibleOfficialAddressRecords({
      source: { ...source, coordinate_augmentation: { source_address_parser: "US_ONELINE_USPS_EXACT_V1" } },
      extractedRecords: [row()],
    }),
    /CENSUS_INPUT_SOURCE_ADDRESS_PARSER_UNSUPPORTED:US_ONELINE_USPS_EXACT_V1/,
  );
});

test("creates distinct exact-coordinate identities for multiple official sites under one licence", () => {
  const multiSiteSource = {
    ...source,
    coordinate_augmentation: {
      source_address_parser: "US_ADDRESS_STATE_ZIP_WITH_DECLARED_CITY_V1",
      source_record_id_strategy: "LICENSE_AND_ADDRESS_V1",
    },
  };
  const result = selectCensusEligibleOfficialAddressRecords({
    source: multiSiteSource,
    extractedRecords: [
      row({ source_record_id: "LIC-1", address: "6445 Lake Road Terrace, Unit 100 Woodbury, MN 55125", city: "Woodbury", region: "MN", postal_code: "" }),
      row({ source_record_id: "LIC-1", address: "5152 Hiawatha Avenue, Minneapolis, MN 55417", city: "Minneapolis", region: "MN", postal_code: "" }),
    ],
  });
  assert.equal(result.length, 2);
  assert.notEqual(result[0].source_record_id, result[1].source_record_id);
  assert.ok(result.every((record) => record.source_record_id.startsWith("LIC-1:")));
  assert.deepEqual(result.map((record) => [record.address, record.city, record.region, record.postal_code]).sort(), [
    ["5152 Hiawatha Avenue", "Minneapolis", "MN", "55417"],
    ["6445 Lake Road Terrace, Unit 100", "Woodbury", "MN", "55125"],
  ]);
});

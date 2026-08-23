import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { applyExactCensusCoordinateAugmentation, applyExactCoordinateAugmentation, applyExactPublicCivicCoordinateAugmentation, loadExactCensusCoordinateAugmentation, loadExactCoordinateAugmentation, sourceCoordinateRecordId } from "./store_coordinate_augmentation.mjs";
import { extractStoreSourcePayload } from "./store_source_adapters.mjs";

const source = {
  coordinate_augmentation: {
    provider: "US_CENSUS_PUBLIC_AR_CURRENT",
    source_record_id_field: "id",
    source_address_fields: { address: "street", city: "city", region: "state", postal_code: "zip" },
    source_coordinate_fields: { latitude: "lat", longitude: "lng" },
  },
};

const payload = {
  census_benchmark: "Public_AR_Current",
  records: [{
    source_record_id: "123",
    address: "10 Main Street",
    city: "Sample City",
    region: "MA",
    postal_code: "01001",
    allow_missing_source_postal_code: true,
    latitude: 42.1,
    longitude: -72.1,
    public_source_fields: { census_matched_address: "10 MAIN ST, SAMPLE CITY, MA, 01001" },
  }],
};

test("adds only an exact Census coordinate to the matching official source record", () => {
  const [record, untouched] = applyExactCensusCoordinateAugmentation({ source, payload, rows: [
    { id: 123, street: "10 Main Street", city: "Sample City", state: "MA", zip: "01001", lat: null, lng: null },
    { id: 124, street: "11 Main Street", city: "Sample City", state: "MA", zip: "01001", lat: null, lng: null },
  ] });
  assert.deepEqual([record.lat, record.lng, record.coordinates_source, record.coordinates_confidence], [42.1, -72.1, "US_CENSUS_PUBLIC_AR_CURRENT_EXACT_ADDRESS", "STRONG"]);
  assert.equal(record.public_source_fields.census_benchmark, "Public_AR_Current");
  assert.equal(untouched.lat, null);
});

test("accepts only standard USPS street-type normalization for an otherwise exact official address", () => {
  const [record] = applyExactCensusCoordinateAugmentation({
    source,
    payload: {
      ...payload,
      records: [{
        ...payload.records[0],
        address: "10 Main Ave",
        public_source_fields: { census_matched_address: "10 MAIN AVE, SAMPLE CITY, MA, 01001" },
      }],
    },
    rows: [{ id: 123, street: "10 Main Avenue", city: "Sample City", state: "MA", zip: "01001", lat: null, lng: null }],
  });
  assert.equal(record.lat, 42.1);
  assert.throws(
    () => applyExactCensusCoordinateAugmentation({
      source,
      payload: { ...payload, records: [{ ...payload.records[0], address: "11 Main Ave" }] },
      rows: [{ id: 123, street: "10 Main Avenue", city: "Sample City", state: "MA", zip: "01001", lat: null, lng: null }],
    }),
    /ADDRESS_MISMATCH/,
  );
});

test("fails closed on an address mismatch or a pre-existing source coordinate", () => {
  assert.throws(() => applyExactCensusCoordinateAugmentation({ source, payload, rows: [{ id: 123, street: "11 Main Street", city: "Sample City", state: "MA", zip: "01001", lat: null, lng: null }] }), /ADDRESS_MISMATCH/);
  assert.throws(() => applyExactCensusCoordinateAugmentation({ source, payload, rows: [{ id: 123, street: "10 Main Street", city: "Sample City", state: "MA", zip: "01001", lat: 42.1, lng: null }] }), /SOURCE_COORDINATE_ALREADY_PRESENT/);
});

test("rejects the technical 0,0 coordinate sentinel", () => {
  assert.throws(
    () => applyExactCensusCoordinateAugmentation({
      source,
      payload: { ...payload, records: [{ ...payload.records[0], latitude: 0, longitude: 0 }] },
      rows: [{ id: 123, street: "10 Main Street", city: "Sample City", state: "MA", zip: "01001", lat: null, lng: null }],
    }),
    /STORE_COORDINATE_AUGMENTATION_COORDINATE_INVALID:123/,
  );
});

test("allows an unpublished source ZIP only with an explicit exact street-city-state policy", () => {
  const postalUnpublishedSource = {
    coordinate_augmentation: {
      ...source.coordinate_augmentation,
      allow_missing_source_postal_code: true,
    },
  };
  const [record] = applyExactCensusCoordinateAugmentation({
    source: postalUnpublishedSource,
    payload,
    rows: [{ id: 123, street: "10 Main Street", city: "Sample City", state: "MA", zip: "", lat: null, lng: null }],
  });
  assert.equal(record.public_source_fields.census_match_policy, "EXACT_STREET_CITY_STATE_OFFICIAL_POSTAL_UNPUBLISHED");
  assert.throws(
    () => applyExactCensusCoordinateAugmentation({ source, payload, rows: [{ id: 123, street: "10 Main Street", city: "Sample City", state: "MA", zip: "", lat: null, lng: null }] }),
    /ADDRESS_MISMATCH/,
  );
  assert.throws(
    () => applyExactCensusCoordinateAugmentation({ source: postalUnpublishedSource, payload, rows: [{ id: 123, street: "10 Main Street", city: "Other City", state: "MA", zip: "", lat: null, lng: null }] }),
    /ADDRESS_MISMATCH/,
  );
  assert.throws(
    () => applyExactCensusCoordinateAugmentation({
      source: postalUnpublishedSource,
      payload: { ...payload, records: [{ ...payload.records[0], allow_missing_source_postal_code: false }] },
      rows: [{ id: 123, street: "10 Main Street", city: "Sample City", state: "MA", zip: "", lat: null, lng: null }],
    }),
    /ADDRESS_MISMATCH/,
  );
});

test("parses an explicitly declared combined US public source address before augmenting it", () => {
  const combinedAddressSource = {
    coordinate_augmentation: {
      provider: "US_CENSUS_PUBLIC_AR_CURRENT",
      source_record_id_field: "id",
      source_address_parser: "US_COMBINED_STREET_CITY_STATE_ZIP_V1",
      source_address_fields: { combined_address: "Address" },
      source_coordinate_fields: { latitude: "lat", longitude: "lng" },
    },
  };
  const [record] = applyExactCensusCoordinateAugmentation({
    source: combinedAddressSource,
    payload,
    rows: [{ id: 123, Address: "10 Main Street, Sample City MA 01001", lat: null, lng: null }],
  });
  assert.deepEqual([record.lat, record.lng, record.source_street_address, record.source_city, record.source_postal_code], [42.1, -72.1, "10 Main Street", "Sample City", "01001"]);
  assert.throws(
    () => applyExactCensusCoordinateAugmentation({ source: combinedAddressSource, payload, rows: [{ id: 123, Address: "10 Main Street", lat: null, lng: null }] }),
    /ADDRESS_PARSE_INVALID/,
  );
});

test("parses a declared comma-delimited address only when its source region and ZIP are explicit", () => {
  const commaDelimitedSource = {
    coordinate_augmentation: {
      provider: "US_CENSUS_PUBLIC_AR_CURRENT",
      source_record_id_field: "source_record_id",
      source_address_parser: "US_COMMA_DELIMITED_ADDRESS_WITH_DECLARED_REGION_V1",
      source_address_fields: { combined_address: "address", region: "region" },
      source_coordinate_fields: { latitude: "latitude", longitude: "longitude" },
    },
  };
  const result = applyExactCensusCoordinateAugmentation({
    source: commaDelimitedSource,
    rows: [{ source_record_id: "LOC-1", address: "870 W 1150 S, Suite C, Brigham City, 84302", region: "UT" }],
    payload: { census_benchmark: "Public_AR_Current", records: [{
      source_record_id: "LOC-1",
      address: "870 W 1150 S, Suite C",
      city: "Brigham City",
      region: "UT",
      postal_code: "84302",
      census_matched_postal_code: "84302",
      latitude: 41.5105,
      longitude: -112.0155,
      public_source_fields: { census_matched_address: "870 W 1150 S STE C, BRIGHAM CITY, UT, 84302" },
    }] },
  });
  assert.equal(result[0].latitude, 41.5105);
  assert.equal(result[0].source_city, "Brigham City");
});

test("keeps multiple official sites under one licence isolated by their declared address identity", () => {
  const multiSiteSource = {
    coordinate_augmentation: {
      provider: "US_CENSUS_PUBLIC_AR_CURRENT",
      source_record_id_field: "License Number",
      source_record_id_strategy: "LICENSE_AND_ADDRESS_V1",
      source_address_parser: "US_ADDRESS_STATE_ZIP_WITH_DECLARED_CITY_V1",
      source_address_fields: { combined_address: "Retail Site Address", city: "City", region: "region" },
      source_coordinate_fields: { latitude: "latitude", longitude: "longitude" },
    },
    default_fields: { region: "MN" },
  };
  const rows = [
    { "License Number": "LIC-1", "Retail Site Address": "5152 Hiawatha Avenue, Minneapolis, MN 55417", City: "Minneapolis", latitude: null, longitude: null },
    { "License Number": "LIC-1", "Retail Site Address": "6445 Lake Road Terrace, Unit 100 Woodbury, MN 55125", City: "Woodbury", latitude: null, longitude: null },
  ];
  const first = { address: "5152 Hiawatha Avenue", city: "Minneapolis", region: "MN", postal_code: "55417" };
  const second = { address: "6445 Lake Road Terrace, Unit 100", city: "Woodbury", region: "MN", postal_code: "55125" };
  const config = multiSiteSource.coordinate_augmentation;
  const payload = {
    census_benchmark: "Public_AR_Current",
    records: [
      { source_record_id: sourceCoordinateRecordId({ ...rows[0], region: "MN" }, config, first), ...first, latitude: 44.97, longitude: -93.24, census_matched_postal_code: "55417", public_source_fields: { census_matched_address: "5152 HIAWATHA AVE, MINNEAPOLIS, MN, 55417" } },
      { source_record_id: sourceCoordinateRecordId({ ...rows[1], region: "MN" }, config, second), ...second, latitude: 44.88, longitude: -92.99, census_matched_postal_code: "55125", public_source_fields: { census_matched_address: "6445 LAKE RD TER, UNIT 100, WOODBURY, MN, 55125" } },
    ],
  };
  const applied = applyExactCensusCoordinateAugmentation({ source: multiSiteSource, rows, payload });
  assert.deepEqual(applied.map((row) => [row.latitude, row.longitude, row.source_street_address, row.source_city, row.source_postal_code]), [
    [44.97, -93.24, "5152 Hiawatha Avenue", "Minneapolis", "55417"],
    [44.88, -92.99, "6445 Lake Road Terrace, Unit 100", "Woodbury", "55125"],
  ]);
});

test("retains an unparseable multi-site source row without attaching a coordinate", () => {
  const source = {
    coordinate_augmentation: {
      provider: "US_CENSUS_PUBLIC_AR_CURRENT",
      source_record_id_field: "License Number",
      source_record_id_strategy: "LICENSE_AND_ADDRESS_V1",
      source_address_parser: "US_ADDRESS_STATE_ZIP_WITH_DECLARED_CITY_V1",
      source_address_fields: { combined_address: "Retail Site Address", city: "City", region: "region" },
      source_coordinate_fields: { latitude: "latitude", longitude: "longitude" },
    },
    default_fields: { region: "MN" },
  };
  const [record] = applyExactCensusCoordinateAugmentation({
    source,
    rows: [{ "License Number": "LIC-1", "Retail Site Address": "unparseable address", City: "Minneapolis", latitude: null, longitude: null }],
    payload: { census_benchmark: "Public_AR_Current", records: [] },
  });
  assert.equal(record.latitude, null);
  assert.equal(record.longitude, null);
});

test("uses a declarative source default while matching a fixed jurisdiction field", () => {
  const defaultRegionSource = {
    ...source,
    default_fields: { region: "MA" },
    coordinate_augmentation: {
      ...source.coordinate_augmentation,
      source_address_fields: { address: "street", city: "city", region: "region", postal_code: "zip" },
    },
  };
  const [record] = applyExactCensusCoordinateAugmentation({
    source: defaultRegionSource,
    payload,
    rows: [{ id: 123, street: "10 Main Street", city: "Sample City", zip: "01001", lat: null, lng: null }],
  });
  assert.deepEqual([record.lat, record.lng], [42.1, -72.1]);
});

test("accepts a declared combined source address only when the Census normalized oneline is identical", () => {
  const onelineSource = {
    coordinate_augmentation: {
      provider: "US_CENSUS_PUBLIC_AR_CURRENT",
      source_record_id_field: "id",
      source_address_parser: "US_ONELINE_USPS_EXACT_V1",
      source_address_fields: { combined_address: "physicalAddress" },
      source_coordinate_fields: { latitude: "lat", longitude: "lng" },
    },
  };
  const onelinePayload = {
    census_benchmark: "Public_AR_Current",
    records: [{
      source_record_id: "123",
      address: "2662 HWY 51 S",
      city: "HERNANDO",
      region: "MS",
      postal_code: "38632",
      latitude: 34.821930089149,
      longitude: -89.994038451914,
      public_source_fields: { census_matched_address: "2662 HWY 51 S, HERNANDO, MS, 38632" },
    }],
  };
  const [record] = applyExactCensusCoordinateAugmentation({
    source: onelineSource,
    payload: onelinePayload,
    rows: [{ id: 123, physicalAddress: "2662 HIGHWAY 51 S HERNANDO, MS 38632", lat: null, lng: null }],
  });
  assert.deepEqual([record.lat, record.lng, record.source_street_address, record.source_city, record.source_postal_code], [34.821930089149, -89.994038451914, "2662 HWY 51 S", "HERNANDO", "38632"]);
  assert.throws(
    () => applyExactCensusCoordinateAugmentation({
      source: onelineSource,
      payload: onelinePayload,
      rows: [{ id: 123, physicalAddress: "2662 HIGHWAY 51 S OXFORD, MS 38632", lat: null, lng: null }],
    }),
    /ADDRESS_MISMATCH/,
  );
});

test("adds a public civic coordinate only after exact official civic-address evidence passes every declared guard", () => {
  const civicSource = {
    coordinate_augmentation: {
      provider: "PUBLIC_GEOJSON_EXACT_CIVIC_ADDRESS_V1",
      source_record_id_field: "licence",
      source_address_fields: { address: "street", city: "city", region: "province", postal_code: "postal" },
      source_coordinate_fields: { latitude: "latitude", longitude: "longitude" },
      coordinate_bounds: { minimum_latitude: 48, maximum_latitude: 60.2, minimum_longitude: -140, maximum_longitude: -114 },
      required_public_source_fields: {
        match_precision: "CIVIC_NUMBER",
        location_positional_accuracy: "HIGH",
        location_descriptor: "PARCELPOINT",
        is_official: true,
        site_status: "ACTIVE",
      },
    },
  };
  const civicPayload = {
    coordinate_augmentation_provider: "PUBLIC_GEOJSON_EXACT_CIVIC_ADDRESS_V1",
    public_geocoder_authority: "Example public address geocoder",
    response_sha256: "a".repeat(64),
    records: [{
      source_record_id: "450279",
      address: "245 Birch Ave",
      city: "100 Mile House",
      region: "BC",
      postal_code: "V0K2E0",
      latitude: 51.6447284,
      longitude: -121.2950617,
      public_source_fields: {
        full_address: "245 Birch Ave, 100 Mile House, BC",
        match_precision: "CIVIC_NUMBER",
        location_positional_accuracy: "HIGH",
        location_descriptor: "PARCELPOINT",
        is_official: true,
        site_status: "ACTIVE",
      },
    }],
  };
  const [record] = applyExactPublicCivicCoordinateAugmentation({
    source: civicSource,
    payload: civicPayload,
    rows: [{ licence: "450279", street: "245 Birch Ave", city: "100 Mile House", province: "BC", postal: "V0K2E0" }],
  });
  assert.deepEqual([record.latitude, record.longitude, record.coordinates_source, record.coordinates_confidence], [51.6447284, -121.2950617, "OFFICIAL_PUBLIC_EXACT_CIVIC_ADDRESS_GEOCODER", "STRONG"]);
  assert.equal(record.public_source_fields.exact_civic_geocoder_match_precision, "CIVIC_NUMBER");
  assert.throws(
    () => applyExactPublicCivicCoordinateAugmentation({
      source: civicSource,
      payload: { ...civicPayload, records: [{ ...civicPayload.records[0], public_source_fields: { ...civicPayload.records[0].public_source_fields, match_precision: "STREET" } }] },
      rows: [{ licence: "450279", street: "245 Birch Ave", city: "100 Mile House", province: "BC", postal: "V0K2E0" }],
    }),
    /PUBLIC_MATCH_INVALID:450279:match_precision/,
  );
  assert.throws(
    () => applyExactPublicCivicCoordinateAugmentation({
      source: civicSource,
      payload: civicPayload,
      rows: [{ licence: "450279", street: "246 Birch Ave", city: "100 Mile House", province: "BC", postal: "V0K2E0" }],
    }),
    /ADDRESS_MISMATCH:450279/,
  );
});

test("accepts a City of Calgary parcel point only under its declared unit-insensitive civic policy", () => {
  const calgarySource = {
    coordinate_augmentation: {
      provider: "PUBLIC_CIVIC_ADDRESS_POINT_V1",
      source_record_id_field: "source_record_id",
      source_address_fields: { address: "address", city: "city", region: "region", postal_code: "postal_code" },
      source_coordinate_fields: { latitude: "latitude", longitude: "longitude" },
      coordinate_bounds: { minimum_latitude: 50.7, maximum_latitude: 51.3, minimum_longitude: -114.4, maximum_longitude: -113.8 },
      address_match_policy: "CALGARY_PARCEL_CIVIC_V1",
      allow_unpublished_coordinate_postal_code: true,
      required_public_source_fields: {
        full_address: "8060 SILVER SPRINGS BV NW",
        address_type: "Parcel",
        city_data_provider: "City of Calgary",
        postal_code_published: false,
      },
    },
  };
  const calgaryPayload = {
    coordinate_augmentation_provider: "PUBLIC_CIVIC_ADDRESS_POINT_V1",
    public_geocoder_authority: "City of Calgary Open Data",
    response_sha256: "b".repeat(64),
    records: [{
      source_record_id: "AGLC-1",
      address: "208-8060 SILVER SPRINGS BLVD NW",
      city: "CALGARY",
      region: "AB",
      postal_code: "T3B 5K1",
      latitude: 51.11573032132341,
      longitude: -114.20520943688113,
      public_source_fields: {
        full_address: "8060 SILVER SPRINGS BV NW",
        address_type: "Parcel",
        city_data_provider: "City of Calgary",
        postal_code_published: false,
      },
    }],
  };
  const [record] = applyExactPublicCivicCoordinateAugmentation({
    source: calgarySource,
    payload: calgaryPayload,
    rows: [{ source_record_id: "AGLC-1", address: "208-8060 SILVER SPRINGS BLVD NW", city: "CALGARY", region: "AB", postal_code: "T3B 5K1" }],
  });
  assert.deepEqual([record.latitude, record.longitude, record.coordinates_source], [51.11573032132341, -114.20520943688113, "OFFICIAL_PUBLIC_EXACT_CIVIC_ADDRESS_POINT"]);
  assert.throws(
    () => applyExactPublicCivicCoordinateAugmentation({
      source: calgarySource,
      payload: calgaryPayload,
      rows: [{ source_record_id: "AGLC-1", address: "208-8060 SILVER SPRINGS BLVD NW", city: "EDMONTON", region: "AB", postal_code: "T3B 5K1" }],
    }),
    /ADDRESS_MISMATCH:AGLC-1/,
  );
  assert.throws(
    () => applyExactPublicCivicCoordinateAugmentation({
      source: { ...calgarySource, coordinate_augmentation: { ...calgarySource.coordinate_augmentation, allow_unpublished_coordinate_postal_code: false } },
      payload: calgaryPayload,
      rows: [{ source_record_id: "AGLC-1", address: "208-8060 SILVER SPRINGS BLVD NW", city: "CALGARY", region: "AB", postal_code: "T3B 5K1" }],
    }),
    /ADDRESS_INVALID:AGLC-1/,
  );
});

test("loads only a SHA-bound augmentation for the configured current source snapshot", () => {
  const registry = JSON.parse(fs.readFileSync("data/store_truth/store_source_registry.json", "utf8"));
  const configured = registry.sources.find((item) => item.source_id === "official-ca-dcc-current-active-retail-license-search-2026-08-13");
  assert.equal(loadExactCensusCoordinateAugmentation(configured).records.length, 1);
  assert.throws(
    () => loadExactCensusCoordinateAugmentation({ ...configured, snapshot_sha256: "0".repeat(64) }),
    /SOURCE_SNAPSHOT_MISMATCH/,
  );
});

test("adds only the explicit BC LCRB record with a SHA-bound exact civic government geocode", () => {
  const registry = JSON.parse(fs.readFileSync("data/store_truth/store_source_registry.json", "utf8"));
  const configured = registry.sources.find((item) => item.source_id === "official-ca-bc-lcrb-current-legal-retailers-2026-08-15");
  const rows = JSON.parse(fs.readFileSync(configured.snapshot_path, "utf8"));
  const payload = loadExactCoordinateAugmentation(configured);
  const applied = applyExactCoordinateAugmentation({ source: configured, rows, payload });
  const visibleCandidate = applied.find((row) => row["Licence Number"] === "450279");
  const stillBlocked = applied.find((row) => row["Licence Number"] === "450239");
  assert.deepEqual([visibleCandidate.latitude, visibleCandidate.longitude, visibleCandidate.coordinates_confidence], [51.6447284, -121.2950617, "STRONG"]);
  assert.equal(visibleCandidate.public_source_fields.exact_civic_geocoder_match_precision, "CIVIC_NUMBER");
  assert.equal(stillBlocked.latitude, undefined);
  assert.equal(stillBlocked.longitude, undefined);
});

test("adds only the 15 SHA-bound City of Calgary exact Parcel points to the current AGLC retailer snapshot", () => {
  const registry = JSON.parse(fs.readFileSync("data/store_truth/store_source_registry.json", "utf8"));
  const configured = registry.sources.find((item) => item.source_id === "official-ca-ab-aglc-current-cannabis-retailers-2026-08-15");
  const rows = JSON.parse(fs.readFileSync(configured.snapshot_path, "utf8"));
  const extracted = extractStoreSourcePayload(configured, rows);
  const silverSprings = extracted.records.find((row) => row.source_record_id === "AGLC_RETAILER:13TH_FLOOR_CANNABIS:208_8060_SILVER_SPRINGS_BLVD_NW:CALGARY:T3B_5K1");
  const blocked = extracted.records.find((row) => row.source_record_id === "AGLC_RETAILER:420_PREMIUM_MARKET:46_SAGE_HILL_PASS_NW:CALGARY:T3R_0S4");
  assert.equal(extracted.extraction_state, "EXTRACTED");
  assert.equal(extracted.records.filter((row) => row.coordinates_source === "OFFICIAL_PUBLIC_EXACT_CIVIC_ADDRESS_POINT").length, 15);
  assert.deepEqual([silverSprings.latitude, silverSprings.longitude], [51.11573032132341, -114.20520943688113]);
  assert.equal(blocked.latitude, undefined);
  assert.equal(blocked.longitude, undefined);
});

test("adds Virginia CCA Census points only to SHA-bound current regulator cards", () => {
  const registry = JSON.parse(fs.readFileSync("data/store_truth/store_source_registry.json", "utf8"));
  const configured = registry.sources.find((item) => item.source_id === "official-va-cca-current-licensed-medical-dispensary-locations-2026-08-13");
  const rows = JSON.parse(fs.readFileSync(configured.snapshot_path, "utf8"));
  const payload = loadExactCensusCoordinateAugmentation(configured);
  const applied = applyExactCensusCoordinateAugmentation({ source: configured, rows, payload });
  const bristol = applied.find((row) => row.source_record_id === "squarespace-location:440e8abd4330b4bb32126fc3");
  const norfolk = applied.find((row) => row.source_record_id === "squarespace-location:44fc680f53a407bc2f3b6906");
  const untouched = applied.find((row) => row.source_record_id === "squarespace-location:39079629cf3e53ce12f44f15");
  assert.deepEqual([bristol.latitude, bristol.longitude], [36.601387030993, -82.219533782391]);
  assert.equal(bristol.public_source_fields.census_matched_address, "780 GATE CITY HWY, BRISTOL, VA, 24201");
  assert.deepEqual([norfolk.latitude, norfolk.longitude], [36.915577342175, -76.272731372457]);
  assert.equal(norfolk.public_source_fields.census_matched_address, "7635 GRANBY ST, NORFOLK, VA, 23505");
  assert.equal(untouched.latitude, null);
  assert.equal(untouched.longitude, null);
});

test("adds all eligible North Dakota HHS Census points only under the explicit no-source-ZIP policy", () => {
  const registry = JSON.parse(fs.readFileSync("data/store_truth/store_source_registry.json", "utf8"));
  const configured = registry.sources.find((item) => item.source_id === "official-nd-hhs-current-medical-dispensary-directory-2026-08-14");
  const rows = JSON.parse(fs.readFileSync(configured.snapshot_path, "utf8"));
  const payload = loadExactCensusCoordinateAugmentation(configured);
  const applied = applyExactCensusCoordinateAugmentation({ source: configured, rows, payload });
  const bismarck = applied.find((row) => row.source_record_id === "html-heading:040cacf09bbc3d37bde7bb0a");
  const grandForks = applied.find((row) => row.source_record_id === "html-heading:e8b0289135005023b9f143cf");
  const devilsLake = applied.find((row) => row.source_record_id === "html-heading:739af987550ea48d113f31af");
  assert.deepEqual([bismarck.latitude, bismarck.longitude], [46.807292372854, -100.812148904151]);
  assert.equal(bismarck.public_source_fields.census_match_policy, "EXACT_STREET_CITY_STATE_OFFICIAL_POSTAL_UNPUBLISHED");
  assert.deepEqual([grandForks.latitude, grandForks.longitude], [47.932112387343, -97.052051666009]);
  assert.equal(devilsLake.latitude, null);
  assert.equal(devilsLake.longitude, null);
});

test("adds the Michigan CRA Census point only after parsing the declared combined official address", () => {
  const registry = JSON.parse(fs.readFileSync("data/store_truth/store_source_registry.json", "utf8"));
  const configured = registry.sources.find((item) => item.source_id === "official-mi-cra-current-adult-use-retailer-directory-2026-08-14");
  const rows = JSON.parse(fs.readFileSync(configured.snapshot_path, "utf8")).records;
  const payload = loadExactCensusCoordinateAugmentation(configured);
  const applied = applyExactCensusCoordinateAugmentation({ source: configured, rows, payload });
  const betterBuds = applied.find((row) => row["Record Number"] === "AU-R-001591");
  const untouched = applied.find((row) => row["Record Number"] === "AU-R-001604");
  assert.deepEqual([betterBuds.latitude, betterBuds.longitude, betterBuds.source_street_address, betterBuds.source_city, betterBuds.source_postal_code], [41.98432628146, -84.351221388541, "202 S Steer ST", "Addison", "49220"]);
  assert.equal(untouched.latitude, undefined);
  assert.equal(untouched.longitude, undefined);
});

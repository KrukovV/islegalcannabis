import assert from "node:assert/strict";
import test from "node:test";
import { selectExactCalgaryParcelAddressPoints } from "./fetch_socrata_civic_address_points.mjs";

const sourceRecords = [
  { source_record_id: "AGLC-1", address: "208-8060 SILVER SPRINGS BLVD NW", city: "CALGARY", region: "AB", postal_code: "T3B 5K1" },
  { source_record_id: "AGLC-2", address: "99 UNKNOWN STREET SW", city: "CALGARY", region: "AB", postal_code: "T1A 1A1" },
];

test("keeps only a unique exact Calgary civic parcel point after declared unit and street-type normalization", () => {
  const result = selectExactCalgaryParcelAddressPoints({
    sourceRecords,
    responsesBySourceRecordId: {
      "AGLC-1": [{ address: "8060 SILVER SPRINGS BV NW", address_type: "Parcel", latitude: "51.11573032132341", longitude: "-114.20520943688113" }],
      "AGLC-2": [{ address: "99 UNKNOWN ST SW", address_type: "Street", latitude: "51.1", longitude: "-114.2" }],
    },
    limit: 2,
  });
  assert.deepEqual(result.counts, {
    source_candidates: 2,
    one_to_one_exact_civic_parcel_points: 1,
    blocked_no_unique_exact_civic_parcel_point: 1,
  });
  assert.deepEqual(result.records[0], {
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
      civic_match_policy: "CALGARY_PARCEL_CIVIC_V1",
    },
  });
});

test("fails closed when an official candidate has no collected city response", () => {
  assert.throws(
    () => selectExactCalgaryParcelAddressPoints({ sourceRecords, responsesBySourceRecordId: {}, limit: 1 }),
    /SOCRATA_CIVIC_ADDRESS_RESPONSE_MISSING:AGLC-1/,
  );
});

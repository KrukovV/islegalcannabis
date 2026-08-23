import assert from "node:assert/strict";
import test from "node:test";
import { joinOfficialRegistryToOfficialCsvMap } from "./join_official_registry_csv_map.mjs";

const config = {
  registry_name_fields: ["business_name"],
  registry_city_field: "city",
  registry_store_type_field: "store_type",
  required_registry_values: { license_status: "ACTIVE" },
  map_name_field: "Dispensary Name",
  map_city_field: "City",
  map_address_field: "Street Address",
  map_latitude_field: "Latitude",
  map_longitude_field: "Longitude",
  map_type_field: "Serves Medical Patients",
  map_type_mapping: { YES: "MEDICAL_DISPENSARY", NO: "ADULT_USE_RETAIL" },
  coordinate_bounds: { west: -91, east: -87, south: 36, north: 43 },
};

function registry(overrides = {}) {
  return {
    business_name: "Current Dispensary",
    city: "Springfield",
    store_type: "ADULT_USE_RETAIL",
    license_status: "ACTIVE",
    ...overrides,
  };
}

function map(rows) {
  return [
    "Dispensary Name,Latitude,Longitude,Serves Medical Patients,City,Street Address",
    ...rows,
  ].join("\n");
}

test("joins only a uniquely exact current registry name, city, and store type", () => {
  const result = joinOfficialRegistryToOfficialCsvMap({
    registryRecords: [registry()],
    mapCsv: map(["Current Dispensary,39.8,-89.6,No,Springfield,1 Main St"]),
    config,
  });
  assert.equal(result.counts.joined_exact_unique, 1);
  assert.equal(result.records[0].address, "1 Main St");
  assert.equal(result.records[0].latitude, 39.8);
  assert.equal(result.records[0].coordinates_source, "OFFICIAL_CURRENT_REGULATOR_MAP_CSV");
});

test("does not attach an official map point across type, name, or coordinate boundaries", () => {
  const result = joinOfficialRegistryToOfficialCsvMap({
    registryRecords: [registry(), registry({ business_name: "Medical Dispensary", store_type: "MEDICAL_DISPENSARY" })],
    mapCsv: map([
      "Current Dispensary,39.8,-89.6,Yes,Springfield,1 Main St",
      "Different Dispensary,44,-89.6,No,Springfield,2 Main St",
    ]),
    config,
  });
  assert.equal(result.counts.joined_exact_unique, 0);
  assert.equal(result.records[0].latitude, undefined);
  assert.equal(result.counts.official_map_points, 1);
});

test("does not treat punctuation changes as an exact display-name identity", () => {
  const result = joinOfficialRegistryToOfficialCsvMap({
    registryRecords: [registry({ business_name: "Nature's Treatment" })],
    mapCsv: map(["Natures Treatment,39.8,-89.6,No,Springfield,1 Main St"]),
    config,
  });
  assert.equal(result.counts.joined_exact_unique, 0);
  assert.equal(result.records[0].latitude, undefined);
});

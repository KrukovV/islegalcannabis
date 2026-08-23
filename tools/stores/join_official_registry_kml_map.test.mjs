import assert from "node:assert/strict";
import test from "node:test";
import { joinOfficialRegistryToOfficialKmlMaps, registryRecordsFromPayload } from "./join_official_registry_kml_map.mjs";

const config = {
  registry_name_fields: ["trade_name", "legal_name"],
  required_registry_values: { store_type: "ADULT_USE_RETAIL", license_status: "ACTIVE" },
  coordinate_bounds: { west: -120, east: -114, south: 35, north: 42 },
};

function registry(overrides = {}) {
  return {
    license_number: "A-1",
    legal_name: "Alpha Holdings",
    trade_name: "Alpha Cannabis",
    store_type: "ADULT_USE_RETAIL",
    license_status: "ACTIVE",
    ...overrides,
  };
}

function mapPayload(name, coordinates = "-115.10,36.10,0") {
  return `<?xml version="1.0"?><kml><Document><Placemark><name>${name}</name><Point><coordinates>${coordinates}</coordinates></Point></Placemark></Document></kml>`;
}

function source(mapId = "official-map") {
  return { map_id: mapId, source_url: `https://regulator.example/${mapId}` };
}

test("joins only an exact unique active regulator display name", () => {
  const result = joinOfficialRegistryToOfficialKmlMaps({
    registryRecords: [registry()],
    mapPayloads: [{ source: source(), payload: mapPayload("Alpha Cannabis") }],
    config,
  });
  assert.equal(result.counts.joined_exact_unique, 1);
  assert.equal(result.records[0].longitude, -115.1);
  assert.equal(result.records[0].coordinates_source, "OFFICIAL_REGULATOR_LINKED_RETAIL_MAP_KML");
});

test("fails closed for duplicate registry or map display identities", () => {
  const duplicateRegistry = joinOfficialRegistryToOfficialKmlMaps({
    registryRecords: [registry(), registry({ license_number: "A-2" })],
    mapPayloads: [{ source: source(), payload: mapPayload("Alpha Cannabis") }],
    config,
  });
  assert.equal(duplicateRegistry.counts.joined_exact_unique, 0);
  const duplicateMap = joinOfficialRegistryToOfficialKmlMaps({
    registryRecords: [registry()],
    mapPayloads: [{ source: source(), payload: `${mapPayload("Alpha Cannabis")}${mapPayload("Alpha Cannabis", "-115.11,36.11,0")}` }],
    config,
  });
  assert.equal(duplicateMap.counts.joined_exact_unique, 0);
});

test("permits one unique trade-name map join when an unused legal name is shared", () => {
  const result = joinOfficialRegistryToOfficialKmlMaps({
    registryRecords: [registry(), registry({ license_number: "A-2", legal_name: "Alpha Holdings", trade_name: "Other Store" })],
    mapPayloads: [{ source: source(), payload: mapPayload("Alpha Cannabis") }],
    config,
  });
  assert.equal(result.counts.joined_exact_unique, 1);
});

test("does not attach an official map coordinate to a non-active or out-of-bounds record", () => {
  const inactive = joinOfficialRegistryToOfficialKmlMaps({
    registryRecords: [registry({ license_status: "SUSPENDED" })],
    mapPayloads: [{ source: source(), payload: mapPayload("Alpha Cannabis") }],
    config,
  });
  assert.equal(inactive.counts.joined_exact_unique, 0);
  const outside = joinOfficialRegistryToOfficialKmlMaps({
    registryRecords: [registry()],
    mapPayloads: [{ source: source(), payload: mapPayload("Alpha Cannabis", "-100,30,0") }],
    config,
  });
  assert.equal(outside.counts.joined_exact_unique, 0);
});

test("accepts an explicitly declared records envelope and rejects undeclared envelopes", () => {
  assert.deepEqual(registryRecordsFromPayload({ records: [registry()] }, { registry_records_field: "records" }), [registry()]);
  assert.throws(() => registryRecordsFromPayload({ records: [registry()] }, {}), /OFFICIAL_KML_JOIN_REGISTRY_SNAPSHOT_ARRAY_REQUIRED/);
  assert.throws(() => registryRecordsFromPayload({ records: [registry()] }, { registry_records_field: "records.nested" }), /OFFICIAL_KML_JOIN_REGISTRY_SNAPSHOT_ARRAY_REQUIRED/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { extractStoreSourcePayload } from "./store_source_adapters.mjs";
import { isIndependentlyValidatedStoreSource } from "./store_source_validation.mjs";

const source = { source_id: "registry", geo_id: "US-GA", source_url: "https://example.gov/registry", source_type: "JSON" };

test("extracts a generic JSON regulator record without country-specific code", () => {
  const result = extractStoreSourcePayload(source, [{ name: "Regulated Point", license: "GA-1", address: "1 Main", latitude: 33.7, longitude: -84.4, status: "ACTIVE" }]);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.deepEqual(result.records[0], {
    source_record_id: "GA-1", geo_id: "US-GA", legal_name: "Regulated Point", trade_name: "", license_number: "GA-1", license_type: "", store_type: "", address: "1 Main", city: "", region: "", postal_code: "", country: "", latitude: 33.7, longitude: -84.4, official_website: "", regulator_url: "https://example.gov/registry", license_status: "ACTIVE", operational_status: "ACTIVE",
  });
});

test("normalizes a literal CSV empty-value sentinel without hiding the legal store name", () => {
  const result = extractStoreSourcePayload(source, [{
    name: "Legal Store Name",
    dba: '""',
    license: "GA-EMPTY-1",
    address: "1 Main",
  }]);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records[0].legal_name, "Legal Store Name");
  assert.equal(result.records[0].trade_name, "");
});

test("parses official CSV empty cells and quoted fields without shifting subsequent columns", () => {
  const csvSource = {
    ...source,
    source_type: "CSV",
    field_map: { legal_name: "PremisesName", license_number: "LicenceNumber", address: "StreetAddress", city: "City" },
  };
  const result = extractStoreSourcePayload(csvSource, [
    "LicenceNumber,Unused,PremisesName,StreetAddress,City",
    '"CRSA-1","","Store, One","10 Main Street","Toronto"',
  ].join("\r\n"));
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.deepEqual(result.records[0], {
    source_record_id: "CRSA-1", geo_id: "US-GA", legal_name: "Store, One", trade_name: "", license_number: "CRSA-1", license_type: "", store_type: "", address: "10 Main Street", city: "Toronto", region: "", postal_code: "", country: "", latitude: undefined, longitude: undefined, official_website: "", regulator_url: "https://example.gov/registry", license_status: "", operational_status: "",
  });
});

test("extracts ArcGIS attributes and geometry through the common adapter", () => {
  const result = extractStoreSourcePayload({ ...source, source_type: "ARCGIS_FEATURE_SERVER" }, { features: [{ attributes: { OBJECTID: 7, business_name: "ArcGIS Point", license_number: "GA-2", street_address: "2 Main" }, geometry: { x: -84.3, y: 33.8 } }] });
  assert.equal(result.format, "ARCGIS_FEATURE_SERVER");
  assert.equal(result.records[0].source_record_id, "7");
  assert.equal(result.records[0].latitude, 33.8);
  assert.equal(result.records[0].longitude, -84.3);
});

test("prefers declared official WGS84 attributes over ArcGIS Web Mercator geometry", () => {
  const result = extractStoreSourcePayload({
    ...source,
    source_type: "ARCGIS_FEATURE_SERVER",
    field_map: { latitude: "latitude", longitude: "longitude" },
  }, {
    features: [{
      attributes: {
        OBJECTID: 8,
        business_name: "Official Coordinate Point",
        license_number: "GA-3",
        street_address: "3 Main",
        latitude: 33.8,
        longitude: -84.3,
      },
      geometry: { x: -9383079.0, y: 4006406.0 },
    }],
  });
  assert.equal(result.records[0].latitude, 33.8);
  assert.equal(result.records[0].longitude, -84.3);
});

test("preserves source-record proof fields without adding source-specific parsing", () => {
  const result = extractStoreSourcePayload(source, [{
    source_record_id: "official-row-3",
    name: "Regulated Point",
    license: "GA-3",
    address: "3 Main",
    status: "ACTIVE",
    adult_use: true,
    coordinates_source: "OFFICIAL_RECORD_NO_COORDINATES",
    coordinates_confidence: "UNKNOWN",
    location_evidence: "STRONG",
    legal_gate: { geo_access_legal: true },
  }]);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records[0].adult_use, true);
  assert.equal(result.records[0].source_record_id, "official-row-3");
  assert.equal(result.records[0].coordinates_source, "OFFICIAL_RECORD_NO_COORDINATES");
  assert.equal(result.records[0].location_evidence, "STRONG");
  assert.deepEqual(result.records[0].legal_gate, { geo_access_legal: true });
});

test("accepts an explicit official row identity only when the source opts into it", () => {
  const row = { source_record_id: "official-row-4", name: "City-only regulated point", city: "Sample City" };
  assert.equal(extractStoreSourcePayload(source, [row]).extraction_state, "NEEDS_REVIEW");
  const accepted = extractStoreSourcePayload({ ...source, allow_source_row_identity: true }, [row]);
  assert.equal(accepted.extraction_state, "EXTRACTED");
  assert.equal(accepted.records[0].source_record_id, "official-row-4");
});

test("uses a CKAN row identifier as an explicit stable source identity", () => {
  const result = extractStoreSourcePayload({ ...source, allow_source_row_identity: true }, [{
    _id: 42,
    name: "Official Pharmacy",
    address: "42 Main Street",
  }]);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records[0].source_record_id, "42");
  assert.equal(result.records[0].license_number, "");
});

test("retains a validated official named directory without treating a regional heading as a map location", async () => {
  const fs = await import("node:fs");
  const registry = JSON.parse(fs.readFileSync("data/store_truth/store_source_registry.json", "utf8"));
  const configured = registry.sources.find((item) => item.source_id === "official-hi-doh-medical-dispensary-directory-2026-08-13");
  const payload = JSON.parse(fs.readFileSync(configured.snapshot_path, "utf8"));
  const result = extractStoreSourcePayload(configured, payload);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records.length, 8);
  assert.ok(result.records.every((record) => record.address === "" && record.city === ""));
  assert.ok(result.records.every((record) => (record.latitude === undefined || record.latitude === null) && (record.longitude === undefined || record.longitude === null)));
  assert.ok(result.records.every((record) => record.location_evidence === "PARTIAL"));
  assert.ok(result.records.every((record) => record.public_source_fields.group_label.endsWith("Dispensaries")));
});

test("retains a certificate-blocked IRCCA pharmacy directory with official joined coordinates but no source promotion", async () => {
  const fs = await import("node:fs");
  const registry = JSON.parse(fs.readFileSync("data/store_truth/store_source_registry.json", "utf8"));
  const source = registry.sources.find((item) => item.source_id === "official-uy-ircca-current-authorized-pharmacies-2026-08-15");
  const snapshot = JSON.parse(fs.readFileSync(source.snapshot_path, "utf8"));
  const canonical = JSON.parse(fs.readFileSync("data/store_truth/canonical_store_records.json", "utf8")).records
    .filter((record) => record.source_id === source.source_id);
  const result = extractStoreSourcePayload(source, snapshot);
  assert.equal(source.status, "PENDING_C3_ACCESS_BLOCKED");
  assert.equal(source.pending_c3_visual_review.status, "ACCESS_BLOCKED_CERTIFICATE");
  assert.equal(snapshot.input_path, undefined);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records.length, 59);
  assert.equal(canonical.length, 59);
  const joined = canonical.filter((record) => record.latitude !== null && record.longitude !== null);
  const coordinateBlocked = canonical.filter((record) => record.latitude === null && record.longitude === null);
  assert.equal(joined.length, 12);
  assert.equal(coordinateBlocked.length, 47);
  assert.ok(joined.every((record) => record.coordinates_source === "OFFICIAL_REGULATOR_LINKED_RETAIL_MAP_KML"));
  assert.ok(coordinateBlocked.every((record) => record.coordinates_source === "OFFICIAL_DIRECTORY_NO_COORDINATE_FIELD"));
  assert.equal(isIndependentlyValidatedStoreSource(source), false);
});

test("retains the current Israel Ministry authorised-pharmacy directory without inventing coordinates", async () => {
  const fs = await import("node:fs");
  const registry = JSON.parse(fs.readFileSync("data/store_truth/store_source_registry.json", "utf8"));
  const source = registry.sources.find((item) => item.source_id === "official-il-moh-current-authorized-medical-cannabis-pharmacies-2026-08-20");
  const snapshot = JSON.parse(fs.readFileSync(source.snapshot_path, "utf8"));
  const canonical = JSON.parse(fs.readFileSync("data/store_truth/canonical_store_records.json", "utf8")).records
    .filter((record) => record.source_id === source.source_id);
  const result = extractStoreSourcePayload(source, snapshot);
  assert.equal(source.geo_id, "IL");
  assert.equal(source.snapshot_sha256, "c9f1fb69fe948805042661b90b51cfc96f4528f83e3bd20343057fbea3ff8bc1");
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records.length, 421);
  assert.equal(canonical.length, 421);
  assert.ok(canonical.every((record) => record.license_number === ""));
  assert.ok(canonical.every((record) => record.license_status === "UNKNOWN_STATUS"));
  assert.ok(canonical.every((record) => record.operational_status === "UNKNOWN_STATUS"));
  assert.ok(canonical.every((record) => record.latitude === null && record.longitude === null));
  assert.ok(canonical.every((record) => record.coordinates_source === "OFFICIAL_MOH_CURRENT_AUTHORIZED_PHARMACY_DIRECTORY_NO_COORDINATE_FIELD"));
});

test("applies declarative source selection and defaults without a GEO-specific parser", () => {
  const result = extractStoreSourcePayload({
    ...source,
    field_map: { legal_name: "entity_name", address: "address_line_1" },
    record_selection: { all: [{ field: "license_group", equals: "Retailer" }, { field: "operational_status", equals: "Active" }] },
    default_fields: { store_type: "ADULT_USE_RETAIL", adult_use: true, coordinates_source: "OFFICIAL_COORDINATES" },
  }, [
    { entity_name: "Retail Point", license_number: "GA-4", address_line_1: "4 Main", license_group: "Retailer", operational_status: "Active" },
    { entity_name: "Non-operating Point", license_number: "GA-5", address_line_1: "5 Main", license_group: "Retailer", operational_status: "Non-Operational" },
  ]);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].store_type, "ADULT_USE_RETAIL");
  assert.equal(result.records[0].adult_use, true);
  assert.equal(result.records[0].coordinates_source, "OFFICIAL_COORDINATES");
});

test("maps an official type taxonomy and nested coordinates declaratively", () => {
  const result = extractStoreSourcePayload({
    ...source,
    source_type: "SOCRATA",
    field_map: {
      legal_name: "business",
      license_number: "license",
      address: "street",
      latitude: "location.coordinates.1",
      longitude: "location.coordinates.0",
    },
    field_value_overrides: [
      { when: { field: "type", equals: "Adult" }, values: { store_type: "ADULT_USE_RETAIL", adult_use: true } },
      { when: { field: "type", equals: "Medical" }, values: { store_type: "MEDICAL_DISPENSARY", medical: true } },
    ],
    default_fields: { license_status: "ACTIVE", operational_status: "ACTIVE" },
  }, [
    { business: "Adult Point", license: "CT-1", street: "1 Main", type: "Adult", location: { coordinates: [-72.1, 41.2] } },
    { business: "Medical Point", license: "CT-2", street: "2 Main", type: "Medical", location: { coordinates: [-72.2, 41.3] } },
  ]);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.format, "SOCRATA");
  assert.deepEqual(result.records.map((record) => [record.store_type, record.latitude, record.longitude]), [
    ["ADULT_USE_RETAIL", 41.2, -72.1],
    ["MEDICAL_DISPENSARY", 41.3, -72.2],
  ]);
});

test("fails closed when a declared row type has no unique mapping", () => {
  const result = extractStoreSourcePayload({
    ...source,
    field_value_overrides: [{ when: { field: "type", equals: "Adult" }, values: { store_type: "ADULT_USE_RETAIL" } }],
  }, [{ name: "Unknown Point", license: "GA-7", address: "7 Main", type: "Medical" }]);
  assert.equal(result.extraction_state, "NEEDS_REVIEW");
  assert.deepEqual(result.records, []);
  assert.deepEqual(result.reasons, ["SOURCE_ROW_TYPE_MAPPING_MISSING"]);
});

test("retains only explicitly declared public source fields", () => {
  const result = extractStoreSourcePayload({
    ...source,
    public_field_map: { renewal_date: "Renewal Date", hybrid_retail: "Hybrid Retail" },
  }, [{
    name: "Official Point",
    license: "GA-8",
    address: "8 Main",
    "Renewal Date": "January 1, 2027",
    "Hybrid Retail": "Yes / Yes",
    phone: "not retained",
  }]);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.deepEqual(result.records[0].public_source_fields, { renewal_date: "January 1, 2027", hybrid_retail: "Yes / Yes" });
});

test("reads a common paginated collection envelope without a source-specific parser", () => {
  const result = extractStoreSourcePayload({
    ...source,
    field_map: { legal_name: "businessLegalName", license_number: "licenseNumber", address: "premiseStreetAddress" },
  }, {
    collection: {
      metadata: { totalPages: 2 },
      data: [{ businessLegalName: "Paginated Regulated Point", licenseNumber: "GA-6", premiseStreetAddress: "6 Main" }],
    },
  });
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records[0].legal_name, "Paginated Regulated Point");
  assert.equal(result.records[0].license_number, "GA-6");
});

test("reads a marker-map envelope and selects array tags declaratively", () => {
  const result = extractStoreSourcePayload({
    ...source,
    field_map: { legal_name: "name", address: "formattedAddress", latitude: "lat", longitude: "long" },
    record_selection: { any: [{ field: "tags", includes: "Recreational cannabis" }] },
    default_fields: { store_type: "ADULT_USE_RETAIL", adult_use: true },
  }, {
    markers: [
      { id: "marker-1", name: "Retail Point", formattedAddress: "1 Main", lat: 33.7, long: -84.4, tags: ["Recreational cannabis", "Microbusiness"] },
      { id: "marker-2", name: "Medical Point", formattedAddress: "2 Main", lat: 33.8, long: -84.3, tags: ["Medicinal cannabis"] },
    ],
  });
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].source_record_id, "marker-1");
  assert.equal(result.records[0].latitude, 33.7);
});

test("extracts KML placemarks through declarative record mappings", () => {
  const kml = `<?xml version="1.0"?><kml><Document><Placemark><name>Official Point</name><description><![CDATA[Official Point 1 Main Street Dispensing License DISP0001]]></description><Point><coordinates>-84.4,33.7,0</coordinates></Point></Placemark></Document></kml>`;
  const result = extractStoreSourcePayload({
    ...source,
    source_type: "KML",
    field_map: { legal_name: "legal_name", trade_name: "trade_name", license_number: "license_number", address: "address", latitude: "__latitude", longitude: "__longitude" },
    field_value_overrides: [{
      when: { field: "description", contains: "Dispensing License DISP0001" },
      values: { source_record_id: "DISP0001", legal_name: "Official Point LLC", trade_name: "Official Point", license_number: "DISP0001", address: "1 Main Street", license_status: "ACTIVE", operational_status: "ACTIVE" },
    }],
  }, kml);
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.format, "KML");
  assert.deepEqual(result.records.map((record) => [record.source_record_id, record.license_number, record.latitude, record.longitude]), [["DISP0001", "DISP0001", "33.7", "-84.4"]]);
});

test("keeps KML source-row identity stable when a regulator reorders placemarks", () => {
  const source = {
    source_id: "kml-registry",
    geo_id: "US-VT",
    source_url: "https://example.gov/map.kml",
    source_type: "KML",
    allow_source_row_identity: true,
    field_map: { legal_name: "name", latitude: "__latitude", longitude: "__longitude" },
  };
  const first = `<?xml version="1.0"?><kml><Document><Placemark><name>First point</name><Point><coordinates>-72.1,43.1,0</coordinates></Point></Placemark><Placemark><name>Second point</name><Point><coordinates>-72.2,43.2,0</coordinates></Point></Placemark></Document></kml>`;
  const reordered = `<?xml version="1.0"?><kml><Document><Placemark><name>Second point</name><Point><coordinates>-72.2,43.2,0</coordinates></Point></Placemark><Placemark><name>First point</name><Point><coordinates>-72.1,43.1,0</coordinates></Point></Placemark></Document></kml>`;
  const ids = (payload) => extractStoreSourcePayload(source, payload).records.map((record) => record.source_record_id).sort();
  assert.deepEqual(ids(first), ids(reordered));
});

test("fails closed when a KML placemark has no declared mapping", () => {
  const kml = `<?xml version="1.0"?><kml><Document><Placemark><name>Unknown Point</name><description>Dispensing License DISP9999</description><Point><coordinates>-84.4,33.7,0</coordinates></Point></Placemark></Document></kml>`;
  const result = extractStoreSourcePayload({
    ...source,
    source_type: "KML",
    field_value_overrides: [{ when: { field: "description", contains: "DISP0001" }, values: { legal_name: "Mapped Point" } }],
  }, kml);
  assert.equal(result.extraction_state, "NEEDS_REVIEW");
  assert.deepEqual(result.reasons, ["SOURCE_ROW_TYPE_MAPPING_MISSING"]);
});

test("keeps malformed and unsupported source payloads in review", () => {
  const malformed = extractStoreSourcePayload(source, [{ name: "Missing identity" }]);
  assert.equal(malformed.extraction_state, "NEEDS_REVIEW");
  assert.deepEqual(malformed.records, []);
  const unsupported = extractStoreSourcePayload(source, { not: "a dataset" });
  assert.equal(unsupported.extraction_state, "NEEDS_REVIEW");
  assert.deepEqual(unsupported.records, []);
});

test("accepts a UTF-8 BOM in an otherwise valid JSON source payload", () => {
  const result = extractStoreSourcePayload(source, '\uFEFF[{"name":"BOM Point","license":"GA-BOM","address":"7 Main"}]');
  assert.equal(result.extraction_state, "EXTRACTED");
  assert.equal(result.records[0].license_number, "GA-BOM");
});

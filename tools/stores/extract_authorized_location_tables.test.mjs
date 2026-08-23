import assert from "node:assert/strict";
import test from "node:test";
import { extractAuthorizedLocationTables, extractPublicLocationTable, normalizedOrganizationName } from "./extract_authorized_location_tables.mjs";

const config = {
  authority_headers: { legal_name: "Name", authorization_status: "Authorization Status", license_number: "License Number" },
  location_headers: { legal_name: "Company", address: "Address", city: "City", postal_code: "ZIP Code" },
  accepted_authorization_statuses: ["Dispensing Authorization"],
  store_type: "MEDICAL_DISPENSARY",
  region: "FL",
  country: "US",
};

function page({ secondLocation = false } = {}) {
  return `<table id="authorizations">
    <tr><td>Name</td><td>Authorization Status</td><td>License Number</td></tr>
    <tr><td>Current Dispensary (Florida)</td><td>Dispensing Authorization</td><td>MMTC-1</td></tr>
    <tr><td>Initial License Only</td><td>Initial Licensure</td><td>MMTC-2</td></tr>
  </table><table id="locations">
    <tr><th>Company</th><th>Address</th><th>City</th><th>ZIP Code</th></tr>
    <tr><td>Current Dispensary</td><td>10 Main St</td><td>Example City</td><td>12345</td></tr>
    <tr><td>Initial License Only</td><td>11 Main St</td><td>Example City</td><td>12345</td></tr>
    <tr><td>Unmatched Brand</td><td>12 Main St</td><td>Example City</td><td>12345</td></tr>
    ${secondLocation ? '<tr><td>Current Dispensary</td><td>10 Main St</td><td>Example City</td><td>12345</td></tr>' : ""}
  </table>`;
}

test("retains only locations exactly joined to accepted official authorization", () => {
  const result = extractAuthorizedLocationTables(page(), config);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].legal_name, "Current Dispensary (Florida)");
  assert.equal(result.records[0].trade_name, "Current Dispensary");
  assert.equal(result.records[0].license_number, "MMTC-1");
  assert.equal(result.records[0].license_status, "ACTIVE");
  assert.equal(result.records[0].operational_status, "UNKNOWN_STATUS");
  assert.deepEqual(result.counts, {
    authorization_records: 2,
    accepted_authorizations: 1,
    location_records: 3,
    retained_authorized_locations: 1,
    blocked_unmatched_or_ineligible_authorization: 2,
  });
});

test("fails closed for a duplicate public authorization-location identity", () => {
  assert.throws(() => extractAuthorizedLocationTables(page({ secondLocation: true }), config), /DUPLICATE_LOCATION/);
});

test("normalizes harmless parenthetical organization labels but does not create aliases", () => {
  assert.equal(normalizedOrganizationName("Café (Medical) LLC"), normalizedOrganizationName("Cafe LLC"));
  assert.notEqual(normalizedOrganizationName("Exact Licensee"), normalizedOrganizationName("Different Brand"));
});

test("retains a current official public location table without inventing a licence, status or coordinate", () => {
  const result = extractPublicLocationTable(`<table><tr><th>FARMACIA</th><th>DIRECCIÓN</th><th>DEPARTAMENTO</th><th>LOCALIDAD</th></tr>
    <tr><td>Farmacia Ñandú</td><td>18 de Julio 100</td><td>Montevideo</td><td>Montevideo</td></tr></table>`, {
    public_location_headers: { legal_name: "FARMACIA", address: "DIRECCIÓN", region: "DEPARTAMENTO", city: "LOCALIDAD" },
    required_fields: ["legal_name", "address", "region", "city"],
    identity_fields: ["legal_name", "address", "city", "region"],
    store_type: "AUTHORIZED_PHARMACY",
    license_type: "CURRENT_REGULATOR_AUTHORIZED_PHARMACY_DIRECTORY",
    country: "UY",
    adult_use: true,
    location_evidence: "STRONG",
    coordinates_source: "OFFICIAL_DIRECTORY_NO_COORDINATE_FIELD",
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].license_number, "");
  assert.equal(result.records[0].license_status, "UNKNOWN_STATUS");
  assert.equal(result.records[0].operational_status, "UNKNOWN_STATUS");
  assert.equal(result.records[0].coordinates_source, "OFFICIAL_DIRECTORY_NO_COORDINATE_FIELD");
  assert.equal(result.records[0].source_record_id, "FARMACIANANDU:18DEJULIO100:MONTEVIDEO:MONTEVIDEO");
});

test("fails closed when a public table repeats the configured source-row identity", () => {
  const html = `<table><tr><th>Name</th><th>Address</th></tr><tr><td>Exact Point</td><td>1 Main</td></tr><tr><td>Exact Point</td><td>1 Main</td></tr></table>`;
  const config = {
    public_location_headers: { legal_name: "Name", address: "Address" },
    required_fields: ["legal_name", "address"],
    identity_fields: ["legal_name", "address"],
    store_type: "AUTHORIZED_PHARMACY",
    country: "UY",
  };
  assert.throws(() => extractPublicLocationTable(html, config), /DUPLICATE_SOURCE_ROW/);
});

test("selects a declared public-location table section when other tables share its headers", () => {
  const html = `<h2>Other establishments</h2><table><tr><th>Name</th><th>City</th></tr><tr><td>Other Point</td><td>Elsewhere</td></tr></table>
    <h2>Dispensary establishments</h2><table><tr><th>Name</th><th>City</th></tr><tr><td>Dispensary Point</td><td>Sample City</td></tr></table>
    <h2>Later section</h2><table><tr><th>Name</th><th>City</th></tr><tr><td>Later Point</td><td>Elsewhere</td></tr></table>`;
  const result = extractPublicLocationTable(html, {
    public_location_headers: { legal_name: "Name", city: "City" },
    required_fields: ["legal_name", "city"],
    identity_fields: ["legal_name", "city"],
    section_heading: "Dispensary establishments",
    store_type: "MEDICAL_DISPENSARY",
    country: "US",
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].legal_name, "Dispensary Point");
});

test("retains repeated public rows only with an explicit source-row-occurrence policy", () => {
  const html = `<h2>Dispensary establishments</h2><table><tr><th>Name</th><th>City</th></tr>
    <tr><td>Same Official Name</td><td>Same City</td></tr><tr><td>Same Official Name</td><td>Same City</td></tr></table>`;
  const result = extractPublicLocationTable(html, {
    public_location_headers: { legal_name: "Name", city: "City" },
    required_fields: ["legal_name", "city"],
    identity_fields: ["legal_name", "city"],
    section_heading: "Dispensary establishments",
    duplicate_identity_mode: "SOURCE_ROW_OCCURRENCE",
    store_type: "MEDICAL_DISPENSARY",
    country: "US",
  });
  assert.deepEqual(result.records.map((record) => record.source_record_id), [
    "SAMEOFFICIALNAME:SAMECITY:ROW:1",
    "SAMEOFFICIALNAME:SAMECITY:ROW:2",
  ]);
  assert.equal(result.counts.duplicate_identity_rows, 2);
});

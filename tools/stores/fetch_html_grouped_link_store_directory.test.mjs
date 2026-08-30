import assert from "node:assert/strict";
import test from "node:test";
import { extractGroupedLinkStoreDirectory } from "./fetch_html_grouped_link_store_directory.mjs";

const options = {
  startMarker: "Licensed directory starts",
  endMarker: "Licensed directory ends",
  geoId: "US-EX",
  country: "US",
  region: "EX",
  storeType: "MEDICAL_DISPENSARY",
  licenseType: "Medical Cannabis Dispensary",
  regulatorUrl: "https://example.gov/directory",
  expectedRecords: 3,
};

test("extracts a location-free official grouped-link directory without inventing a map location", () => {
  const records = extractGroupedLinkStoreDirectory({
    ...options,
    html: `Licensed directory starts
      <h3><button>Island One Dispensaries<span>+</span></button></h3>
      <ul><li><a href="https://one.example/">One Licensee</a></li><li><a href="https://two.example/">Two Licensee</a></li></ul>
      <h3>Island Two Dispensaries</h3><ul><li><a href="https://three.example/">Three Licensee</a></li></ul>
      Licensed directory ends`,
  });
  assert.equal(records.length, 3);
  assert.deepEqual(records.map((record) => [record.legal_name, record.public_source_fields.group_label]), [
    ["One Licensee", "Island One Dispensaries"],
    ["Two Licensee", "Island One Dispensaries"],
    ["Three Licensee", "Island Two Dispensaries"],
  ]);
  assert.ok(records.every((record) => record.source_record_id.startsWith("html-grouped-link:")));
  assert.ok(records.every((record) => record.address === "" && record.latitude === null && record.longitude === null));
  assert.ok(records.every((record) => record.location_evidence === "PARTIAL"));
  assert.ok(records.every((record) => record.license_status === "UNKNOWN_STATUS" && record.operational_status === "UNKNOWN_STATUS"));
});

test("fails closed for unexpected directory cardinality or a non-HTTPS link", () => {
  assert.throws(() => extractGroupedLinkStoreDirectory({
    ...options,
    html: "Licensed directory starts<h3>Island</h3><a href=\"https://one.example/\">One</a>Licensed directory ends",
  }), /RECORD_COUNT_INVALID:1\/3/);
  assert.throws(() => extractGroupedLinkStoreDirectory({
    ...options,
    expectedRecords: 1,
    html: "Licensed directory starts<h3>Island</h3><a href=\"http://one.example/\">One</a>Licensed directory ends",
  }), /LINK_URL_INVALID/);
});

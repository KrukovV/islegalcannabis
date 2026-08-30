import assert from "node:assert/strict";
import test from "node:test";
import { selectHtmlHeadingStoreDirectory } from "./fetch_html_heading_store_directory.mjs";

const options = {
  startMarker: "Directory starts",
  endMarker: "Directory ends",
  groupHeading: "h2",
  recordHeading: "h3",
  addressTag: "p",
  geoId: "US-EX",
  country: "US",
  region: "EX",
  storeType: "MEDICAL_DISPENSARY",
  licenseType: "Example medical dispensary",
  regulatorUrl: "https://example.gov/directory",
};

test("extracts a configured heading directory without inferring coordinates or licence status", () => {
  const records = selectHtmlHeadingStoreDirectory(`
    <main>Directory starts<h2>Example City</h2><h3>Example Point</h3><p>1 Main Street</p><p>(555) 0100</p>
    <h2>Second City</h2><h3>Second Point</h3><p>2 Main Street</p>Directory ends</main>
  `, { ...options, expectedRecords: 2 });
  assert.equal(records.length, 2);
  assert.equal(records[0].city, "Example City");
  assert.equal(records[0].legal_name, "Example Point");
  assert.equal(records[0].address, "1 Main Street");
  assert.equal(records[0].license_status, "UNKNOWN_STATUS");
  assert.equal(records[0].operational_status, "ACTIVE");
  assert.equal(records[0].latitude, null);
  assert.equal(records[0].longitude, null);
  assert.equal(records[0].coordinates_confidence, "UNKNOWN");
});

test("fails closed when the configured record heading has no following address", () => {
  assert.throws(() => selectHtmlHeadingStoreDirectory(
    "Directory starts<h2>Example City</h2><h3>Example Point</h3>Directory ends",
    options,
  ), /HTML_HEADING_DIRECTORY_ADDRESS_MISSING_AT_END/);
});

test("fails closed when the source count changes from the declared review count", () => {
  assert.throws(() => selectHtmlHeadingStoreDirectory(
    "Directory starts<h2>Example City</h2><h3>Example Point</h3><p>1 Main Street</p>Directory ends",
    { ...options, expectedRecords: 2 },
  ), /HTML_HEADING_DIRECTORY_RECORD_COUNT_INVALID:1\/2/);
});

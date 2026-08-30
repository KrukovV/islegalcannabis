import assert from "node:assert/strict";
import test from "node:test";
import { selectHtmlGroupedListStoreDirectory } from "./fetch_html_grouped_list_store_directory.mjs";

const options = {
  startMarker: "Current directory starts",
  endMarker: "Current directory ends",
  geoId: "CA",
  country: "CA",
  region: "MB",
  storeType: "ADULT_USE_RETAIL",
  licenseType: "Regulator licensed cannabis store",
  regulatorUrl: "https://regulator.example/current-directory",
};

test("extracts city-grouped current regulator store rows without inferring coordinates", () => {
  const records = selectHtmlGroupedListStoreDirectory(`
    Current directory starts
    <p><strong>First City:</strong></p><ul><li>Example Cannabis, Unit 1 - 10 Main Street</li></ul>
    <p><strong>Second City:</strong></p><ul><li>Another Cannabis, 20 Market Road</li></ul>
    Current directory ends
  `, { ...options, expectedRecords: 2 });
  assert.equal(records.length, 2);
  assert.equal(records[0].legal_name, "Example Cannabis");
  assert.equal(records[0].address, "Unit 1 - 10 Main Street");
  assert.equal(records[0].city, "First City");
  assert.equal(records[0].license_status, "ACTIVE");
  assert.equal(records[0].operational_status, "UNKNOWN_STATUS");
  assert.equal(records[0].latitude, null);
  assert.equal(records[0].longitude, null);
});

test("fails closed when a current list row does not provide a name and address separator", () => {
  assert.throws(() => selectHtmlGroupedListStoreDirectory(
    "Current directory starts<p><strong>First City:</strong></p><ul><li>Unparseable row</li></ul>Current directory ends",
    options,
  ), /HTML_GROUPED_LIST_DIRECTORY_ROW_INVALID/);
});

test("accepts the two explicit public list separators without inferring address structure", () => {
  const records = selectHtmlGroupedListStoreDirectory(
    "Current directory starts<p><strong>First City:</strong></p><ul><li>Example Cannabis - 1 Main Street</li></ul>Current directory ends",
    { ...options, expectedRecords: 1 },
  );
  assert.equal(records[0].legal_name, "Example Cannabis");
  assert.equal(records[0].address, "1 Main Street");
});

test("fails closed when the verified record count changes", () => {
  assert.throws(() => selectHtmlGroupedListStoreDirectory(
    "Current directory starts<p><strong>First City:</strong></p><ul><li>Example Cannabis, 1 Main Street</li></ul>Current directory ends",
    { ...options, expectedRecords: 2 },
  ), /HTML_GROUPED_LIST_DIRECTORY_RECORD_COUNT_INVALID:1\/2/);
});

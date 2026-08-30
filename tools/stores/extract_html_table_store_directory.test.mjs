import assert from "node:assert/strict";
import test from "node:test";
import { extractHtmlTableStoreDirectory } from "./extract_html_table_store_directory.mjs";

const legalGate = {
  geo_access_legal: true,
  store_type_legal: true,
  store_type_eligibility_ref: "data/store_truth/store_eligibility_model.json#US-EX:ADULT_USE_RETAIL",
  store_type_eligibility_fingerprint: "store-eligibility:example",
  canonical_truth_ref: "data/reviews/wiki-truth-307-final-reconciliation.json#US-EX",
  canonical_truth_fingerprint: "US-EX:GREEN:EXAMPLE",
  evidence_basis: "INDEPENDENT_OFFICIAL_LEGAL_TRUTH",
};

function page(salesType = "Adult Use") {
  return `<table><thead><tr><th>Licensee’s Name</th><th>City</th><th>Location Name</th><th>Sales Type</th><th>Phone</th></tr></thead><tbody><tr><td>Example Licensee</td><td>Sample City</td><td>Example Shop<br/>*Former Name</td><td>${salesType}</td><td>(406) 555-0100</td></tr></tbody></table>`;
}

function input(overrides = {}) {
  return {
    html: page(),
    geoId: "US-EX",
    country: "US",
    region: "EX",
    regulatorUrl: "https://example.gov/directory",
    legalGates: {
      ADULT_USE_RETAIL: legalGate,
      MEDICAL_DISPENSARY: { ...legalGate, store_type_legal: false },
    },
    ...overrides,
  };
}

test("extracts a current regulator table while retaining its no-coordinate boundary", () => {
  const records = extractHtmlTableStoreDirectory(input());
  assert.equal(records.length, 1);
  assert.equal(records[0].legal_name, "Example Licensee");
  assert.equal(records[0].trade_name, "Example Shop *Former Name");
  assert.equal(records[0].store_type, "ADULT_USE_RETAIL");
  assert.equal(records[0].license_status, "UNKNOWN_STATUS");
  assert.equal(records[0].operational_status, "UNKNOWN_STATUS");
  assert.equal(records[0].latitude, null);
  assert.equal(records[0].longitude, null);
  assert.equal(Object.hasOwn(records[0], "phone"), false);
});

test("retains identical published table rows as distinct source-table occurrences", () => {
  const repeated = page().replace("</tbody>", `${page().match(/<tbody>([\s\S]*)<\/tbody>/)?.[1]}</tbody>`);
  const records = extractHtmlTableStoreDirectory(input({ html: repeated }));
  assert.equal(records.length, 2);
  assert.notEqual(records[0].source_record_id, records[1].source_record_id);
  assert.equal(records[0].legal_name, records[1].legal_name);
});

test("fails closed for an unsupported regulator sales classification", () => {
  assert.throws(() => extractHtmlTableStoreDirectory(input({ html: page("Pending") })), /HTML_TABLE_DIRECTORY_SALES_TYPE_UNSUPPORTED/);
});

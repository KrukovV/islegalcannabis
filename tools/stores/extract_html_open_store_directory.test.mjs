import assert from "node:assert/strict";
import test from "node:test";
import { extractOpenStoreDirectory } from "./extract_html_open_store_directory.mjs";

const legalGate = {
  geo_access_legal: true,
  store_type_legal: true,
  store_type_eligibility_ref: "data/store_truth/store_eligibility_model.json#US-EX:MEDICAL_DISPENSARY",
  store_type_eligibility_fingerprint: "store-eligibility:example",
  canonical_truth_ref: "data/reviews/wiki-truth-307-final-reconciliation.json#US-EX",
  canonical_truth_fingerprint: "US-EX:GREEN:EXAMPLE",
  evidence_basis: "INDEPENDENT_OFFICIAL_LEGAL_TRUTH",
};

test("extracts an official open-location list through a schema-driven HTML adapter", () => {
  const records = extractOpenStoreDirectory({
    html: '<section>Open locations:<ul><li>Regulated Point LLC, located at 1 Main St, Suite 2, Sampletown, EX 12345; open since January 1, 2026.&#8203;</li></ul>Directory</section>',
    startMarker: "Open locations:",
    endMarker: "Directory",
    geoId: "US-EX",
    country: "US",
    storeType: "MEDICAL_DISPENSARY",
    licenseType: "Medical Cannabis Dispensary",
    regulatorUrl: "https://example.gov/directory",
    legalGate,
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].legal_name, "Regulated Point LLC");
  assert.equal(records[0].address, "1 Main St, Suite 2");
  assert.equal(records[0].city, "Sampletown");
  assert.equal(records[0].postal_code, "12345");
  assert.equal(records[0].license_status, "ACTIVE");
  assert.equal(records[0].operational_status, "ACTIVE");
  assert.equal(records[0].coordinates_confidence, "UNKNOWN");
});

test("fails closed when a source row does not carry an open-location shape", () => {
  assert.throws(() => extractOpenStoreDirectory({
    html: '<section>Open locations:<ul><li>Unknown entry</li></ul>Directory</section>',
    startMarker: "Open locations:",
    endMarker: "Directory",
    geoId: "US-EX",
    country: "US",
    storeType: "MEDICAL_DISPENSARY",
    licenseType: "Medical Cannabis Dispensary",
    regulatorUrl: "https://example.gov/directory",
    legalGate,
  }), /HTML_OPEN_DIRECTORY_ROWS_UNPARSEABLE/);
});

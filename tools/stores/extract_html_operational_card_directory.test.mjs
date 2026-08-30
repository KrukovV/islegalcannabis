import assert from "node:assert/strict";
import test from "node:test";
import { extractOperationalCardDirectory } from "./extract_html_operational_card_directory.mjs";

const legalGate = {
  geo_access_legal: true,
  store_type_legal: true,
  store_type_eligibility_ref: "data/store_truth/store_eligibility_model.json#US-EX:MEDICAL_DISPENSARY",
  store_type_eligibility_fingerprint: "store-eligibility:example",
  canonical_truth_ref: "data/reviews/wiki-truth-307-final-reconciliation.json#US-EX",
  canonical_truth_fingerprint: "US-EX:GREEN:EXAMPLE",
  evidence_basis: "INDEPENDENT_OFFICIAL_LEGAL_TRUTH",
};

function page(status = "Operational with product") {
  return `<div class="card" data-county="Example" data-id="5"><h3>Example Dispensary</h3><h4>1 Main Street, Sample City, EX 12345</h4><label>Dispensary Name:</label><span>Example Licensee LLC</span><span>${status}</span></div>L.marker([39.1, -80.2],{icon: L.AwesomeMarkers.icon({extraClasses: 'county-Example id-5'})});`;
}

function input(overrides = {}) {
  return {
    html: page(),
    geoId: "US-EX",
    country: "US",
    regulatorUrl: "https://example.gov/find-a-dispensary",
    legalGate,
    ...overrides,
  };
}

test("joins every operational regulator card to its own published marker", () => {
  const records = extractOperationalCardDirectory(input());
  assert.equal(records.length, 1);
  assert.equal(records[0].legal_name, "Example Licensee LLC");
  assert.equal(records[0].trade_name, "Example Dispensary");
  assert.equal(records[0].city, "Sample City");
  assert.equal(records[0].latitude, 39.1);
  assert.equal(records[0].longitude, -80.2);
  assert.equal(records[0].operational_status, "ACTIVE");
});

test("fails closed if a current-status card has no matching published marker", () => {
  assert.throws(() => extractOperationalCardDirectory(input({ html: page().replace("id-5", "id-6") })), /HTML_OPERATIONAL_CARD_DIRECTORY_CARD_OR_MARKER_MISMATCH/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { extractDrupalGeofieldLocationDirectory } from "./extract_drupal_geofield_location_directory.mjs";

const legalGate = {
  geo_access_legal: true,
  store_type_legal: true,
  store_type_eligibility_ref: "data/store_truth/store_eligibility_model.json#US-EX:MEDICAL_DISPENSARY",
  store_type_eligibility_fingerprint: "store-eligibility:example",
  canonical_truth_ref: "data/reviews/wiki-truth-307-final-reconciliation.json#US-EX",
  canonical_truth_fingerprint: "US-EX:GREEN:EXAMPLE",
  evidence_basis: "INDEPENDENT_OFFICIAL_LEGAL_TRUTH",
};

function input(overrides = {}) {
  return {
    directoryHtml: `<script data-drupal-selector="drupal-settings-json" type="application/json">${JSON.stringify({
      geofield_google_map: {
        example: {
          data: {
            features: [{
              geometry: { coordinates: [-90.1, 41.2] },
              properties: {
                entity_id: "42",
                tooltip: "Example Cannabis Dispensary",
                description: '<a href="/locations/example-dispensary">Example Cannabis Dispensary</a>',
              },
            }],
          },
        },
      },
    })}</script>`,
    detailsByPath: {
      "/locations/example-dispensary": '<span class="page-header-content__top-hat">Medical Cannabis Dispensary</span><h1 id="page-title">Example Cannabis Dispensary</h1><div class="field--name-field-location__address"><span class="address-line1">1 Main Street</span><span class="locality">Sample City</span><span class="administrative-area">EX</span><span class="postal-code">12345</span></div>',
    },
    geoId: "US-EX",
    country: "US",
    storeType: "MEDICAL_DISPENSARY",
    licenseType: "Medical Cannabis Dispensary",
    regulatorUrl: "https://example.gov/medical-cannabis/dispensary-locations",
    expectedTypeLabel: "Medical Cannabis Dispensary",
    expectedCount: 1,
    legalGate,
    ...overrides,
  };
}

test("extracts a declared Drupal geofield directory by matching each official detail page", () => {
  const records = extractDrupalGeofieldLocationDirectory(input());
  assert.equal(records.length, 1);
  assert.equal(records[0].legal_name, "Example Cannabis Dispensary");
  assert.equal(records[0].address, "1 Main Street");
  assert.equal(records[0].latitude, 41.2);
  assert.equal(records[0].longitude, -90.1);
  assert.equal(records[0].location_evidence, "STRONG");
  assert.equal(records[0].license_status, "ACTIVE");
  assert.equal(records[0].operational_status, "ACTIVE");
});

test("fails closed when a listing feature and its official detail disagree", () => {
  assert.throws(() => extractDrupalGeofieldLocationDirectory(input({
    detailsByPath: {
      "/locations/example-dispensary": '<span class="page-header-content__top-hat">Medical Cannabis Dispensary</span><h1 id="page-title">Different Location</h1><div class="field--name-field-location__address"><span class="address-line1">1 Main Street</span><span class="locality">Sample City</span><span class="administrative-area">EX</span><span class="postal-code">12345</span></div>',
    },
  })), /DRUPAL_GEOFIELD_LOCATION_NAME_MISMATCH/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { selectCurrentOfficialDirectoryWithCensusGeocode } from "./fetch_current_official_directory_with_census_geocode.mjs";

function record(overrides = {}) {
  return {
    source_record_id: "site-1",
    legal_name: "Current Licensed Store",
    address: "516 Jefferic Blvd",
    city: "Dover",
    region: "DE",
    postal_code: "19901",
    country: "US",
    license_status: "ACTIVE",
    operational_status: "ACTIVE",
    store_type: "ADULT_USE_RETAIL",
    ...overrides,
  };
}

function page(entries) {
  return entries.map((entry) => `<i class="fa-map-pin"></i><p>${entry.legal_name} ${entry.address}, ${entry.city}, ${entry.region} ${entry.postal_code}</p>`).join("\n");
}

function census(overrides = {}) {
  return {
    result: {
      input: { benchmark: { benchmarkName: "Public_AR_Current" } },
      addressMatches: [{
        matchedAddress: "516 JEFFERIC BLVD, DOVER, DE, 19901",
        addressComponents: { city: "DOVER", state: "DE", zip: "19901" },
        coordinates: { x: -75.52, y: 39.17 },
        ...overrides,
      }],
    },
  };
}

const delawareBounds = { west: -76, east: -75, south: 38.3, north: 39.9 };

test("retains a current official directory row with exactly one jurisdiction-matched Census geocode", () => {
  const source = record();
  const result = selectCurrentOfficialDirectoryWithCensusGeocode({
    directoryRecords: [source],
    currentDirectoryHtml: page([source]),
    censusPayloadByRecordId: { "site-1": census() },
    expectedCurrentListingCount: 1,
    bounds: delawareBounds,
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].coordinates_source, "OFFICIAL_ADDRESS_GEOCODED");
  assert.equal(result.records[0].coordinates_confidence, "STRONG");
  assert.equal(result.records[0].public_source_fields.census_matched_address, "516 JEFFERIC BLVD, DOVER, DE, 19901");
});

test("blocks a Census candidate when it resolves to a different ZIP", () => {
  const source = record();
  const invalid = record({ source_record_id: "site-2", legal_name: "Different ZIP Store", address: "17 Main St" });
  const result = selectCurrentOfficialDirectoryWithCensusGeocode({
    directoryRecords: [source, invalid],
    currentDirectoryHtml: page([source, invalid]),
    censusPayloadByRecordId: {
      "site-1": census(),
      "site-2": census({ matchedAddress: "17 MAIN ST, DOVER, DE, 19999", addressComponents: { city: "DOVER", state: "DE", zip: "19999" } }),
    },
    expectedCurrentListingCount: 2,
    bounds: delawareBounds,
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.counts.blocked_geocode_mismatch_or_ambiguity, 1);
});

test("uses only a configured current-list section rather than unrelated page list items", () => {
  const source = record();
  const currentDirectoryHtml = [
    "<ul><li>Unrelated program navigation</li></ul>",
    "<h4>Current open locations</h4><ul><li>Current&#160;Licensed Store, located at 516 Jefferic Blvd, Dover, DE 19901.</li></ul>",
    "<h2>Other directory content</h2><ul><li>Unrelated Store</li></ul>",
  ].join("");
  const result = selectCurrentOfficialDirectoryWithCensusGeocode({
    directoryRecords: [source],
    currentDirectoryHtml,
    censusPayloadByRecordId: { "site-1": census() },
    expectedCurrentListingCount: 1,
    bounds: delawareBounds,
    listing: {
      item_tag: "li",
      section_start: "Current open locations",
      section_end: "Other directory content",
    },
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.counts.current_directory_listing_markers, 1);
});

test("fails closed when configured current-list section bounds are incomplete", () => {
  const source = record();
  assert.throws(() => selectCurrentOfficialDirectoryWithCensusGeocode({
    directoryRecords: [source],
    currentDirectoryHtml: page([source]),
    censusPayloadByRecordId: { "site-1": census() },
    expectedCurrentListingCount: 1,
    bounds: delawareBounds,
    listing: { item_tag: "li", section_start: "Current open locations" },
  }), /LISTING_SECTION_BOUNDS_INCOMPLETE/);
});

test("fails closed when the source listing count changes", () => {
  const source = record();
  assert.throws(() => selectCurrentOfficialDirectoryWithCensusGeocode({
    directoryRecords: [source],
    currentDirectoryHtml: page([source, record({ source_record_id: "site-2", legal_name: "Second Store" })]),
    censusPayloadByRecordId: { "site-1": census() },
    expectedCurrentListingCount: 1,
    bounds: delawareBounds,
  }), /CURRENT_LISTING_COUNT_INVALID/);
});

test("blocks a row no longer present in the current official directory", () => {
  const source = record();
  const absent = record({ source_record_id: "site-2", legal_name: "No Longer Listed", address: "2 Main St" });
  const result = selectCurrentOfficialDirectoryWithCensusGeocode({
    directoryRecords: [source, absent],
    currentDirectoryHtml: `${page([source])}<i class="fa-map-pin"></i><p>Unrelated Store 1 Main St, Dover, DE 19901</p>`,
    censusPayloadByRecordId: { "site-1": census(), "site-2": census() },
    expectedCurrentListingCount: 2,
    bounds: delawareBounds,
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.counts.blocked_not_currently_listed, 1);
});

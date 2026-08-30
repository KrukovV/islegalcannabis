import assert from "node:assert/strict";
import test from "node:test";
import { selectOlccCurrentActiveRecreationalRetailers } from "./fetch_olcc_current_active_recreational_retailers.mjs";

function license(overrides = {}) {
  return {
    license_number: "050-1234",
    business_name: "Official Retailer",
    business_licenses: "Official Retailer LLC",
    license_type: "RECREATIONAL RETAILER",
    license_expired: "No",
    effective_date: "2026-06-01",
    expiration_date: "2027-05-31",
    inactive_date: "",
    physical_address: "1 Main Street, Example OR 97000",
    ...overrides,
  };
}

function feature(overrides = {}) {
  return {
    attributes: {
      OBJECTID: 1,
      licensenumber: "050-1234",
      premisesname: "Official Retailer",
      licensee: "Official Retailer LLC",
      licenseType: "RECREATIONAL RETAILER",
      address: "1 MAIN STREET EXAMPLE OR 97000",
      city: "EXAMPLE",
      X: -122.7,
      Y: 45.5,
      ...overrides.attributes,
    },
    geometry: { x: -122.7, y: 45.5, ...overrides.geometry },
  };
}

test("keeps only a current, not-expired retailer with exact official map address", () => {
  const result = selectOlccCurrentActiveRecreationalRetailers({
    licenseRows: [license(), license({ license_number: "050-expired", expiration_date: "2026-08-13" })],
    mapFeatures: [feature(), feature({ attributes: { OBJECTID: 2, licensenumber: "050-expired" } })],
    asOfDate: "2026-08-14",
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].license_status, "ACTIVE");
  assert.equal(result.records[0].operational_status, "UNKNOWN_STATUS");
  assert.equal(result.records[0].coordinates_confidence, "PROVEN");
  assert.equal(result.counts.map_features_blocked_for_current_license_or_location_mismatch, 1);
});

test("fails closed when the active license location no longer exactly matches the official map", () => {
  assert.throws(
    () => selectOlccCurrentActiveRecreationalRetailers({
      licenseRows: [license({ physical_address: "99 Changed Address, Example OR 97000" })],
      mapFeatures: [feature()],
      asOfDate: "2026-08-14",
    }),
    /OLCC_CURRENT_RETAIL_ACTIVE_LOCATION_SELECTION_EMPTY/,
  );
});

test("rejects a row with an inactive date even if its expiry flag says no", () => {
  assert.throws(
    () => selectOlccCurrentActiveRecreationalRetailers({
      licenseRows: [license({ inactive_date: "2026-08-01" })],
      mapFeatures: [feature()],
      asOfDate: "2026-08-14",
    }),
    /OLCC_CURRENT_RETAIL_LICENSE_SELECTION_EMPTY/,
  );
});

test("merges an exact duplicate map feature for one official license", () => {
  const result = selectOlccCurrentActiveRecreationalRetailers({
    licenseRows: [license()],
    mapFeatures: [feature(), feature({ attributes: { OBJECTID: 2 } })],
    asOfDate: "2026-08-14",
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.counts.duplicate_map_features_merged, 1);
});

test("fails closed on conflicting map locations for one license", () => {
  assert.throws(
    () => selectOlccCurrentActiveRecreationalRetailers({
      licenseRows: [license()],
      mapFeatures: [feature(), feature({ attributes: { OBJECTID: 2, address: "2 Main Street Example OR 97000" } })],
      asOfDate: "2026-08-14",
    }),
    /OLCC_CURRENT_RETAIL_MAP_LICENSE_CONFLICT/,
  );
});

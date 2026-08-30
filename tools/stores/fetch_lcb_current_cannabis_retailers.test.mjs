import assert from "node:assert/strict";
import test from "node:test";
import { selectLcbCurrentCannabisRetailers } from "./fetch_lcb_current_cannabis_retailers.mjs";

function license(overrides = {}) {
  return {
    License: "123456",
    "Priv Desc": "CANNABIS RETAILER",
    "Privilege Status": "ACTIVE (ISSUED)",
    "Street Address": "1 Main Street",
    "Suite Rm": "Suite 10",
    City: "Example City",
    "Zip Code": "98101-1234",
    ...overrides,
  };
}

function feature(overrides = {}) {
  return {
    attributes: {
      objectid: 1,
      licensenum: "123456",
      tradename: "Official Cannabis Retailer",
      privstring: "CANNABIS RETAILER; MEDICAL CANNABIS ENDORSEMENT",
      streetaddress: "1 MAIN STREET SUITE 10",
      streetaddress2: "",
      cityname: "EXAMPLE CITY",
      zipcode: "981011234",
      ...overrides.attributes,
    },
    geometry: { x: -122.33, y: 47.61, ...overrides.geometry },
  };
}

test("keeps only active official retailer locations with matched license and address", () => {
  const result = selectLcbCurrentCannabisRetailers({
    licenseRows: [license(), license({ License: "999999", "Privilege Status": "CLOSED (PERMANENT)" })],
    mapFeatures: [feature(), feature({ attributes: { objectid: 2, licensenum: "999999" } })],
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].license_status, "ACTIVE");
  assert.equal(result.records[0].operational_status, "UNKNOWN_STATUS");
  assert.equal(result.records[0].coordinates_confidence, "PROVEN");
  assert.equal(result.records[0].medical, true);
  assert.equal(result.counts.blocked_for_current_license_or_location_mismatch, 1);
});

test("fails closed when the current license and official map address diverge", () => {
  assert.throws(
    () => selectLcbCurrentCannabisRetailers({
      licenseRows: [license({ "Street Address": "99 Changed Address" })],
      mapFeatures: [feature()],
    }),
    /LCB_RETAILER_ACTIVE_LOCATION_SELECTION_EMPTY/,
  );
});

test("accepts the official Pending Issued status as current but rejects non-retail map rows", () => {
  const result = selectLcbCurrentCannabisRetailers({
    licenseRows: [license({ "Privilege Status": "PENDING (ISSUED)" })],
    mapFeatures: [feature({ attributes: { privstring: "LIQUOR RETAILER" } }), feature()],
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].public_source_fields.current_license_status, "PENDING (ISSUED)");
});

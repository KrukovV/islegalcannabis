import assert from "node:assert/strict";
import test from "node:test";
import { parseCccWhereToBuyGviz, selectCccCurrentActiveRetailers } from "./fetch_ccc_current_active_retailers_with_locator_coordinates.mjs";

function license(overrides = {}) {
  return {
    BUSINESS_NAME: "Official Retailer LLC",
    LICENSE_NUMBER: "MR281234",
    LICENSE_TYPE: "Marijuana Retailer",
    LICENSE_STATUS_CATEGORY: "Active",
    LICENSE_STATUS: "Active",
    COMMENCE_OPS: "Yes",
    LIC_START_DATE: "02-01-2026",
    LIC_EXPIRATION_DATE: "02-01-2027",
    ESTABLISHMENT_ADDRESS_1: "1 Main Street, Unit 3",
    ESTABLISHMENT_CITY: "Example Town",
    ESTABLISHMENT_STATE: "MA",
    ESTABLISHMENT_ZIP: "01001",
    ...overrides,
  };
}

function point(overrides = {}) {
  return {
    id: "100",
    title: "Official Retailer",
    address: "1 MAIN ST UNIT 3",
    town: "EXAMPLE TOWN",
    zip: "01001-1234",
    state: "MA",
    use: "Medical/Adult-use",
    coordinates: '["-72.6", "42.1"]',
    ...overrides,
  };
}

test("keeps only a currently active commenced retailer with its exact CCC locator location", () => {
  const result = selectCccCurrentActiveRetailers({
    licenseRows: [license(), license({ LICENSE_NUMBER: "MR-expired", LIC_EXPIRATION_DATE: "08-13-2026" })],
    locatorRows: [point(), point({ id: "101", address: "99 Changed Address" })],
    asOfDate: "2026-08-14",
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].license_number, "MR281234");
  assert.equal(result.records[0].license_status, "ACTIVE");
  assert.equal(result.records[0].operational_status, "UNKNOWN_STATUS");
  assert.equal(result.records[0].coordinates_confidence, "PROVEN");
  assert.equal(result.counts.locator_points_blocked_for_current_license_or_location_mismatch, 1);
});

test("fails closed for closed labels, out-of-state points, and ambiguous official licence locations", () => {
  assert.throws(
    () => selectCccCurrentActiveRetailers({
      licenseRows: [license()],
      locatorRows: [point({ title: "Official Retailer (Temporarily Closed)" })],
      asOfDate: "2026-08-14",
    }),
    /CCC_CURRENT_RETAIL_LOCATOR_SELECTION_EMPTY/,
  );
  assert.throws(
    () => selectCccCurrentActiveRetailers({
      licenseRows: [license(), license({ LICENSE_NUMBER: "MR281235" })],
      locatorRows: [point()],
      asOfDate: "2026-08-14",
    }),
    /CCC_CURRENT_RETAIL_ACTIVE_LOCATION_SELECTION_EMPTY/,
  );
});

test("rejects a malformed or outside-Massachusetts official locator coordinate", () => {
  assert.throws(
    () => selectCccCurrentActiveRetailers({
      licenseRows: [license()],
      locatorRows: [point({ coordinates: '["71.7", "42.1"]' })],
      asOfDate: "2026-08-14",
    }),
    /CCC_CURRENT_RETAIL_LOCATOR_SELECTION_EMPTY/,
  );
});

test("blocks a licence when separate official locator points conflict on its location", () => {
  assert.throws(
    () => selectCccCurrentActiveRetailers({
      licenseRows: [license()],
      locatorRows: [point(), point({ id: "101", coordinates: '["-72.5", "42.1"]' })],
      asOfDate: "2026-08-14",
    }),
    /CCC_CURRENT_RETAIL_ACTIVE_LOCATION_SELECTION_EMPTY/,
  );
});

test("parses the public CCC gviz response without retaining phone or web fields", () => {
  const rows = parseCccWhereToBuyGviz('/*O_o*/ paulCallBack({"status":"ok","table":{"rows":[{"c":[{"v":1},{"v":"Retailer"},{"v":"1 Main St"},{"v":"Town"},{"v":"01001"},{"v":"MA"},null,{"v":"Adult-use"},null,null,{"v":"[\\"-72.6\\", \\"42.1\\"]"}]}]}});');
  assert.deepEqual(rows, [{ id: "1", title: "Retailer", address: "1 Main St", town: "Town", zip: "01001", state: "MA", use: "Adult-use", coordinates: '["-72.6", "42.1"]' }]);
});

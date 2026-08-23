import assert from "node:assert/strict";
import test from "node:test";
import { selectPaCurrentOperationalDispensaries } from "./fetch_pa_current_operational_dispensaries.mjs";

function productPdfText({ asOf = "7/31/2026", rows = [] } = {}) {
  return [
    "Medical Marijuana Dispensaries in Pennsylvania with Product",
    `Product available as of ${asOf}: Dispensary name Address City State Zip Code Phone number Website`,
    ...rows,
  ].join("\n");
}

function directoryRow(overrides = {}) {
  return {
    objectid: "70",
    facility_name: "Harvest of Whitehall",
    street: "1809 MacArthur Rd",
    city_or_borough: "Whitehall",
    state: "PA",
    zip_code: "18052",
    longitude: "-75.48520",
    latitude: "40.63152",
    georeference: { type: "Point", coordinates: [-75.48525, 40.6315] },
    ...overrides,
  };
}

function productRow({ name = "Harvest of Whitehall", address = "1809 MacArthur Rd", city = "Whitehall", zip = "18052" } = {}) {
  return `2/9/21 3/11/21 Yes ${name} ${address} ${city} Pennsylvania ${zip} 445-465-7555`;
}

test("retains only a current PA product-available row with exactly matched official coordinates", () => {
  const result = selectPaCurrentOperationalDispensaries({
    productPdfText: productPdfText({ rows: [productRow()] }),
    directoryRows: [directoryRow()],
    now: new Date("2026-08-14T00:00:00Z"),
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].license_status, "ACTIVE");
  assert.equal(result.records[0].operational_status, "ACTIVE");
  assert.equal(result.records[0].source_record_id, "70");
  assert.equal(result.records[0].coordinates_confidence, "PROVEN");
  assert.equal(result.records[0].public_source_fields.product_available_as_of, "2026-07-31");
  assert.equal(result.counts.current_operational_dispensaries, 1);
});

test("blocks a product row when the current directory address is not exactly present", () => {
  const result = selectPaCurrentOperationalDispensaries({
    productPdfText: productPdfText({ rows: [productRow(), productRow({ address: "1811 MacArthur Rd" })] }),
    directoryRows: [directoryRow()],
    now: new Date("2026-08-14T00:00:00Z"),
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.counts.product_rows_without_exact_directory_match, 1);
});

test("blocks a row when two official coordinate representations materially disagree", () => {
  const good = directoryRow();
  const conflicting = directoryRow({
    objectid: "71",
    facility_name: "Harvest of Scranton",
    street: "1809 Market Street",
    city_or_borough: "Scranton",
    zip_code: "18503",
    longitude: "-75.6600",
    latitude: "41.4080",
    georeference: { type: "Point", coordinates: [-76.8, 41.6] },
  });
  const result = selectPaCurrentOperationalDispensaries({
    productPdfText: productPdfText({ rows: [productRow(), productRow({ name: "Harvest of Scranton", address: "1809 Market Street", city: "Scranton", zip: "18503" })] }),
    directoryRows: [good, conflicting],
    now: new Date("2026-08-14T00:00:00Z"),
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.counts.product_rows_with_coordinate_conflict, 1);
});

test("refuses a product-availability document that is no longer current", () => {
  assert.throws(() => selectPaCurrentOperationalDispensaries({
    productPdfText: productPdfText({ asOf: "6/1/2026", rows: [productRow()] }),
    directoryRows: [directoryRow()],
    now: new Date("2026-08-14T00:00:00Z"),
  }), /STALE_OR_FUTURE/);
});

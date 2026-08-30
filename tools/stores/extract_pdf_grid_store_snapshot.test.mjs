import assert from "node:assert/strict";
import test from "node:test";
import { extractPdfGridStoreSnapshot } from "./extract_pdf_grid_store_snapshot.mjs";

function fixture() {
  return `<doc><page width="100" height="100">
    <word xMin="10" xMax="20" yMin="5" yMax="8">AUTHORIZED</word><word xMin="21" xMax="30" yMin="5" yMax="8">PHARMACIES</word>
    <word xMin="2" xMax="5" yMin="20" yMax="23">1</word><word xMin="10" xMax="25" yMin="20" yMax="23">First</word><word xMin="26" xMax="35" yMin="20" yMax="23">Pharmacy</word><word xMin="40" xMax="50" yMin="20" yMax="23">North</word><word xMin="55" xMax="65" yMin="20" yMax="23">1 Main</word>
    <word xMin="55" xMax="65" yMin="25" yMax="28">Street</word>
    <word xMin="2" xMax="5" yMin="35" yMax="38">2</word><word xMin="10" xMax="25" yMin="35" yMax="38">Second</word><word xMin="40" xMax="50" yMin="35" yMax="38">South</word><word xMin="55" xMax="65" yMin="35" yMax="38">2 Main</word>
  </page></doc>`;
}

const config = {
  source_url: "https://regulator.example.gov/authorized-pharmacies.pdf",
  source_pdf_sha256: "a".repeat(64),
  country: "ZZ",
  store_type: "AUTHORIZED_PHARMACY",
  medical: true,
  expected_record_count: 2,
  tables: [{
    page: 1,
    y_min: 15,
    y_max: 45,
    required_header_phrases: ["authorized pharmacies"],
    number_column: { x_min: 0, x_max: 8 },
    columns: {
      legal_name: { x_min: 9, x_max: 36 },
      city: { x_min: 39, x_max: 51 },
      address: { x_min: 54, x_max: 70 },
    },
    required_fields: ["legal_name", "city", "address"],
    expected_numbers: { from: 1, to: 2 },
  }],
};

test("extracts wrapped public pharmacy rows from declarative PDF grid coordinates", () => {
  const extracted = extractPdfGridStoreSnapshot({ bboxXml: fixture(), config });
  assert.equal(extracted.records.length, 2);
  assert.deepEqual(extracted.records.map((record) => [record.source_record_id, record.legal_name, record.city, record.address]), [
    ["PDF:1:1", "First Pharmacy", "North", "1 Main Street"],
    ["PDF:1:2", "Second", "South", "2 Main"],
  ]);
  assert.ok(extracted.records.every((record) => record.latitude === undefined && record.longitude === undefined));
});

test("fails closed when the numbered source rows are incomplete", () => {
  assert.throws(
    () => extractPdfGridStoreSnapshot({ bboxXml: fixture(), config: { ...config, tables: [{ ...config.tables[0], expected_numbers: { from: 1, to: 3 } }], expected_record_count: 3 } }),
    /PDF_GRID_TABLE_ROW_NUMBER_SEQUENCE_INVALID/,
  );
});

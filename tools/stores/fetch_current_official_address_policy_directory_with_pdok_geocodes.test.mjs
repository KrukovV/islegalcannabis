import assert from "node:assert/strict";
import test from "node:test";
import {
  bindPdokCoordinatesWithBoundaries,
  bindExactPdokCoordinates,
  extractOfficialAddressPolicyRows,
  selectExactPdokAddress,
} from "./fetch_current_official_address_policy_directory_with_pdok_geocodes.mjs";

const config = {
  source_id: "official-example-current-address-policy",
  source_url: "https://example.gov/policy",
  geo_id: "EX",
  country: "EX",
  city: "Example City",
  region: "Example Province",
  policy_name: "Example current address policy",
  expected_row_count: 1,
  table: {
    column_count: 5,
    columns: { street: 0, house_number: 1, house_number_suffix: 2, postal_prefix: 3, postal_suffix: 4 },
  },
  pdok_bounds: { west: 4, east: 5, south: 52, north: 53 },
};

const html = "<table><tr><td>Main Street</td><td>12</td><td>A</td><td>1234</td><td>AB</td></tr></table>";
const exactPayload = {
  response: {
    docs: [{
      weergavenaam: "Main Street 12-A, 1234AB Example City",
      centroide_ll: "POINT(4.5001 52.4002)",
      adresseerbaarobject_id: "EXACT-12-A",
      postcode: "1234AB",
      huisnummer: 12,
      huisletter: "A",
      straatnaam: "Main Street",
      woonplaatsnaam: "Example City",
    }],
  },
};

test("extracts a schema-declared municipal address policy without inventing an operator", () => {
  const [record] = extractOfficialAddressPolicyRows(html, config);
  assert.equal(record.address, "Main Street 12-A");
  assert.equal(record.legal_name, "Municipal tolerated coffeeshop address");
  assert.equal(record.trade_name, "");
  assert.equal(record.operational_status, "UNKNOWN_STATUS");
  assert.equal(record.public_source_fields.record_kind, "MUNICIPAL_TOLERATION_ADDRESS");
});

test("accepts only the one exact PDOK postcode, city, street, number and suffix match", () => {
  const [record] = extractOfficialAddressPolicyRows(html, config);
  const exact = selectExactPdokAddress(record, exactPayload, config.pdok_bounds);
  assert.deepEqual(exact, {
    latitude: 52.4002,
    longitude: 4.5001,
    pdok_adresseerbaarobject_id: "EXACT-12-A",
    pdok_adresseerbaarobject_ids: ["EXACT-12-A"],
    pdok_weergavenaam: "Main Street 12-A, 1234AB Example City",
  });
  const [bound] = bindExactPdokCoordinates([record], { [record.source_record_id]: exactPayload }, config.pdok_bounds);
  assert.equal(bound.latitude, 52.4002);
  assert.equal(bound.public_source_fields.pdok_adresseerbaarobject_id, "EXACT-12-A");
});

test("accepts a suffix-free municipal civic address only when all BAG units share one coordinate", () => {
  const suffixFreeConfig = structuredClone(config);
  suffixFreeConfig.table.columns.house_number_suffix = 2;
  const suffixFreeHtml = "<table><tr><td>Main Street</td><td>12</td><td></td><td>1234</td><td>AB</td></tr></table>";
  const [record] = extractOfficialAddressPolicyRows(suffixFreeHtml, suffixFreeConfig);
  const samePointUnits = structuredClone(exactPayload);
  samePointUnits.response.docs[0].huisletter = "H";
  samePointUnits.response.docs.push({ ...samePointUnits.response.docs[0], huisnummertoevoeging: "1", adresseerbaarobject_id: "EXACT-12-1" });
  assert.equal(selectExactPdokAddress(record, samePointUnits, suffixFreeConfig.pdok_bounds)?.pdok_adresseerbaarobject_ids.length, 2);
  samePointUnits.response.docs[1].centroide_ll = "POINT(4.5002 52.4002)";
  assert.equal(selectExactPdokAddress(record, samePointUnits, suffixFreeConfig.pdok_bounds), null);
});

test("fails closed when PDOK returns a partial or ambiguous address", () => {
  const [record] = extractOfficialAddressPolicyRows(html, config);
  const mismatched = structuredClone(exactPayload);
  mismatched.response.docs[0].huisletter = "B";
  assert.equal(selectExactPdokAddress(record, mismatched, config.pdok_bounds), null);
  const ambiguous = structuredClone(exactPayload);
  ambiguous.response.docs.push({
    ...structuredClone(ambiguous.response.docs[0]),
    adresseerbaarobject_id: "EXACT-12-A-SECOND",
    centroide_ll: "POINT(4.5002 52.4002)",
  });
  assert.equal(selectExactPdokAddress(record, ambiguous, config.pdok_bounds), null);
  assert.throws(() => bindExactPdokCoordinates([record], { [record.source_record_id]: mismatched }, config.pdok_bounds), /EXACT_MATCH_REQUIRED/);
});

test("retains a current policy row but blocks its marker when parent civic units disagree", () => {
  const [record] = extractOfficialAddressPolicyRows(html.replace("<td>A</td>", "<td></td>"), config);
  const ambiguous = structuredClone(exactPayload);
  ambiguous.response.docs[0].huisletter = "H";
  ambiguous.response.docs.push({ ...ambiguous.response.docs[0], huisnummertoevoeging: "1", adresseerbaarobject_id: "EXACT-12-1", centroide_ll: "POINT(4.5002 52.4002)" });
  const bound = bindPdokCoordinatesWithBoundaries([record], { [record.source_record_id]: ambiguous }, config.pdok_bounds);
  assert.equal(bound.exact_pdok_coordinate_rows, 0);
  assert.equal(bound.blocked_pdok_coordinate_ambiguity_rows, 1);
  assert.equal(bound.records[0].latitude, null);
  assert.equal(bound.records[0].public_source_fields.coordinate_boundary.includes("blocked"), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseEqualitySelector, selectStoreSnapshotPayload } from "./fetch_json_store_snapshot.mjs";

test("minimizes a JSON snapshot with declared equality filters and an explicit field projection", () => {
  const selected = selectStoreSnapshotPayload([
    { LICENSE_TYPE: "Marijuana Retailer", LICENSE_STATUS_CATEGORY: "Active", COMMENCE_OPS: "Yes", LICENSE_NUMBER: "MR-1", BUSINESS_EMAIL: "person@example.test", EIN_TIN: "secret" },
    { LICENSE_TYPE: "Marijuana Retailer", LICENSE_STATUS_CATEGORY: "Active", COMMENCE_OPS: "No", LICENSE_NUMBER: "MR-2", BUSINESS_EMAIL: "person2@example.test" },
  ], {
    equals: ["LICENSE_TYPE=Marijuana Retailer", "LICENSE_STATUS_CATEGORY=Active", "COMMENCE_OPS=Yes"],
    fields: ["LICENSE_NUMBER", "LICENSE_TYPE", "LICENSE_STATUS_CATEGORY", "COMMENCE_OPS"],
  });
  assert.equal(selected.rowCount, 1);
  assert.deepEqual(selected.payload, [{ LICENSE_NUMBER: "MR-1", LICENSE_TYPE: "Marijuana Retailer", LICENSE_STATUS_CATEGORY: "Active", COMMENCE_OPS: "Yes" }]);
  assert.equal(JSON.stringify(selected.payload).includes("EIN_TIN"), false);
  assert.equal(JSON.stringify(selected.payload).includes("BUSINESS_EMAIL"), false);
});

test("keeps the source payload unchanged when no minimization is requested", () => {
  const payload = { data: [{ id: "one" }] };
  const selected = selectStoreSnapshotPayload(payload);
  assert.equal(selected.payload, payload);
  assert.equal(selected.rowCount, 1);
});

test("minimizes the standard CKAN DataStore result.records envelope", () => {
  const selected = selectStoreSnapshotPayload({
    result: {
      records: [
        { _id: 1, pharmacy_name: "Official Pharmacy", private_note: "exclude" },
        { _id: 2, pharmacy_name: "Second Official Pharmacy", private_note: "exclude" },
      ],
    },
  }, { fields: ["_id", "pharmacy_name"] });
  assert.equal(selected.rowCount, 2);
  assert.deepEqual(selected.payload, [
    { _id: 1, pharmacy_name: "Official Pharmacy" },
    { _id: 2, pharmacy_name: "Second Official Pharmacy" },
  ]);
});

test("excludes a public placeholder row with no declared identity field", () => {
  const selected = selectStoreSnapshotPayload([
    { _id: 1, pharmacy_name: "Official Pharmacy" },
    { _id: 2, pharmacy_name: "" },
  ], { nonempty: ["pharmacy_name"], fields: ["_id", "pharmacy_name"] });
  assert.equal(selected.rowCount, 1);
  assert.deepEqual(selected.payload, [{ _id: 1, pharmacy_name: "Official Pharmacy" }]);
});

test("rejects malformed selectors and empty declarative selections", () => {
  assert.throws(() => parseEqualitySelector("LICENSE_TYPE"), /STORE_SNAPSHOT_EQUALS_MUST_BE_FIELD_EQUALS_VALUE/);
  assert.throws(() => selectStoreSnapshotPayload([{ status: "Active" }], { equals: ["status=Closed"] }), /STORE_SNAPSHOT_SELECTION_EMPTY/);
});

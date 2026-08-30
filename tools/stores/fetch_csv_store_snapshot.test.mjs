import assert from "node:assert/strict";
import test from "node:test";
import { fetchCsvStoreSnapshot, selectCsvStoreSnapshot } from "./fetch_csv_store_snapshot.mjs";

test("fetches an https CSV snapshot and retains a stable byte hash", async () => {
  const snapshot = await fetchCsvStoreSnapshot({
    url: "https://regulator.example.gov/stores.csv",
    fetchImpl: async () => new Response("License,Name\nCO-1,Store One\n", {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8" },
    }),
  });
  assert.equal(snapshot.records, 1);
  assert.equal(snapshot.csv, "License,Name\nCO-1,Store One\n");
  assert.match(snapshot.sha256, /^[a-f0-9]{64}$/);
});

test("rejects non-CSV responses and unsafe URLs", async () => {
  await assert.rejects(
    () => fetchCsvStoreSnapshot({
      url: "https://regulator.example.gov/stores.csv",
      fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    }),
    /STORE_CSV_SNAPSHOT_CONTENT_TYPE_INVALID/,
  );
  await assert.rejects(() => fetchCsvStoreSnapshot({ url: "http://regulator.example.gov/stores.csv" }), /STORE_CSV_SNAPSHOT_URL_MUST_USE_HTTPS/);
});

test("requires an explicit opt-in for an official CSV served as octet-stream", async () => {
  const response = async () => new Response("License,Name\nON-1,Store One\n", {
    status: 200,
    headers: { "content-type": "application/octet-stream" },
  });
  await assert.rejects(
    () => fetchCsvStoreSnapshot({ url: "https://regulator.example.gov/stores.csv", fetchImpl: response }),
    /STORE_CSV_SNAPSHOT_CONTENT_TYPE_INVALID:application\/octet-stream/,
  );
  const snapshot = await fetchCsvStoreSnapshot({
    url: "https://regulator.example.gov/stores.csv",
    allowOctetStream: true,
    fetchImpl: response,
  });
  assert.equal(snapshot.records, 1);
});

test("projects only declared current store fields and excludes contact columns", () => {
  const result = selectCsvStoreSnapshot(
    'LICENSE,LICENSE_TYPE,LICENSE_STATUS,LICENSE_NAME,PRIMARY_CONTACT_EMAIL\nAMS-1,RETAIL STORE,Active,Store One,person@example.test\nAMS-2,CULTIVATION,Active,Grow One,grower@example.test\n',
    {
      equals: [{ field: "LICENSE_TYPE", expected: "RETAIL STORE" }, { field: "LICENSE_STATUS", expected: "Active" }],
      fields: ["LICENSE", "LICENSE_TYPE", "LICENSE_STATUS", "LICENSE_NAME"],
    },
  );
  assert.match(result, /AMS-1/);
  assert.doesNotMatch(result, /person@example\.test|AMS-2|grower@example\.test/);
});

test("selects an official CSV row after an empty quoted source field without column drift", () => {
  const result = selectCsvStoreSnapshot([
    "LicenceNumber,ObjectDefDescription,ApplicationStatusEn,PremisesName,City",
    '"CRSA-1","","Authorized to Open","Store, One","Toronto"',
  ].join("\r\n"), {
    equals: [{ field: "ApplicationStatusEn", expected: "Authorized to Open" }],
    fields: ["LicenceNumber", "PremisesName", "City"],
  });
  assert.equal(result, '"LicenceNumber","PremisesName","City"\n"CRSA-1","Store, One","Toronto"\n');
});

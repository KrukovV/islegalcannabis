import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStoreSnapshot } from "./store_record_normalizer.mjs";

const source = {
  source_id: "official-colorado-registry",
  geo_id: "US-CO",
  authority: "Colorado regulator",
  source_url: "https://example.gov/registry",
};
const observedAt = "2026-08-12T12:00:00.000Z";

function raw(overrides = {}) {
  return {
    geo_id: "US-CO",
    legal_name: "Example Cannabis Store",
    license_number: "LIC-1",
    address: "1 Main Street",
    latitude: 39.7,
    longitude: -104.9,
    license_status: "ACTIVE",
    operational_status: "ACTIVE",
    ...overrides,
  };
}

test("license plus GEO is stable across repeated snapshots", () => {
  const first = normalizeStoreSnapshot({ source, rawRecords: [raw()], priorRecords: [], observedAt });
  const second = normalizeStoreSnapshot({
    source,
    rawRecords: [raw({ legal_name: "Example Cannabis Store LLC", source_record_id: "row-2" })],
    priorRecords: first.records,
    observedAt: "2026-08-13T12:00:00.000Z",
  });
  assert.equal(second.records.length, 1);
  assert.equal(second.records[0].first_seen_at, observedAt);
  assert.deepEqual(second.records[0].source_record_ids, ["official-colorado-registry:LIC-1", "row-2"]);
  assert.equal(second.records[0].source_url, source.source_url);
  assert.equal(second.records[0].source_presence_status, "PRESENT");
});

test("same address never merges different licenses", () => {
  const result = normalizeStoreSnapshot({
    source,
    rawRecords: [raw({ license_number: "LIC-1" }), raw({ license_number: "LIC-2" })],
    priorRecords: [],
    observedAt,
  });
  assert.equal(result.records.length, 2);
  assert.notEqual(result.records[0].canonical_store_id, result.records[1].canonical_store_id);
});

test("a declared multi-site licence scope preserves independently published addresses", () => {
  const multiSiteSource = { ...source, license_identity_scope: "LICENSE_AND_ADDRESS" };
  const result = normalizeStoreSnapshot({
    source: multiSiteSource,
    rawRecords: [
      raw({ license_number: "LIC-1", address: "1 Main Street", city: "First" }),
      raw({ license_number: "LIC-1", address: "2 Main Street", city: "Second" }),
    ],
    priorRecords: [],
    observedAt,
  });
  assert.equal(result.records.length, 2);
  assert.ok(result.records.every((record) => record.canonical_store_id.startsWith("US-CO:LICENSE_LOCATION:lic-1:")));
  assert.ok(result.records.every((record) => record.merge_reason === "LICENSE_NUMBER_ADDRESS_AND_GEO"));
});

test("deduplicates byte-for-byte repeated source rows without hiding conflicts", () => {
  const result = normalizeStoreSnapshot({
    source,
    rawRecords: [raw(), raw()],
    priorRecords: [],
    observedAt,
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.summary.extracted, 2);
  assert.equal(result.summary.normalized, 1);
  assert.throws(
    () => normalizeStoreSnapshot({
      source,
      rawRecords: [raw(), raw({ legal_name: "Conflicting same license" })],
      priorRecords: [],
      observedAt,
    }),
    /STORE_NORMALIZATION_DUPLICATE_CANONICAL_ID_CONFLICT:US-CO:LICENSE:lic-1/,
  );
});

test("deduplicates identical official rows that have distinct source-row identities", () => {
  const result = normalizeStoreSnapshot({
    source,
    rawRecords: [raw({ source_record_id: "object-1" }), raw({ source_record_id: "object-2" })],
    priorRecords: [],
    observedAt,
  });
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.records[0].source_record_ids, ["object-1", "object-2"]);
});

test("one absent source snapshot retains the history without declaring closure", () => {
  const first = normalizeStoreSnapshot({ source, rawRecords: [raw()], priorRecords: [], observedAt });
  const second = normalizeStoreSnapshot({
    source,
    rawRecords: [],
    priorRecords: first.records,
    observedAt: "2026-08-13T12:00:00.000Z",
  });
  assert.equal(second.records.length, 1);
  assert.equal(second.records[0].source_presence_status, "MISSING_FROM_SOURCE");
  assert.equal(second.records[0].operational_status, "ACTIVE");
  assert.equal(second.records[0].license_status, "ACTIVE");
});

test("missing coordinate fields never normalize to the Gulf of Guinea", () => {
  const result = normalizeStoreSnapshot({
    source,
    rawRecords: [raw({ latitude: null, longitude: "" })],
    priorRecords: [],
    observedAt,
  });
  assert.equal(result.records[0].latitude, null);
  assert.equal(result.records[0].longitude, null);
});

test("the technical 0,0 coordinate sentinel never normalizes as a store location", () => {
  const result = normalizeStoreSnapshot({
    source,
    rawRecords: [raw({ latitude: 0, longitude: 0 })],
    priorRecords: [],
    observedAt,
  });
  assert.equal(result.records[0].latitude, null);
  assert.equal(result.records[0].longitude, null);
});

test("normalizes explicit regulator void and suspension labels to fail-closed license states", () => {
  const result = normalizeStoreSnapshot({
    source,
    rawRecords: [
      raw({ license_number: "VOID-1", license_status: "License Void" }),
      raw({ license_number: "SUSP-1", license_status: "Closed - Suspended" }),
    ],
    priorRecords: [],
    observedAt,
  });
  assert.deepEqual(result.records.map((record) => record.license_status).sort(), ["REVOKED", "SUSPENDED"]);
});

test("uses declared official source-row identity when a directory publishes no address or licence number", () => {
  const directorySource = { ...source, allow_source_row_identity: true };
  const result = normalizeStoreSnapshot({
    source: directorySource,
    rawRecords: [
      raw({ legal_name: "One Licensee", license_number: "", address: "", city: "Example", source_record_id: "row-one" }),
      raw({ legal_name: "One Licensee", license_number: "", address: "", city: "Example", source_record_id: "row-two" }),
    ],
    priorRecords: [],
    observedAt,
  });
  assert.equal(result.records.length, 2);
  assert.notEqual(result.records[0].canonical_store_id, result.records[1].canonical_store_id);
  assert.equal(result.records[0].merge_reason, "OFFICIAL_SOURCE_ROW_IDENTITY_AND_GEO");
});

test("retains explicitly allowed official source fields in canonical history", () => {
  const result = normalizeStoreSnapshot({
    source,
    rawRecords: [raw({ public_source_fields: { renewal_date: "January 1, 2027", hybrid_retail_license: "Yes / Yes" } })],
    priorRecords: [],
    observedAt,
  });
  assert.deepEqual(result.records[0].public_source_fields, { renewal_date: "January 1, 2027", hybrid_retail_license: "Yes / Yes" });
});

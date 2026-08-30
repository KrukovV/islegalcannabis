import assert from "node:assert/strict";
import test from "node:test";
import { collectPaginatedJsonStoreDirectory } from "./fetch_paginated_json_store_directory.mjs";

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function page(pageNumber, data, overrides = {}) {
  return {
    metadata: { currentPage: pageNumber, totalPages: 2, totalCount: 3, pageSize: 2, ...overrides },
    data,
  };
}

test("collects every declared page and validates total row count", async () => {
  const calls = [];
  const result = await collectPaginatedJsonStoreDirectory({
    baseUrl: "https://official.example/licenses?LicenseStatus=Active&pageSize=2",
    fetchImpl: async (url) => {
      calls.push(url);
      return new URL(url).searchParams.get("pageNumber") === "1"
        ? response(page(1, [{ id: 1 }, { id: 2 }]))
        : response(page(2, [{ id: 3 }]));
    },
  });
  assert.equal(result.pages_fetched, 2);
  assert.equal(result.records_fetched, 3);
  assert.deepEqual(result.data.map((row) => row.id), [1, 2, 3]);
  assert.deepEqual(calls.map((url) => new URL(url).searchParams.get("pageNumber")), ["1", "2"]);
});

test("fails closed when page metadata drifts", async () => {
  await assert.rejects(
    collectPaginatedJsonStoreDirectory({
      baseUrl: "https://official.example/licenses?pageSize=2",
      fetchImpl: async (url) => new URL(url).searchParams.get("pageNumber") === "1"
        ? response(page(1, [{ id: 1 }, { id: 2 }]))
        : response(page(2, [{ id: 3 }], { totalCount: 4 })),
    }),
    /PAGINATED_STORE_DIRECTORY_METADATA_DRIFT/,
  );
});

test("fails closed when response rows do not match the declared source total", async () => {
  await assert.rejects(
    collectPaginatedJsonStoreDirectory({
      baseUrl: "https://official.example/licenses?pageSize=2",
      fetchImpl: async (url) => new URL(url).searchParams.get("pageNumber") === "1"
        ? response(page(1, [{ id: 1 }]))
        : response(page(2, [{ id: 2 }])),
    }),
    /PAGINATED_STORE_DIRECTORY_ROW_COUNT_MISMATCH/,
  );
});

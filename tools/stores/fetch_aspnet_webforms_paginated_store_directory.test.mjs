import assert from "node:assert/strict";
import test from "node:test";
import { collectAspNetWebFormsStoreDirectory } from "./fetch_aspnet_webforms_paginated_store_directory.mjs";

function response(html, cookie = "session=first") {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "text/html; charset=utf-8", getSetCookie: () => [cookie] },
    text: async () => html,
  };
}

function form() {
  return '<form><input type="hidden" name="__VIEWSTATE" value="state" /><input type="hidden" name="__EVENTVALIDATION" value="validation" /><select name="permit"><option value="">All</option><option value="retail" selected="selected">Retail</option></select></form>';
}

function resultPage({ page, records, includeNext = false, pageCount = 2 }) {
  const rows = records.map((record) => `<tr><td>${record.id}</td><td>${record.name}</td><td>${record.status}</td></tr>`).join("");
  const next = includeNext ? "<a href=\"javascript:__doPostBack('page-2','')\">Next &gt;</a>" : "";
  return `${form()}<table id="directory" PageCount="${pageCount}"><tr><th>Record Number</th><th>License Name</th><th>Status</th></tr>${rows}<tr><td colspan="3">${page === 1 ? next : ""}</td></tr></table>`;
}

test("collects every WebForms page with form state, cookies, and search fields", async () => {
  const calls = [];
  const result = await collectAspNetWebFormsStoreDirectory({
    url: "https://official.example/directory",
    searchEventTarget: "search",
    searchFields: { permit: "retail" },
    tableId: "directory",
    headers: ["Record Number", "License Name", "Status"],
    recordKeyHeader: "Record Number",
    recordKeyPattern: "^R-",
    expectedMinimumRecords: 3,
    fetchImpl: async (_url, init = {}) => {
      calls.push(init);
      if (!init.method) return response(form());
      const body = new URLSearchParams(init.body);
      if (body.get("__EVENTTARGET") === "search") {
        return response(resultPage({ page: 1, records: [{ id: "R-1", name: "One", status: "Active" }, { id: "R-2", name: "Two", status: "Active" }], includeNext: true }), "session=second");
      }
      assert.equal(body.get("__EVENTTARGET"), "page-2");
      return response(resultPage({ page: 2, records: [{ id: "R-3", name: "Three", status: "Active" }] }), "session=third");
    },
  });
  assert.equal(result.pages_fetched, 2);
  assert.equal(result.reported_page_count, 2);
  assert.equal(result.records_fetched, 3);
  assert.deepEqual(result.records.map((record) => record["Record Number"]), ["R-1", "R-2", "R-3"]);
  assert.equal(new URLSearchParams(calls[1].body).get("permit"), "retail");
  assert.equal(new URLSearchParams(calls[2].body).get("permit"), "retail");
  assert.match(String(calls[2].headers.cookie), /session=second/);
});

test("fails closed if a later WebForms page repeats an already collected record", async () => {
  await assert.rejects(
    collectAspNetWebFormsStoreDirectory({
      url: "https://official.example/directory",
      searchEventTarget: "search",
      tableId: "directory",
      headers: ["Record Number", "License Name", "Status"],
      recordKeyHeader: "Record Number",
      recordKeyPattern: "^R-",
      fetchImpl: async (_url, init = {}) => {
        if (!init.method) return response(form());
        const target = new URLSearchParams(init.body).get("__EVENTTARGET");
        return target === "search"
          ? response(resultPage({ page: 1, records: [{ id: "R-1", name: "One", status: "Active" }], includeNext: true }))
          : response(resultPage({ page: 2, records: [{ id: "R-1", name: "One", status: "Active" }] }));
      },
    }),
    /ASP_NET_WEBFORMS_DUPLICATE_RECORD_KEY/,
  );
});

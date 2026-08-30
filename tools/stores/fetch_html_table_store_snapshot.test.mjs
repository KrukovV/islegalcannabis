import assert from "node:assert/strict";
import test from "node:test";
import { selectHtmlTableStoreSnapshot } from "./fetch_html_table_store_snapshot.mjs";

const headers = ["License #", "Name", "Address", "Phone", "Date of Renewal", "Hybrid Grow/ Retail License"];
const html = `<table><tbody><tr><td><h5>License<br>#</h5></td><td><h5>Name</h5></td><td><h5>Address</h5></td><td><h5>Phone</h5></td><td><h5>Date of Renewal</h5></td><td><h5>Hybrid Grow/ Retail License</h5></td></tr><tr><td>MMP CC 001</td><td>Official Point</td><td>1 Main<br>Providence, RI 02904</td><td>401-000-0000</td><td>January 1, 2026</td><td>Yes / Yes</td></tr></tbody></table>`;

test("projects only explicitly declared public store fields from an HTML table", () => {
  assert.deepEqual(selectHtmlTableStoreSnapshot(html, {
    headers,
    fields: ["License #", "Name", "Address", "Date of Renewal", "Hybrid Grow/ Retail License"],
  }), [{
    "License #": "MMP CC 001",
    Name: "Official Point",
    Address: "1 Main Providence, RI 02904",
    "Date of Renewal": "January 1, 2026",
    "Hybrid Grow/ Retail License": "Yes / Yes",
  }]);
});

test("fails when the declared source table is absent or malformed", () => {
  assert.throws(() => selectHtmlTableStoreSnapshot("<table><tr><td>wrong</td></tr></table>", { headers, fields: ["Name"] }), /STORE_HTML_TABLE_EXPECTED_TABLE_COUNT_INVALID/);
  assert.throws(() => selectHtmlTableStoreSnapshot(html, { headers, fields: ["Phone", "Phone"] }), /STORE_HTML_TABLE_HEADERS_OR_FIELDS_DUPLICATED/);
});

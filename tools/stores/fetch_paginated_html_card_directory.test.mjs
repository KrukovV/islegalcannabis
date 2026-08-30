#!/usr/bin/env node
import assert from "node:assert/strict";
import { selectPaginatedHtmlCardDirectory } from "./fetch_paginated_html_card_directory.mjs";

const directory = `
  <ul>
    <li data-latitude="38,032102" data-longitude="23,790266">
      <a href="/el/pharmacylist/kentriko-farmakeio/"><h3>Κεντρικό Φαρμακείο</h3></a>
      <p class="list-item-link__info-text js-item-address">Απ. Παύλου 12</p>
    </li>
    <li data-latitude="35.190561" data-longitude="25.7201863">
      <a href="/el/pharmacylist/farmakeio-ag-nikolaou/"><h3>Φαρμακείο Αγ. Νικολάου</h3></a>
      <p class="list-item-link__info-text js-item-address">Λασθένους 15</p>
    </li>
  </ul>`;

const records = selectPaginatedHtmlCardDirectory(directory, {
  sourceUrl: "https://eopyy.gov.gr/el/medicinelist/epidyolex/",
});
assert.equal(records.length, 2);
assert.deepEqual(records[0], {
  source_record_id: records[0].source_record_id,
  legal_name: "Κεντρικό Φαρμακείο",
  address: "Απ. Παύλου 12",
  latitude: 38.032102,
  longitude: 23.790266,
  regulator_url: "https://eopyy.gov.gr/el/pharmacylist/kentriko-farmakeio/",
});
assert.throws(() => selectPaginatedHtmlCardDirectory(`<li data-latitude="0" data-longitude="0"><a href="/x"><h3>x</h3></a><p class="list-item-link__info-text js-item-address">x</p></li>`, {
  sourceUrl: "https://eopyy.gov.gr/el/medicinelist/epidyolex/",
}), /PAGINATED_HTML_CARD_DIRECTORY_RECORD_INVALID/);
console.log("PAGINATED_HTML_CARD_DIRECTORY_TEST_OK");

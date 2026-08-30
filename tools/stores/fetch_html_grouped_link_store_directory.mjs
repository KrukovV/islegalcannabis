#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, encoded) => {
      const codePoint = String(encoded).toLowerCase().startsWith("x")
        ? Number.parseInt(String(encoded).slice(1), 16)
        : Number.parseInt(String(encoded), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : " ";
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z]+;/gi, " ");
}

function stableId(parts) {
  return `html-grouped-link:${crypto.createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24)}`;
}

function markerSlice(html, startMarker, endMarker) {
  const source = String(html ?? "");
  const lower = source.toLowerCase();
  const start = lower.indexOf(text(startMarker).toLowerCase());
  if (start < 0) throw new Error("HTML_GROUPED_LINK_DIRECTORY_START_MARKER_NOT_FOUND");
  const end = lower.indexOf(text(endMarker).toLowerCase(), start + text(startMarker).length);
  if (end < 0) throw new Error("HTML_GROUPED_LINK_DIRECTORY_END_MARKER_NOT_FOUND");
  return source.slice(start, end);
}

function websiteHref(attributes) {
  const href = String(attributes ?? "").match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
  const parsed = new URL(text(decodeHtml(href)));
  if (parsed.protocol !== "https:") throw new Error("HTML_GROUPED_LINK_DIRECTORY_LINK_URL_INVALID");
  return parsed.toString();
}

/**
 * Extracts public named directory rows grouped under rendered headings. It is
 * intentionally location-free: a source that exposes only a licensee name and
 * region may be retained in local history but cannot obtain a map coordinate.
 */
export function extractGroupedLinkStoreDirectory({ html, startMarker, endMarker, geoId, country, region, storeType, licenseType, regulatorUrl, expectedRecords }) {
  const scope = markerSlice(html, startMarker, endMarker);
  const headings = [...scope.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  if (headings.length === 0) throw new Error("HTML_GROUPED_LINK_DIRECTORY_HEADINGS_MISSING");
  const records = [];
  const identities = new Set();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const groupLabel = text(decodeHtml(heading[1])).replace(/\s*\+\s*$/, "");
    if (!groupLabel) throw new Error("HTML_GROUPED_LINK_DIRECTORY_GROUP_LABEL_MISSING");
    const blockStart = Number(heading.index) + heading[0].length;
    const blockEnd = index + 1 < headings.length ? Number(headings[index + 1].index) : scope.length;
    const block = scope.slice(blockStart, blockEnd);
    for (const link of block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const legalName = text(decodeHtml(link[2]));
      if (!legalName) throw new Error("HTML_GROUPED_LINK_DIRECTORY_LINK_NAME_MISSING");
      const officialWebsite = websiteHref(link[1]);
      const identity = [groupLabel, legalName, officialWebsite].join("\n");
      if (identities.has(identity)) throw new Error(`HTML_GROUPED_LINK_DIRECTORY_DUPLICATE_ROW:${legalName}`);
      identities.add(identity);
      records.push({
        source_record_id: stableId([text(geoId).toUpperCase(), groupLabel, legalName, officialWebsite]),
        legal_name: legalName,
        trade_name: "",
        license_number: "",
        license_type: text(licenseType),
        store_type: text(storeType).toUpperCase(),
        address: "",
        city: "",
        region: text(region).toUpperCase(),
        postal_code: "",
        country: text(country).toUpperCase(),
        latitude: null,
        longitude: null,
        official_website: officialWebsite,
        regulator_url: text(regulatorUrl),
        license_status: "UNKNOWN_STATUS",
        operational_status: "UNKNOWN_STATUS",
        medical: text(storeType).toUpperCase() === "MEDICAL_DISPENSARY",
        adult_use: text(storeType).toUpperCase() === "ADULT_USE_RETAIL",
        confidence: "STRONG",
        coordinates_source: "OFFICIAL_DIRECTORY_NO_ADDRESS_OR_COORDINATE_FIELD",
        coordinates_confidence: "UNKNOWN",
        location_evidence: "PARTIAL",
        public_source_fields: { group_label: groupLabel },
      });
    }
  }
  if (records.length === 0) throw new Error("HTML_GROUPED_LINK_DIRECTORY_NO_RECORDS");
  if (Number.isInteger(expectedRecords) && expectedRecords >= 0 && records.length !== expectedRecords) {
    throw new Error(`HTML_GROUPED_LINK_DIRECTORY_RECORD_COUNT_INVALID:${records.length}/${expectedRecords}`);
  }
  return records;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function required(name) {
  const value = argument(name);
  if (!value) throw new Error(`HTML_GROUPED_LINK_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
  return value;
}

function expectedCount() {
  const value = required("--expected-records");
  const count = Number.parseInt(value, 10);
  if (!Number.isInteger(count) || count < 1) throw new Error("HTML_GROUPED_LINK_DIRECTORY_EXPECTED_RECORDS_INVALID");
  return count;
}

function repositoryPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("HTML_GROUPED_LINK_DIRECTORY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  return absolute;
}

async function main() {
  const url = new URL(required("--url"));
  if (url.protocol !== "https:") throw new Error("HTML_GROUPED_LINK_DIRECTORY_URL_MUST_USE_HTTPS");
  const response = await fetch(url, { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`HTML_GROUPED_LINK_DIRECTORY_HTTP_${response.status}`);
  if (!text(response.headers.get("content-type")).toLowerCase().includes("text/html")) throw new Error("HTML_GROUPED_LINK_DIRECTORY_CONTENT_TYPE_INVALID");
  const html = await response.text();
  const records = extractGroupedLinkStoreDirectory({
    html,
    startMarker: required("--start-marker"),
    endMarker: required("--end-marker"),
    geoId: required("--geo"),
    country: required("--country"),
    region: required("--region"),
    storeType: required("--store-type"),
    licenseType: required("--license-type"),
    regulatorUrl: required("--regulator-url"),
    expectedRecords: expectedCount(),
  });
  const payload = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    source_url: response.url,
    source_page_sha256: crypto.createHash("sha256").update(html).digest("hex"),
    records_sha256: crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    records,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const digest = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`HTML_GROUPED_LINK_DIRECTORY_DRY_RUN records=${records.length} sha256=${digest} records_sha256=${payload.records_sha256} source_page_sha256=${payload.source_page_sha256} url=${response.url}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("HTML_GROUPED_LINK_DIRECTORY_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const output = repositoryPath(required("--output"));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, serialized);
  console.log(`HTML_GROUPED_LINK_DIRECTORY_WRITTEN records=${records.length} output=${path.relative(ROOT, output)} sha256=${digest} records_sha256=${payload.records_sha256} source_page_sha256=${payload.source_page_sha256} url=${response.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

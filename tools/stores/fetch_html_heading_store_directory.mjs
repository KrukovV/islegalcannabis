#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, encoded) => {
      const number = String(encoded).toLowerCase().startsWith("x")
        ? Number.parseInt(String(encoded).slice(1), 16)
        : Number.parseInt(String(encoded), 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : " ";
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stableId(parts) {
  return `html-heading:${crypto.createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24)}`;
}

function markerSlice(html, startMarker, endMarker) {
  const source = String(html || "");
  const lower = source.toLowerCase();
  const start = lower.indexOf(text(startMarker).toLowerCase());
  if (start < 0) throw new Error("HTML_HEADING_DIRECTORY_START_MARKER_NOT_FOUND");
  const end = lower.indexOf(text(endMarker).toLowerCase(), start + text(startMarker).length);
  if (end < 0) throw new Error("HTML_HEADING_DIRECTORY_END_MARKER_NOT_FOUND");
  return source.slice(start, end);
}

function tagName(value, argumentName) {
  const normalized = text(value).toLowerCase();
  if (!/^h[1-6]$/.test(normalized) && !["p", "li"].includes(normalized)) {
    throw new Error(`HTML_HEADING_DIRECTORY_${argumentName}_INVALID`);
  }
  return normalized;
}

function tokens(html, acceptedTags) {
  const pattern = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  return [...String(html || "").matchAll(pattern)]
    .map((match) => ({ tag: String(match[1]).toLowerCase(), value: text(decodeHtml(match[2])) }))
    .filter((token) => acceptedTags.has(token.tag) && token.value);
}

/**
 * Extracts directories whose repeated record structure is a group heading, a
 * store heading and the first following address element. The HTML shape is
 * supplied by CLI/configuration rather than a jurisdiction-specific branch.
 */
export function selectHtmlHeadingStoreDirectory(html, options) {
  const groupTag = tagName(options?.groupHeading, "GROUP_HEADING");
  const recordTag = tagName(options?.recordHeading, "RECORD_HEADING");
  const addressTag = tagName(options?.addressTag, "ADDRESS_TAG");
  const geoId = text(options?.geoId).toUpperCase();
  const country = text(options?.country).toUpperCase();
  const region = text(options?.region).toUpperCase();
  const storeType = text(options?.storeType).toUpperCase();
  const licenseType = text(options?.licenseType);
  const regulatorUrl = text(options?.regulatorUrl);
  if (!geoId || !country || !region || !storeType || !licenseType || !/^https:\/\//i.test(regulatorUrl)) {
    throw new Error("HTML_HEADING_DIRECTORY_REQUIRED_METADATA_MISSING");
  }
  const scope = markerSlice(html, options?.startMarker, options?.endMarker);
  const stream = tokens(scope, new Set([groupTag, recordTag, addressTag]));
  const records = [];
  let city = "";
  let pending = null;
  for (const token of stream) {
    if (token.tag === groupTag) {
      if (pending) throw new Error("HTML_HEADING_DIRECTORY_ADDRESS_MISSING_BEFORE_GROUP");
      city = token.value;
      continue;
    }
    if (token.tag === recordTag) {
      if (!city) throw new Error("HTML_HEADING_DIRECTORY_GROUP_HEADING_MISSING");
      if (pending) throw new Error("HTML_HEADING_DIRECTORY_ADDRESS_MISSING_BEFORE_RECORD");
      pending = { city, legal_name: token.value };
      continue;
    }
    if (token.tag === addressTag && pending) {
      const address = token.value;
      records.push({
        source_record_id: stableId([geoId, pending.legal_name, address, pending.city, region, country]),
        legal_name: pending.legal_name,
        trade_name: "",
        license_number: "",
        license_type: licenseType,
        store_type: storeType,
        address,
        city: pending.city,
        region,
        postal_code: "",
        country,
        latitude: null,
        longitude: null,
        official_website: "",
        regulator_url: regulatorUrl,
        license_status: "UNKNOWN_STATUS",
        operational_status: "ACTIVE",
        medical: storeType === "MEDICAL_DISPENSARY",
        adult_use: storeType === "ADULT_USE_RETAIL",
        confidence: "STRONG",
        coordinates_source: "OFFICIAL_DIRECTORY_NO_COORDINATE_FIELD",
        coordinates_confidence: "UNKNOWN",
        location_evidence: "STRONG",
      });
      pending = null;
    }
  }
  if (pending) throw new Error("HTML_HEADING_DIRECTORY_ADDRESS_MISSING_AT_END");
  if (records.length === 0) throw new Error("HTML_HEADING_DIRECTORY_NO_RECORDS");
  const identities = new Set();
  for (const record of records) {
    const identity = [record.legal_name, record.address, record.city, record.region, record.country].map((value) => text(value).toLowerCase()).join("|");
    if (identities.has(identity)) throw new Error(`HTML_HEADING_DIRECTORY_DUPLICATE_RECORD:${identity}`);
    identities.add(identity);
  }
  const expectedRecords = options?.expectedRecords;
  if (Number.isInteger(expectedRecords) && expectedRecords >= 0 && records.length !== expectedRecords) {
    throw new Error(`HTML_HEADING_DIRECTORY_RECORD_COUNT_INVALID:${records.length}/${expectedRecords}`);
  }
  return records;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function required(name) {
  const value = argument(name);
  if (!value) throw new Error(`HTML_HEADING_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
  return value;
}

function optionalInteger(name) {
  const value = argument(name);
  if (!value) return undefined;
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number < 0) throw new Error(`HTML_HEADING_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_INVALID`);
  return number;
}

function outputPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("HTML_HEADING_DIRECTORY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  return absolute;
}

async function main() {
  const url = required("--url");
  const output = required("--output");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("HTML_HEADING_DIRECTORY_URL_MUST_USE_HTTPS");
  const response = await fetch(parsed, { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`HTML_HEADING_DIRECTORY_HTTP_${response.status}`);
  const contentType = text(response.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("text/html")) throw new Error(`HTML_HEADING_DIRECTORY_CONTENT_TYPE_INVALID:${contentType || "MISSING"}`);
  const records = selectHtmlHeadingStoreDirectory(await response.text(), {
    startMarker: required("--start-marker"),
    endMarker: required("--end-marker"),
    groupHeading: required("--group-heading"),
    recordHeading: required("--record-heading"),
    addressTag: required("--address-tag"),
    geoId: required("--geo"),
    country: required("--country"),
    region: required("--region"),
    storeType: required("--store-type"),
    licenseType: required("--license-type"),
    regulatorUrl: required("--regulator-url"),
    expectedRecords: optionalInteger("--expected-records"),
  });
  const serialized = `${JSON.stringify(records, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`HTML_HEADING_DIRECTORY_DRY_RUN records=${records.length} sha256=${sha256} url=${response.url}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("HTML_HEADING_DIRECTORY_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const target = outputPath(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
  console.log(`HTML_HEADING_DIRECTORY_WRITTEN records=${records.length} sha256=${sha256} output=${path.relative(ROOT, target)} url=${response.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();

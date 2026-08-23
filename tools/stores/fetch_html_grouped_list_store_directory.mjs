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
    .replace(/<br\s*\/?>/gi, " ")
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
    .replace(/&ndash;|&mdash;/gi, "-");
}

function markerSlice(html, startMarker, endMarker) {
  const source = String(html ?? "");
  const lower = source.toLowerCase();
  const start = lower.indexOf(text(startMarker).toLowerCase());
  if (start < 0) throw new Error("HTML_GROUPED_LIST_DIRECTORY_START_MARKER_NOT_FOUND");
  const end = lower.indexOf(text(endMarker).toLowerCase(), start + text(startMarker).length);
  if (end < 0) throw new Error("HTML_GROUPED_LIST_DIRECTORY_END_MARKER_NOT_FOUND");
  return source.slice(start, end);
}

function stableId(parts) {
  return `html-grouped-list:${crypto.createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24)}`;
}

function parseListing(value) {
  const matched = text(value).match(/^(?<legalName>.+?)(?:,\s*|\s+-\s+)(?<address>.+)$/);
  if (!matched?.groups) return null;
  const legalName = text(matched.groups.legalName);
  const address = text(matched.groups.address);
  return legalName && address ? { legalName, address } : null;
}

/**
 * Extract current regulator directories that group <li> records under a city
 * label in a preceding <p>. The parser is schema-driven and retains only the
 * public legal name, street address and group locality; it never invents a
 * license number, lifecycle, coordinate or opening state.
 */
export function selectHtmlGroupedListStoreDirectory(html, options) {
  const geoId = text(options?.geoId).toUpperCase();
  const country = text(options?.country).toUpperCase();
  const region = text(options?.region).toUpperCase();
  const storeType = text(options?.storeType).toUpperCase();
  const licenseType = text(options?.licenseType);
  const regulatorUrl = text(options?.regulatorUrl);
  if (!geoId || !country || !region || !storeType || !licenseType || !/^https:\/\//i.test(regulatorUrl)) {
    throw new Error("HTML_GROUPED_LIST_DIRECTORY_REQUIRED_METADATA_MISSING");
  }
  const scope = markerSlice(html, options?.startMarker, options?.endMarker);
  const records = [];
  let city = "";
  for (const match of scope.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tag = String(match[1]).toLowerCase();
    const value = text(decodeHtml(match[2]));
    if (!value) continue;
    if (tag === "p") {
      if (/^[^,:;]+:\s*$/.test(value)) city = text(value.replace(/:\s*$/, ""));
      continue;
    }
    if (!city) throw new Error("HTML_GROUPED_LIST_DIRECTORY_GROUP_MISSING");
    const parsed = parseListing(value);
    if (!parsed) throw new Error(`HTML_GROUPED_LIST_DIRECTORY_ROW_INVALID:${value}`);
    records.push({
      source_record_id: stableId([geoId, parsed.legalName, parsed.address, city, region, country]),
      legal_name: parsed.legalName,
      trade_name: "",
      license_number: "",
      license_type: licenseType,
      store_type: storeType,
      address: parsed.address,
      city,
      region,
      postal_code: "",
      country,
      latitude: null,
      longitude: null,
      official_website: "",
      regulator_url: regulatorUrl,
      license_status: "ACTIVE",
      operational_status: "UNKNOWN_STATUS",
      medical: storeType === "MEDICAL_DISPENSARY",
      adult_use: storeType === "ADULT_USE_RETAIL",
      confidence: "PROVEN",
      coordinates_source: "OFFICIAL_CURRENT_REGULATOR_DIRECTORY_NO_COORDINATE_FIELD",
      coordinates_confidence: "UNKNOWN",
      location_evidence: "STRONG",
    });
  }
  if (records.length === 0) throw new Error("HTML_GROUPED_LIST_DIRECTORY_NO_RECORDS");
  const identities = new Set();
  for (const record of records) {
    const identity = [record.legal_name, record.address, record.city, record.region, record.country].map((value) => text(value).toLowerCase()).join("|");
    if (identities.has(identity)) throw new Error(`HTML_GROUPED_LIST_DIRECTORY_DUPLICATE_RECORD:${identity}`);
    identities.add(identity);
  }
  if (Number.isInteger(options?.expectedRecords) && options.expectedRecords >= 0 && records.length !== options.expectedRecords) {
    throw new Error(`HTML_GROUPED_LIST_DIRECTORY_RECORD_COUNT_INVALID:${records.length}/${options.expectedRecords}`);
  }
  return records;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function required(name) {
  const value = argument(name);
  if (!value) throw new Error(`HTML_GROUPED_LIST_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
  return value;
}

function optionalInteger(name) {
  const value = argument(name);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`HTML_GROUPED_LIST_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_INVALID`);
  return parsed;
}

function outputPath(value) {
  const target = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("HTML_GROUPED_LIST_DIRECTORY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  return target;
}

async function main() {
  const url = required("--url");
  const output = required("--output");
  if (new URL(url).protocol !== "https:") throw new Error("HTML_GROUPED_LIST_DIRECTORY_URL_MUST_USE_HTTPS");
  const response = await fetch(url, { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`HTML_GROUPED_LIST_DIRECTORY_HTTP_${response.status}`);
  const contentType = text(response.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("text/html")) throw new Error(`HTML_GROUPED_LIST_DIRECTORY_CONTENT_TYPE_INVALID:${contentType || "MISSING"}`);
  const records = selectHtmlGroupedListStoreDirectory(await response.text(), {
    startMarker: required("--start-marker"),
    endMarker: required("--end-marker"),
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
    console.log(`HTML_GROUPED_LIST_DIRECTORY_DRY_RUN records=${records.length} sha256=${sha256} url=${response.url}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("HTML_GROUPED_LIST_DIRECTORY_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const target = outputPath(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
  console.log(`HTML_GROUPED_LIST_DIRECTORY_WRITTEN records=${records.length} sha256=${sha256} output=${path.relative(ROOT, target)} url=${response.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

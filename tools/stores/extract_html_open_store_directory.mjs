#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value || "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function required(name) {
  const value = arg(name);
  if (!value) throw new Error(`HTML_OPEN_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
  return value;
}

function decodeHtml(value) {
  return String(value || "")
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
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z]+;/gi, " ");
}

function stableId(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function listSlice(html, startMarker, endMarker) {
  const lower = String(html).toLowerCase();
  const start = lower.indexOf(startMarker.toLowerCase());
  if (start < 0) throw new Error("HTML_OPEN_DIRECTORY_START_MARKER_NOT_FOUND");
  const end = lower.indexOf(endMarker.toLowerCase(), start + startMarker.length);
  if (end < 0) throw new Error("HTML_OPEN_DIRECTORY_END_MARKER_NOT_FOUND");
  return String(html).slice(start, end);
}

function parseOpenLocation(textValue) {
  const matched = textValue.match(/^(?<legal_name>.+?),\s*located at\s+(?<address>.+),\s*(?<city>[^,;]+),\s*(?<region>[A-Z]{2})\s+(?<postal_code>\d{5}(?:-\d{4})?)\s*;\s*open since\s+(?<opened_since>.+?)\.?$/i);
  if (!matched?.groups) return null;
  return Object.fromEntries(Object.entries(matched.groups).map(([key, value]) => [key, text(value)]));
}

export function extractOpenStoreDirectory({ html, startMarker, endMarker, geoId, country, storeType, licenseType, regulatorUrl, legalGate }) {
  const records = [];
  const unparsed = [];
  const slice = listSlice(html, startMarker, endMarker);
  for (const matched of slice.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const sourceText = text(decodeHtml(matched[1]));
    const parsed = parseOpenLocation(sourceText);
    if (!parsed) {
      unparsed.push(sourceText);
      continue;
    }
    records.push({
      source_record_id: stableId([geoId, parsed.legal_name, parsed.address, parsed.city, parsed.postal_code].join("|")),
      geo_id: geoId,
      legal_name: parsed.legal_name,
      trade_name: "",
      license_type: licenseType,
      store_type: storeType,
      address: parsed.address,
      city: parsed.city,
      region: parsed.region,
      postal_code: parsed.postal_code,
      country,
      latitude: null,
      longitude: null,
      official_website: "",
      regulator_url: regulatorUrl,
      license_status: "ACTIVE",
      operational_status: "ACTIVE",
      medical: storeType === "MEDICAL_DISPENSARY",
      adult_use: storeType === "ADULT_USE_RETAIL",
      confidence: "STRONG",
      coordinates_source: "OFFICIAL_RECORD_NO_COORDINATE_FIELD",
      coordinates_confidence: "UNKNOWN",
      location_evidence: "STRONG",
      source_opened_since: parsed.opened_since,
      legal_gate: legalGate,
    });
  }
  if (unparsed.length > 0) throw new Error(`HTML_OPEN_DIRECTORY_ROWS_UNPARSEABLE:${unparsed.length}:${unparsed.join(" | ")}`);
  if (records.length === 0) throw new Error("HTML_OPEN_DIRECTORY_NO_RECORDS");
  return records;
}

function main() {
  const input = path.resolve(ROOT, required("--input"));
  const output = path.resolve(ROOT, required("--output"));
  const relativeOutput = path.relative(ROOT, output);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("HTML_OPEN_DIRECTORY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  }
  const geoId = required("--geo").toUpperCase();
  const country = required("--country").toUpperCase();
  const storeType = required("--store-type").toUpperCase();
  const licenseType = required("--license-type");
  const regulatorUrl = required("--regulator-url");
  const legalGate = {
    geo_access_legal: true,
    store_type_legal: true,
    store_type_eligibility_ref: required("--eligibility-ref"),
    store_type_eligibility_fingerprint: required("--eligibility-fingerprint"),
    canonical_truth_ref: required("--canonical-truth-ref"),
    canonical_truth_fingerprint: required("--canonical-truth-fingerprint"),
    evidence_basis: required("--evidence-basis"),
  };
  const records = extractOpenStoreDirectory({
    html: fs.readFileSync(input, "utf8"),
    startMarker: required("--start-marker"),
    endMarker: required("--end-marker"),
    geoId,
    country,
    storeType,
    licenseType,
    regulatorUrl,
    legalGate,
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(records, null, 2)}\n`);
  console.log(`HTML_OPEN_DIRECTORY_EXTRACTED geo=${geoId} records=${records.length} output=${relativeOutput}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

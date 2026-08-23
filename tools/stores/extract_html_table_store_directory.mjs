#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_HEADERS = ["Licensee’s Name", "City", "Location Name", "Sales Type", "Phone"];
const SALES_TYPES = {
  "Adult Use": { store_type: "ADULT_USE_RETAIL", adult_use: true, medical: false },
  "Medical Only": { store_type: "MEDICAL_DISPENSARY", adult_use: false, medical: true },
};

function text(value) {
  return String(value || "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function required(name) {
  const value = arg(name);
  if (!value) throw new Error(`HTML_TABLE_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
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

function cellValues(row) {
  return [...String(row).matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => text(decodeHtml(match[1])));
}

function tableWithExpectedHeaders(html) {
  const tables = [...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => match[0]);
  const matching = tables.filter((table) => {
    const headerRow = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i)?.[1];
    const headers = cellValues(headerRow);
    return headers.length === REQUIRED_HEADERS.length && headers.every((header, index) => header === REQUIRED_HEADERS[index]);
  });
  if (matching.length !== 1) throw new Error(`HTML_TABLE_DIRECTORY_EXPECTED_TABLE_COUNT_INVALID:${matching.length}`);
  return matching[0];
}

export function extractHtmlTableStoreDirectory({ html, geoId, country, region, regulatorUrl, legalGates }) {
  const table = tableWithExpectedHeaders(html);
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!body) throw new Error("HTML_TABLE_DIRECTORY_BODY_MISSING");
  const records = [];
  const rowOccurrences = new Map();
  for (const [index, match] of [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].entries()) {
    const cells = cellValues(match[1]);
    if (cells.length !== REQUIRED_HEADERS.length || cells.some((value) => !value)) {
      throw new Error(`HTML_TABLE_DIRECTORY_ROW_INVALID:${index + 1}`);
    }
    const [legalName, city, tradeName, salesType] = cells;
    const type = SALES_TYPES[salesType];
    if (!type) throw new Error(`HTML_TABLE_DIRECTORY_SALES_TYPE_UNSUPPORTED:${salesType}`);
    const legalGate = legalGates?.[type.store_type];
    if (!legalGate) throw new Error(`HTML_TABLE_DIRECTORY_LEGAL_GATE_MISSING:${type.store_type}`);
    const rowKey = [geoId, legalName, city, tradeName, salesType].join("\n");
    const occurrence = (rowOccurrences.get(rowKey) || 0) + 1;
    rowOccurrences.set(rowKey, occurrence);
    records.push({
      source_record_id: stableId([rowKey, occurrence].join("\n")),
      geo_id: geoId,
      legal_name: legalName,
      trade_name: tradeName,
      license_number: "",
      license_type: "Licensed Dispensary Location",
      store_type: type.store_type,
      address: "",
      city,
      region,
      postal_code: "",
      country,
      latitude: null,
      longitude: null,
      official_website: "",
      regulator_url: regulatorUrl,
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      adult_use: type.adult_use,
      medical: type.medical,
      confidence: "STRONG",
      coordinates_source: "OFFICIAL_DIRECTORY_NO_COORDINATE_FIELD",
      coordinates_confidence: "UNKNOWN",
      location_evidence: "STRONG",
      legal_gate: legalGate,
    });
  }
  if (records.length === 0) throw new Error("HTML_TABLE_DIRECTORY_NO_RECORDS");
  return records;
}

function main() {
  const input = path.resolve(ROOT, required("--input"));
  const output = path.resolve(ROOT, required("--output"));
  const relativeOutput = path.relative(ROOT, output);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("HTML_TABLE_DIRECTORY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  }
  const geoId = required("--geo").toUpperCase();
  const eligibleGate = {
    geo_access_legal: true,
    store_type_legal: true,
    store_type_eligibility_ref: required("--eligibility-ref"),
    store_type_eligibility_fingerprint: required("--eligibility-fingerprint"),
    canonical_truth_ref: required("--canonical-truth-ref"),
    canonical_truth_fingerprint: required("--canonical-truth-fingerprint"),
    evidence_basis: required("--evidence-basis"),
  };
  const unprovenStoreType = required("--unproven-store-type").toUpperCase();
  const unprovenGate = {
    geo_access_legal: true,
    store_type_legal: false,
    store_type_eligibility_ref: required("--unproven-eligibility-ref"),
    store_type_eligibility_fingerprint: required("--unproven-eligibility-fingerprint"),
    canonical_truth_ref: required("--canonical-truth-ref"),
    canonical_truth_fingerprint: required("--canonical-truth-fingerprint"),
    evidence_basis: required("--unproven-evidence-basis"),
  };
  const records = extractHtmlTableStoreDirectory({
    html: fs.readFileSync(input, "utf8"),
    geoId,
    country: required("--country").toUpperCase(),
    region: required("--region").toUpperCase(),
    regulatorUrl: required("--regulator-url"),
    legalGates: {
      [required("--eligible-store-type").toUpperCase()]: eligibleGate,
      [unprovenStoreType]: unprovenGate,
    },
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(records, null, 2)}\n`);
  console.log(`HTML_TABLE_DIRECTORY_EXTRACTED geo=${geoId} records=${records.length} output=${relativeOutput}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

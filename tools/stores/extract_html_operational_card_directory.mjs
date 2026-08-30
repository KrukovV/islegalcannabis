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
  if (!value) throw new Error(`HTML_OPERATIONAL_CARD_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
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

function htmlValue(fragment, tag) {
  return text(decodeHtml(String(fragment).match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]));
}

function labelledValue(fragment, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text(decodeHtml(String(fragment).match(new RegExp(`<label>\\s*${escaped}\\s*<\\/label>\\s*<span>([\\s\\S]*?)<\\/span>`, "i"))?.[1]));
}

function statusValue(fragment, expectedStatus) {
  return [...String(fragment).matchAll(/<span>([\s\S]*?)<\/span>/gi)]
    .map((match) => text(decodeHtml(match[1])))
    .find((value) => value === expectedStatus) || "";
}

function cardSlices(html) {
  const starts = [...String(html).matchAll(/<div\s+class="card"\s+data-county="([^"]+)"\s+data-id="([^"]+)">/gi)];
  if (starts.length === 0) throw new Error("HTML_OPERATIONAL_CARD_DIRECTORY_CARDS_MISSING");
  return starts.map((match, index) => ({
    county: text(match[1]),
    sourceRecordId: text(match[2]),
    html: String(html).slice(match.index, starts[index + 1]?.index),
  }));
}

function coordinatesBySourceRecordId(html) {
  const coordinates = new Map();
  const pattern = /L\.marker\(\[\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\],\{[\s\S]{0,700}?extraClasses:\s*'[^']*\bid-([^'\s]+)[^']*'/gi;
  for (const match of String(html).matchAll(pattern)) {
    const id = text(match[3]);
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (!id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (coordinates.has(id)) throw new Error(`HTML_OPERATIONAL_CARD_DIRECTORY_DUPLICATE_MARKER_ID:${id}`);
    coordinates.set(id, { latitude, longitude });
  }
  return coordinates;
}

function parseAddress(value, index) {
  const match = text(value).match(/^(?<address>.+),\s*(?<city>[^,]+),\s*(?<region>[A-Z]{2})\s+(?<postal_code>\d{5}(?:-\d{4})?)$/);
  if (!match?.groups) throw new Error(`HTML_OPERATIONAL_CARD_DIRECTORY_ADDRESS_INVALID:${index}`);
  return Object.fromEntries(Object.entries(match.groups).map(([key, item]) => [key, text(item)]));
}

export function extractOperationalCardDirectory({ html, geoId, country, regulatorUrl, legalGate, expectedStatus = "Operational with product" }) {
  const coordinates = coordinatesBySourceRecordId(html);
  const records = cardSlices(html).map((card, index) => {
    const legalName = labelledValue(card.html, "Dispensary Name:");
    const status = statusValue(card.html, expectedStatus);
    const tradeName = htmlValue(card.html, "h3");
    const address = parseAddress(htmlValue(card.html, "h4"), index + 1);
    const marker = coordinates.get(card.sourceRecordId);
    if (!legalName || status !== expectedStatus || !marker) {
      throw new Error(`HTML_OPERATIONAL_CARD_DIRECTORY_CARD_OR_MARKER_MISMATCH:${card.sourceRecordId || index + 1}`);
    }
    return {
      source_record_id: card.sourceRecordId || stableId([geoId, legalName, address.address, address.city].join("\n")),
      geo_id: geoId,
      legal_name: legalName,
      trade_name: tradeName,
      license_number: "",
      license_type: "Office of Medical Cannabis Dispensary Directory",
      store_type: "MEDICAL_DISPENSARY",
      address: address.address,
      city: address.city,
      region: address.region,
      postal_code: address.postal_code,
      country,
      latitude: marker.latitude,
      longitude: marker.longitude,
      official_website: "",
      regulator_url: regulatorUrl,
      license_status: "ACTIVE",
      operational_status: "ACTIVE",
      medical: true,
      adult_use: false,
      county: card.county,
      directory_status: status,
      confidence: "STRONG",
      coordinates_source: "OFFICIAL_EMBEDDED_DIRECTORY_LEAFLET_MARKER",
      coordinates_confidence: "PROVEN",
      location_evidence: "STRONG",
      legal_gate: legalGate,
    };
  });
  if (records.length === 0) throw new Error("HTML_OPERATIONAL_CARD_DIRECTORY_NO_RECORDS");
  return records;
}

function main() {
  const input = path.resolve(ROOT, required("--input"));
  const output = path.resolve(ROOT, required("--output"));
  const relativeOutput = path.relative(ROOT, output);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("HTML_OPERATIONAL_CARD_DIRECTORY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  }
  const geoId = required("--geo").toUpperCase();
  const legalGate = {
    geo_access_legal: true,
    store_type_legal: true,
    store_type_eligibility_ref: required("--eligibility-ref"),
    store_type_eligibility_fingerprint: required("--eligibility-fingerprint"),
    canonical_truth_ref: required("--canonical-truth-ref"),
    canonical_truth_fingerprint: required("--canonical-truth-fingerprint"),
    evidence_basis: required("--evidence-basis"),
  };
  const records = extractOperationalCardDirectory({
    html: fs.readFileSync(input, "utf8"),
    geoId,
    country: required("--country").toUpperCase(),
    regulatorUrl: required("--regulator-url"),
    legalGate,
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(records, null, 2)}\n`);
  console.log(`HTML_OPERATIONAL_CARD_DIRECTORY_EXTRACTED geo=${geoId} records=${records.length} output=${relativeOutput}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PA_BOUNDS = Object.freeze({ west: -81, east: -74, south: 39.5, north: 42.5 });
const MAX_COORDINATE_DISAGREEMENT_DEGREES = 0.002;
const MAX_PRODUCT_DIRECTORY_AGE_DAYS = 31;

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inPennsylvania(longitude, latitude) {
  return Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= PA_BOUNDS.west && longitude <= PA_BOUNDS.east &&
    latitude >= PA_BOUNDS.south && latitude <= PA_BOUNDS.north;
}

function parseUsDate(value) {
  const match = text(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function dateLabel(date) {
  return date.toISOString().slice(0, 10);
}

function productAvailabilityDate(pdfText, now) {
  const match = String(pdfText || "").match(/Product\s+available\s+as\s+of\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*:/i);
  const date = parseUsDate(match?.[1]);
  if (!date) throw new Error("PA_CURRENT_PRODUCT_DIRECTORY_DATE_MISSING");
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ageDays = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
  if (ageDays < 0 || ageDays > MAX_PRODUCT_DIRECTORY_AGE_DAYS) {
    throw new Error(`PA_CURRENT_PRODUCT_DIRECTORY_STALE_OR_FUTURE:${dateLabel(date)}`);
  }
  return { date, age_days: ageDays };
}

function productRows(pdfText) {
  const rows = [];
  for (const line of String(pdfText || "").split(/\r?\n/)) {
    const match = line.match(/(\d{1,2}\/\d{1,2}\/\d{2})\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+Yes\s+(.+)/i);
    if (!match) continue;
    const tail = text(match[3]);
    const addressTail = tail.match(/\s+Pennsylvania\s+(\d{5})\s+\d{3}[-.]\d{3}[-.]\d{4}(?:\s+\S.*)?$/i);
    if (!addressTail) {
      rows.push({ raw: text(line), zip_code: "", parsable: false });
      continue;
    }
    rows.push({ raw: text(line), zip_code: addressTail[1], parsable: true });
  }
  if (rows.length === 0) throw new Error("PA_CURRENT_PRODUCT_DIRECTORY_ROWS_MISSING");
  return rows;
}

function directoryLocationSignature(row) {
  const postalCode = text(row?.zip_code).padStart(5, "0");
  return `${normalized(row?.street)}${normalized(row?.city_or_borough)}PENNSYLVANIA${postalCode}`;
}

function currentDirectoryCoordinate(row) {
  const coordinates = row?.georeference?.coordinates;
  const geometryLongitude = asNumber(Array.isArray(coordinates) ? coordinates[0] : null);
  const geometryLatitude = asNumber(Array.isArray(coordinates) ? coordinates[1] : null);
  const publishedLongitude = asNumber(row?.longitude);
  const publishedLatitude = asNumber(row?.latitude);
  if (!inPennsylvania(geometryLongitude, geometryLatitude) || !inPennsylvania(publishedLongitude, publishedLatitude)) return null;
  const disagreement = Math.max(
    Math.abs(geometryLongitude - publishedLongitude),
    Math.abs(geometryLatitude - publishedLatitude),
  );
  if (disagreement > MAX_COORDINATE_DISAGREEMENT_DEGREES) return null;
  return { longitude: geometryLongitude, latitude: geometryLatitude, disagreement };
}

function canonicalCurrentOperationalRecord(row, coordinate, productDate) {
  const objectId = text(row?.objectid);
  const legalName = text(row?.facility_name);
  const street = text(row?.street);
  const city = text(row?.city_or_borough);
  const postalCode = text(row?.zip_code).padStart(5, "0");
  if (!objectId || !legalName || !street || !city || !postalCode || text(row?.state).toUpperCase() !== "PA") return null;
  return {
    // The DOH Object Id is the stable public row identity already used by the
    // prior current-directory projection. Keeping it verbatim prevents a
    // source-refresh from manufacturing a second canonical store identity.
    source_record_id: objectId,
    legal_name: legalName,
    trade_name: legalName,
    license_type: "Pennsylvania Medical Marijuana Dispensary",
    store_type: "MEDICAL_DISPENSARY",
    address: street,
    city,
    region: "PA",
    postal_code: postalCode,
    country: "US",
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    regulator_url: "https://www.pa.gov/agencies/health/programs/medical-marijuana/dispensaries",
    license_status: "ACTIVE",
    operational_status: "ACTIVE",
    medical: true,
    adult_use: false,
    confidence: "PROVEN",
    coordinates_source: "OFFICIAL_PA_DOH_CURRENT_OPEN_DATA_GEOREFERENCE_CONFIRMED_AGAINST_PUBLISHED_LATITUDE_LONGITUDE",
    coordinates_confidence: "PROVEN",
    location_evidence: "STRONG",
    public_source_fields: {
      current_product_status: "YES",
      product_available_as_of: dateLabel(productDate),
      official_directory_object_id: objectId,
      coordinate_agreement_degrees: coordinate.disagreement.toFixed(8),
    },
  };
}

export function selectPaCurrentOperationalDispensaries({ productPdfText, directoryRows, now = new Date() }) {
  const productDate = productAvailabilityDate(productPdfText, now);
  if (!Array.isArray(directoryRows) || directoryRows.length === 0) throw new Error("PA_CURRENT_OPEN_DATA_DIRECTORY_EMPTY");
  const products = productRows(productPdfText);
  const retained = new Map();
  let productRowsWithoutExactDirectoryMatch = 0;
  let productRowsWithoutUsableOfficialCoordinates = 0;
  let productRowsWithCoordinateConflict = 0;

  for (const product of products) {
    if (!product.parsable) {
      productRowsWithoutExactDirectoryMatch += 1;
      continue;
    }
    const normalizedProduct = normalized(product.raw);
    const matches = directoryRows.filter((row) => {
      const signature = directoryLocationSignature(row);
      return signature && text(row?.zip_code).padStart(5, "0") === product.zip_code && normalizedProduct.includes(signature);
    });
    if (matches.length !== 1) {
      productRowsWithoutExactDirectoryMatch += 1;
      continue;
    }
    const coordinate = currentDirectoryCoordinate(matches[0]);
    if (!coordinate) {
      const geometry = matches[0]?.georeference?.coordinates;
      const geometryLongitude = asNumber(Array.isArray(geometry) ? geometry[0] : null);
      const geometryLatitude = asNumber(Array.isArray(geometry) ? geometry[1] : null);
      const publishedLongitude = asNumber(matches[0]?.longitude);
      const publishedLatitude = asNumber(matches[0]?.latitude);
      if (inPennsylvania(geometryLongitude, geometryLatitude) && inPennsylvania(publishedLongitude, publishedLatitude)) {
        productRowsWithCoordinateConflict += 1;
      } else {
        productRowsWithoutUsableOfficialCoordinates += 1;
      }
      continue;
    }
    const record = canonicalCurrentOperationalRecord(matches[0], coordinate, productDate.date);
    if (!record) {
      productRowsWithoutExactDirectoryMatch += 1;
      continue;
    }
    const prior = retained.get(record.source_record_id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(record)) {
      throw new Error(`PA_CURRENT_PRODUCT_DIRECTORY_DUPLICATE_CONFLICT:${record.source_record_id}`);
    }
    retained.set(record.source_record_id, record);
  }
  const records = [...retained.values()].sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
  if (records.length === 0) throw new Error("PA_CURRENT_PRODUCT_DIRECTORY_SELECTION_EMPTY");
  return {
    product_available_as_of: dateLabel(productDate.date),
    product_directory_age_days: productDate.age_days,
    records,
    counts: {
      current_product_rows: products.length,
      current_open_data_directory_rows: directoryRows.length,
      product_rows_without_exact_directory_match: productRowsWithoutExactDirectoryMatch,
      product_rows_without_usable_official_coordinates: productRowsWithoutUsableOfficialCoordinates,
      product_rows_with_coordinate_conflict: productRowsWithCoordinateConflict,
      current_operational_dispensaries: records.length,
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function withinRepository(filePath) {
  const relative = path.relative(ROOT, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function fetchBytes(url, label, accept) {
  const response = await fetch(url, { headers: { accept }, redirect: "follow" });
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, bytes, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

function pdfText(pdfBytes) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-pa-product-"));
  const temporaryPdf = path.join(temporaryDirectory, "current-product-directory.pdf");
  try {
    fs.writeFileSync(temporaryPdf, pdfBytes);
    return execFileSync("pdftotext", ["-raw", temporaryPdf, "-"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`PA_CURRENT_PRODUCT_DIRECTORY_PDF_TEXT_EXTRACTION_FAILED:${text(error?.message)}`);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const productPdfUrl = argument("--product-pdf-url");
  const directoryUrl = argument("--directory-url");
  const output = argument("--output");
  if (!productPdfUrl || !directoryUrl || !output) {
    throw new Error("PA_CURRENT_PRODUCT_DIRECTORY_USAGE:--product-pdf-url <https-pdf> --directory-url <https-json> --output <repo-relative-json> [--write]");
  }
  for (const url of [productPdfUrl, directoryUrl]) {
    if (new URL(url).protocol !== "https:") throw new Error("PA_CURRENT_PRODUCT_DIRECTORY_SOURCE_URL_MUST_USE_HTTPS");
  }
  const outputPath = path.resolve(ROOT, output);
  if (!withinRepository(outputPath)) throw new Error("PA_CURRENT_PRODUCT_DIRECTORY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  const [productPdf, directory] = await Promise.all([
    fetchBytes(productPdfUrl, "PA_CURRENT_PRODUCT_DIRECTORY_PDF", "application/pdf"),
    fetchBytes(directoryUrl, "PA_CURRENT_OPEN_DATA_DIRECTORY", "application/json"),
  ]);
  let directoryRows;
  try {
    directoryRows = JSON.parse(directory.bytes.toString("utf8"));
  } catch {
    throw new Error("PA_CURRENT_OPEN_DATA_DIRECTORY_JSON_INVALID");
  }
  const selected = selectPaCurrentOperationalDispensaries({
    productPdfText: pdfText(productPdf.bytes),
    directoryRows,
    now: new Date(),
  });
  const payload = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    local_only: true,
    source: "CURRENT_PA_DOH_PRODUCT_AVAILABLE_PDF_EXACTLY_JOINED_TO_CURRENT_PA_DOH_OPEN_DATA_GEOREFERENCE_DIRECTORY",
    product_directory: {
      url: productPdf.response.url,
      content_sha256: productPdf.sha256,
      product_available_as_of: selected.product_available_as_of,
      age_days: selected.product_directory_age_days,
    },
    coordinate_directory: { url: directory.response.url, content_sha256: directory.sha256 },
    counts: selected.counts,
    records: selected.records,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`PA_CURRENT_PRODUCT_DIRECTORY_DRY_RUN records=${selected.records.length} unmatched=${selected.counts.product_rows_without_exact_directory_match} coordinate_conflicts=${selected.counts.product_rows_with_coordinate_conflict} sha256=${sha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("PA_CURRENT_PRODUCT_DIRECTORY_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`PA_CURRENT_PRODUCT_DIRECTORY_WRITTEN records=${selected.records.length} sha256=${sha256} output=${path.relative(ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

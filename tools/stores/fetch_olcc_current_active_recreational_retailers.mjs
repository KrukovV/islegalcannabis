#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RETAILER_TYPE = "RECREATIONAL RETAILER";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function normalized(value) {
  return upper(value).replace(/[^A-Z0-9]+/g, "");
}

function isoDate(value) {
  const candidate = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
}

function licenseKey(value) {
  return upper(value).replace(/\s+/g, "");
}

function activeCurrentRetailLicense(row, asOfDate) {
  const effectiveDate = isoDate(row?.effective_date);
  const expirationDate = isoDate(row?.expiration_date);
  return upper(row?.license_type) === RETAILER_TYPE &&
    upper(row?.license_expired) === "NO" &&
    !text(row?.inactive_date) &&
    Boolean(licenseKey(row?.license_number)) &&
    Boolean(normalized(row?.physical_address)) &&
    Boolean(effectiveDate) &&
    Boolean(expirationDate) &&
    effectiveDate <= asOfDate &&
    expirationDate >= asOfDate;
}

function currentLicenseByNumber(rows, asOfDate) {
  const active = new Map();
  for (const row of rows) {
    if (!activeCurrentRetailLicense(row, asOfDate)) continue;
    const key = licenseKey(row.license_number);
    if (active.has(key)) throw new Error(`OLCC_CURRENT_RETAIL_LICENSE_DUPLICATE:${key}`);
    active.set(key, row);
  }
  if (active.size === 0) throw new Error("OLCC_CURRENT_RETAIL_LICENSE_SELECTION_EMPTY");
  return active;
}

function mapRetailerFeature(feature) {
  const attributes = feature?.attributes || {};
  const longitude = Number(attributes.X ?? feature?.geometry?.x);
  const latitude = Number(attributes.Y ?? feature?.geometry?.y);
  return upper(attributes.licenseType) === RETAILER_TYPE &&
    Boolean(licenseKey(attributes.licensenumber)) &&
    Boolean(normalized(attributes.address)) &&
    Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= -125 && longitude <= -116 && latitude >= 41 && latitude <= 47;
}

function exactOfficialLocationMatch(feature, license) {
  return normalized(feature?.attributes?.address) === normalized(license?.physical_address);
}

export function selectOlccCurrentActiveRecreationalRetailers({ licenseRows, mapFeatures, asOfDate }) {
  const selectedDate = isoDate(asOfDate);
  if (!Array.isArray(licenseRows) || !Array.isArray(mapFeatures) || !selectedDate) {
    throw new Error("OLCC_CURRENT_RETAIL_INPUT_INVALID");
  }
  const activeByLicense = currentLicenseByNumber(licenseRows, selectedDate);
  const mappedRetailers = mapFeatures.filter(mapRetailerFeature);
  if (mappedRetailers.length === 0) throw new Error("OLCC_CURRENT_RETAIL_MAP_SELECTION_EMPTY");
  const mapFingerprintByLicense = new Map();
  const sourceRecordIds = new Set();
  const records = [];
  let currentLicenseMatches = 0;
  let exactLocationMatches = 0;
  let duplicateMapFeaturesMerged = 0;
  for (const feature of mappedRetailers) {
    const attributes = feature.attributes || {};
    const licenseNumber = text(attributes.licensenumber);
    const key = licenseKey(licenseNumber);
    const fingerprint = [
      normalized(attributes.address),
      normalized(attributes.premisesname),
      normalized(attributes.licensee),
      Number(attributes.X ?? feature.geometry?.x).toFixed(7),
      Number(attributes.Y ?? feature.geometry?.y).toFixed(7),
    ].join(":");
    const priorFingerprint = mapFingerprintByLicense.get(key);
    if (priorFingerprint) {
      if (priorFingerprint === fingerprint) {
        duplicateMapFeaturesMerged += 1;
        continue;
      }
      throw new Error(`OLCC_CURRENT_RETAIL_MAP_LICENSE_CONFLICT:${key}`);
    }
    mapFingerprintByLicense.set(key, fingerprint);
    const license = activeByLicense.get(key);
    if (!license) continue;
    currentLicenseMatches += 1;
    if (!exactOfficialLocationMatch(feature, license)) continue;
    exactLocationMatches += 1;
    const objectId = text(attributes.OBJECTID);
    const sourceRecordId = `OLCC_CAMP_PUBLIC:${objectId}:LICENSE:${licenseNumber}`;
    if (!objectId || sourceRecordIds.has(sourceRecordId)) {
      throw new Error(`OLCC_CURRENT_RETAIL_MAP_IDENTITY_INVALID_OR_DUPLICATE:${sourceRecordId || "MISSING"}`);
    }
    sourceRecordIds.add(sourceRecordId);
    records.push({
      source_record_id: sourceRecordId,
      legal_name: text(attributes.licensee),
      trade_name: text(attributes.premisesname),
      license_number: licenseNumber,
      license_type: text(attributes.licenseType),
      store_type: "ADULT_USE_RETAIL",
      address: text(attributes.address),
      city: text(attributes.city),
      region: "OR",
      postal_code: "",
      country: "US",
      latitude: Number(attributes.Y ?? feature.geometry?.y),
      longitude: Number(attributes.X ?? feature.geometry?.x),
      regulator_url: "https://www.oregon.gov/olcc/marijuana/Pages/Recreational-Marijuana-Licensee-Reports.aspx",
      license_status: "ACTIVE",
      operational_status: "UNKNOWN_STATUS",
      adult_use: true,
      medical: false,
      confidence: "PROVEN",
      coordinates_source: "OFFICIAL_OLCC_CAMP_PUBLIC_FEATURE_COORDINATES",
      coordinates_confidence: "PROVEN",
      location_evidence: "STRONG",
      public_source_fields: {
        current_license_status: "NOT_EXPIRED_WITH_CURRENT_EFFECTIVE_AND_EXPIRATION_DATES",
      },
    });
  }
  if (records.length === 0) throw new Error("OLCC_CURRENT_RETAIL_ACTIVE_LOCATION_SELECTION_EMPTY");
  return {
    records: records.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id)),
    counts: {
      license_rows_returned: licenseRows.length,
      current_active_retail_licenses: activeByLicense.size,
      map_retailer_features: mappedRetailers.length,
      duplicate_map_features_merged: duplicateMapFeaturesMerged,
      unique_map_retailer_locations: mappedRetailers.length - duplicateMapFeaturesMerged,
      current_license_matches: currentLicenseMatches,
      active_license_and_exact_official_location_matches: exactLocationMatches,
      map_features_blocked_for_current_license_or_location_mismatch: mappedRetailers.length - duplicateMapFeaturesMerged - exactLocationMatches,
      active_current_licenses_missing_exact_official_map_location: activeByLicense.size - exactLocationMatches,
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

async function fetchJson(url, label) {
  const response = await fetch(url, { headers: { accept: "application/json" }, redirect: "follow" });
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label}_JSON_INVALID`);
  }
  return {
    payload,
    response,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

async function main() {
  const statusUrl = argument("--status-url");
  const mapUrl = argument("--map-url");
  const output = argument("--output");
  const asOfDate = isoDate(argument("--as-of-date") || new Date().toISOString().slice(0, 10));
  const writeRequested = process.argv.includes("--write");
  if (!statusUrl || !mapUrl || !output || !asOfDate) {
    throw new Error("OLCC_CURRENT_RETAIL_USAGE:--status-url <https-json> --map-url <https-json> --output <repo-relative-json> [--as-of-date YYYY-MM-DD] [--write]");
  }
  if (new URL(statusUrl).protocol !== "https:" || new URL(mapUrl).protocol !== "https:") {
    throw new Error("OLCC_CURRENT_RETAIL_SOURCE_URL_MUST_USE_HTTPS");
  }
  const outputPath = path.resolve(ROOT, output);
  if (!withinRepository(outputPath)) throw new Error("OLCC_CURRENT_RETAIL_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  const [status, map] = await Promise.all([
    fetchJson(statusUrl, "OLCC_CURRENT_RETAIL_STATUS"),
    fetchJson(mapUrl, "OLCC_CURRENT_RETAIL_MAP"),
  ]);
  if (!Array.isArray(status.payload)) throw new Error("OLCC_CURRENT_RETAIL_STATUS_ROWS_INVALID");
  if (!Array.isArray(map.payload?.features) || map.payload.exceededTransferLimit === true) {
    throw new Error("OLCC_CURRENT_RETAIL_MAP_RESPONSE_INVALID_OR_INCOMPLETE");
  }
  const selected = selectOlccCurrentActiveRecreationalRetailers({
    licenseRows: status.payload,
    mapFeatures: map.payload.features,
    asOfDate,
  });
  const payload = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    local_only: true,
    source: "CURRENT_OFFICIAL_OLCC_RECREATIONAL_RETAILER_LICENSE_STATUS_JOINED_TO_CURRENT_OLCC_CAMP_PUBLIC_MAP",
    as_of_date: asOfDate,
    license_status_dataset: {
      url: status.response.url,
      content_sha256: status.sha256,
      returned_count: status.payload.length,
    },
    retailer_map: {
      url: map.response.url,
      content_sha256: map.sha256,
      feature_count: map.payload.features.length,
      spatial_reference: map.payload.spatialReference || null,
    },
    counts: selected.counts,
    records: selected.records,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!writeRequested) {
    console.log(`OLCC_CURRENT_RETAIL_DRY_RUN records=${selected.records.length} active_current_licenses=${selected.counts.current_active_retail_licenses} map_features=${selected.counts.map_retailer_features} blocked=${selected.counts.map_features_blocked_for_current_license_or_location_mismatch} sha256=${sha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("OLCC_CURRENT_RETAIL_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`OLCC_CURRENT_RETAIL_WRITTEN records=${selected.records.length} sha256=${sha256} output=${path.relative(ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

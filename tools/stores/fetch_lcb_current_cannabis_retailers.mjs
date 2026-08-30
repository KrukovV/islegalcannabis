#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractXlsxRows } from "./fetch_xlsx_store_snapshot.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ACTIVE_LICENSE_STATUSES = new Set(["ACTIVE (ISSUED)", "PENDING (ISSUED)"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function licenseKey(value) {
  const compact = text(value).replace(/\s+/g, "");
  if (!/^\d+$/.test(compact)) return compact.toUpperCase();
  return String(Number(compact));
}

function zipPrefix(value) {
  return normalized(value).slice(0, 5);
}

function activeRetailLicense(row) {
  return text(row?.["Priv Desc"]).toUpperCase().includes("CANNABIS RETAILER") &&
    ACTIVE_LICENSE_STATUSES.has(text(row?.["Privilege Status"]).toUpperCase());
}

function mapRetailerFeature(feature) {
  return text(feature?.attributes?.privstring).toUpperCase().includes("CANNABIS RETAILER") &&
    Number.isFinite(Number(feature?.geometry?.x)) &&
    Number.isFinite(Number(feature?.geometry?.y));
}

function locationsMatch(feature, licenseRow) {
  const attributes = feature.attributes || {};
  const mapStreet = normalized([attributes.streetaddress, attributes.streetaddress2].join(" "));
  const licenseStreet = normalized([licenseRow?.["Street Address"], licenseRow?.["Suite Rm"], licenseRow?.["Suite/Unit"]].join(" "));
  const streetMatches = Boolean(mapStreet && licenseStreet && (mapStreet.includes(licenseStreet) || licenseStreet.includes(mapStreet)));
  const cityMatches = normalized(attributes.cityname) === normalized(licenseRow?.City);
  const zipMatches = Boolean(zipPrefix(attributes.zipcode) && zipPrefix(licenseRow?.["Zip Code"])) &&
    zipPrefix(attributes.zipcode) === zipPrefix(licenseRow?.["Zip Code"]);
  return streetMatches && cityMatches && zipMatches;
}

function activeLicenseByNumber(rows) {
  const active = new Map();
  for (const row of rows) {
    if (!activeRetailLicense(row)) continue;
    const key = licenseKey(row?.License);
    if (!key) throw new Error("LCB_RETAILER_ACTIVE_LICENSE_NUMBER_MISSING");
    const existing = active.get(key);
    const status = text(row?.["Privilege Status"]).toUpperCase();
    if (existing && text(existing?.["Privilege Status"]).toUpperCase() !== status) {
      throw new Error(`LCB_RETAILER_ACTIVE_LICENSE_STATUS_CONFLICT:${key}`);
    }
    active.set(key, row);
  }
  if (active.size === 0) throw new Error("LCB_RETAILER_ACTIVE_LICENSE_SELECTION_EMPTY");
  return active;
}

export function selectLcbCurrentCannabisRetailers({ licenseRows, mapFeatures }) {
  if (!Array.isArray(licenseRows) || !Array.isArray(mapFeatures)) {
    throw new Error("LCB_RETAILER_INPUT_ARRAYS_REQUIRED");
  }
  const activeByLicense = activeLicenseByNumber(licenseRows);
  const mappedRetailers = mapFeatures.filter(mapRetailerFeature);
  if (mappedRetailers.length === 0) throw new Error("LCB_RETAILER_MAP_SELECTION_EMPTY");
  const observedIds = new Set();
  const records = [];
  let currentLicenseMatches = 0;
  let locationMatches = 0;
  for (const feature of mappedRetailers) {
    const attributes = feature.attributes || {};
    const licenseNumber = text(attributes.licensenum);
    const activeLicense = activeByLicense.get(licenseKey(licenseNumber));
    if (!activeLicense) continue;
    currentLicenseMatches += 1;
    if (!locationsMatch(feature, activeLicense)) continue;
    locationMatches += 1;
    const objectId = text(attributes.objectid);
    const sourceRecordId = `LCB_MAP:${objectId}:LICENSE:${licenseNumber}`;
    if (!objectId || !licenseNumber || observedIds.has(sourceRecordId)) {
      throw new Error(`LCB_RETAILER_MAP_IDENTITY_INVALID_OR_DUPLICATE:${sourceRecordId || "MISSING"}`);
    }
    observedIds.add(sourceRecordId);
    records.push({
      source_record_id: sourceRecordId,
      legal_name: text(attributes.tradename),
      trade_name: text(attributes.tradename),
      license_number: licenseNumber,
      license_type: text(attributes.privstring),
      store_type: "ADULT_USE_RETAIL",
      address: text([attributes.streetaddress, attributes.streetaddress2].filter((value) => text(value)).join(" ")),
      city: text(attributes.cityname),
      region: "WA",
      postal_code: text(attributes.zipcode),
      country: "US",
      latitude: Number(feature.geometry.y),
      longitude: Number(feature.geometry.x),
      regulator_url: "https://lcb.wa.gov/education/is-it-legal",
      license_status: "ACTIVE",
      operational_status: "UNKNOWN_STATUS",
      adult_use: true,
      medical: text(attributes.privstring).toUpperCase().includes("MEDICAL CANNABIS ENDORSEMENT"),
      confidence: "PROVEN",
      coordinates_source: "OFFICIAL_LCB_RETAILER_MAP_FEATURE_COORDINATES",
      coordinates_confidence: "PROVEN",
      location_evidence: "STRONG",
      public_source_fields: {
        current_license_status: text(activeLicense["Privilege Status"]),
      },
    });
  }
  if (records.length === 0) throw new Error("LCB_RETAILER_ACTIVE_LOCATION_SELECTION_EMPTY");
  return {
    records: records.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id)),
    counts: {
      active_license_rows: activeByLicense.size,
      map_retailer_features: mappedRetailers.length,
      current_license_matches: currentLicenseMatches,
      active_license_and_location_matches: locationMatches,
      blocked_for_current_license_or_location_mismatch: mappedRetailers.length - locationMatches,
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

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" }, redirect: "follow" });
  if (!response.ok) throw new Error(`LCB_RETAILER_MAP_HTTP_${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.features) || payload.exceededTransferLimit === true) {
    throw new Error("LCB_RETAILER_MAP_RESPONSE_INVALID_OR_INCOMPLETE");
  }
  return { payload, response };
}

async function fetchXlsxRows(url, pythonPath) {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`LCB_RETAILER_LICENSE_LIST_HTTP_${response.status}`);
  const contentType = text(response.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("spreadsheetml") && !contentType.includes("application/vnd.ms-excel")) {
    throw new Error(`LCB_RETAILER_LICENSE_LIST_CONTENT_TYPE_INVALID:${contentType || "MISSING"}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const sheetNames = ["Retailers 8-4-2026", "SE Retailers 8-4-2026"];
  const rows = sheetNames.flatMap((sheet) => extractXlsxRows({ bytes, sheet, pythonPath }));
  return { rows, response, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), sheetNames };
}

async function main() {
  const licenseUrl = argument("--license-url");
  const mapUrl = argument("--map-url");
  const output = argument("--output");
  const writeRequested = process.argv.includes("--write");
  if (!licenseUrl || !mapUrl || !output) {
    throw new Error("LCB_RETAILER_USAGE:--license-url <https-xlsx> --map-url <https-json> --output <repo-relative-json> [--write]");
  }
  if (new URL(licenseUrl).protocol !== "https:" || new URL(mapUrl).protocol !== "https:") {
    throw new Error("LCB_RETAILER_SOURCE_URL_MUST_USE_HTTPS");
  }
  const outputPath = path.resolve(ROOT, output);
  if (!withinRepository(outputPath)) throw new Error("LCB_RETAILER_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  const [licenseList, map] = await Promise.all([
    fetchXlsxRows(licenseUrl, process.env.STORE_XLSX_PYTHON),
    fetchJson(mapUrl),
  ]);
  const selected = selectLcbCurrentCannabisRetailers({ licenseRows: licenseList.rows, mapFeatures: map.payload.features });
  const payload = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    local_only: true,
    source: "CURRENT_OFFICIAL_LCB_RETAILER_MAP_JOINED_TO_CURRENT_LCB_CANNABIS_LICENSE_APPLICANTS",
    license_list: {
      url: licenseList.response.url,
      content_sha256: licenseList.sha256,
      last_modified: text(licenseList.response.headers.get("last-modified")),
      sheets: licenseList.sheetNames,
    },
    retailer_map: {
      url: map.response.url,
      feature_count: map.payload.features.length,
      spatial_reference: map.payload.spatialReference || null,
    },
    counts: selected.counts,
    records: selected.records,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!writeRequested) {
    console.log(`LCB_RETAILER_DRY_RUN records=${selected.records.length} active_license_rows=${selected.counts.active_license_rows} map_features=${selected.counts.map_retailer_features} blocked_mismatch=${selected.counts.blocked_for_current_license_or_location_mismatch} sha256=${sha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("LCB_RETAILER_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`LCB_RETAILER_WRITTEN records=${selected.records.length} sha256=${sha256} output=${path.relative(ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

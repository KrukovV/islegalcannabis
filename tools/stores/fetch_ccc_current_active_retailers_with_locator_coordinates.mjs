#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MA_BOUNDS = Object.freeze({ west: -74, east: -69, south: 41, north: 43 });

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function normalized(value) {
  return upper(value).replace(/[^A-Z0-9]+/g, "");
}

function normalizedStreet(value) {
  return upper(value)
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bPARKWAY\b/g, "PKWY")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bROUTE\b/g, "RTE")
    .replace(/\bSQUARE\b/g, "SQ")
    .replace(/\bTERRACE\b/g, "TER")
    .replace(/\bTRAIL\b/g, "TRL")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S")
    .replace(/\bEAST\b/g, "E")
    .replace(/\bWEST\b/g, "W")
    .replace(/[^A-Z0-9]+/g, "");
}

function zipPrefix(value) {
  return normalized(value).slice(0, 5);
}

function locationKey({ address, city, postalCode }) {
  const street = normalizedStreet(address);
  const town = normalized(city);
  const zip = zipPrefix(postalCode);
  return street && town && zip ? `${street}:${town}:${zip}` : "";
}

function isoDate(value) {
  const candidate = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
  const match = candidate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return "";
  const [, month, day, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    : "";
}

function activeRetailLicense(row, asOfDate) {
  const startDate = isoDate(row?.LIC_START_DATE);
  const expirationDate = isoDate(row?.LIC_EXPIRATION_DATE);
  return text(row?.LICENSE_TYPE) === "Marijuana Retailer" &&
    text(row?.LICENSE_STATUS_CATEGORY) === "Active" &&
    text(row?.LICENSE_STATUS) === "Active" &&
    text(row?.COMMENCE_OPS) === "Yes" &&
    upper(row?.ESTABLISHMENT_STATE) === "MA" &&
    Boolean(text(row?.LICENSE_NUMBER)) &&
    Boolean(locationKey({ address: row?.ESTABLISHMENT_ADDRESS_1, city: row?.ESTABLISHMENT_CITY, postalCode: row?.ESTABLISHMENT_ZIP })) &&
    Boolean(startDate) && Boolean(expirationDate) && startDate <= asOfDate && expirationDate >= asOfDate;
}

function coordinatePair(value) {
  let coordinates;
  try {
    coordinates = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [longitude, latitude] = coordinates.map(Number);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null;
}

function inMassachusettsEnvelope({ longitude, latitude }) {
  return longitude >= MA_BOUNDS.west && longitude <= MA_BOUNDS.east && latitude >= MA_BOUNDS.south && latitude <= MA_BOUNDS.north;
}

function locatorAdultRetailPoint(row) {
  const coordinates = coordinatePair(row?.coordinates);
  return upper(row?.state) === "MA" &&
    upper(row?.use).includes("ADULT-USE") &&
    !/\b(?:TEMPORARILY\s+)?CLOSED\b/i.test(text(row?.title)) &&
    Boolean(text(row?.id)) &&
    Boolean(locationKey({ address: row?.address, city: row?.town, postalCode: row?.zip })) &&
    Boolean(coordinates) && inMassachusettsEnvelope(coordinates);
}

function locatorFingerprint(point) {
  return [
    locationKey({ address: point?.address, city: point?.town, postalCode: point?.zip }),
    upper(point?.use),
    text(point?.coordinates),
  ].join(":");
}

function gvizValue(cell) {
  return cell && Object.hasOwn(cell, "v") ? cell.v : "";
}

export function parseCccWhereToBuyGviz(payload) {
  const source = text(payload)
    .replace(/^\/\*O_o\*\/\s*/, "")
    .replace(/^paulCallBack\(/, "")
    .replace(/\);\s*$/, "");
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("CCC_WHERE_TO_BUY_GVIZ_INVALID");
  }
  const rows = parsed?.table?.rows;
  if (parsed?.status !== "ok" || !Array.isArray(rows)) throw new Error("CCC_WHERE_TO_BUY_GVIZ_RESPONSE_INVALID");
  return rows.map(({ c }) => ({
    id: text(gvizValue(c?.[0])),
    title: text(gvizValue(c?.[1])),
    address: text(gvizValue(c?.[2])),
    town: text(gvizValue(c?.[3])),
    zip: text(gvizValue(c?.[4])),
    state: text(gvizValue(c?.[5])),
    use: text(gvizValue(c?.[7])),
    coordinates: text(gvizValue(c?.[10])),
  }));
}

export function selectCccCurrentActiveRetailers({ licenseRows, locatorRows, asOfDate }) {
  const selectedDate = isoDate(asOfDate);
  if (!Array.isArray(licenseRows) || !Array.isArray(locatorRows) || !selectedDate) {
    throw new Error("CCC_CURRENT_RETAIL_INPUT_INVALID");
  }
  const activeLicensesByLocation = new Map();
  let activeLicenses = 0;
  let ambiguousActiveLicenseLocations = 0;
  for (const row of licenseRows) {
    if (!activeRetailLicense(row, selectedDate)) continue;
    activeLicenses += 1;
    const key = locationKey({ address: row.ESTABLISHMENT_ADDRESS_1, city: row.ESTABLISHMENT_CITY, postalCode: row.ESTABLISHMENT_ZIP });
    if (activeLicensesByLocation.has(key)) {
      const prior = activeLicensesByLocation.get(key);
      if (!prior || text(prior.LICENSE_NUMBER) !== text(row.LICENSE_NUMBER)) {
        if (prior) ambiguousActiveLicenseLocations += 1;
        activeLicensesByLocation.set(key, null);
        continue;
      }
      throw new Error(`CCC_CURRENT_RETAIL_LICENSE_DUPLICATE:${text(row.LICENSE_NUMBER)}`);
    }
    activeLicensesByLocation.set(key, row);
  }
  if (activeLicenses === 0) throw new Error("CCC_CURRENT_RETAIL_LICENSE_SELECTION_EMPTY");
  const locatorPoints = locatorRows.filter(locatorAdultRetailPoint);
  if (locatorPoints.length === 0) throw new Error("CCC_CURRENT_RETAIL_LOCATOR_SELECTION_EMPTY");
  const locatorById = new Map();
  let duplicateLocatorRowsMerged = 0;
  let conflictingLocatorIdsBlocked = 0;
  for (const point of locatorPoints) {
    if (!locatorById.has(point.id)) {
      locatorById.set(point.id, point);
      continue;
    }
    const prior = locatorById.get(point.id);
    if (prior && locatorFingerprint(prior) === locatorFingerprint(point)) {
      duplicateLocatorRowsMerged += 1;
      continue;
    }
    if (prior) conflictingLocatorIdsBlocked += 1;
    locatorById.set(point.id, null);
  }
  const matchedByLicense = new Map();
  let duplicateLocatorPointsForLicenseMerged = 0;
  let conflictingLocatorLocationsForLicenseBlocked = 0;
  let currentLicenseMatches = 0;
  let exactLocationMatches = 0;
  for (const point of locatorById.values()) {
    if (!point) continue;
    const key = locationKey({ address: point.address, city: point.town, postalCode: point.zip });
    const license = activeLicensesByLocation.get(key);
    if (!license) continue;
    currentLicenseMatches += 1;
    const coordinates = coordinatePair(point.coordinates);
    if (!coordinates) continue;
    exactLocationMatches += 1;
    const record = {
      source_record_id: `CCC_WHERE_TO_BUY:${point.id}:LICENSE:${text(license.LICENSE_NUMBER)}`,
      legal_name: text(license.BUSINESS_NAME),
      trade_name: text(point.title),
      license_number: text(license.LICENSE_NUMBER),
      license_type: text(license.LICENSE_TYPE),
      store_type: "ADULT_USE_RETAIL",
      address: text(point.address),
      city: text(point.town),
      region: "MA",
      postal_code: text(point.zip),
      country: "US",
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      regulator_url: "https://masscannabiscontrol.com/where-to-buy/",
      license_status: "ACTIVE",
      operational_status: "UNKNOWN_STATUS",
      adult_use: true,
      medical: upper(point.use).includes("MEDICAL"),
      confidence: "PROVEN",
      coordinates_source: "OFFICIAL_CCC_WHERE_TO_BUY_LOCATOR_COORDINATES",
      coordinates_confidence: "PROVEN",
      location_evidence: "STRONG",
      public_source_fields: {
        current_license_status: "ACTIVE_WITH_COMMENCE_OPS_YES_AND_CURRENT_DATES",
      },
    };
    const licenseNumber = text(record.license_number);
    const prior = matchedByLicense.get(licenseNumber);
    if (!prior) {
      matchedByLicense.set(licenseNumber, record);
      continue;
    }
    const sameLocation = locationKey({ address: prior.address, city: prior.city, postalCode: prior.postal_code }) === locationKey({ address: record.address, city: record.city, postalCode: record.postal_code });
    const sameCoordinate = prior.latitude === record.latitude && prior.longitude === record.longitude;
    const sameTradeName = normalized(prior.trade_name) === normalized(record.trade_name);
    if (sameLocation && sameCoordinate && sameTradeName) {
      duplicateLocatorPointsForLicenseMerged += 1;
      continue;
    }
    if (prior) conflictingLocatorLocationsForLicenseBlocked += 1;
    matchedByLicense.set(licenseNumber, null);
  }
  const records = [...matchedByLicense.values()].filter(Boolean);
  if (records.length === 0) throw new Error("CCC_CURRENT_RETAIL_ACTIVE_LOCATION_SELECTION_EMPTY");
  return {
    records: records.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id)),
    counts: {
      license_rows_returned: licenseRows.length,
      active_current_retail_licenses: activeLicenses,
      ambiguous_active_license_locations: ambiguousActiveLicenseLocations,
      locator_rows_returned: locatorRows.length,
      locator_adult_retail_points_in_state_envelope: locatorPoints.length,
      duplicate_locator_rows_merged: duplicateLocatorRowsMerged,
      conflicting_locator_ids_blocked: conflictingLocatorIdsBlocked,
      unique_locator_adult_retail_points: [...locatorById.values()].filter(Boolean).length,
      current_license_matches: currentLicenseMatches,
      active_license_and_exact_official_location_matches: exactLocationMatches,
      duplicate_locator_points_for_license_merged: duplicateLocatorPointsForLicenseMerged,
      conflicting_locator_locations_for_license_blocked: conflictingLocatorLocationsForLicenseBlocked,
      projected_unique_current_license_locations: records.length,
      locator_points_blocked_for_current_license_or_location_mismatch: [...locatorById.values()].filter(Boolean).length - exactLocationMatches,
      active_current_licenses_missing_exact_official_locator_location: activeLicenses - exactLocationMatches,
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
  return {
    bytes,
    response,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

async function main() {
  const licenseUrl = argument("--license-url");
  const locatorUrl = argument("--locator-url");
  const output = argument("--output");
  const asOfDate = isoDate(argument("--as-of-date") || new Date().toISOString().slice(0, 10));
  const writeRequested = process.argv.includes("--write");
  if (!licenseUrl || !locatorUrl || !output || !asOfDate) {
    throw new Error("CCC_CURRENT_RETAIL_USAGE:--license-url <https-json> --locator-url <https-gviz> --output <repo-relative-json> [--as-of-date YYYY-MM-DD] [--write]");
  }
  if (new URL(licenseUrl).protocol !== "https:" || new URL(locatorUrl).protocol !== "https:") {
    throw new Error("CCC_CURRENT_RETAIL_SOURCE_URL_MUST_USE_HTTPS");
  }
  const outputPath = path.resolve(ROOT, output);
  if (!withinRepository(outputPath)) throw new Error("CCC_CURRENT_RETAIL_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  const [licenseDataset, locatorDataset] = await Promise.all([
    fetchBytes(licenseUrl, "CCC_CURRENT_RETAIL_LICENSE_DATASET", "application/json"),
    fetchBytes(locatorUrl, "CCC_CURRENT_RETAIL_LOCATOR", "application/json,text/plain"),
  ]);
  let licenseRows;
  try {
    licenseRows = JSON.parse(licenseDataset.bytes.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("CCC_CURRENT_RETAIL_LICENSE_DATASET_JSON_INVALID");
  }
  if (!Array.isArray(licenseRows)) throw new Error("CCC_CURRENT_RETAIL_LICENSE_DATASET_ROWS_INVALID");
  const locatorRows = parseCccWhereToBuyGviz(locatorDataset.bytes.toString("utf8"));
  const selected = selectCccCurrentActiveRetailers({ licenseRows, locatorRows, asOfDate });
  const payload = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    local_only: true,
    source: "CURRENT_OFFICIAL_CCC_ACTIVE_COMMENCE_OPS_MARIJUANA_RETAILER_LICENSE_DATASET_JOINED_TO_CURRENT_CCC_WHERE_TO_BUY_LOCATOR",
    as_of_date: asOfDate,
    license_dataset: {
      url: licenseDataset.response.url,
      content_sha256: licenseDataset.sha256,
      last_modified: text(licenseDataset.response.headers.get("last-modified")),
      returned_count: licenseRows.length,
    },
    locator_dataset: {
      url: locatorDataset.response.url,
      content_sha256: locatorDataset.sha256,
      returned_count: locatorRows.length,
      location_join: "EXACT_NORMALIZED_OFFICIAL_STREET_CITY_ZIP",
      coordinate_envelope: MA_BOUNDS,
    },
    counts: selected.counts,
    records: selected.records,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!writeRequested) {
    console.log(`CCC_CURRENT_RETAIL_DRY_RUN records=${selected.records.length} active_current_licenses=${selected.counts.active_current_retail_licenses} locator_points=${selected.counts.locator_adult_retail_points_in_state_envelope} blocked=${selected.counts.locator_points_blocked_for_current_license_or_location_mismatch} sha256=${sha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("CCC_CURRENT_RETAIL_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`CCC_CURRENT_RETAIL_WRITTEN records=${selected.records.length} sha256=${sha256} output=${path.relative(ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

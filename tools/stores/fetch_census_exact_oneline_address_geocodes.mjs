#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function repositoryPath(value) {
  const absolute = path.resolve(ROOT, text(value));
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("CENSUS_ONELINE_PATH_MUST_BE_WITHIN_REPOSITORY");
  }
  return absolute;
}

function finite(value, minimum, maximum) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum;
}

function canonicalUspsOneline(value) {
  return text(value)
    .toUpperCase()
    // Census may return ZIP+4 where the official regulator published the
    // same five-digit ZIP. This is a postal-format normalization only; the
    // street, city, state and five-digit ZIP remain part of the exact check.
    .replace(/\b(\d{5})-\d{4}\b/g, "$1")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bPARKWAY\b/g, "PKWY")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S")
    .replace(/\bEAST\b/g, "E")
    .replace(/\bWEST\b/g, "W")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function matchedAddressParts(value) {
  const matched = text(value).match(/^(?<address>.+),\s*(?<city>[^,]+),\s*(?<region>[A-Z]{2}),\s*(?<postal_code>\d{5}(?:-\d{4})?)$/i);
  if (!matched?.groups) return null;
  const parts = Object.fromEntries(Object.entries(matched.groups).map(([key, item]) => [key, text(item)]));
  return Object.values(parts).every(Boolean) ? parts : null;
}

function exactMatchForRow(row, response, bounds) {
  const matches = Array.isArray(response?.result?.addressMatches) ? response.result.addressMatches : [];
  if (matches.length !== 1) return null;
  const [match] = matches;
  const parts = matchedAddressParts(match?.matchedAddress);
  const latitude = Number(match?.coordinates?.y);
  const longitude = Number(match?.coordinates?.x);
  const matchType = text(match?.matchType).toUpperCase();
  if (!["", "MATCH", "EXACT"].includes(matchType) || !parts ||
    !finite(latitude, bounds.south, bounds.north) || !finite(longitude, bounds.west, bounds.east) ||
    text(parts.region).toUpperCase() !== bounds.region ||
    canonicalUspsOneline(row.physical_address) !== canonicalUspsOneline(match.matchedAddress)) {
    return null;
  }
  return {
    source_record_id: text(row.source_record_id),
    address: parts.address,
    city: parts.city,
    region: parts.region.toUpperCase(),
    postal_code: parts.postal_code,
    latitude,
    longitude,
    source_combined_address: text(row.physical_address),
    public_source_fields: {
      census_matched_address: text(match.matchedAddress),
    },
  };
}

function selectedSourceRows(source, { recordIdField, addressField, addressFields = [], excludedSourceRecordIds = [] }) {
  const configuredRecordIdField = text(recordIdField);
  const configuredAddressField = text(addressField);
  const configuredAddressFields = Array.isArray(addressFields)
    ? addressFields.map(text).filter(Boolean)
    : [];
  if (!configuredRecordIdField || (!configuredAddressField && configuredAddressFields.length === 0)) {
    throw new Error("CENSUS_ONELINE_SOURCE_FIELDS_REQUIRED");
  }
  if (configuredAddressField && configuredAddressFields.length > 0) {
    throw new Error("CENSUS_ONELINE_SOURCE_ADDRESS_FIELDS_AMBIGUOUS");
  }
  const excluded = new Set(Array.isArray(excludedSourceRecordIds)
    ? excludedSourceRecordIds.map(text).filter(Boolean)
    : []);
  const rows = Array.isArray(source) ? source : Array.isArray(source?.records) ? source.records : [];
  return rows
    .map((row) => ({
      source_record_id: text(row?.[configuredRecordIdField]),
      physical_address: configuredAddressFields.length > 0
        ? configuredAddressFields.map((field) => text(row?.[field])).filter(Boolean).join(", ")
        : text(row?.[configuredAddressField]),
    }))
    .filter((row) => row.source_record_id && row.physical_address && !excluded.has(row.source_record_id))
    .sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
}

export function selectOnelineRequestRows({
  source,
  limit,
  offset = 0,
  recordIdField = "source_record_id",
  addressField = "physical_address",
  addressFields = [],
  excludedSourceRecordIds = [],
}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("CENSUS_ONELINE_LIMIT_INVALID");
  if (!Number.isInteger(offset) || offset < 0) throw new Error("CENSUS_ONELINE_OFFSET_INVALID");
  const rows = selectedSourceRows(source, { recordIdField, addressField, addressFields, excludedSourceRecordIds }).slice(offset, offset + limit);
  if (rows.length === 0) throw new Error("CENSUS_ONELINE_SOURCE_ROWS_EMPTY");
  return rows;
}

export function selectExactOnelineCensusGeocodes({
  source,
  responsesById,
  limit,
  offset = 0,
  bounds,
  recordIdField = "source_record_id",
  addressField = "physical_address",
  addressFields = [],
  excludedSourceRecordIds = [],
}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("CENSUS_ONELINE_LIMIT_INVALID");
  if (!Number.isInteger(offset) || offset < 0) throw new Error("CENSUS_ONELINE_OFFSET_INVALID");
  if (!bounds || !/^[A-Z]{2}$/.test(text(bounds.region).toUpperCase()) ||
    !finite(bounds.west, -180, 180) || !finite(bounds.east, -180, 180) || bounds.west >= bounds.east ||
    !finite(bounds.south, -90, 90) || !finite(bounds.north, -90, 90) || bounds.south >= bounds.north) {
    throw new Error("CENSUS_ONELINE_BOUNDS_INVALID");
  }
  const candidates = selectOnelineRequestRows({ source, limit, offset, recordIdField, addressField, addressFields, excludedSourceRecordIds });
  const accepted = candidates
    .map((row) => exactMatchForRow(row, responsesById?.[text(row.source_record_id)], { ...bounds, region: text(bounds.region).toUpperCase() }))
    .filter(Boolean);
  const ids = new Set(accepted.map((row) => row.source_record_id));
  if (ids.size !== accepted.length) throw new Error("CENSUS_ONELINE_DUPLICATE_SOURCE_RECORD_ID");
  return { candidates, accepted };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function numericArgument(name) {
  const value = Number(argument(name));
  return Number.isFinite(value) ? value : NaN;
}

function excludedSourceRecordIdsFrom(value) {
  if (!value) return [];
  const raw = fs.readFileSync(repositoryPath(value));
  const payload = JSON.parse(raw.toString("utf8"));
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const ids = records.map((record) => text(record?.source_record_id)).filter(Boolean);
  if (ids.length !== new Set(ids).size) throw new Error("CENSUS_ONELINE_EXCLUSION_RECORD_IDS_DUPLICATE");
  return ids;
}

async function main() {
  const input = argument("--input");
  const output = argument("--output");
  const limit = Number(argument("--limit"));
  const offset = Number(argument("--offset") || 0);
  const recordIdField = argument("--source-record-id-field") || "source_record_id";
  const addressFields = argument("--address-fields").split(",").map(text).filter(Boolean);
  const addressField = argument("--address-field") || (addressFields.length > 0 ? "" : "physical_address");
  const excludedSourceRecordIds = excludedSourceRecordIdsFrom(argument("--exclude-source-record-ids-from"));
  const bounds = {
    region: argument("--region").toUpperCase(),
    west: numericArgument("--west"),
    east: numericArgument("--east"),
    south: numericArgument("--south"),
    north: numericArgument("--north"),
  };
  if (!input || !output || !Number.isInteger(limit)) {
    throw new Error("CENSUS_ONELINE_USAGE:--input <repo-json> --output <repo-json> --limit <1..50> --region <US-state> --west <number> --east <number> --south <number> --north <number> [--address-field <field>|--address-fields <field,field,...>] [--exclude-source-record-ids-from <augmentation-json>] [--write]");
  }
  const inputPath = repositoryPath(input);
  const outputPath = repositoryPath(output);
  const raw = fs.readFileSync(inputPath);
  const source = JSON.parse(raw.toString("utf8"));
  const candidateRows = selectOnelineRequestRows({ source, limit, offset, recordIdField, addressField, addressFields, excludedSourceRecordIds });
  const responsesById = {};
  for (const row of candidateRows) {
    const url = new URL(CENSUS_URL);
    url.searchParams.set("format", "json");
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("address", text(row.physical_address));
    const response = await fetch(url, { headers: { accept: "application/json" }, redirect: "error" });
    if (!response.ok) throw new Error(`CENSUS_ONELINE_HTTP_${response.status}:SOURCE_RECORD_${text(row.source_record_id)}`);
    responsesById[text(row.source_record_id)] = await response.json();
  }
  const selected = selectExactOnelineCensusGeocodes({
    source,
    responsesById,
    limit,
    offset,
    bounds,
    recordIdField,
    addressField,
    addressFields,
    excludedSourceRecordIds,
  });
  const payload = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    local_only: true,
    input_snapshot_path: path.relative(ROOT, inputPath),
    input_snapshot_sha256: sha256(raw),
    census_benchmark: "Public_AR_Current",
    match_policy: "ONE_MATCH_OPTIONAL_MATCH_TYPE_MATCH_OR_EXACT_SAME_CANONICAL_ONELINE_ADDRESS_AND_IN_DECLARED_BOUNDS",
    requested_candidates: selected.candidates.length,
    accepted_records: selected.accepted.length,
    blocked_records: selected.candidates.length - selected.accepted.length,
    records: selected.accepted,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const outputSha256 = sha256(serialized);
  if (!process.argv.includes("--write")) {
    console.log(`CENSUS_ONELINE_DRY_RUN candidates=${payload.requested_candidates} accepted=${payload.accepted_records} blocked=${payload.blocked_records} sha256=${outputSha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("CENSUS_ONELINE_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`CENSUS_ONELINE_WRITTEN candidates=${payload.requested_candidates} accepted=${payload.accepted_records} blocked=${payload.blocked_records} sha256=${outputSha256} output=${path.relative(ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

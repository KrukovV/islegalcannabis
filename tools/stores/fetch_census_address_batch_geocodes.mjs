#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CENSUS_BATCH_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
const MAX_BATCH_RECORDS = 10000;

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function normalized(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function parseCsv(textValue) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < String(textValue || "").length; index += 1) {
    const char = textValue[index];
    const next = textValue[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => text(cell))) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => text(cell))) rows.push(row);
  if (quoted) throw new Error("CENSUS_BATCH_CSV_UNTERMINATED_QUOTE");
  return rows;
}

function sourceHouseNumber(value) {
  return text(value).match(/^\s*(\d+[A-Z-]*)\b/i)?.[1]?.toUpperCase() || "";
}

function matchedAddressParts(value) {
  const parts = text(value).split(/\s*,\s*/).filter(Boolean);
  if (parts.length < 4) return null;
  const [street, city, state, postalCode] = parts.slice(-4);
  return { street, city, state, postal_code: postalCode };
}

function coordinates(value) {
  const [longitude, latitude] = text(value).split(",").map(Number);
  return { longitude, latitude };
}

function recordIdentity(record) {
  const id = text(record?.source_record_id);
  if (!id || /[\r\n]/.test(id)) throw new Error("CENSUS_BATCH_SOURCE_RECORD_ID_INVALID");
  return id;
}

function allowsMissingSourcePostalCode(record) {
  return record?.allow_missing_source_postal_code === true;
}

export function buildCensusAddressBatch(records) {
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_BATCH_RECORDS) {
    throw new Error(`CENSUS_BATCH_RECORD_COUNT_INVALID:${Array.isArray(records) ? records.length : 0}`);
  }
  const identities = new Set();
  const lines = records.map((record) => {
    const id = recordIdentity(record);
    if (identities.has(id)) throw new Error(`CENSUS_BATCH_DUPLICATE_SOURCE_RECORD:${id}`);
    identities.add(id);
    const [address, city, region, postalCode] = [record.address, record.city, record.region, record.postal_code].map(text);
    if ([address, city, region].some((value) => !value || /[\r\n]/.test(value)) ||
      (!postalCode && !allowsMissingSourcePostalCode(record)) ||
      (postalCode && /[\r\n]/.test(postalCode))) {
      throw new Error(`CENSUS_BATCH_ADDRESS_FIELDS_INVALID:${id}`);
    }
    return [id, address, city, region, postalCode].map(csvEscape).join(",");
  });
  return `${lines.join("\n")}\n`;
}

export function selectExactCensusBatchGeocodes({ records, censusCsv, bounds }) {
  if (![bounds?.west, bounds?.east, bounds?.south, bounds?.north].every(Number.isFinite)) {
    throw new Error("CENSUS_BATCH_BOUNDS_INVALID");
  }
  buildCensusAddressBatch(records);
  const sourceById = new Map(records.map((record) => [recordIdentity(record), record]));
  const rows = parseCsv(censusCsv);
  const responseById = new Map();
  for (const row of rows) {
    if (row.length < 3 || (text(row[2]) === "Match" && row.length < 6)) throw new Error("CENSUS_BATCH_RESPONSE_ROW_INVALID");
    const id = text(row[0]);
    if (!sourceById.has(id)) throw new Error(`CENSUS_BATCH_RESPONSE_UNKNOWN_SOURCE_RECORD:${id}`);
    if (responseById.has(id)) throw new Error(`CENSUS_BATCH_RESPONSE_DUPLICATE_SOURCE_RECORD:${id}`);
    responseById.set(id, row);
  }
  const accepted = [];
  let blocked = 0;
  for (const [id, source] of sourceById) {
    const row = responseById.get(id);
    const matched = row && text(row[2]) === "Match" && text(row[3]) === "Exact" ? matchedAddressParts(row[4]) : null;
    const point = row ? coordinates(row[5]) : { longitude: Number.NaN, latitude: Number.NaN };
    const exactJurisdiction = matched &&
      normalized(matched.city) === normalized(source.city) &&
      text(matched.state).toUpperCase() === text(source.region).toUpperCase() &&
      (text(source.postal_code)
        ? text(matched.postal_code) === text(source.postal_code)
        : allowsMissingSourcePostalCode(source) && Boolean(text(matched.postal_code))) &&
      sourceHouseNumber(matched.street) === sourceHouseNumber(source.address);
    const inBounds = Number.isFinite(point.longitude) && Number.isFinite(point.latitude) &&
      point.longitude >= bounds.west && point.longitude <= bounds.east && point.latitude >= bounds.south && point.latitude <= bounds.north;
    if (!exactJurisdiction || !inBounds) {
      blocked += 1;
      continue;
    }
    accepted.push({
      ...source,
      latitude: point.latitude,
      longitude: point.longitude,
      census_matched_postal_code: text(matched.postal_code),
      coordinates_source: "OFFICIAL_ADDRESS_GEOCODED",
      coordinates_confidence: "STRONG",
      location_evidence: "STRONG",
      confidence: "STRONG",
      public_source_fields: {
        ...(source.public_source_fields || {}),
        census_benchmark: "Public_AR_Current",
        census_matched_address: text(row[4]),
      },
    });
  }
  if (accepted.length === 0) throw new Error("CENSUS_BATCH_SELECTION_EMPTY");
  return {
    records: accepted.sort((left, right) => recordIdentity(left).localeCompare(recordIdentity(right))),
    counts: {
      input_records: records.length,
      census_response_rows: rows.length,
      one_to_one_exact_census_geocodes: accepted.length,
      blocked_census_no_exact_in_jurisdiction_match: blocked,
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function number(name) {
  const value = Number(argument(name));
  if (!Number.isFinite(value)) throw new Error(`CENSUS_BATCH_${name.slice(2).toUpperCase().replace(/-/g, "_")}_INVALID`);
  return value;
}

function repositoryPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("CENSUS_BATCH_PATH_MUST_BE_WITHIN_REPOSITORY");
  return absolute;
}

async function main() {
  const inputArgument = argument("--input");
  const outputArgument = argument("--output");
  if (!inputArgument || !outputArgument) throw new Error("CENSUS_BATCH_USAGE:--input <json-path> --output <json-path> --west <n> --east <n> --south <n> --north <n> [--write]");
  const inputPath = repositoryPath(inputArgument);
  const outputPath = repositoryPath(outputArgument);
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const inputRecords = Array.isArray(input) ? input : input?.records;
  const batchCsv = buildCensusAddressBatch(inputRecords);
  const form = new FormData();
  form.set("benchmark", "Public_AR_Current");
  form.set("addressFile", new Blob([batchCsv], { type: "text/csv" }), "official-addresses.csv");
  const response = await fetch(CENSUS_BATCH_URL, { method: "POST", body: form, headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`CENSUS_BATCH_HTTP_${response.status}`);
  const censusCsv = await response.text();
  const selected = selectExactCensusBatchGeocodes({
    records: inputRecords,
    censusCsv,
    bounds: { west: number("--west"), east: number("--east"), south: number("--south"), north: number("--north") },
  });
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    input_path: path.relative(ROOT, inputPath),
    input_sha256: sha256(fs.readFileSync(inputPath)),
    census_geocoder_url: CENSUS_BATCH_URL,
    census_benchmark: "Public_AR_Current",
    census_response_sha256: sha256(censusCsv),
    ...selected,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const outputSha256 = sha256(serialized);
  if (!process.argv.includes("--write")) {
    console.log(`CENSUS_BATCH_DRY_RUN records=${selected.records.length} blocked=${selected.counts.blocked_census_no_exact_in_jurisdiction_match} sha256=${outputSha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("CENSUS_BATCH_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`CENSUS_BATCH_WRITTEN records=${selected.records.length} blocked=${selected.counts.blocked_census_no_exact_in_jurisdiction_match} output=${path.relative(ROOT, outputPath)} sha256=${outputSha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractStoreSourcePayload } from "./store_source_adapters.mjs";
import { isIndependentlyValidatedStoreSource } from "./store_source_validation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES_PATH = path.join(ROOT, "data", "store_truth", "store_source_registry.json");
const MAX_RECORDS = 25;
const CALGARY_PARCEL_DATASET_URL = "https://data.calgary.ca/resource/s8b3-j88p.json";

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function repositoryPath(relativePath) {
  const absolute = path.resolve(ROOT, text(relativePath));
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("SOCRATA_CIVIC_ADDRESS_PATH_OUTSIDE_REPOSITORY");
  }
  return absolute;
}

function canonicalCalgaryCivicAddress(value) {
  const abbreviations = {
    AVENUE: "AV",
    AVE: "AV",
    BOULEVARD: "BV",
    BLVD: "BV",
    DRIVE: "DR",
    ROAD: "RD",
    STREET: "ST",
    TRAIL: "TR",
    CRESCENT: "CR",
    CRES: "CR",
    CIRCLE: "CI",
    COURT: "CT",
    LANE: "LN",
    PLACE: "PL",
    PLAZA: "PLZ",
    CENTRE: "CTR",
    CENTER: "CTR",
    WAY: "WY",
  };
  const withoutUnit = text(value).toUpperCase().replace(/^\s*\d+[A-Z]?\s*-\s*(?=\d)/, "");
  return withoutUnit
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => abbreviations[part] || part)
    .join(" ");
}

function civicNumber(value) {
  const match = canonicalCalgaryCivicAddress(value).match(/^(\d+[A-Z]?)\b/);
  return match ? Number(match[1].replace(/[^0-9]/g, "")) : Number.NaN;
}

function validCoordinate(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 &&
    Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180 &&
    !(Number(latitude) === 0 && Number(longitude) === 0);
}

function selectCalgaryCandidates({ sourceRecords, city = "CALGARY", limit = MAX_RECORDS }) {
  if (!Array.isArray(sourceRecords)) throw new Error("SOCRATA_CIVIC_ADDRESS_SOURCE_RECORDS_INVALID");
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECORDS) throw new Error("SOCRATA_CIVIC_ADDRESS_LIMIT_INVALID");
  const cityKey = text(city).toUpperCase();
  if (cityKey !== "CALGARY") throw new Error("SOCRATA_CIVIC_ADDRESS_CITY_UNSUPPORTED");
  const candidates = sourceRecords
    .filter((record) => text(record?.city).toUpperCase() === cityKey && text(record?.region).toUpperCase() === "AB")
    .filter((record) => text(record?.source_record_id) && text(record?.address) && Number.isFinite(civicNumber(record?.address)))
    .sort((left, right) => text(left.source_record_id).localeCompare(text(right.source_record_id)))
    .slice(0, limit);
  if (candidates.length === 0) throw new Error("SOCRATA_CIVIC_ADDRESS_NO_CANDIDATES");
  return { candidates, cityKey };
}

export function selectExactCalgaryParcelAddressPoints({ sourceRecords, responsesBySourceRecordId, city = "CALGARY", limit = MAX_RECORDS }) {
  const { candidates, cityKey } = selectCalgaryCandidates({ sourceRecords, city, limit });
  const accepted = [];
  let blocked = 0;
  for (const source of candidates) {
    const responseRows = responsesBySourceRecordId?.[text(source.source_record_id)];
    if (!Array.isArray(responseRows)) throw new Error(`SOCRATA_CIVIC_ADDRESS_RESPONSE_MISSING:${text(source.source_record_id)}`);
    const matches = responseRows.filter((row) => text(row?.address_type) === "Parcel" &&
      canonicalCalgaryCivicAddress(row?.address) === canonicalCalgaryCivicAddress(source.address) &&
      validCoordinate(row?.latitude, row?.longitude));
    if (matches.length !== 1) {
      blocked += 1;
      continue;
    }
    const match = matches[0];
    accepted.push({
      source_record_id: text(source.source_record_id),
      address: text(source.address),
      city: cityKey,
      region: "AB",
      postal_code: text(source.postal_code),
      latitude: Number(match.latitude),
      longitude: Number(match.longitude),
      public_source_fields: {
        full_address: text(match.address),
        address_type: "Parcel",
        city_data_provider: "City of Calgary",
        postal_code_published: false,
        civic_match_policy: "CALGARY_PARCEL_CIVIC_V1",
      },
    });
  }
  return {
    candidates,
    records: accepted.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id)),
    counts: {
      source_candidates: candidates.length,
      one_to_one_exact_civic_parcel_points: accepted.length,
      blocked_no_unique_exact_civic_parcel_point: blocked,
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

async function main() {
  const sourceId = argument("--source-id");
  const outputArgument = argument("--output");
  const city = argument("--city") || "CALGARY";
  const limit = Number(argument("--limit") || MAX_RECORDS);
  if (!sourceId || !outputArgument) {
    throw new Error("SOCRATA_CIVIC_ADDRESS_USAGE:--source-id <id> --city CALGARY --limit <1..25> --output <repo-json> [--write]");
  }
  const registry = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  const source = (registry.sources || []).find((item) => text(item?.source_id) === sourceId);
  if (!isIndependentlyValidatedStoreSource(source)) throw new Error(`SOCRATA_CIVIC_ADDRESS_SOURCE_NOT_VALIDATED:${sourceId}`);
  const sourcePath = repositoryPath(source.snapshot_path);
  const sourceBytes = fs.readFileSync(sourcePath);
  const sourceSha256 = sha256(sourceBytes);
  if (sourceSha256 !== text(source.snapshot_sha256).toLowerCase()) throw new Error("SOCRATA_CIVIC_ADDRESS_SOURCE_SNAPSHOT_SHA256_MISMATCH");
  const extraction = extractStoreSourcePayload(source, JSON.parse(sourceBytes.toString("utf8")));
  if (extraction.extraction_state !== "EXTRACTED") throw new Error(`SOCRATA_CIVIC_ADDRESS_EXTRACTION_NOT_READY:${extraction.extraction_state}`);
  const seed = selectCalgaryCandidates({ sourceRecords: extraction.records, city, limit });
  const responsesBySourceRecordId = {};
  for (const candidate of seed.candidates) {
    const url = new URL(CALGARY_PARCEL_DATASET_URL);
    url.searchParams.set("$select", "address,longitude,latitude,address_type");
    url.searchParams.set("$where", `house_number=${civicNumber(candidate.address)}`);
    url.searchParams.set("$limit", "1000");
    const response = await fetch(url, { headers: { accept: "application/json" }, redirect: "error" });
    if (!response.ok) throw new Error(`SOCRATA_CIVIC_ADDRESS_HTTP_${response.status}:SOURCE_RECORD_${text(candidate.source_record_id)}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error(`SOCRATA_CIVIC_ADDRESS_RESPONSE_INVALID:${text(candidate.source_record_id)}`);
    responsesBySourceRecordId[text(candidate.source_record_id)] = rows;
  }
  const selected = selectExactCalgaryParcelAddressPoints({ sourceRecords: extraction.records, responsesBySourceRecordId, city, limit });
  if (selected.records.length === 0) throw new Error("SOCRATA_CIVIC_ADDRESS_SELECTION_EMPTY");
  const orderedResponses = Object.fromEntries(Object.entries(responsesBySourceRecordId).sort(([left], [right]) => left.localeCompare(right)));
  const responseSha256 = sha256(JSON.stringify(orderedResponses));
  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    coordinate_augmentation_provider: "PUBLIC_CIVIC_ADDRESS_POINT_V1",
    public_geocoder_authority: "City of Calgary Open Data — Parcel Address and lat/long",
    public_dataset_url: "https://data.calgary.ca/Base-Maps/Parcel-Address-and-lat-long/s8b3-j88p",
    public_dataset_api: CALGARY_PARCEL_DATASET_URL,
    source_id: sourceId,
    source_snapshot_path: text(source.snapshot_path),
    source_snapshot_sha256: sourceSha256,
    response_sha256: responseSha256,
    city: text(city).toUpperCase(),
    ...selected,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const outputSha256 = sha256(serialized);
  if (!process.argv.includes("--write")) {
    console.log(`SOCRATA_CIVIC_ADDRESS_DRY_RUN candidates=${selected.counts.source_candidates} accepted=${selected.records.length} blocked=${selected.counts.blocked_no_unique_exact_civic_parcel_point} sha256=${outputSha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("SOCRATA_CIVIC_ADDRESS_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const outputPath = repositoryPath(outputArgument);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`SOCRATA_CIVIC_ADDRESS_WRITTEN candidates=${selected.counts.source_candidates} accepted=${selected.records.length} blocked=${selected.counts.blocked_no_unique_exact_civic_parcel_point} output=${path.relative(ROOT, outputPath)} sha256=${outputSha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

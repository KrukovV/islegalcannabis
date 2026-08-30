#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractStoreSourcePayload } from "./store_source_adapters.mjs";
import { loadExactCoordinateAugmentation, sourceCoordinateRecordId } from "./store_coordinate_augmentation.mjs";
import { isIndependentlyValidatedStoreSource } from "./store_source_validation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES_PATH = path.join(ROOT, "data/store_truth/store_source_registry.json");
const MAX_RECORDS = 25;
const GEOCODER_URL = "https://geocoder.api.gov.bc.ca/addresses.json";

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function repositoryPath(relativePath) {
  const absolute = path.resolve(ROOT, text(relativePath));
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("BC_CIVIC_GEOCODER_PATH_OUTSIDE_REPOSITORY");
  return absolute;
}

function canonical(value) {
  return text(value).toUpperCase()
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function simpleCivicAddress(address) {
  const match = text(address).match(/^(?<number>\d+)\s+(?<street>[A-Za-zÀ-ÿ0-9 .'-]+)$/u);
  if (!match?.groups) return null;
  return { civicNumber: Number(match.groups.number), street: canonical(match.groups.street) };
}

function coordinate(point) {
  const longitude = Number(point?.geometry?.coordinates?.[0]);
  const latitude = Number(point?.geometry?.coordinates?.[1]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && !(latitude === 0 && longitude === 0)
    ? { latitude, longitude }
    : null;
}

function currentRows(source) {
  const snapshotPath = repositoryPath(source.snapshot_path);
  const snapshot = fs.readFileSync(snapshotPath);
  if (sha256(snapshot) !== text(source.snapshot_sha256).toLowerCase()) throw new Error("BC_CIVIC_GEOCODER_SOURCE_SNAPSHOT_SHA256_MISMATCH");
  const extracted = extractStoreSourcePayload(source, JSON.parse(snapshot.toString("utf8")));
  if (extracted.extraction_state !== "EXTRACTED") throw new Error(`BC_CIVIC_GEOCODER_EXTRACTION_NOT_READY:${extracted.extraction_state}`);
  return extracted.records;
}

export function selectBcCivicCandidates({ source, rows, existingRecords = [], limit = MAX_RECORDS }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECORDS) throw new Error("BC_CIVIC_GEOCODER_LIMIT_INVALID");
  const present = new Set(existingRecords.map((record) => text(record?.source_record_id)).filter(Boolean));
  return rows
    .filter((row) => text(row?.region).toUpperCase() === "BC" && text(row?.country).toUpperCase() === "CA")
    .filter((row) => text(row?.source_record_id) && !present.has(text(row.source_record_id)))
    .filter((row) => simpleCivicAddress(row?.address))
    .sort((left, right) => text(left.source_record_id).localeCompare(text(right.source_record_id)))
    .slice(0, limit);
}

export function selectExactBcCivicCoordinateRecords({ candidates, responsesBySourceRecordId }) {
  const records = [];
  let blocked = 0;
  for (const row of candidates) {
    const response = responsesBySourceRecordId?.[text(row.source_record_id)];
    const features = response?.features;
    const input = simpleCivicAddress(row.address);
    if (!input || !Array.isArray(features)) {
      blocked += 1;
      continue;
    }
    const exact = features.filter((feature) => {
      const properties = feature?.properties || {};
      return coordinate(feature) &&
        Number(properties.civicNumber) === input.civicNumber &&
        canonical(String(properties.streetAddress || "").replace(/^\d+\s+/, "")) === input.street &&
        canonical(properties.localityName) === canonical(row.city) &&
        canonical(properties.provinceCode) === "BC" &&
        canonical(properties.matchPrecision) === "CIVIC NUMBER" &&
        canonical(properties.locationPositionalAccuracy) === "HIGH" &&
        canonical(properties.locationDescriptor) === "PARCELPOINT" &&
        canonical(properties.siteStatus) === "ACTIVE" &&
        String(properties.isOfficial) === "true";
    });
    if (exact.length !== 1) {
      blocked += 1;
      continue;
    }
    const feature = exact[0];
    const properties = feature.properties || {};
    const point = coordinate(feature);
    records.push({
      source_record_id: text(row.source_record_id),
      address: text(row.address),
      city: text(row.city),
      region: "BC",
      postal_code: text(row.postal_code),
      latitude: point.latitude,
      longitude: point.longitude,
      public_source_fields: {
        full_address: text(properties.fullAddress),
        match_precision: "CIVIC_NUMBER",
        location_positional_accuracy: "HIGH",
        location_descriptor: "PARCELPOINT",
        is_official: true,
        site_status: "ACTIVE",
        base_data_date: text(response.baseDataDate),
        search_timestamp: text(response.searchTimestamp),
      },
    });
  }
  return { records: records.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id)), blocked };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

async function main() {
  const sourceId = argument("--source-id");
  const outputArgument = argument("--output");
  const limit = Number(argument("--limit") || MAX_RECORDS);
  if (!sourceId || !outputArgument) throw new Error("BC_CIVIC_GEOCODER_USAGE:--source-id <id> --limit <1..25> --output <repo-json> [--write]");
  const registry = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  const source = (registry.sources || []).find((item) => text(item?.source_id) === sourceId);
  if (!isIndependentlyValidatedStoreSource(source)) throw new Error(`BC_CIVIC_GEOCODER_SOURCE_NOT_VALIDATED:${sourceId}`);
  if (text(source?.coordinate_augmentation?.provider) !== "PUBLIC_GEOJSON_EXACT_CIVIC_ADDRESS_V1") throw new Error("BC_CIVIC_GEOCODER_SOURCE_PROVIDER_INVALID");
  const existing = loadExactCoordinateAugmentation(source);
  const rows = currentRows(source);
  const candidates = selectBcCivicCandidates({ source, rows, existingRecords: existing.records, limit });
  if (candidates.length === 0) throw new Error("BC_CIVIC_GEOCODER_NO_CANDIDATES");
  const responsesBySourceRecordId = {};
  for (const row of candidates) {
    const url = new URL(GEOCODER_URL);
    url.searchParams.set("addressString", `${text(row.address)}, ${text(row.city)}, BC ${text(row.postal_code)}`);
    url.searchParams.set("maxResults", "5");
    const response = await fetch(url, { headers: { accept: "application/json" }, redirect: "error" });
    if (!response.ok) throw new Error(`BC_CIVIC_GEOCODER_HTTP_${response.status}:${text(row.source_record_id)}`);
    responsesBySourceRecordId[text(row.source_record_id)] = await response.json();
  }
  const selected = selectExactBcCivicCoordinateRecords({ candidates, responsesBySourceRecordId });
  const combined = [...existing.records, ...selected.records].sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
  if (new Set(combined.map((row) => row.source_record_id)).size !== combined.length) throw new Error("BC_CIVIC_GEOCODER_DUPLICATE_RECORD_ID");
  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    coordinate_augmentation_provider: "PUBLIC_GEOJSON_EXACT_CIVIC_ADDRESS_V1",
    public_geocoder_authority: "Government of British Columbia Address Geocoder",
    public_geocoder_url: GEOCODER_URL,
    source_id: sourceId,
    source_snapshot_path: source.snapshot_path,
    source_snapshot_sha256: source.snapshot_sha256,
    prior_augmentation_sha256: text(source.coordinate_augmentation.snapshot_sha256),
    response_sha256: sha256(JSON.stringify(responsesBySourceRecordId)),
    responses_by_source_record_id: responsesBySourceRecordId,
    records: combined,
    counts: {
      source_records_considered: candidates.length,
      newly_accepted_exact_civic_matches: selected.records.length,
      retained_exact_civic_matches: existing.records.length,
      official_exact_civic_matches: combined.length,
      blocked_nonexact_or_outside_scope: selected.blocked,
    },
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (!process.argv.includes("--write")) {
    console.log(`BC_CIVIC_GEOCODER_DRY_RUN candidates=${candidates.length} accepted=${selected.records.length} blocked=${selected.blocked} total=${combined.length} sha256=${sha256(serialized)}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("BC_CIVIC_GEOCODER_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const outputPath = repositoryPath(outputArgument);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`BC_CIVIC_GEOCODER_WRITTEN candidates=${candidates.length} accepted=${selected.records.length} blocked=${selected.blocked} total=${combined.length} output=${path.relative(ROOT, outputPath)} sha256=${sha256(serialized)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractStoreSourcePayload } from "./store_source_adapters.mjs";
import { isIndependentlyValidatedStoreSource } from "./store_source_validation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES_PATH = path.join(ROOT, "data", "store_truth", "store_source_registry.json");

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function normalized(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hasCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum;
}

function hasSourceCoordinate(record) {
  return hasCoordinate(record?.latitude, -90, 90) || hasCoordinate(record?.longitude, -180, 180);
}

function combinedUsAddressComponents(value) {
  const matched = text(value).match(/^(?<address>.+),\s*(?<city>[^,]+?)\s*,?\s*(?<region>[A-Z]{2})\s+(?<postal_code>\d{5}(?:-\d{4})?)$/i);
  if (!matched?.groups) return null;
  const components = Object.fromEntries(Object.entries(matched.groups).map(([key, item]) => [key, text(item)]));
  return Object.values(components).every(Boolean) ? components : null;
}

function escapedRegExp(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceCityStateZipAddressComponents(value, declaredCity, declaredRegion) {
  const city = text(declaredCity);
  const region = text(declaredRegion).toUpperCase();
  const matched = text(value).match(/^(?<address_with_city>.+?),\s*(?<region>[A-Z]{2})\s+(?<postal_code>\d{5}(?:-\d{4})?)$/i);
  if (!matched?.groups || !city || !region || text(matched.groups.region).toUpperCase() !== region) return null;
  const addressWithCity = text(matched.groups.address_with_city);
  const citySuffix = new RegExp(`(?:,\\s*|\\s+)${escapedRegExp(city)}$`, "i");
  if (!citySuffix.test(addressWithCity)) return null;
  const address = text(addressWithCity.replace(citySuffix, "").replace(/[\s,]+$/, ""));
  const components = { address, city, region, postal_code: text(matched.groups.postal_code) };
  return Object.values(components).every(Boolean) ? components : null;
}

/**
 * Parses an official US address column that uses comma-separated display
 * fields, while retaining a separately declared state. The source must still
 * publish an unambiguous city and a real ZIP; an omitted state is filled only
 * from the source's fixed jurisdiction, never inferred from the city.
 */
function commaDelimitedUsAddressComponents(value, declaredRegion) {
  const region = text(declaredRegion).toUpperCase();
  const parts = text(value).split(",").map(text).filter(Boolean);
  if (!/^[A-Z]{2}$/.test(region) || parts.length < 3) return null;
  const last = parts.at(-1) || "";
  const terminal = last.match(/^(?:(?<region>[A-Z]{2})\s*)?(?<postal_code>\d{5}(?:-\d{4})?)$/i);
  if (!terminal?.groups?.postal_code) return null;
  let cityIndex = parts.length - 2;
  const statedRegion = text(terminal.groups.region).toUpperCase();
  if (statedRegion && statedRegion !== region) return null;
  if (!statedRegion && /^[A-Z]{2}$/i.test(parts.at(-2) || "")) {
    if (text(parts.at(-2)).toUpperCase() !== region) return null;
    cityIndex -= 1;
  }
  const city = text(parts[cityIndex]);
  const address = text(parts.slice(0, cityIndex).join(", "));
  const components = { address, city, region, postal_code: text(terminal.groups.postal_code) };
  return Object.values(components).every(Boolean) ? components : null;
}

function resolvedAddressComponents(source, record) {
  const parser = text(source?.coordinate_augmentation?.source_address_parser);
  if (!parser) {
    return {
      address: text(record?.address),
      city: text(record?.city),
      region: text(record?.region),
      postal_code: text(record?.postal_code),
    };
  }
  if (parser === "US_COMBINED_STREET_CITY_STATE_ZIP_V1") {
    return combinedUsAddressComponents(record?.address);
  }
  if (parser === "US_ADDRESS_STATE_ZIP_WITH_DECLARED_CITY_V1") {
    return sourceCityStateZipAddressComponents(record?.address, record?.city, record?.region);
  }
  if (parser === "US_COMMA_DELIMITED_ADDRESS_WITH_DECLARED_REGION_V1") {
    return commaDelimitedUsAddressComponents(record?.address, record?.region);
  }
  throw new Error(`CENSUS_INPUT_SOURCE_ADDRESS_PARSER_UNSUPPORTED:${parser}`);
}

function sourceRecordIdentity(source, record, components) {
  const strategy = text(source?.coordinate_augmentation?.source_record_id_strategy);
  const sourceRecordId = text(record?.source_record_id);
  if (!strategy) return sourceRecordId;
  if (strategy !== "LICENSE_AND_ADDRESS_V1") {
    throw new Error(`CENSUS_INPUT_SOURCE_RECORD_ID_STRATEGY_UNSUPPORTED:${strategy}`);
  }
  if (![sourceRecordId, components?.address, components?.city, components?.region, components?.postal_code].every((value) => text(value))) {
    return "";
  }
  const identity = [sourceRecordId, normalized(components.address), normalized(components.city), normalized(components.region), normalized(components.postal_code)].join("\u001f");
  return `${sourceRecordId}:${sha256(identity).slice(0, 24)}`;
}

function repositoryPath(relativePath) {
  const absolute = path.resolve(ROOT, text(relativePath));
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("CENSUS_INPUT_PATH_OUTSIDE_REPOSITORY");
  }
  return absolute;
}

export function selectCensusEligibleOfficialAddressRecords({ source, extractedRecords }) {
  if (!isIndependentlyValidatedStoreSource(source)) {
    throw new Error(`CENSUS_INPUT_SOURCE_NOT_INDEPENDENTLY_VALIDATED:${text(source?.source_id) || "MISSING"}`);
  }
  if (!Array.isArray(extractedRecords)) throw new Error("CENSUS_INPUT_EXTRACTED_RECORDS_INVALID");
  const allowMissingSourcePostalCode = source?.coordinate_augmentation?.allow_missing_source_postal_code === true;
  const identities = new Map();
  const records = extractedRecords
    .filter((record) => !hasSourceCoordinate(record))
    .map((record) => ({
      record,
      components: resolvedAddressComponents(source, record),
    }))
    .filter(({ record, components }) => [record?.source_record_id, components?.address, components?.city, components?.region].every((value) => text(value)))
    .filter(({ components }) => text(components?.postal_code) || allowMissingSourcePostalCode)
    .map(({ record, components }) => ({
      source_record_id: sourceRecordIdentity(source, record, components),
      address: text(components.address),
      city: text(components.city),
      region: text(components.region),
      postal_code: text(components.postal_code),
      ...(allowMissingSourcePostalCode && !text(components.postal_code) ? { allow_missing_source_postal_code: true } : {}),
    }))
    .sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
  for (const record of records) {
    const existing = identities.get(record.source_record_id);
    if (!existing) {
      identities.set(record.source_record_id, record);
      continue;
    }
    if (JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new Error(`CENSUS_INPUT_DUPLICATE_SOURCE_RECORD:${record.source_record_id}`);
    }
  }
  return [...identities.values()];
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

async function main() {
  const sourceId = argument("--source-id");
  const outputArgument = argument("--output");
  if (!sourceId || !outputArgument) {
    throw new Error("CENSUS_INPUT_USAGE:--source-id <id> --output <json-path> [--write]");
  }
  const registry = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  const source = (registry.sources || []).find((entry) => text(entry?.source_id) === sourceId);
  if (!source) throw new Error(`CENSUS_INPUT_SOURCE_NOT_FOUND:${sourceId}`);
  const snapshotPath = repositoryPath(source.snapshot_path);
  const snapshotBytes = fs.readFileSync(snapshotPath);
  const snapshotSha256 = sha256(snapshotBytes);
  if (snapshotSha256 !== text(source.snapshot_sha256).toLowerCase()) {
    throw new Error("CENSUS_INPUT_SOURCE_SNAPSHOT_SHA256_MISMATCH");
  }
  // A re-run must derive the complete batch from the immutable official
  // snapshot. Prior Census output is derived data, not a source coordinate,
  // and must never silently remove a previously exact official-address row.
  const sourceSnapshotOnly = { ...source, coordinate_augmentation: undefined };
  const extraction = extractStoreSourcePayload(sourceSnapshotOnly, snapshotBytes.toString("utf8"));
  if (extraction.extraction_state !== "EXTRACTED") {
    throw new Error(`CENSUS_INPUT_SOURCE_EXTRACTION_NOT_READY:${extraction.extraction_state}`);
  }
  const records = selectCensusEligibleOfficialAddressRecords({ source, extractedRecords: extraction.records });
  if (records.length === 0) throw new Error("CENSUS_INPUT_NO_ELIGIBLE_OFFICIAL_ADDRESSES");
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_id: sourceId,
    source_snapshot_path: text(source.snapshot_path),
    source_snapshot_sha256: snapshotSha256,
    source_url: text(source.source_url),
    records,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const outputSha256 = sha256(serialized);
  if (!process.argv.includes("--write")) {
    console.log(`CENSUS_INPUT_DRY_RUN source=${sourceId} records=${records.length} sha256=${outputSha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("CENSUS_INPUT_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const outputPath = repositoryPath(outputArgument);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`CENSUS_INPUT_WRITTEN source=${sourceId} records=${records.length} output=${path.relative(ROOT, outputPath)} sha256=${outputSha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

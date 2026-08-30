#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return text(value).toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseCsv(value) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < String(value || "").length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => text(cell))) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((cell) => text(cell))) rows.push(row);
  if (quoted) throw new Error("OFFICIAL_CSV_JOIN_UNTERMINATED_QUOTE");
  if (rows.length < 2) throw new Error("OFFICIAL_CSV_JOIN_ROWS_INVALID");
  return rows;
}

function csvRecords(payload) {
  const [headers, ...rows] = parseCsv(payload);
  const normalizedHeaders = headers.map(text);
  return rows.map((row) => Object.fromEntries(normalizedHeaders.map((header, index) => [header, text(row[index])])));
}

function requiredText(config, key) {
  const value = text(config?.[key]);
  if (!value) throw new Error(`OFFICIAL_CSV_JOIN_CONFIG_${key.toUpperCase()}_REQUIRED`);
  return value;
}

function coordinatePair(record, config) {
  const longitude = Number(record?.[requiredText(config, "map_longitude_field")]);
  const latitude = Number(record?.[requiredText(config, "map_latitude_field")]);
  const bounds = config?.coordinate_bounds;
  if (!bounds || ![bounds.west, bounds.east, bounds.south, bounds.north].every(Number.isFinite)) {
    throw new Error("OFFICIAL_CSV_JOIN_COORDINATE_BOUNDS_INVALID");
  }
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || (longitude === 0 && latitude === 0) ||
    longitude < bounds.west || longitude > bounds.east || latitude < bounds.south || latitude > bounds.north) {
    return null;
  }
  return { latitude, longitude };
}

function matchesRequiredValues(record, required) {
  return Object.entries(required || {}).every(([field, expected]) => text(record?.[field]) === text(expected));
}

function registryNames(record, fields) {
  return [...new Set(fields.map((field) => normalized(record?.[field])).filter(Boolean))];
}

function registryKey(name, city, storeType) {
  return [normalized(name), normalized(city), text(storeType).toUpperCase()].join("|");
}

function mapType(record, config) {
  const field = requiredText(config, "map_type_field");
  const mapping = config?.map_type_mapping;
  const key = text(record?.[field]).toUpperCase();
  const resolved = text(mapping?.[key]).toUpperCase();
  if (!resolved) throw new Error(`OFFICIAL_CSV_JOIN_MAP_TYPE_UNMAPPED:${key || "EMPTY"}`);
  return resolved;
}

function mapRecordId(record, config) {
  return `CSV:${sha256([
    text(record?.[requiredText(config, "map_name_field")]),
    text(record?.[requiredText(config, "map_address_field")]),
    text(record?.[requiredText(config, "map_city_field")]),
    text(record?.[requiredText(config, "map_type_field")]),
  ].join("\n")).slice(0, 24)}`;
}

export function joinOfficialRegistryToOfficialCsvMap({ registryRecords, mapCsv, config }) {
  if (!Array.isArray(registryRecords)) throw new Error("OFFICIAL_CSV_JOIN_REGISTRY_ARRAY_REQUIRED");
  const registryNameFields = Array.isArray(config?.registry_name_fields) ? config.registry_name_fields.map(text).filter(Boolean) : [];
  if (registryNameFields.length === 0 || !config?.required_registry_values || !config?.map_type_mapping) {
    throw new Error("OFFICIAL_CSV_JOIN_CONFIG_INVALID");
  }
  const registryCityField = requiredText(config, "registry_city_field");
  const registryTypeField = requiredText(config, "registry_store_type_field");
  const mapNameField = requiredText(config, "map_name_field");
  const mapCityField = requiredText(config, "map_city_field");
  const mapAddressField = requiredText(config, "map_address_field");
  const mapRows = csvRecords(mapCsv);

  const validMaps = [];
  const mapByKey = new Map();
  for (const row of mapRows) {
    const name = text(row?.[mapNameField]);
    const city = text(row?.[mapCityField]);
    const address = text(row?.[mapAddressField]);
    const storeType = mapType(row, config);
    const point = coordinatePair(row, config);
    if (!name || !city || !address || !point) continue;
    const map = { row, name, city, address, store_type: storeType, ...point, map_record_id: mapRecordId(row, config) };
    const key = registryKey(name, city, storeType);
    const entries = mapByKey.get(key) || [];
    entries.push(map);
    mapByKey.set(key, entries);
    validMaps.push(map);
  }

  const eligible = registryRecords.filter((record) => matchesRequiredValues(record, config.required_registry_values));
  const registryByKey = new Map();
  for (const record of eligible) {
    const city = text(record?.[registryCityField]);
    const storeType = text(record?.[registryTypeField]).toUpperCase();
    for (const name of registryNames(record, registryNameFields)) {
      const key = registryKey(name, city, storeType);
      const entries = registryByKey.get(key) || [];
      entries.push(record);
      registryByKey.set(key, entries);
    }
  }

  const joined = new Map();
  let blockedRegistryIdentity = 0;
  let blockedMapIdentity = 0;
  for (const record of eligible) {
    const keys = registryNames(record, registryNameFields).map((name) => registryKey(name, record?.[registryCityField], record?.[registryTypeField]));
    const candidates = keys.flatMap((key) => {
      const registryMatches = registryByKey.get(key) || [];
      const mapMatches = mapByKey.get(key) || [];
      if (registryMatches.length > 1) blockedRegistryIdentity += 1;
      if (mapMatches.length > 1) blockedMapIdentity += 1;
      return registryMatches.length === 1 && mapMatches.length === 1 ? mapMatches : [];
    });
    const unique = [...new Map(candidates.map((candidate) => [candidate.map_record_id, candidate])).values()];
    if (unique.length === 1 && keys.every((key) => (registryByKey.get(key) || []).length <= 1 && (mapByKey.get(key) || []).length <= 1)) {
      joined.set(record, unique[0]);
    }
  }

  const records = registryRecords.map((record) => {
    const point = joined.get(record);
    if (!point) return record;
    return {
      ...record,
      address: point.address,
      latitude: point.latitude,
      longitude: point.longitude,
      coordinates_source: "OFFICIAL_CURRENT_REGULATOR_MAP_CSV",
      coordinates_confidence: "PROVEN",
      location_evidence: "STRONG",
      public_source_fields: {
        ...(record?.public_source_fields || {}),
        official_coordinate_join: "UNIQUE_EXACT_NORMALIZED_NAME_CITY_AND_STORE_TYPE",
        official_coordinate_map_record_id: point.map_record_id,
        official_coordinate_map_name: point.name,
        official_coordinate_map_city: point.city,
        official_coordinate_map_type: point.store_type,
      },
    };
  });
  const matchedMapIds = new Set([...joined.values()].map((point) => point.map_record_id));
  return {
    records,
    counts: {
      registry_records: registryRecords.length,
      eligible_registry_records: eligible.length,
      official_map_points: validMaps.length,
      joined_exact_unique: joined.size,
      map_points_without_unique_current_license: validMaps.filter((point) => !matchedMapIds.has(point.map_record_id)).length,
      blocked_registry_identity: blockedRegistryIdentity,
      blocked_map_identity: blockedMapIdentity,
    },
  };
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function localFile(relativePath, errorCode) {
  const absolute = path.resolve(ROOT, relativePath);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(absolute)) throw new Error(errorCode);
  return { absolute, payload: fs.readFileSync(absolute) };
}

function assertedSnapshot(config, pathField, shaField, errorPrefix) {
  const input = localFile(requiredText(config, pathField), `${errorPrefix}_LOCAL_INPUT_REQUIRED`);
  if (text(config?.[shaField]).toLowerCase() !== sha256(input.payload)) throw new Error(`${errorPrefix}_SHA256_MISMATCH`);
  return input;
}

function main() {
  const configPath = readArgument("--config");
  const outputPath = readArgument("--output");
  if (!configPath || !outputPath) throw new Error("OFFICIAL_CSV_JOIN_USAGE:--config <local-json> --output <local-json> --write");
  if (!process.argv.includes("--write") || process.env.STORE_TRUTH_WRITE !== "1") throw new Error("OFFICIAL_CSV_JOIN_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const configInput = localFile(configPath, "OFFICIAL_CSV_JOIN_CONFIG_LOCAL_INPUT_REQUIRED");
  const config = JSON.parse(configInput.payload.toString("utf8"));
  const registryInput = assertedSnapshot(config, "registry_snapshot_path", "registry_snapshot_sha256", "OFFICIAL_CSV_JOIN_REGISTRY_SNAPSHOT");
  const mapInput = assertedSnapshot(config, "map_snapshot_path", "map_snapshot_sha256", "OFFICIAL_CSV_JOIN_MAP_SNAPSHOT");
  const registryRecords = JSON.parse(registryInput.payload.toString("utf8"));
  const result = joinOfficialRegistryToOfficialCsvMap({ registryRecords, mapCsv: mapInput.payload.toString("utf8"), config });
  if (Number.isInteger(config.expected_map_points) && result.counts.official_map_points !== config.expected_map_points) {
    throw new Error(`OFFICIAL_CSV_JOIN_MAP_COUNT_DRIFT:${result.counts.official_map_points}`);
  }
  if (Number.isInteger(config.expected_joined_exact_unique) && result.counts.joined_exact_unique !== config.expected_joined_exact_unique) {
    throw new Error(`OFFICIAL_CSV_JOIN_JOINED_COUNT_DRIFT:${result.counts.joined_exact_unique}`);
  }
  const output = path.resolve(ROOT, outputPath);
  const relative = path.relative(ROOT, output);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("OFFICIAL_CSV_JOIN_OUTPUT_MUST_BE_LOCAL");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result.records, null, 2)}\n`);
  console.log(`OFFICIAL_CSV_JOIN_WRITTEN rows=${result.records.length} joined=${result.counts.joined_exact_unique} points=${result.counts.official_map_points} unmatched=${result.counts.map_points_without_unique_current_license} sha256=${sha256(fs.readFileSync(output))} output=${relative}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

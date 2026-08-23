#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedDisplayName(value) {
  return text(value)
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validCoordinatePair(longitude, latitude) {
  const lng = Number(longitude);
  const lat = Number(latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90 && !(lng === 0 && lat === 0)
    ? { longitude: lng, latitude: lat }
    : null;
}

function pointInBounds(point, bounds) {
  if (!bounds) return true;
  return point.longitude >= Number(bounds.west) && point.longitude <= Number(bounds.east) && point.latitude >= Number(bounds.south) && point.latitude <= Number(bounds.north);
}

function kmlTag(value, tag) {
  return String(value || "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "";
}

function kmlText(value) {
  return text(String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " "));
}

export function parseOfficialKmlPlacemarks(payload, mapSource) {
  const mapId = text(mapSource?.map_id);
  const sourceUrl = text(mapSource?.source_url);
  if (!mapId || !/^https:\/\//i.test(sourceUrl)) throw new Error("OFFICIAL_KML_MAP_SOURCE_SCHEMA_INVALID");
  const placemarks = [...String(payload || "").matchAll(/<Placemark(?:\s[^>]*)?>([\s\S]*?)<\/Placemark>/gi)];
  return placemarks.map((match, index) => {
    const body = match[1];
    const coordinateParts = kmlText(kmlTag(body, "coordinates")).split(/\s+/)[0].split(",");
    const point = validCoordinatePair(coordinateParts[0], coordinateParts[1]);
    return {
      map_id: mapId,
      map_source_url: sourceUrl,
      map_record_id: `${mapId}:KML:${index + 1}`,
      display_name: kmlText(kmlTag(body, "name")),
      ...(point || {}),
    };
  });
}

function matchedNameKeys(record, fields) {
  return [...new Set(fields.map((field) => normalizedDisplayName(record?.[field])).filter((value) => value && value !== "nan"))];
}

function matchesRequiredValues(record, required) {
  return Object.entries(required || {}).every(([field, expected]) => record?.[field] === expected);
}

function localJson(filePath) {
  const absolute = path.resolve(ROOT, filePath);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(absolute)) {
    throw new Error("OFFICIAL_KML_JOIN_LOCAL_INPUT_REQUIRED");
  }
  return { absolute, payload: fs.readFileSync(absolute) };
}

export function registryRecordsFromPayload(payload, config = {}) {
  if (Array.isArray(payload)) return payload;
  const field = text(config.registry_records_field);
  if (!field || !/^[A-Za-z0-9_]+$/.test(field) || !Array.isArray(payload?.[field])) {
    throw new Error("OFFICIAL_KML_JOIN_REGISTRY_SNAPSHOT_ARRAY_REQUIRED");
  }
  return payload[field];
}

export function joinOfficialRegistryToOfficialKmlMaps({ registryRecords, mapPayloads, config }) {
  if (!Array.isArray(registryRecords) || !Array.isArray(mapPayloads)) throw new Error("OFFICIAL_KML_JOIN_INPUT_ARRAY_REQUIRED");
  const nameFields = Array.isArray(config?.registry_name_fields) ? config.registry_name_fields.map(text).filter(Boolean) : [];
  if (nameFields.length === 0 || !config?.required_registry_values || !config?.coordinate_bounds) {
    throw new Error("OFFICIAL_KML_JOIN_CONFIG_INVALID");
  }

  const points = mapPayloads.flatMap(({ payload, source }) => parseOfficialKmlPlacemarks(payload, source))
    .filter((point) => validCoordinatePair(point.longitude, point.latitude) && pointInBounds(point, config.coordinate_bounds));
  const validPointNames = new Map();
  for (const point of points) {
    const key = normalizedDisplayName(point.display_name);
    if (!key) continue;
    const entries = validPointNames.get(key) || [];
    entries.push(point);
    validPointNames.set(key, entries);
  }

  const eligible = registryRecords.filter((record) => matchesRequiredValues(record, config.required_registry_values));
  const registryNames = new Map();
  for (const record of eligible) {
    for (const key of matchedNameKeys(record, nameFields)) {
      const entries = registryNames.get(key) || [];
      entries.push(record);
      registryNames.set(key, entries);
    }
  }

  const coordinatesByRecord = new Map();
  let ambiguousRegistryIdentity = 0;
  let ambiguousMapIdentity = 0;
  for (const record of eligible) {
    const names = matchedNameKeys(record, nameFields);
    const nameMatches = names.map((name) => {
      const sameRegistry = registryNames.get(name) || [];
      const sameMap = validPointNames.get(name) || [];
      return { sameRegistry, sameMap };
    });
    const candidates = nameMatches.flatMap(({ sameRegistry, sameMap }) => sameRegistry.length === 1 && sameMap.length === 1 ? sameMap : []);
    const uniqueCandidates = [...new Map(candidates.map((point) => [point.map_record_id, point])).values()];
    // A shared legal-entity name is not a location ambiguity when a distinct
    // published trade name uniquely identifies one official map placemark.
    // An ambiguous name blocks only if it could connect this record to a map
    // point, and competing unique coordinates remain fail-closed below.
    const duplicateRegistryName = nameMatches.some(({ sameRegistry, sameMap }) => sameRegistry.length > 1 && sameMap.length > 0);
    const duplicateMapName = nameMatches.some(({ sameRegistry, sameMap }) => sameRegistry.length > 0 && sameMap.length > 1);
    if (duplicateRegistryName) ambiguousRegistryIdentity += 1;
    if (duplicateMapName) ambiguousMapIdentity += 1;
    if (uniqueCandidates.length === 1 && !duplicateRegistryName && !duplicateMapName) {
      coordinatesByRecord.set(record, uniqueCandidates[0]);
    }
  }

  const records = registryRecords.map((record) => {
    const point = coordinatesByRecord.get(record);
    if (!point) return record;
    return {
      ...record,
      latitude: point.latitude,
      longitude: point.longitude,
      coordinates_source: "OFFICIAL_REGULATOR_LINKED_RETAIL_MAP_KML",
      coordinates_confidence: "PROVEN",
      location_evidence: "STRONG",
      public_source_fields: {
        ...(record.public_source_fields || {}),
        official_coordinate_join: "UNIQUE_EXACT_NORMALIZED_DISPLAY_NAME",
        official_coordinate_map_id: point.map_id,
        official_coordinate_map_url: point.map_source_url,
        official_coordinate_map_record_id: point.map_record_id,
        official_coordinate_map_display_name: point.display_name,
      },
    };
  });
  return {
    records,
    counts: {
      registry_records: registryRecords.length,
      eligible_registry_records: eligible.length,
      official_map_points: points.length,
      joined_exact_unique: coordinatesByRecord.size,
      blocked_registry_name_ambiguity: ambiguousRegistryIdentity,
      blocked_map_name_ambiguity: ambiguousMapIdentity,
    },
  };
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function main() {
  const configPath = readArg("--config");
  const outputPath = readArg("--output");
  if (!configPath || !outputPath) throw new Error("OFFICIAL_KML_JOIN_USAGE:--config <local-json> --output <local-json> --write");
  if (!process.argv.includes("--write") || process.env.STORE_TRUTH_WRITE !== "1") {
    throw new Error("OFFICIAL_KML_JOIN_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  }
  const configInput = localJson(configPath);
  const config = JSON.parse(configInput.payload.toString("utf8"));
  const registryInput = localJson(text(config.registry_snapshot_path));
  if (text(config.registry_snapshot_sha256).toLowerCase() !== sha256(registryInput.payload)) {
    throw new Error("OFFICIAL_KML_JOIN_REGISTRY_SNAPSHOT_SHA256_MISMATCH");
  }
  const registryRecords = registryRecordsFromPayload(JSON.parse(registryInput.payload.toString("utf8")), config);
  const mapPayloads = (config.map_sources || []).map((source) => {
    const input = localJson(text(source.snapshot_path));
    if (text(source.snapshot_sha256).toLowerCase() !== sha256(input.payload)) {
      throw new Error(`OFFICIAL_KML_JOIN_MAP_SNAPSHOT_SHA256_MISMATCH:${text(source.map_id)}`);
    }
    return { source, payload: input.payload.toString("utf8") };
  });
  if (mapPayloads.length === 0) throw new Error("OFFICIAL_KML_JOIN_MAP_SOURCES_REQUIRED");
  const result = joinOfficialRegistryToOfficialKmlMaps({ registryRecords, mapPayloads, config });
  const output = path.resolve(ROOT, outputPath);
  const relative = path.relative(ROOT, output);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("OFFICIAL_KML_JOIN_OUTPUT_MUST_BE_LOCAL");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result.records, null, 2)}\n`);
  console.log(`OFFICIAL_KML_JOIN_WRITTEN rows=${result.records.length} joined=${result.counts.joined_exact_unique} points=${result.counts.official_map_points} sha256=${sha256(fs.readFileSync(output))} output=${relative}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

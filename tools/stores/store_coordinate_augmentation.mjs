import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_CIVIC_COORDINATE_PROVIDERS = new Set([
  "PUBLIC_GEOJSON_EXACT_CIVIC_ADDRESS_V1",
  "PUBLIC_CIVIC_ADDRESS_POINT_V1",
]);

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function normalized(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizedUsStreetAddress(value) {
  return text(value)
    .toUpperCase()
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
    .replace(/[^A-Z0-9]+/g, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function escapedRegExp(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function repositoryPath(relativePath) {
  const absolute = path.resolve(ROOT, text(relativePath));
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_PATH_OUTSIDE_REPOSITORY");
  }
  return absolute;
}

function finiteCoordinate(value, minimum, maximum) {
  if (!text(value)) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum;
}

function validCoordinatePair(latitude, longitude) {
  return finiteCoordinate(latitude, -90, 90)
    && finiteCoordinate(longitude, -180, 180)
    && !(Number(latitude) === 0 && Number(longitude) === 0);
}

function configuredSourceAddressFields(config) {
  const fields = config?.source_address_fields;
  const parser = text(config?.source_address_parser);
  if (!fields || typeof fields !== "object") throw new Error("STORE_COORDINATE_AUGMENTATION_SOURCE_FIELDS_INVALID");
  if (!parser) {
    if (["address", "city", "region", "postal_code"].some((key) => !text(fields[key]))) {
      throw new Error("STORE_COORDINATE_AUGMENTATION_SOURCE_FIELDS_INVALID");
    }
    return { fields, parser: "" };
  }
  if (![
    "US_COMBINED_STREET_CITY_STATE_ZIP_V1",
    "US_ONELINE_USPS_EXACT_V1",
    "US_ADDRESS_STATE_ZIP_WITH_DECLARED_CITY_V1",
    "US_COMMA_DELIMITED_ADDRESS_WITH_DECLARED_REGION_V1",
  ].includes(parser) || !text(fields.combined_address)) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SOURCE_FIELDS_INVALID");
  }
  if (parser === "US_ADDRESS_STATE_ZIP_WITH_DECLARED_CITY_V1" && (!text(fields.city) || !text(fields.region))) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SOURCE_FIELDS_INVALID");
  }
  if (parser === "US_COMMA_DELIMITED_ADDRESS_WITH_DECLARED_REGION_V1" && !text(fields.region)) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SOURCE_FIELDS_INVALID");
  }
  return { fields, parser };
}

function combinedUsAddressComponents(value) {
  const matched = text(value).match(/^(?<address>.+),\s*(?<city>[^,]+?)\s*,?\s*(?<region>[A-Z]{2})\s+(?<postal_code>\d{5}(?:-\d{4})?)$/i);
  if (!matched?.groups) return null;
  const components = Object.fromEntries(Object.entries(matched.groups).map(([key, item]) => [key, text(item)]));
  return Object.values(components).every(Boolean) ? components : null;
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

function commaDelimitedUsAddressComponents(value, declaredRegion) {
  const region = text(declaredRegion).toUpperCase();
  const parts = text(value).split(",").map(text).filter(Boolean);
  if (!/^[A-Z]{2}$/.test(region) || parts.length < 3) return null;
  const terminal = text(parts.at(-1)).match(/^(?:(?<region>[A-Z]{2})\s*)?(?<postal_code>\d{5}(?:-\d{4})?)$/i);
  if (!terminal?.groups?.postal_code) return null;
  let cityIndex = parts.length - 2;
  const statedRegion = text(terminal.groups.region).toUpperCase();
  if (statedRegion && statedRegion !== region) return null;
  if (!statedRegion && /^[A-Z]{2}$/i.test(parts.at(-2) || "")) {
    if (text(parts.at(-2)).toUpperCase() !== region) return null;
    cityIndex -= 1;
  }
  const components = {
    address: text(parts.slice(0, cityIndex).join(", ")),
    city: text(parts[cityIndex]),
    region,
    postal_code: text(terminal.groups.postal_code),
  };
  return Object.values(components).every(Boolean) ? components : null;
}

function canonicalUspsOneline(value) {
  return text(value)
    .toUpperCase()
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

function sourceAddressComponents(row, sourceAddressFields) {
  if (sourceAddressFields.parser === "US_COMBINED_STREET_CITY_STATE_ZIP_V1") {
    return combinedUsAddressComponents(row?.[sourceAddressFields.fields.combined_address]);
  }
  if (sourceAddressFields.parser === "US_ONELINE_USPS_EXACT_V1") {
    const combinedAddress = text(row?.[sourceAddressFields.fields.combined_address]);
    return combinedAddress ? { combined_address: combinedAddress } : null;
  }
  if (sourceAddressFields.parser === "US_ADDRESS_STATE_ZIP_WITH_DECLARED_CITY_V1") {
    return sourceCityStateZipAddressComponents(
      row?.[sourceAddressFields.fields.combined_address],
      row?.[sourceAddressFields.fields.city],
      row?.[sourceAddressFields.fields.region],
    );
  }
  if (sourceAddressFields.parser === "US_COMMA_DELIMITED_ADDRESS_WITH_DECLARED_REGION_V1") {
    return commaDelimitedUsAddressComponents(
      row?.[sourceAddressFields.fields.combined_address],
      row?.[sourceAddressFields.fields.region],
    );
  }
  return {
    address: text(row?.[sourceAddressFields.fields.address]),
    city: text(row?.[sourceAddressFields.fields.city]),
    region: text(row?.[sourceAddressFields.fields.region]),
    postal_code: text(row?.[sourceAddressFields.fields.postal_code]),
  };
}

export function sourceCoordinateRecordId(row, config, components) {
  const sourceRecordId = text(row?.[config?.source_record_id_field]);
  const strategy = text(config?.source_record_id_strategy);
  if (!strategy) return sourceRecordId;
  if (strategy !== "LICENSE_AND_ADDRESS_V1") {
    throw new Error(`STORE_COORDINATE_AUGMENTATION_SOURCE_RECORD_ID_STRATEGY_UNSUPPORTED:${strategy}`);
  }
  if (![sourceRecordId, components?.address, components?.city, components?.region, components?.postal_code].every((value) => text(value))) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SOURCE_RECORD_ID_COMPONENTS_INVALID");
  }
  const identity = [sourceRecordId, normalized(components.address), normalized(components.city), normalized(components.region), normalized(components.postal_code)].join("\u001f");
  return `${sourceRecordId}:${sha256(identity).slice(0, 24)}`;
}

function exactAddressMatch(components, coordinate, { allowMissingSourcePostalCode = false } = {}) {
  if (!components) return false;
  if (text(components.combined_address)) {
    return canonicalUspsOneline(components.combined_address) === canonicalUspsOneline(coordinate?.public_source_fields?.census_matched_address);
  }
  const sourcePostalCode = normalized(components.postal_code);
  const matchedPostalCode = normalized(coordinate.census_matched_postal_code ?? coordinate.postal_code);
  return normalizedUsStreetAddress(components.address) === normalizedUsStreetAddress(coordinate.address) &&
    normalized(components.city) === normalized(coordinate.city) &&
    normalized(components.region) === normalized(coordinate.region) &&
    (sourcePostalCode
      ? sourcePostalCode === matchedPostalCode
      : allowMissingSourcePostalCode && coordinate?.allow_missing_source_postal_code === true && Boolean(matchedPostalCode));
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

function exactPublicCivicAddressMatch(components, coordinate, config) {
  if (!components) return false;
  const policy = text(config?.address_match_policy);
  if (!policy) return exactAddressMatch(components, coordinate);
  if (policy !== "CALGARY_PARCEL_CIVIC_V1") {
    throw new Error(`STORE_COORDINATE_AUGMENTATION_ADDRESS_MATCH_POLICY_UNSUPPORTED:${policy}`);
  }
  const sourcePostalCode = normalized(components.postal_code);
  const coordinatePostalPublished = coordinate?.public_source_fields?.postal_code_published === true;
  const coordinatePostalCode = normalized(coordinate?.postal_code);
  const postalMatches = !sourcePostalCode || (coordinatePostalPublished
    ? sourcePostalCode === coordinatePostalCode
    : config?.allow_unpublished_coordinate_postal_code === true && coordinate?.public_source_fields?.postal_code_published === false);
  return canonicalCalgaryCivicAddress(components.address) === canonicalCalgaryCivicAddress(coordinate?.public_source_fields?.full_address) &&
    normalized(components.city) === normalized(coordinate?.city) &&
    normalized(components.region) === normalized(coordinate?.region) &&
    postalMatches;
}

export function applyExactCensusCoordinateAugmentation({ source, rows, payload }) {
  const config = source?.coordinate_augmentation;
  if (!config) return rows;
  if (config.provider !== "US_CENSUS_PUBLIC_AR_CURRENT" || !Array.isArray(payload?.records)) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SCHEMA_INVALID");
  }
  const sourceAddressFields = configuredSourceAddressFields(config);
  if (!text(config.source_record_id_field)) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SOURCE_FIELDS_INVALID");
  }
  if (config.allow_missing_source_postal_code !== undefined && typeof config.allow_missing_source_postal_code !== "boolean") {
    throw new Error("STORE_COORDINATE_AUGMENTATION_POSTAL_POLICY_INVALID");
  }
  const allowMissingSourcePostalCode = config.allow_missing_source_postal_code === true;
  const coordinates = new Map();
  for (const coordinate of payload.records) {
    const id = text(coordinate?.source_record_id);
    if (!id || coordinates.has(id)) throw new Error(`STORE_COORDINATE_AUGMENTATION_DUPLICATE_RECORD:${id || "MISSING"}`);
    if (!validCoordinatePair(coordinate?.latitude, coordinate?.longitude)) {
      throw new Error(`STORE_COORDINATE_AUGMENTATION_COORDINATE_INVALID:${id}`);
    }
    if (!exactAddressMatch({
      address: coordinate.address,
      city: coordinate.city,
      region: coordinate.region,
      postal_code: coordinate.postal_code,
    }, coordinate, { allowMissingSourcePostalCode })) {
      throw new Error(`STORE_COORDINATE_AUGMENTATION_ADDRESS_INVALID:${id}`);
    }
    coordinates.set(id, coordinate);
  }
  return rows.map((row) => {
    // Source adapters apply declarative defaults when normalizing records.
    // Coordinate augmentation runs immediately before that step, so it must
    // use the same defaults for a declared field such as a fixed US state.
    const sourceRow = { ...(source?.default_fields || {}), ...(row || {}) };
    const configuredStrategy = text(config.source_record_id_strategy);
    const components = configuredStrategy
      ? sourceAddressComponents(sourceRow, sourceAddressFields)
      : null;
    if (configuredStrategy && !components) {
      // The source snapshot remains canonical history even when one address
      // is too malformed for the declared exact-geocode parser. No input ID
      // can be created for it, so no Census coordinate can be attached.
      return row;
    }
    const id = sourceCoordinateRecordId(sourceRow, config, components);
    const coordinate = coordinates.get(id);
    if (!coordinate) return row;
    const resolvedComponents = components || sourceAddressComponents(sourceRow, sourceAddressFields);
    if (!resolvedComponents) throw new Error(`STORE_COORDINATE_AUGMENTATION_ADDRESS_PARSE_INVALID:${id}`);
    if (!exactAddressMatch(resolvedComponents, coordinate, { allowMissingSourcePostalCode })) {
      throw new Error(`STORE_COORDINATE_AUGMENTATION_ADDRESS_MISMATCH:${id}`);
    }
    const latitudeField = text(config.source_coordinate_fields?.latitude);
    const longitudeField = text(config.source_coordinate_fields?.longitude);
    if (!latitudeField || !longitudeField) throw new Error("STORE_COORDINATE_AUGMENTATION_TARGET_FIELDS_INVALID");
    if (finiteCoordinate(sourceRow?.[latitudeField], -90, 90) || finiteCoordinate(sourceRow?.[longitudeField], -180, 180)) {
      throw new Error(`STORE_COORDINATE_AUGMENTATION_SOURCE_COORDINATE_ALREADY_PRESENT:${id}`);
    }
    return {
      ...row,
      [latitudeField]: Number(coordinate.latitude),
      [longitudeField]: Number(coordinate.longitude),
      ...(sourceAddressFields.parser ? {
        source_street_address: resolvedComponents.address || text(coordinate.address),
        source_city: resolvedComponents.city || text(coordinate.city),
        source_postal_code: resolvedComponents.postal_code || text(coordinate.postal_code),
      } : {}),
      coordinates_source: "US_CENSUS_PUBLIC_AR_CURRENT_EXACT_ADDRESS",
      coordinates_confidence: "STRONG",
      location_evidence: "STRONG",
      public_source_fields: {
        ...(row?.public_source_fields || {}),
        census_benchmark: text(payload.census_benchmark),
        census_matched_address: text(coordinate.public_source_fields?.census_matched_address),
        ...(allowMissingSourcePostalCode ? { census_match_policy: "EXACT_STREET_CITY_STATE_OFFICIAL_POSTAL_UNPUBLISHED" } : {}),
      },
    };
  });
}

function publicSourceFieldMatches(actual, expected) {
  if (typeof expected === "boolean") return actual === expected;
  return text(actual).toUpperCase() === text(expected).toUpperCase();
}

function configuredCoordinateBounds(config) {
  const bounds = config?.coordinate_bounds;
  if (!bounds || typeof bounds !== "object") throw new Error("STORE_COORDINATE_AUGMENTATION_BOUNDS_INVALID");
  const minimumLatitude = Number(bounds.minimum_latitude);
  const maximumLatitude = Number(bounds.maximum_latitude);
  const minimumLongitude = Number(bounds.minimum_longitude);
  const maximumLongitude = Number(bounds.maximum_longitude);
  if (![minimumLatitude, maximumLatitude, minimumLongitude, maximumLongitude].every(Number.isFinite) ||
    minimumLatitude >= maximumLatitude || minimumLongitude >= maximumLongitude ||
    !finiteCoordinate(minimumLatitude, -90, 90) || !finiteCoordinate(maximumLatitude, -90, 90) ||
    !finiteCoordinate(minimumLongitude, -180, 180) || !finiteCoordinate(maximumLongitude, -180, 180)) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_BOUNDS_INVALID");
  }
  return { minimumLatitude, maximumLatitude, minimumLongitude, maximumLongitude };
}

function isWithinConfiguredBounds(coordinate, bounds) {
  return Number(coordinate.latitude) >= bounds.minimumLatitude && Number(coordinate.latitude) <= bounds.maximumLatitude &&
    Number(coordinate.longitude) >= bounds.minimumLongitude && Number(coordinate.longitude) <= bounds.maximumLongitude;
}

export function applyExactPublicCivicCoordinateAugmentation({ source, rows, payload }) {
  const config = source?.coordinate_augmentation;
  if (!config) return rows;
  if (!PUBLIC_CIVIC_COORDINATE_PROVIDERS.has(config.provider) || payload?.coordinate_augmentation_provider !== config.provider || !Array.isArray(payload?.records)) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SCHEMA_INVALID");
  }
  const sourceAddressFields = configuredSourceAddressFields(config);
  if (!text(config.source_record_id_field) || !config.required_public_source_fields || typeof config.required_public_source_fields !== "object") {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SOURCE_FIELDS_INVALID");
  }
  if (config.allow_unpublished_coordinate_postal_code !== undefined && typeof config.allow_unpublished_coordinate_postal_code !== "boolean") {
    throw new Error("STORE_COORDINATE_AUGMENTATION_POSTAL_POLICY_INVALID");
  }
  const bounds = configuredCoordinateBounds(config);
  const coordinates = new Map();
  for (const coordinate of payload.records) {
    const id = text(coordinate?.source_record_id);
    if (!id || coordinates.has(id)) throw new Error(`STORE_COORDINATE_AUGMENTATION_DUPLICATE_RECORD:${id || "MISSING"}`);
    if (!validCoordinatePair(coordinate?.latitude, coordinate?.longitude) || !isWithinConfiguredBounds(coordinate, bounds)) {
      throw new Error(`STORE_COORDINATE_AUGMENTATION_COORDINATE_INVALID:${id}`);
    }
    if (!exactPublicCivicAddressMatch({
      address: coordinate.address,
      city: coordinate.city,
      region: coordinate.region,
      postal_code: coordinate.postal_code,
    }, coordinate, config)) {
      throw new Error(`STORE_COORDINATE_AUGMENTATION_ADDRESS_INVALID:${id}`);
    }
    for (const [field, expected] of Object.entries(config.required_public_source_fields)) {
      if (!publicSourceFieldMatches(coordinate?.public_source_fields?.[field], expected)) {
        throw new Error(`STORE_COORDINATE_AUGMENTATION_PUBLIC_MATCH_INVALID:${id}:${field}`);
      }
    }
    coordinates.set(id, coordinate);
  }
  return rows.map((row) => {
    const sourceRow = { ...(source?.default_fields || {}), ...(row || {}) };
    const configuredStrategy = text(config.source_record_id_strategy);
    const components = configuredStrategy ? sourceAddressComponents(sourceRow, sourceAddressFields) : null;
    if (configuredStrategy && !components) return row;
    const id = sourceCoordinateRecordId(sourceRow, config, components);
    const coordinate = coordinates.get(id);
    if (!coordinate) return row;
    const resolvedComponents = components || sourceAddressComponents(sourceRow, sourceAddressFields);
    if (!resolvedComponents) throw new Error(`STORE_COORDINATE_AUGMENTATION_ADDRESS_PARSE_INVALID:${id}`);
    if (!exactPublicCivicAddressMatch(resolvedComponents, coordinate, config)) {
      throw new Error(`STORE_COORDINATE_AUGMENTATION_ADDRESS_MISMATCH:${id}`);
    }
    const latitudeField = text(config.source_coordinate_fields?.latitude);
    const longitudeField = text(config.source_coordinate_fields?.longitude);
    if (!latitudeField || !longitudeField) throw new Error("STORE_COORDINATE_AUGMENTATION_TARGET_FIELDS_INVALID");
    if (finiteCoordinate(sourceRow?.[latitudeField], -90, 90) || finiteCoordinate(sourceRow?.[longitudeField], -180, 180)) {
      throw new Error(`STORE_COORDINATE_AUGMENTATION_SOURCE_COORDINATE_ALREADY_PRESENT:${id}`);
    }
    return {
      ...row,
      [latitudeField]: Number(coordinate.latitude),
      [longitudeField]: Number(coordinate.longitude),
      coordinates_source: config.provider === "PUBLIC_CIVIC_ADDRESS_POINT_V1"
        ? "OFFICIAL_PUBLIC_EXACT_CIVIC_ADDRESS_POINT"
        : "OFFICIAL_PUBLIC_EXACT_CIVIC_ADDRESS_GEOCODER",
      coordinates_confidence: "STRONG",
      location_evidence: "STRONG",
      public_source_fields: {
        ...(row?.public_source_fields || {}),
        exact_civic_geocoder: text(payload.public_geocoder_authority),
        exact_civic_geocoder_response_sha256: text(payload.response_sha256),
        exact_civic_geocoder_matched_address: text(coordinate.public_source_fields?.full_address),
        exact_civic_geocoder_match_precision: text(coordinate.public_source_fields?.match_precision),
        exact_civic_geocoder_location_descriptor: text(coordinate.public_source_fields?.location_descriptor),
      },
    };
  });
}

export function applyExactCoordinateAugmentation({ source, rows, payload }) {
  const provider = text(source?.coordinate_augmentation?.provider);
  if (!provider) return rows;
  if (provider === "US_CENSUS_PUBLIC_AR_CURRENT") return applyExactCensusCoordinateAugmentation({ source, rows, payload });
  if (PUBLIC_CIVIC_COORDINATE_PROVIDERS.has(provider)) return applyExactPublicCivicCoordinateAugmentation({ source, rows, payload });
  throw new Error(`STORE_COORDINATE_AUGMENTATION_PROVIDER_UNSUPPORTED:${provider}`);
}

export function loadExactCoordinateAugmentation(source) {
  const config = source?.coordinate_augmentation;
  if (!config) return null;
  if (text(config.source_snapshot_path) !== text(source.snapshot_path) || text(config.source_snapshot_sha256).toLowerCase() !== text(source.snapshot_sha256).toLowerCase()) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SOURCE_SNAPSHOT_MISMATCH");
  }
  const snapshotPath = repositoryPath(config.snapshot_path);
  const raw = fs.readFileSync(snapshotPath);
  if (sha256(raw) !== text(config.snapshot_sha256).toLowerCase()) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_SNAPSHOT_SHA256_MISMATCH");
  }
  const payload = JSON.parse(raw.toString("utf8"));
  if (config.provider === "US_CENSUS_PUBLIC_AR_CURRENT" && payload?.census_benchmark !== "Public_AR_Current") {
    throw new Error("STORE_COORDINATE_AUGMENTATION_BENCHMARK_INVALID");
  }
  if (PUBLIC_CIVIC_COORDINATE_PROVIDERS.has(config.provider) &&
    (payload?.coordinate_augmentation_provider !== config.provider || !/^[a-f0-9]{64}$/i.test(text(payload?.response_sha256)))) {
    throw new Error("STORE_COORDINATE_AUGMENTATION_PUBLIC_PROVIDER_INVALID");
  }
  return payload;
}

export function loadExactCensusCoordinateAugmentation(source) {
  const config = source?.coordinate_augmentation;
  if (config && config.provider !== "US_CENSUS_PUBLIC_AR_CURRENT") {
    throw new Error("STORE_COORDINATE_AUGMENTATION_PROVIDER_UNSUPPORTED");
  }
  return loadExactCoordinateAugmentation(source);
}

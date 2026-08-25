#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_PDOK_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function normalized(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, encoded) => {
      const number = String(encoded).toLowerCase().startsWith("x")
        ? Number.parseInt(String(encoded).slice(1), 16)
        : Number.parseInt(String(encoded), 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : " ";
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-");
}

function cells(row) {
  return [...String(row).matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => text(decodeHtml(match[1])));
}

function tableRows(table) {
  return [...String(table).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => cells(match[1]));
}

function configuredColumnIndex(config, name) {
  const index = Number(config?.table?.columns?.[name]);
  if (!Number.isInteger(index) || index < 0) throw new Error(`OFFICIAL_ADDRESS_POLICY_PDOK_COLUMN_INVALID:${name}`);
  return index;
}

function configuredExpectedRows(config) {
  const count = Number(config?.expected_row_count);
  if (!Number.isInteger(count) || count < 1) throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_EXPECTED_ROW_COUNT_INVALID");
  return count;
}

function configuredColumnCount(config) {
  const count = Number(config?.table?.column_count);
  if (!Number.isInteger(count) || count < 1) throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_COLUMN_COUNT_INVALID");
  return count;
}

function sourceRecordId({ street, houseNumber, addition, postalCode, city }) {
  return `ADDRESS_POLICY:${sha256([street, houseNumber, addition, postalCode, city].map(normalized).join("\u001f")).slice(0, 24)}`;
}

/**
 * Extracts an official current address list without interpreting a business
 * identity or opening state. The configuration owns the table layout, so this
 * works for any municipality that publishes a comparable policy table.
 */
export function extractOfficialAddressPolicyRows(html, config) {
  const expectedRows = configuredExpectedRows(config);
  const columnCount = configuredColumnCount(config);
  const indexes = Object.fromEntries(["street", "house_number", "house_number_suffix", "postal_prefix", "postal_suffix"]
    .map((name) => [name, configuredColumnIndex(config, name)]));
  if (Object.values(indexes).some((index) => index >= columnCount)) throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_COLUMN_OUT_OF_RANGE");
  const tables = [...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .map((match) => tableRows(match[0]));
  const matches = tables.filter((rows) => rows.length === expectedRows && rows.every((row) => row.length === columnCount));
  if (matches.length !== 1) throw new Error(`OFFICIAL_ADDRESS_POLICY_PDOK_TABLE_COUNT_INVALID:${matches.length}`);
  const city = text(config?.city);
  const country = text(config?.country).toUpperCase();
  const region = text(config?.region);
  const geoId = text(config?.geo_id).toUpperCase();
  if (![city, country, region, geoId].every(Boolean)) throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_JURISDICTION_INVALID");
  const addresses = matches[0].map((row) => {
    const street = text(row[indexes.street]);
    const houseNumber = text(row[indexes.house_number]);
    const addition = text(row[indexes.house_number_suffix]);
    const postalCode = `${text(row[indexes.postal_prefix])}${text(row[indexes.postal_suffix])}`.toUpperCase();
    if (![street, houseNumber, postalCode].every(Boolean)) throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_ADDRESS_ROW_INVALID");
    const address = `${street} ${houseNumber}${addition ? `-${addition}` : ""}`;
    return {
      source_record_id: sourceRecordId({ street, houseNumber, addition, postalCode, city }),
      legal_name: "Municipal tolerated coffeeshop address",
      trade_name: "",
      license_number: "",
      license_type: "Municipal coffeeshop toleration-list address",
      store_type: "ADULT_USE_RETAIL",
      address,
      city,
      region,
      postal_code: postalCode,
      country,
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      adult_use: true,
      medical: false,
      confidence: "PROVEN",
      coordinates_source: "OFFICIAL_PDOK_BAG_EXACT_ADDRESS_POINT",
      coordinates_confidence: "PROVEN",
      location_evidence: "STRONG",
      regulator_url: text(config?.source_url),
      public_source_fields: {
        record_kind: "MUNICIPAL_TOLERATION_ADDRESS",
        source_semantics: "Current municipal toleration-list address; the source does not publish the operator name, licence lifecycle, opening hours or factual operating state.",
        municipality_policy: text(config?.policy_name),
        source_street: street,
        source_house_number: houseNumber,
        source_house_number_suffix: addition,
      },
    };
  });
  if (new Set(addresses.map((record) => record.source_record_id)).size !== addresses.length) {
    throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_SOURCE_RECORD_ID_DUPLICATE");
  }
  return addresses.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
}

function coordinateFromWkt(value) {
  const matched = text(value).match(/^POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (!matched) return null;
  const longitude = Number(matched[1]);
  const latitude = Number(matched[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function pdokAddition(document) {
  return `${text(document?.huisletter)}${text(document?.huisnummertoevoeging)}`;
}

/** Exact declared address match: postcode, municipality, street, house number
 * and suffix all have to agree. A partial PDOK result is never promoted. */
export function selectExactPdokAddress(record, payload, bounds) {
  const sourceFields = record?.public_source_fields || {};
  const expectedStreet = normalized(sourceFields.source_street);
  const expectedHouseNumber = normalized(sourceFields.source_house_number);
  const expectedAddition = normalized(sourceFields.source_house_number_suffix);
  const expectedPostalCode = normalized(record?.postal_code);
  const expectedCity = normalized(record?.city);
  const candidates = Array.isArray(payload?.response?.docs) ? payload.response.docs : [];
  const baseMatches = candidates.filter((document) => {
    const coordinate = coordinateFromWkt(document?.centroide_ll);
    if (!coordinate) return false;
    const inBounds = coordinate.longitude >= Number(bounds?.west) && coordinate.longitude <= Number(bounds?.east) &&
      coordinate.latitude >= Number(bounds?.south) && coordinate.latitude <= Number(bounds?.north);
    return inBounds &&
      normalized(document?.postcode) === expectedPostalCode &&
      normalized(document?.woonplaatsnaam) === expectedCity &&
      normalized(document?.straatnaam) === expectedStreet &&
      normalized(document?.huisnummer) === expectedHouseNumber &&
      text(document?.adresseerbaarobject_id);
  });
  const exactMatches = expectedAddition
    ? baseMatches.filter((document) => normalized(pdokAddition(document)) === expectedAddition)
    : baseMatches.filter((document) => !normalized(pdokAddition(document)));
  const matches = exactMatches.length > 0 ? exactMatches : expectedAddition ? [] : baseMatches;
  const coordinates = new Map(matches.map((document) => {
    const coordinate = coordinateFromWkt(document.centroide_ll);
    return [`${coordinate.longitude},${coordinate.latitude}`, coordinate];
  }));
  // A municipal list may publish a parent civic number while BAG contains
  // several addressable units below it. It remains an exact coordinate only
  // when every such official unit resolves to one identical WGS84 point.
  if (coordinates.size !== 1) return null;
  const document = [...matches].sort((left, right) => (
    text(pdokAddition(left)).localeCompare(text(pdokAddition(right))) ||
    text(left.adresseerbaarobject_id).localeCompare(text(right.adresseerbaarobject_id))
  ))[0];
  if (!document) return null;
  return {
    latitude: coordinateFromWkt(document.centroide_ll).latitude,
    longitude: coordinateFromWkt(document.centroide_ll).longitude,
    pdok_adresseerbaarobject_id: text(document.adresseerbaarobject_id),
    pdok_adresseerbaarobject_ids: [...new Set(matches.map((item) => text(item.adresseerbaarobject_id)))].sort(),
    pdok_weergavenaam: text(document.weergavenaam),
  };
}

export function bindExactPdokCoordinates(records, pdokPayloads, bounds) {
  const bound = (records || []).map((record) => {
    const exact = selectExactPdokAddress(record, pdokPayloads?.[record.source_record_id], bounds);
    if (!exact) throw new Error(`OFFICIAL_ADDRESS_POLICY_PDOK_EXACT_MATCH_REQUIRED:${record.source_record_id}`);
    return {
      ...record,
      latitude: exact.latitude,
      longitude: exact.longitude,
      public_source_fields: {
        ...record.public_source_fields,
        pdok_adresseerbaarobject_id: exact.pdok_adresseerbaarobject_id,
        pdok_adresseerbaarobject_ids: exact.pdok_adresseerbaarobject_ids.join(","),
        pdok_weergavenaam: exact.pdok_weergavenaam,
      },
    };
  });
  return bound.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
}

/**
 * Preserve every current official policy row. Rows with an ambiguous civic
 * coordinate stay in Store Truth history, but the normal map gate blocks them
 * because neither an inferred point nor a unit-level address is acceptable.
 */
export function bindPdokCoordinatesWithBoundaries(records, pdokPayloads, bounds) {
  const output = [];
  let blockedCoordinateAmbiguity = 0;
  for (const record of records || []) {
    const exact = selectExactPdokAddress(record, pdokPayloads?.[record.source_record_id], bounds);
    if (!exact) {
      blockedCoordinateAmbiguity += 1;
      output.push({
        ...record,
        latitude: null,
        longitude: null,
        coordinates_source: "OFFICIAL_PDOK_BAG_COORDINATE_AMBIGUOUS",
        coordinates_confidence: "UNKNOWN",
        location_evidence: "UNKNOWN",
        public_source_fields: {
          ...record.public_source_fields,
          coordinate_boundary: "PDOK does not provide one unambiguous coordinate for this official parent civic address; the map marker is blocked rather than inferred.",
        },
      });
      continue;
    }
    output.push({
      ...record,
      latitude: exact.latitude,
      longitude: exact.longitude,
      public_source_fields: {
        ...record.public_source_fields,
        pdok_adresseerbaarobject_id: exact.pdok_adresseerbaarobject_id,
        pdok_adresseerbaarobject_ids: exact.pdok_adresseerbaarobject_ids.join(","),
        pdok_weergavenaam: exact.pdok_weergavenaam,
      },
    });
  }
  return {
    records: output.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id)),
    exact_pdok_coordinate_rows: output.length - blockedCoordinateAmbiguity,
    blocked_pdok_coordinate_ambiguity_rows: blockedCoordinateAmbiguity,
  };
}

function repositoryPath(value) {
  const absolute = path.resolve(ROOT, text(value));
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_PATH_OUTSIDE_REPOSITORY");
  return absolute;
}

function requiredConfig(config, name) {
  const value = text(config?.[name]);
  if (!value) throw new Error(`OFFICIAL_ADDRESS_POLICY_PDOK_CONFIG_${name.toUpperCase()}_REQUIRED`);
  return value;
}

async function fetchOfficialPolicy(config) {
  const response = await fetch(requiredConfig(config, "source_url"), { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`OFFICIAL_ADDRESS_POLICY_PDOK_POLICY_HTTP_${response.status}`);
  const contentType = text(response.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("text/html")) throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_POLICY_NOT_HTML");
  const html = await response.text();
  return { url: response.url, html, sha256: sha256(html) };
}

async function fetchPdok(record, config) {
  const endpoint = text(config?.pdok_url) || DEFAULT_PDOK_URL;
  const url = new URL(endpoint);
  url.searchParams.set("fq", "type:adres");
  url.searchParams.set("q", `${record.address} ${record.postal_code} ${record.city}`);
  url.searchParams.set("rows", "50");
  url.searchParams.set("fl", "weergavenaam,centroide_ll,adresseerbaarobject_id,postcode,huisnummer,huisletter,huisnummertoevoeging,straatnaam,woonplaatsnaam");
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`OFFICIAL_ADDRESS_POLICY_PDOK_GEOCODER_HTTP_${response.status}`);
  return response.json();
}

async function boundedMap(records, maxConcurrent, action) {
  const output = {};
  let cursor = 0;
  async function worker() {
    while (cursor < records.length) {
      const record = records[cursor];
      cursor += 1;
      output[record.source_record_id] = await action(record);
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxConcurrent, records.length) }, worker));
  return output;
}

async function main() {
  const index = process.argv.indexOf("--config");
  const configPath = index >= 0 ? repositoryPath(process.argv[index + 1]) : "";
  const writeRequested = process.argv.includes("--write");
  if (!configPath) throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_USAGE:--config <repo-relative-json> [--write]");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const expectedRows = configuredExpectedRows(config);
  const policy = await fetchOfficialPolicy(config);
  const records = extractOfficialAddressPolicyRows(policy.html, config);
  const maxConcurrency = Number(config?.pdok_max_concurrency || 4);
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 8) throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_CONCURRENCY_INVALID");
  const pdokPayloads = await boundedMap(records, maxConcurrency, (record) => fetchPdok(record, config));
  const bound = bindPdokCoordinatesWithBoundaries(records, pdokPayloads, config?.pdok_bounds);
  if (bound.records.length !== expectedRows) throw new Error(`OFFICIAL_ADDRESS_POLICY_PDOK_COVERAGE_INVALID:${bound.records.length}/${expectedRows}`);
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_id: requiredConfig(config, "source_id"),
    source_url: policy.url,
    source_document_sha256: policy.sha256,
    coordinate_authority: "PDOK Locatieserver / BAG",
    coordinate_url: text(config?.pdok_url) || DEFAULT_PDOK_URL,
    expected_current_policy_address_rows: expectedRows,
    exact_pdok_coordinate_rows: bound.exact_pdok_coordinate_rows,
    blocked_pdok_coordinate_ambiguity_rows: bound.blocked_pdok_coordinate_ambiguity_rows,
    records: bound.records,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const digest = sha256(serialized);
  if (!writeRequested) {
    console.log(`OFFICIAL_ADDRESS_POLICY_PDOK_DRY_RUN source=${output.source_id} rows=${bound.records.length}/${expectedRows} exact=${bound.exact_pdok_coordinate_rows} blocked_coordinate_ambiguity=${bound.blocked_pdok_coordinate_ambiguity_rows} sha256=${digest}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("OFFICIAL_ADDRESS_POLICY_PDOK_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const outputPath = repositoryPath(requiredConfig(config, "output_path"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`OFFICIAL_ADDRESS_POLICY_PDOK_WRITTEN source=${output.source_id} rows=${bound.records.length}/${expectedRows} exact=${bound.exact_pdok_coordinate_rows} blocked_coordinate_ambiguity=${bound.blocked_pdok_coordinate_ambiguity_rows} sha256=${digest} output=${path.relative(ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

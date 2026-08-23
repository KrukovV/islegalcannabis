#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, encoded) => {
      const number = String(encoded).toLowerCase().startsWith("x")
        ? Number.parseInt(String(encoded).slice(1), 16)
        : Number.parseInt(String(encoded), 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : " ";
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function visibleText(value) {
  return text(decodeHtml(String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")));
}

function header(value) {
  return visibleText(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export function normalizedOrganizationName(value) {
  return visibleText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function tableRows(html) {
  return [...String(html || "").matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)].map((match) => {
    const rows = [...match[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => visibleText(cell[1]))
    ).filter((row) => row.length > 0);
    return { id: text(match[1].match(/\bid=["']([^"']+)/i)?.[1]), rows };
  }).filter((table) => table.rows.length > 0);
}

function findTable(tables, requiredHeaders, label) {
  const required = requiredHeaders.map(header);
  const matches = tables.filter((table) => required.every((name) => table.rows[0].map(header).includes(name)));
  if (matches.length !== 1) throw new Error(`AUTHORIZED_LOCATION_TABLE_${label}_TABLE_AMBIGUOUS_OR_MISSING:${matches.length}`);
  const headers = matches[0].rows[0].map(header);
  return matches[0].rows.slice(1).map((values) => Object.fromEntries(headers.map((name, index) => [name, text(values[index])])));
}

function sectionHtml(html, heading) {
  const expected = text(heading);
  if (!expected) return String(html || "");
  const headings = [...String(html || "").matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => ({ start: match.index, end: match.index + match[0].length, value: visibleText(match[2]) }));
  const matches = headings.filter((item) => item.value === expected);
  if (matches.length !== 1) throw new Error(`PUBLIC_LOCATION_TABLE_SECTION_HEADING_AMBIGUOUS_OR_MISSING:${matches.length}`);
  const current = matches[0];
  const next = headings.find((item) => item.start > current.end);
  return String(html || "").slice(current.end, next?.start);
}

function field(row, name) {
  const value = text(row?.[header(name)]);
  if (!value) throw new Error(`AUTHORIZED_LOCATION_TABLE_REQUIRED_FIELD_MISSING:${header(name)}`);
  return value;
}

function sourceRecordId(licenseNumber, location) {
  return [licenseNumber, location.address, location.city, location.postal_code].map(normalizedOrganizationName).join(":");
}

function publicTableSourceRecordId(record, identityFields) {
  return identityFields.map((name) => normalizedOrganizationName(record[name])).join(":");
}

/**
 * Extract one publicly listed, regulator-authorized location table without
 * assuming that the regulator publishes a licence number, ZIP code or map
 * coordinate. The explicit identity fields are deliberately supplied by the
 * source configuration: a source-row identity is retention provenance, never
 * a substitute for a licence or a coordinate visibility gate.
 */
export function extractPublicLocationTable(html, config) {
  const locationHeaders = config?.public_location_headers;
  const identityFields = Array.isArray(config?.identity_fields) ? config.identity_fields.map(text).filter(Boolean) : [];
  const requiredFields = Array.isArray(config?.required_fields) ? config.required_fields.map(text).filter(Boolean) : [];
  const duplicateIdentityMode = text(config?.duplicate_identity_mode).toUpperCase();
  const configuredFields = Object.keys(locationHeaders || {});
  if (!locationHeaders || configuredFields.length === 0 || identityFields.length === 0 || !text(config?.country)) {
    throw new Error("PUBLIC_LOCATION_TABLE_CONFIG_INVALID");
  }
  if (duplicateIdentityMode && duplicateIdentityMode !== "SOURCE_ROW_OCCURRENCE") {
    throw new Error("PUBLIC_LOCATION_TABLE_DUPLICATE_IDENTITY_MODE_INVALID");
  }
  if (identityFields.some((name) => !Object.hasOwn(locationHeaders, name)) || requiredFields.some((name) => !Object.hasOwn(locationHeaders, name))) {
    throw new Error("PUBLIC_LOCATION_TABLE_FIELD_CONFIG_INVALID");
  }
  const rows = findTable(tableRows(sectionHtml(html, config?.section_heading)), Object.values(locationHeaders), "PUBLIC_LOCATION");
  const identityOccurrences = new Map();
  const records = rows.map((row) => {
    const extracted = Object.fromEntries(configuredFields.map((name) => [name, text(row?.[header(locationHeaders[name])])]));
    for (const name of requiredFields) {
      if (!extracted[name]) throw new Error(`PUBLIC_LOCATION_TABLE_REQUIRED_FIELD_MISSING:${name.toUpperCase()}`);
    }
    const baseSourceRecord = publicTableSourceRecordId(extracted, identityFields);
    if (!baseSourceRecord || baseSourceRecord.split(":").some((value) => !value)) {
      throw new Error("PUBLIC_LOCATION_TABLE_IDENTITY_FIELD_MISSING");
    }
    const occurrence = (identityOccurrences.get(baseSourceRecord) || 0) + 1;
    identityOccurrences.set(baseSourceRecord, occurrence);
    if (occurrence > 1 && duplicateIdentityMode !== "SOURCE_ROW_OCCURRENCE") {
      throw new Error(`PUBLIC_LOCATION_TABLE_DUPLICATE_SOURCE_ROW:${baseSourceRecord}`);
    }
    const sourceRecord = duplicateIdentityMode === "SOURCE_ROW_OCCURRENCE"
      ? `${baseSourceRecord}:ROW:${occurrence}`
      : baseSourceRecord;
    return {
      source_record_id: sourceRecord,
      legal_name: extracted.legal_name || "",
      trade_name: extracted.trade_name || "",
      license_number: extracted.license_number || "",
      license_type: text(config.license_type),
      store_type: text(config.store_type),
      address: extracted.address || "",
      city: extracted.city || "",
      region: extracted.region || text(config.region),
      postal_code: extracted.postal_code || "",
      country: text(config.country),
      license_status: text(config.license_status || "UNKNOWN_STATUS"),
      operational_status: text(config.operational_status || "UNKNOWN_STATUS"),
      ...(config.medical === true ? { medical: true } : {}),
      ...(config.adult_use === true ? { adult_use: true } : {}),
      confidence: text(config.confidence || "UNKNOWN"),
      coordinates_source: text(config.coordinates_source || "UNKNOWN"),
      coordinates_confidence: text(config.coordinates_confidence || "UNKNOWN"),
      location_evidence: text(config.location_evidence || "UNKNOWN"),
    };
  });
  if (records.length === 0) throw new Error("PUBLIC_LOCATION_TABLE_SELECTION_EMPTY");
  return {
    records: records.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id)),
    counts: {
      table_records: rows.length,
      retained_public_locations: records.length,
      duplicate_identity_rows: [...identityOccurrences.values()].filter((count) => count > 1).reduce((total, count) => total + count, 0),
    },
  };
}

export function extractAuthorizedLocationTables(html, config) {
  const authorityHeaders = config?.authority_headers;
  const locationHeaders = config?.location_headers;
  const acceptedAuthorizationStatuses = new Set((config?.accepted_authorization_statuses || []).map(header));
  if (!authorityHeaders || !locationHeaders || acceptedAuthorizationStatuses.size === 0) {
    throw new Error("AUTHORIZED_LOCATION_TABLE_CONFIG_INVALID");
  }
  const tables = tableRows(html);
  const authorityRows = findTable(tables, Object.values(authorityHeaders), "AUTHORIZATION");
  const locationRows = findTable(tables, Object.values(locationHeaders), "LOCATION");
  const authorizationByName = new Map();
  for (const row of authorityRows) {
    const legalName = field(row, authorityHeaders.legal_name);
    const authorizationStatus = field(row, authorityHeaders.authorization_status);
    const licenseNumber = field(row, authorityHeaders.license_number);
    const nameKey = normalizedOrganizationName(legalName);
    if (!nameKey) throw new Error("AUTHORIZED_LOCATION_TABLE_AUTHORIZATION_NAME_INVALID");
    if (authorizationByName.has(nameKey)) throw new Error(`AUTHORIZED_LOCATION_TABLE_DUPLICATE_AUTHORIZATION_NAME:${nameKey}`);
    authorizationByName.set(nameKey, { legal_name: legalName, authorization_status: authorizationStatus, license_number: licenseNumber });
  }

  const records = [];
  let excludedUnmatchedAuthorization = 0;
  const identities = new Set();
  for (const row of locationRows) {
    const legalName = field(row, locationHeaders.legal_name);
    const location = {
      address: field(row, locationHeaders.address),
      city: field(row, locationHeaders.city),
      postal_code: field(row, locationHeaders.postal_code),
    };
    const authorization = authorizationByName.get(normalizedOrganizationName(legalName));
    if (!authorization || !acceptedAuthorizationStatuses.has(header(authorization.authorization_status))) {
      excludedUnmatchedAuthorization += 1;
      continue;
    }
    const id = sourceRecordId(authorization.license_number, location);
    if (identities.has(id)) throw new Error(`AUTHORIZED_LOCATION_TABLE_DUPLICATE_LOCATION:${id}`);
    identities.add(id);
    records.push({
      source_record_id: id,
      legal_name: authorization.legal_name,
      trade_name: legalName,
      license_number: authorization.license_number,
      license_type: authorization.authorization_status,
      store_type: text(config.store_type),
      ...location,
      region: text(config.region),
      country: text(config.country),
      license_status: text(config.license_status || "ACTIVE"),
      operational_status: text(config.operational_status || "UNKNOWN_STATUS"),
    });
  }
  if (records.length === 0) throw new Error("AUTHORIZED_LOCATION_TABLE_SELECTION_EMPTY");
  return {
    records: records.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id)),
    counts: {
      authorization_records: authorityRows.length,
      accepted_authorizations: [...authorizationByName.values()].filter((item) => acceptedAuthorizationStatuses.has(header(item.authorization_status))).length,
      location_records: locationRows.length,
      retained_authorized_locations: records.length,
      blocked_unmatched_or_ineligible_authorization: excludedUnmatchedAuthorization,
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function repositoryPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("AUTHORIZED_LOCATION_TABLE_PATH_MUST_BE_WITHIN_REPOSITORY");
  return absolute;
}

function readableInputPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  const insideRepository = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (insideRepository) return absolute;
  // A certificate-validating transport may be available outside the Node
  // runtime. The caller must explicitly bind that ephemeral C1 capture to an
  // HTTPS source URL; the external path is never written into the snapshot.
  if (process.argv.includes("--allow-external-input") && argument("--source-url")) return absolute;
  throw new Error("AUTHORIZED_LOCATION_TABLE_PATH_MUST_BE_WITHIN_REPOSITORY");
}

async function main() {
  const inputArgument = argument("--input");
  const sourceUrl = argument("--source-url");
  if ((!inputArgument && !sourceUrl) || !argument("--config") || !argument("--output")) {
    throw new Error("AUTHORIZED_LOCATION_TABLE_USAGE:(--input <html-path> [--source-url <https-url>]|--source-url <https-url>) --config <json-path> --output <json-path> [--write]");
  }
  const configPath = repositoryPath(argument("--config"));
  const outputPath = repositoryPath(argument("--output"));
  let inputPath = "";
  let resolvedSourceUrl = "";
  let html = "";
  if (inputArgument) {
    inputPath = readableInputPath(inputArgument);
    html = fs.readFileSync(inputPath, "utf8");
    if (sourceUrl) {
      if (new URL(sourceUrl).protocol !== "https:") throw new Error("AUTHORIZED_LOCATION_TABLE_SOURCE_URL_MUST_USE_HTTPS");
      resolvedSourceUrl = sourceUrl;
    }
  } else {
    if (new URL(sourceUrl).protocol !== "https:") throw new Error("AUTHORIZED_LOCATION_TABLE_SOURCE_URL_MUST_USE_HTTPS");
    const response = await fetch(sourceUrl, { headers: { accept: "text/html" }, redirect: "follow" });
    if (!response.ok) throw new Error(`AUTHORIZED_LOCATION_TABLE_SOURCE_HTTP_${response.status}`);
    if (!text(response.headers.get("content-type")).toLowerCase().includes("text/html")) throw new Error("AUTHORIZED_LOCATION_TABLE_SOURCE_NOT_HTML");
    resolvedSourceUrl = response.url;
    html = await response.text();
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const extracted = config.public_location_headers
    ? extractPublicLocationTable(html, config)
    : extractAuthorizedLocationTables(html, config);
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    ...(inputPath && !path.relative(ROOT, inputPath).startsWith("..") ? { input_path: path.relative(ROOT, inputPath) } : {}),
    ...(resolvedSourceUrl ? { source_url: resolvedSourceUrl } : {}),
    input_sha256: crypto.createHash("sha256").update(html).digest("hex"),
    ...extracted,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const outputSha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`AUTHORIZED_LOCATION_TABLE_DRY_RUN retained=${extracted.records.length} blocked=${extracted.counts.blocked_unmatched_or_ineligible_authorization} sha256=${outputSha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("AUTHORIZED_LOCATION_TABLE_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  const blocked = extracted.counts.blocked_unmatched_or_ineligible_authorization ?? (extracted.counts.table_records - extracted.counts.retained_public_locations);
  console.log(`AUTHORIZED_LOCATION_TABLE_WRITTEN retained=${extracted.records.length} blocked=${blocked} output=${path.relative(ROOT, outputPath)} sha256=${outputSha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

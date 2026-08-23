#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function valueAt(value, dottedPath) {
  let current = value;
  for (const segment of text(dottedPath).split(".").filter(Boolean)) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function drupalSettings(html) {
  const matched = String(html || "").match(/<script\b[^>]*data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!matched) throw new Error("EMBEDDED_LICENSE_REGISTRY_DRUPAL_SETTINGS_NOT_FOUND");
  try {
    return JSON.parse(matched[1]);
  } catch {
    throw new Error("EMBEDDED_LICENSE_REGISTRY_DRUPAL_SETTINGS_INVALID_JSON");
  }
}

function asDate(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function publicRecord(row) {
  return {
    source_record_id: text(row.recordId),
    business_name: text(row.businessName),
    business_type: text(row.businessType),
    license_number: text(row.licenseNumber),
    license_issue_date: text(row.licenseIssueDate),
    license_expiration_date: text(row.licenseExpirationDate),
    physical_address: text(row.physicalAddress),
  };
}

export function extractCurrentOfficialEmbeddedLicenseRegistry({ html, settingsPath, typeField, typeValue, now = new Date() }) {
  const settings = drupalSettings(html);
  const encoded = valueAt(settings, settingsPath);
  if (typeof encoded !== "string" || !encoded.trim()) throw new Error("EMBEDDED_LICENSE_REGISTRY_PAYLOAD_MISSING");
  let payload;
  try {
    payload = JSON.parse(encoded);
  } catch {
    throw new Error("EMBEDDED_LICENSE_REGISTRY_PAYLOAD_INVALID_JSON");
  }
  const rows = Array.isArray(payload?.records) ? payload.records : null;
  const totalRecords = Number(payload?.totalRecords);
  const filteredRecords = Number(payload?.filteredRecords);
  const totalPages = Number(payload?.totalPages);
  const pageSize = Number(payload?.pageSize);
  if (!rows || !Number.isInteger(totalRecords) || totalRecords < 1 || filteredRecords !== totalRecords || totalPages !== 1 || pageSize !== totalRecords || rows.length !== totalRecords) {
    throw new Error("EMBEDDED_LICENSE_REGISTRY_NOT_A_COMPLETE_SINGLE_PAGE_DIRECTORY");
  }
  const selected = rows
    .filter((row) => text(row?.[typeField]) === text(typeValue))
    .map(publicRecord)
    .filter((row) => {
      const issued = asDate(row.license_issue_date);
      const expires = asDate(row.license_expiration_date);
      return Boolean(
        row.source_record_id && row.business_name && row.license_number && row.physical_address && issued && expires &&
        issued.getTime() <= now.getTime() && expires.getTime() >= now.getTime(),
      );
    })
    .sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
  if (selected.length === 0) throw new Error("EMBEDDED_LICENSE_REGISTRY_CURRENT_SELECTION_EMPTY");
  const ids = new Set(selected.map((row) => row.source_record_id));
  if (ids.size !== selected.length) throw new Error("EMBEDDED_LICENSE_REGISTRY_DUPLICATE_SOURCE_RECORD_ID");
  return {
    source_payload: {
      total_records: totalRecords,
      filtered_records: filteredRecords,
      total_pages: totalPages,
      page_size: pageSize,
    },
    selection: {
      field: text(typeField),
      equals: text(typeValue),
      current_license_window: "ISSUED_ON_OR_BEFORE_FETCH_AND_EXPIRING_ON_OR_AFTER_FETCH",
    },
    records: selected,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function repositoryPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("EMBEDDED_LICENSE_REGISTRY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  return absolute;
}

async function main() {
  const sourceUrl = argument("--source-url");
  const settingsPath = argument("--settings-path");
  const typeField = argument("--type-field");
  const typeValue = argument("--type-value");
  const output = argument("--output");
  if (!sourceUrl || !settingsPath || !typeField || !typeValue || !output) {
    throw new Error("EMBEDDED_LICENSE_REGISTRY_USAGE:--source-url <https-url> --settings-path <path> --type-field <field> --type-value <value> --output <repo-relative-json> [--write]");
  }
  if (new URL(sourceUrl).protocol !== "https:") throw new Error("EMBEDDED_LICENSE_REGISTRY_SOURCE_URL_MUST_USE_HTTPS");
  const outputPath = repositoryPath(output);
  const response = await fetch(sourceUrl, { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`EMBEDDED_LICENSE_REGISTRY_HTTP_${response.status}`);
  const html = await response.text();
  const extracted = extractCurrentOfficialEmbeddedLicenseRegistry({ html, settingsPath, typeField, typeValue });
  const payload = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    local_only: true,
    source_url: response.url,
    source_html_sha256: sha256(html),
    ...extracted,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const outputSha256 = sha256(serialized);
  if (!process.argv.includes("--write")) {
    console.log(`EMBEDDED_LICENSE_REGISTRY_DRY_RUN records=${payload.records.length} source_records=${payload.source_payload.total_records} sha256=${outputSha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("EMBEDDED_LICENSE_REGISTRY_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`EMBEDDED_LICENSE_REGISTRY_WRITTEN records=${payload.records.length} source_records=${payload.source_payload.total_records} sha256=${outputSha256} output=${path.relative(ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value || "")
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, " ")
    .trim();
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
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalized(value) {
  return text(decodeHtml(value)).toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function stableId(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function findSettings(html) {
  const matched = String(html || "").match(/<script\b[^>]*data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!matched) throw new Error("DRUPAL_GEOFIELD_DIRECTORY_SETTINGS_NOT_FOUND");
  try {
    return JSON.parse(matched[1]);
  } catch {
    throw new Error("DRUPAL_GEOFIELD_DIRECTORY_SETTINGS_INVALID_JSON");
  }
}

function locationDetails(detailHtml) {
  const html = String(detailHtml || "");
  const type = html.match(/page-header-content__top-hat[^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const title = html.match(/<h1\b[^>]*id=["']page-title["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const address = html.match(/field--name-field-location__address[\s\S]{0,2000}?<span\b[^>]*class=["'][^"']*address-line1[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]{0,1200}?<span\b[^>]*class=["'][^"']*locality[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]{0,300}?<span\b[^>]*class=["'][^"']*administrative-area[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]{0,300}?<span\b[^>]*class=["'][^"']*postal-code[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (!address) throw new Error("DRUPAL_GEOFIELD_LOCATION_ADDRESS_NOT_FOUND");
  return {
    legal_name: text(decodeHtml(title)),
    type_label: text(decodeHtml(type)),
    address: text(decodeHtml(address[1])),
    city: text(decodeHtml(address[2])),
    region: text(decodeHtml(address[3])),
    postal_code: text(decodeHtml(address[4])),
  };
}

function featurePath(feature) {
  const raw = String(feature?.properties?.description || feature?.properties?.data?.title || "");
  const match = raw.match(/href=\\?"([^"?#]+)\\?"/i);
  if (!match?.[1]) throw new Error("DRUPAL_GEOFIELD_FEATURE_DETAIL_LINK_MISSING");
  const href = decodeHtml(match[1]);
  if (!href.startsWith("/")) throw new Error("DRUPAL_GEOFIELD_FEATURE_DETAIL_LINK_NOT_LOCAL");
  return href;
}

function validCoordinates(coordinates) {
  const longitude = Number(coordinates?.[0]);
  const latitude = Number(coordinates?.[1]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

export function extractDrupalGeofieldLocationDirectory({ directoryHtml, detailsByPath, geoId, country, storeType, licenseType, regulatorUrl, expectedTypeLabel, expectedCount, legalGate }) {
  const settings = findSettings(directoryHtml);
  const maps = Object.values(settings.geofield_google_map || {});
  const features = maps.flatMap((map) => Array.isArray(map?.data?.features) ? map.data.features : []);
  if (features.length !== expectedCount) throw new Error(`DRUPAL_GEOFIELD_DIRECTORY_UNEXPECTED_FEATURE_COUNT:${features.length}/${expectedCount}`);
  const records = features.map((feature) => {
    const sourcePath = featurePath(feature);
    const detailsHtml = detailsByPath?.[sourcePath];
    if (!detailsHtml) throw new Error(`DRUPAL_GEOFIELD_LOCATION_DETAIL_MISSING:${sourcePath}`);
    const details = locationDetails(detailsHtml);
    const coordinates = validCoordinates(feature?.geometry?.coordinates);
    if (!coordinates) throw new Error(`DRUPAL_GEOFIELD_LOCATION_COORDINATES_INVALID:${sourcePath}`);
    const featureName = normalized(feature?.properties?.tooltip);
    if (!featureName || featureName !== normalized(details.legal_name)) {
      throw new Error(`DRUPAL_GEOFIELD_LOCATION_NAME_MISMATCH:${sourcePath}`);
    }
    if (normalized(details.type_label) !== normalized(expectedTypeLabel)) {
      throw new Error(`DRUPAL_GEOFIELD_LOCATION_TYPE_MISMATCH:${sourcePath}`);
    }
    if (!details.address || !details.city || !details.region || !details.postal_code) {
      throw new Error(`DRUPAL_GEOFIELD_LOCATION_ADDRESS_INCOMPLETE:${sourcePath}`);
    }
    return {
      source_record_id: text(feature?.properties?.entity_id) || stableId([geoId, sourcePath].join("|")),
      geo_id: geoId,
      legal_name: details.legal_name,
      trade_name: "",
      license_number: "",
      license_type: licenseType,
      store_type: storeType,
      address: details.address,
      city: details.city,
      region: details.region,
      postal_code: details.postal_code,
      country,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      official_website: "",
      regulator_url: `${new URL(sourcePath, regulatorUrl).toString()}`,
      license_status: "ACTIVE",
      operational_status: "ACTIVE",
      medical: storeType === "MEDICAL_DISPENSARY",
      adult_use: storeType === "ADULT_USE_RETAIL",
      confidence: "STRONG",
      coordinates_source: "OFFICIAL_DIRECTORY_GEOFIELD",
      coordinates_confidence: "PROVEN",
      location_evidence: "STRONG",
      legal_gate: legalGate,
    };
  });
  const unique = new Set(records.map((record) => `${normalized(record.legal_name)}|${normalized(record.address)}|${record.latitude}|${record.longitude}`));
  if (unique.size !== records.length) throw new Error("DRUPAL_GEOFIELD_DIRECTORY_DUPLICATE_RECORDS");
  return records;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function required(name) {
  const value = arg(name);
  if (!value) throw new Error(`DRUPAL_GEOFIELD_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
  return value;
}

function repositoryPath(value, field) {
  const resolved = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`DRUPAL_GEOFIELD_DIRECTORY_${field}_MUST_BE_WITHIN_REPOSITORY`);
  return resolved;
}

function readablePath(value, field) {
  const resolved = path.resolve(ROOT, value);
  if (!fs.existsSync(resolved)) throw new Error(`DRUPAL_GEOFIELD_DIRECTORY_${field}_NOT_FOUND`);
  return resolved;
}

function main() {
  const directory = readablePath(required("--directory"), "DIRECTORY");
  const detailsDir = readablePath(required("--details-dir"), "DETAILS_DIR");
  const output = repositoryPath(required("--output"), "OUTPUT");
  const geoId = required("--geo").toUpperCase();
  const country = required("--country").toUpperCase();
  const storeType = required("--store-type").toUpperCase();
  const licenseType = required("--license-type");
  const regulatorUrl = required("--regulator-url");
  const expectedTypeLabel = required("--expected-type-label");
  const expectedCount = Number.parseInt(required("--expected-count"), 10);
  if (!Number.isInteger(expectedCount) || expectedCount < 1) throw new Error("DRUPAL_GEOFIELD_DIRECTORY_EXPECTED_COUNT_INVALID");
  const detailsByPath = {};
  for (const fileName of fs.readdirSync(detailsDir).sort()) {
    if (!fileName.endsWith(".html")) continue;
    detailsByPath[`/locations/${path.basename(fileName, ".html")}`] = fs.readFileSync(path.join(detailsDir, fileName), "utf8");
  }
  const legalGate = {
    geo_access_legal: true,
    store_type_legal: true,
    store_type_eligibility_ref: required("--eligibility-ref"),
    store_type_eligibility_fingerprint: required("--eligibility-fingerprint"),
    canonical_truth_ref: required("--canonical-truth-ref"),
    canonical_truth_fingerprint: required("--canonical-truth-fingerprint"),
    evidence_basis: required("--evidence-basis"),
  };
  const records = extractDrupalGeofieldLocationDirectory({
    directoryHtml: fs.readFileSync(directory, "utf8"),
    detailsByPath,
    geoId,
    country,
    storeType,
    licenseType,
    regulatorUrl,
    expectedTypeLabel,
    expectedCount,
    legalGate,
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(records, null, 2)}\n`);
  console.log(`DRUPAL_GEOFIELD_DIRECTORY_EXTRACTED geo=${geoId} records=${records.length} output=${path.relative(ROOT, output)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

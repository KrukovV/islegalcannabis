#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MARYLAND_BOUNDS = Object.freeze({ west: -80, east: -74, south: 37, north: 40.5 });

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function normalized(value) {
  return upper(value).replace(/[^A-Z0-9]+/g, "");
}

function validCoordinate(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum;
}

function inMarylandEnvelope(longitude, latitude) {
  return validCoordinate(longitude, MARYLAND_BOUNDS.west, MARYLAND_BOUNDS.east) &&
    validCoordinate(latitude, MARYLAND_BOUNDS.south, MARYLAND_BOUNDS.north);
}

function entityDecode(value) {
  return String(value || "")
    .replace(/&#58;|&colon;/gi, ":")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function locatorAppId(html) {
  const match = String(html || "").match(/https(?:&#58;|:)[^"'\s]*maryland\.maps\.arcgis\.com\/apps\/instant\/basic\/index\.html\?appid=([a-f0-9]{32})/i);
  return text(match?.[1]);
}

function locatorPageIsCurrentLicensedDirectory(html, expectedAppId) {
  const source = entityDecode(String(html || ""));
  const updated = source.match(/Updated\s+\d{1,2}\/\d{1,2}\/20\d{2}/i)?.[0] || "";
  if (!/Find a Licensed Dispensary/i.test(source) || !/View Dispensary Map/i.test(source) || !updated) {
    throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_LOCATOR_CONTRACT_MISSING");
  }
  const actualAppId = locatorAppId(source);
  if (!actualAppId || actualAppId.toLowerCase() !== text(expectedAppId).toLowerCase()) {
    throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_LOCATOR_APP_ID_MISMATCH");
  }
  return updated;
}

function mapConfigIsMcaLicensedDispensaryMap(appData, expectedFeatureServiceUrl) {
  const values = appData?.values;
  const expectedUrl = text(expectedFeatureServiceUrl).replace(/\/$/, "").toLowerCase();
  const sourceUrl = text(values?.searchConfiguration?.sources?.find((source) => text(source?.name) === "Licensed Dispensaries")?.layer?.url)
    .replace(/\/$/, "")
    .toLowerCase();
  if (!values || !text(values?.webmap) || sourceUrl !== expectedUrl ||
    !/Maryland Cannabis Administration/i.test(text(values?.mapA11yDesc)) ||
    !/MCA Licensed Dispensaries List/i.test(text(values?.searchConfiguration?.sources?.find((source) => text(source?.name) === "Licensed Dispensaries")?.popupTemplate?.title))) {
    throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_MAP_CONFIG_CONTRACT_MISSING");
  }
}

function publicAddress(attributes) {
  return text([attributes?.Address, attributes?.Address_2].filter((value) => text(value)).join(" "));
}

function canonicalFeature(feature, expectedFeatureServiceUrl) {
  const attributes = feature?.attributes || {};
  const licenseNumber = text(attributes.license_number);
  const objectId = text(attributes.ObjectId);
  const legalName = text(attributes.name);
  const tradeName = text(attributes.dba);
  const address = publicAddress(attributes);
  const city = text(attributes.City);
  const postalCode = text(attributes.Zip).padStart(5, "0");
  const longitude = Number(feature?.geometry?.x);
  const latitude = Number(feature?.geometry?.y);
  if (!licenseNumber || !objectId || !legalName || !tradeName || !address || !city || !postalCode ||
    upper(attributes.State) !== "MARYLAND" || upper(attributes.au_med) !== "MEDICAL & ADULT-USE" ||
    !inMarylandEnvelope(longitude, latitude)) {
    return null;
  }
  return {
    source_record_id: `MCA_LICENSED_DISPENSARY_MAP:${objectId}:LICENSE:${licenseNumber}`,
    legal_name: legalName,
    trade_name: tradeName,
    license_number: licenseNumber,
    license_type: text(attributes.Licensee_Type) || "MCA Licensed Dispensary",
    store_type: "ADULT_USE_RETAIL",
    address,
    city,
    region: "MD",
    postal_code: postalCode,
    country: "US",
    latitude,
    longitude,
    regulator_url: "https://cannabis.maryland.gov/Pages/Dispensary-Locator.aspx",
    license_status: "ACTIVE",
    operational_status: "UNKNOWN_STATUS",
    adult_use: true,
    medical: true,
    confidence: "PROVEN",
    coordinates_source: "OFFICIAL_MCA_CURRENT_LICENSED_DISPENSARY_MAP_FEATURE_COORDINATES",
    coordinates_confidence: "PROVEN",
    location_evidence: "STRONG",
    public_source_fields: {
      current_license_status: "LISTED_ON_CURRENT_MCA_LICENSED_DISPENSARY_MAP",
      marketplace: text(attributes.au_med),
      licensee_type: text(attributes.Licensee_Type),
    },
  };
}

export function selectMcaCurrentLicensedDispensaries({ locatorHtml, appData, featureSet, expectedAppId, expectedFeatureServiceUrl }) {
  const locatorUpdated = locatorPageIsCurrentLicensedDirectory(locatorHtml, expectedAppId);
  mapConfigIsMcaLicensedDispensaryMap(appData, expectedFeatureServiceUrl);
  const features = featureSet?.features;
  if (!Array.isArray(features) || featureSet?.exceededTransferLimit === true || features.length === 0) {
    throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_FEATURES_INCOMPLETE");
  }
  const recordsByLicense = new Map();
  let invalidFeaturesBlocked = 0;
  for (const feature of features) {
    const record = canonicalFeature(feature, expectedFeatureServiceUrl);
    if (!record) {
      invalidFeaturesBlocked += 1;
      continue;
    }
    const key = normalized(record.license_number);
    const prior = recordsByLicense.get(key);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(record)) throw new Error(`MCA_CURRENT_LICENSED_DISPENSARY_LICENSE_CONFLICT:${key}`);
      throw new Error(`MCA_CURRENT_LICENSED_DISPENSARY_LICENSE_DUPLICATE:${key}`);
    }
    recordsByLicense.set(key, record);
  }
  const records = [...recordsByLicense.values()].sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
  if (records.length === 0) throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_SELECTION_EMPTY");
  return {
    locator_updated_label: locatorUpdated,
    records,
    counts: {
      feature_rows_returned: features.length,
      invalid_or_noncurrent_features_blocked: invalidFeaturesBlocked,
      current_licensed_adult_and_medical_dispensaries: records.length,
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function withinRepository(filePath) {
  const relative = path.relative(ROOT, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function fetchJson(url, label) {
  const response = await fetch(url, { headers: { accept: "application/json" }, redirect: "follow" });
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label}_JSON_INVALID`);
  }
  return { response, bytes, payload, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

async function fetchHtml(url, label) {
  const response = await fetch(url, { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, bytes, html: bytes.toString("utf8"), sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

async function main() {
  const locatorUrl = argument("--locator-url");
  const appId = argument("--app-id");
  const featureUrl = argument("--feature-url");
  const output = argument("--output");
  if (!locatorUrl || !appId || !featureUrl || !output) {
    throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_USAGE:--locator-url <https-html> --app-id <arcgis-item-id> --feature-url <https-json> --output <repo-relative-json> [--write]");
  }
  for (const url of [locatorUrl, featureUrl]) {
    if (new URL(url).protocol !== "https:") throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_SOURCE_URL_MUST_USE_HTTPS");
  }
  if (!/^[a-f0-9]{32}$/i.test(appId)) throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_APP_ID_INVALID");
  const outputPath = path.resolve(ROOT, output);
  if (!withinRepository(outputPath)) throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  const appBaseUrl = `https://maryland.maps.arcgis.com/sharing/rest/content/items/${appId}`;
  const [locator, appMetadata, appData, featureSet] = await Promise.all([
    fetchHtml(locatorUrl, "MCA_CURRENT_LICENSED_DISPENSARY_LOCATOR"),
    fetchJson(`${appBaseUrl}?f=json`, "MCA_CURRENT_LICENSED_DISPENSARY_APP_METADATA"),
    fetchJson(`${appBaseUrl}/data?f=json`, "MCA_CURRENT_LICENSED_DISPENSARY_APP_DATA"),
    fetchJson(featureUrl, "MCA_CURRENT_LICENSED_DISPENSARY_FEATURES"),
  ]);
  if (text(appMetadata.payload?.id).toLowerCase() !== appId.toLowerCase() ||
    !/MCA Dispensary Map/i.test(text(appMetadata.payload?.title)) ||
    !/Maryland Cannabis Administration/i.test(text(appMetadata.payload?.description)) ||
    !/maryland\.gov/i.test(text(appMetadata.payload?.owner))) {
    throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_APP_METADATA_CONTRACT_MISSING");
  }
  const selected = selectMcaCurrentLicensedDispensaries({
    locatorHtml: locator.html,
    appData: appData.payload,
    featureSet: featureSet.payload,
    expectedAppId: appId,
    expectedFeatureServiceUrl: featureUrl.replace(/\/0\/query\?.*$/i, "").replace(/\/$/, ""),
  });
  const payload = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    local_only: true,
    source: "CURRENT_MCA_LICENSED_DISPENSARY_LOCATOR_LINKED_TO_MCA_OWNED_ARCGIS_APP_AND_FEATURE_SERVICE",
    locator_dataset: { url: locator.response.url, content_sha256: locator.sha256, updated_label: selected.locator_updated_label },
    app_metadata: { url: appMetadata.response.url, content_sha256: appMetadata.sha256, modified: appMetadata.payload?.modified || null },
    app_configuration: { url: appData.response.url, content_sha256: appData.sha256, webmap: appData.payload?.values?.webmap || null },
    feature_dataset: { url: featureSet.response.url, content_sha256: featureSet.sha256 },
    counts: selected.counts,
    records: selected.records,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`MCA_CURRENT_LICENSED_DISPENSARY_DRY_RUN records=${selected.records.length} invalid_blocked=${selected.counts.invalid_or_noncurrent_features_blocked} sha256=${sha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("MCA_CURRENT_LICENSED_DISPENSARY_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`MCA_CURRENT_LICENSED_DISPENSARY_WRITTEN records=${selected.records.length} sha256=${sha256} output=${path.relative(ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function normalized(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function recordAddress(record) {
  return [record?.address, record?.city, record?.region, record?.postal_code].map(text).filter(Boolean).join(", ");
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
  return decodeHtml(String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function currentListingBlocks(currentPage, listing) {
  const itemTag = text(listing?.item_tag || "p").toLowerCase();
  const sectionStart = text(listing?.section_start);
  const sectionEnd = text(listing?.section_end);
  if (!/^[a-z][a-z0-9-]*$/.test(itemTag)) throw new Error("OFFICIAL_DIRECTORY_GEOCODE_LISTING_ITEM_TAG_INVALID");
  if (Boolean(sectionStart) !== Boolean(sectionEnd)) throw new Error("OFFICIAL_DIRECTORY_GEOCODE_LISTING_SECTION_BOUNDS_INCOMPLETE");

  let scopedPage = currentPage;
  if (sectionStart) {
    const lowerPage = currentPage.toLowerCase();
    const start = lowerPage.indexOf(sectionStart.toLowerCase());
    const end = start < 0 ? -1 : lowerPage.indexOf(sectionEnd.toLowerCase(), start + sectionStart.length);
    if (start < 0 || end < 0 || end <= start) throw new Error("OFFICIAL_DIRECTORY_GEOCODE_LISTING_SECTION_NOT_FOUND");
    scopedPage = currentPage.slice(start, end);
  }
  return [...scopedPage.matchAll(new RegExp(`<${itemTag}\\b[^>]*>([\\s\\S]*?)<\\/${itemTag}>`, "gi"))]
    .map((match) => normalized(visibleText(match[1])))
    .filter(Boolean);
}

function currentListingContainsRecord(listingBlocks, record) {
  const name = normalized(record?.legal_name);
  const address = normalized(recordAddress(record));
  return Boolean(name && address) && listingBlocks.some((block) => block.includes(name) && block.includes(address));
}

function censusMatch(record, payload, bounds) {
  const matches = Array.isArray(payload?.result?.addressMatches) ? payload.result.addressMatches : [];
  if (matches.length !== 1) return null;
  const match = matches[0] || {};
  const components = match.addressComponents || {};
  const longitude = Number(match?.coordinates?.x);
  const latitude = Number(match?.coordinates?.y);
  const sourceHouseNumber = text(record?.address).match(/^\s*(\d+[A-Z-]*)\b/i)?.[1]?.toUpperCase() || "";
  const matchedHouseNumber = text(match?.matchedAddress).match(/^\s*(\d+[A-Z-]*)\b/i)?.[1]?.toUpperCase() || "";
  const exactJurisdiction = text(components?.state).toUpperCase() === text(record?.region).toUpperCase() &&
    text(components?.zip) === text(record?.postal_code) &&
    normalized(components?.city) === normalized(record?.city);
  const inBounds = Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= bounds.west && longitude <= bounds.east && latitude >= bounds.south && latitude <= bounds.north;
  if (!exactJurisdiction || !sourceHouseNumber || sourceHouseNumber !== matchedHouseNumber || !inBounds) return null;
  return {
    latitude,
    longitude,
    matched_address: text(match?.matchedAddress),
    benchmark: text(payload?.result?.input?.benchmark?.benchmarkName) || "Public_AR_Current",
  };
}

export function selectCurrentOfficialDirectoryWithCensusGeocode({
  directoryRecords,
  currentDirectoryHtml,
  censusPayloadByRecordId,
  expectedCurrentListingCount,
  bounds,
  listing,
}) {
  if (!Array.isArray(directoryRecords) || directoryRecords.length === 0) {
    throw new Error("OFFICIAL_DIRECTORY_GEOCODE_INPUT_RECORDS_EMPTY");
  }
  if (!Number.isInteger(expectedCurrentListingCount) || expectedCurrentListingCount < 1) {
    throw new Error("OFFICIAL_DIRECTORY_GEOCODE_EXPECTED_LISTING_COUNT_INVALID");
  }
  if (![bounds?.west, bounds?.east, bounds?.south, bounds?.north].every(Number.isFinite)) {
    throw new Error("OFFICIAL_DIRECTORY_GEOCODE_BOUNDS_INVALID");
  }
  const currentPage = String(currentDirectoryHtml || "");
  // Validate the public text that a visitor sees, never a coincidental string
  // assembled from markup attributes between a business name and its address.
  const listingBlocks = currentListingBlocks(currentPage, listing);
  const currentListingCount = listing?.section_start
    ? listingBlocks.length
    : [...currentPage.matchAll(/fa-map-pin/gi)].length;
  if (currentListingCount !== expectedCurrentListingCount || directoryRecords.length !== expectedCurrentListingCount) {
    throw new Error(`OFFICIAL_DIRECTORY_GEOCODE_CURRENT_LISTING_COUNT_INVALID:${currentListingCount}/${directoryRecords.length}/${expectedCurrentListingCount}`);
  }

  const records = [];
  let notCurrentlyListed = 0;
  let noOneToOneGovernmentGeocode = 0;
  const identities = new Set();
  for (const original of directoryRecords) {
    const sourceRecordId = text(original?.source_record_id);
    if (!sourceRecordId || !currentListingContainsRecord(listingBlocks, original)) {
      notCurrentlyListed += 1;
      continue;
    }
    const geocode = censusMatch(original, censusPayloadByRecordId?.[sourceRecordId], bounds);
    if (!geocode) {
      noOneToOneGovernmentGeocode += 1;
      continue;
    }
    if (identities.has(sourceRecordId)) throw new Error(`OFFICIAL_DIRECTORY_GEOCODE_DUPLICATE_SOURCE_RECORD:${sourceRecordId}`);
    identities.add(sourceRecordId);
    records.push({
      ...original,
      latitude: geocode.latitude,
      longitude: geocode.longitude,
      coordinates_source: "OFFICIAL_ADDRESS_GEOCODED",
      coordinates_confidence: "STRONG",
      location_evidence: "STRONG",
      confidence: "STRONG",
      public_source_fields: {
        census_benchmark: geocode.benchmark,
        census_matched_address: geocode.matched_address,
      },
    });
  }
  if (records.length === 0) throw new Error("OFFICIAL_DIRECTORY_GEOCODE_SELECTION_EMPTY");
  return {
    records: records.sort((left, right) => text(left.source_record_id).localeCompare(text(right.source_record_id))),
    counts: {
      source_directory_records: directoryRecords.length,
      current_directory_listing_markers: currentListingCount,
      current_listing_records: directoryRecords.length - notCurrentlyListed,
      one_to_one_census_geocodes: records.length,
      blocked_not_currently_listed: notCurrentlyListed,
      blocked_geocode_mismatch_or_ambiguity: noOneToOneGovernmentGeocode,
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function required(name) {
  const value = argument(name);
  if (!value) throw new Error(`OFFICIAL_DIRECTORY_GEOCODE_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
  return value;
}

function integer(name) {
  const value = Number.parseInt(required(name), 10);
  if (!Number.isInteger(value) || value < 1) throw new Error(`OFFICIAL_DIRECTORY_GEOCODE_${name.slice(2).toUpperCase().replace(/-/g, "_")}_INVALID`);
  return value;
}

function number(name) {
  const value = Number(required(name));
  if (!Number.isFinite(value)) throw new Error(`OFFICIAL_DIRECTORY_GEOCODE_${name.slice(2).toUpperCase().replace(/-/g, "_")}_INVALID`);
  return value;
}

function repositoryPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("OFFICIAL_DIRECTORY_GEOCODE_PATH_MUST_BE_WITHIN_REPOSITORY");
  }
  return absolute;
}

async function fetchCurrentDirectory(url) {
  const response = await fetch(url, { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`OFFICIAL_DIRECTORY_GEOCODE_DIRECTORY_HTTP_${response.status}`);
  const contentType = text(response.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("text/html")) throw new Error("OFFICIAL_DIRECTORY_GEOCODE_DIRECTORY_NOT_HTML");
  const html = await response.text();
  return { url: response.url, html, sha256: sha256(html) };
}

async function fetchCensusPayload(record) {
  const url = new URL(CENSUS_GEOCODER_URL);
  url.searchParams.set("address", recordAddress(record));
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`OFFICIAL_DIRECTORY_GEOCODE_CENSUS_HTTP_${response.status}`);
  return response.json();
}

async function main() {
  const directoryUrl = required("--directory-url");
  const inputPath = repositoryPath(required("--input"));
  const outputPath = repositoryPath(required("--output"));
  const expectedCurrentListingCount = integer("--expected-current-listing-count");
  const listingSectionStart = argument("--listing-section-start");
  const listingSectionEnd = argument("--listing-section-end");
  const listingItemTag = argument("--listing-item-tag") || "p";
  const bounds = {
    west: number("--west"),
    east: number("--east"),
    south: number("--south"),
    north: number("--north"),
  };
  if (new URL(directoryUrl).protocol !== "https:") throw new Error("OFFICIAL_DIRECTORY_GEOCODE_DIRECTORY_URL_MUST_USE_HTTPS");
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!Array.isArray(input)) throw new Error("OFFICIAL_DIRECTORY_GEOCODE_INPUT_MUST_BE_ARRAY");
  const directory = await fetchCurrentDirectory(directoryUrl);
  const censusPayloadByRecordId = {};
  for (const record of input) {
    const sourceRecordId = text(record?.source_record_id);
    if (!sourceRecordId) throw new Error("OFFICIAL_DIRECTORY_GEOCODE_SOURCE_RECORD_ID_MISSING");
    censusPayloadByRecordId[sourceRecordId] = await fetchCensusPayload(record);
  }
  const selected = selectCurrentOfficialDirectoryWithCensusGeocode({
    directoryRecords: input,
    currentDirectoryHtml: directory.html,
    censusPayloadByRecordId,
    expectedCurrentListingCount,
    bounds,
    listing: {
      item_tag: listingItemTag,
      section_start: listingSectionStart,
      section_end: listingSectionEnd,
    },
  });
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    directory_url: directory.url,
    directory_sha256: directory.sha256,
    census_geocoder_url: CENSUS_GEOCODER_URL,
    census_benchmark: "Public_AR_Current",
    ...selected,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const outputSha256 = sha256(serialized);
  if (!process.argv.includes("--write")) {
    console.log(`OFFICIAL_DIRECTORY_GEOCODE_DRY_RUN records=${selected.records.length} blocked=${selected.counts.blocked_not_currently_listed + selected.counts.blocked_geocode_mismatch_or_ambiguity} sha256=${outputSha256} directory_sha256=${directory.sha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("OFFICIAL_DIRECTORY_GEOCODE_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`OFFICIAL_DIRECTORY_GEOCODE_WRITTEN records=${selected.records.length} blocked=${selected.counts.blocked_not_currently_listed + selected.counts.blocked_geocode_mismatch_or_ambiguity} output=${path.relative(ROOT, outputPath)} sha256=${outputSha256} directory_sha256=${directory.sha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

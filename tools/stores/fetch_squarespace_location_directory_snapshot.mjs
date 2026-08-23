#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, encoded) => {
      const value = String(encoded).toLowerCase().startsWith("x")
        ? Number.parseInt(String(encoded).slice(1), 16)
        : Number.parseInt(String(encoded), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    });
}

function plainHtml(value) {
  return text(decodeHtml(String(value ?? "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ")));
}

function paragraphText(value) {
  return text(decodeHtml(String(value ?? "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ")));
}

function normalize(value) {
  return text(value).toLocaleLowerCase("en").normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function normalizeAddress(value) {
  const aliases = [
    [/\b(st|street)\b/gi, " street "],
    [/\b(rd|road)\b/gi, " road "],
    [/\b(ave|avenue)\b/gi, " avenue "],
    [/\b(blvd|boulevard)\b/gi, " boulevard "],
    [/\b(dr|drive)\b/gi, " drive "],
    [/\b(hwy|highway)\b/gi, " highway "],
    [/\b(ln|lane)\b/gi, " lane "],
    [/\b(ct|court)\b/gi, " court "],
    [/\b(pl|place)\b/gi, " place "],
    [/\b(pkwy|parkway)\b/gi, " parkway "],
    [/\b(ste|suite)\b/gi, " suite "],
    [/\b(n|north)\b/gi, " north "],
    [/\b(s|south)\b/gi, " south "],
    [/\b(e|east)\b/gi, " east "],
    [/\b(w|west)\b/gi, " west "],
  ];
  let result = text(value);
  for (const [pattern, replacement] of aliases) result = result.replace(pattern, replacement);
  return normalize(result);
}

function addressWithoutUnit(value) {
  return normalizeAddress(value)
    .replace(/\b(?:suite|unit|building|floor)\s+[\p{L}\p{N}-]+\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameAddress(left, right) {
  const exactLeft = normalizeAddress(left);
  const exactRight = normalizeAddress(right);
  return exactLeft === exactRight || (addressWithoutUnit(left) && addressWithoutUnit(left) === addressWithoutUnit(right));
}

function stableId(parts) {
  return `squarespace-location:${crypto.createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24)}`;
}

function finiteCoordinate(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function htmlCards(html, { region, country }) {
  const records = [];
  for (const matched of String(html).matchAll(/<div\s+class="sqs-html-content"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const content = matched[1].replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (paragraph) => `${paragraph}\u0000`);
    const paragraphs = content.split("\u0000").map((paragraph) => paragraph.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]).filter(Boolean).map(paragraphText);
    const name = paragraphs[0] || "";
    const addressLines = String(matched[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)?.[1] || "")
      .split(/<br\s*\/?\s*>/gi)
      .map(plainHtml)
      .filter(Boolean);
    if (!name || addressLines.length < 2) continue;
    const locality = addressLines.at(-1).match(/^(?<city>.+?),\s*(?<region>[A-Z]{2})\s+(?<postal_code>\d{5}(?:-\d{4})?)$/i);
    if (!locality?.groups || locality.groups.region.toUpperCase() !== region) continue;
    const address = text(addressLines.slice(0, -1).join(", "));
    if (!address) throw new Error("SQUARESPACE_LOCATION_CARD_ADDRESS_MISSING");
    records.push({
      source_record_id: stableId([name, address, locality.groups.city, locality.groups.region, locality.groups.postal_code]),
      legal_name: name,
      trade_name: name,
      address,
      city: text(locality.groups.city),
      region,
      postal_code: text(locality.groups.postal_code),
      country,
    });
  }
  const identities = new Set();
  for (const record of records) {
    const identity = [normalize(record.legal_name), normalizeAddress(record.address), normalize(record.city), record.postal_code].join("|");
    if (identities.has(identity)) throw new Error(`SQUARESPACE_LOCATION_CARD_DUPLICATE:${identity}`);
    identities.add(identity);
  }
  return records;
}

function pageMarkers(html, { region }) {
  const markers = [];
  for (const matched of String(html).matchAll(/data-context="([^"]+)"/gi)) {
    let context;
    try {
      context = JSON.parse(decodeHtml(matched[1]));
    } catch {
      continue;
    }
    const location = context?.location;
    const name = text(location?.addressTitle);
    const sourceAddress = text(location?.addressLine1);
    const completeAddress = sourceAddress.match(/^(?<address>.+?),\s*(?<city>[^,]+),\s*(?<region>[A-Z]{2})\s+(?<postal_code>\d{5}(?:-\d{4})?)$/i) || sourceAddress.match(/^(?<address>.+?)\s+(?<city>[\p{L}\s.-]+),\s*(?<region>[A-Z]{2})\s+(?<postal_code>\d{5}(?:-\d{4})?)$/iu);
    const locality = completeAddress?.groups || text(location?.addressLine2).match(/^(?<city>.+?),\s*(?<region>[A-Z]{2}),\s*(?<postal_code>\d{5}(?:-\d{4})?)$/i)?.groups;
    const address = text(completeAddress?.groups?.address || sourceAddress);
    const latitude = finiteCoordinate(location?.markerLat ?? location?.mapLat, -90, 90);
    const longitude = finiteCoordinate(location?.markerLng ?? location?.mapLng, -180, 180);
    if (!name || !address || !locality || locality.region.toUpperCase() !== region || latitude === null || longitude === null) continue;
    markers.push({
      legal_name: name,
      address,
      city: text(locality.city),
      region,
      postal_code: text(locality.postal_code),
      latitude,
      longitude,
    });
  }
  const identities = new Set();
  for (const marker of markers) {
    const identity = [normalize(marker.legal_name), normalizeAddress(marker.address), normalize(marker.city), marker.postal_code].join("|");
    if (identities.has(identity)) throw new Error(`SQUARESPACE_LOCATION_MARKER_DUPLICATE:${identity}`);
    identities.add(identity);
  }
  return markers;
}

export function selectSquarespaceLocationDirectory(html, { region, country, expectedCards, expectedMatchedMarkers, expectedUnmatchedMarkers }) {
  const normalizedRegion = text(region).toUpperCase();
  const normalizedCountry = text(country).toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedRegion) || !/^[A-Z]{2}$/.test(normalizedCountry)) throw new Error("SQUARESPACE_LOCATION_JURISDICTION_INVALID");
  const cards = htmlCards(html, { region: normalizedRegion, country: normalizedCountry });
  const markers = pageMarkers(html, { region: normalizedRegion });
  const markerForCard = (card) => markers.filter((marker) =>
    normalize(marker.legal_name) === normalize(card.legal_name) &&
    normalize(marker.city) === normalize(card.city) &&
    marker.postal_code === card.postal_code &&
    sameAddress(marker.address, card.address),
  );
  const matched = new Set();
  const records = cards.map((card) => {
    const candidates = markerForCard(card);
    if (candidates.length > 1) throw new Error(`SQUARESPACE_LOCATION_MARKER_MATCH_AMBIGUOUS:${card.source_record_id}`);
    const marker = candidates[0];
    if (marker) matched.add(marker);
    return {
      ...card,
      latitude: marker?.latitude ?? null,
      longitude: marker?.longitude ?? null,
      coordinates_source: marker ? "OFFICIAL_SQUARESPACE_CARD_AND_MATCHED_PAGE_MARKER" : "OFFICIAL_SQUARESPACE_CARD_WITHOUT_MATCHED_MARKER",
      coordinates_confidence: marker ? "PROVEN" : "UNKNOWN",
      location_evidence: "STRONG",
    };
  });
  const unmatchedMarkers = markers.filter((marker) => !matched.has(marker));
  if (Number.isInteger(expectedCards) && cards.length !== expectedCards) throw new Error(`SQUARESPACE_LOCATION_CARD_COUNT_INVALID:${cards.length}/${expectedCards}`);
  if (Number.isInteger(expectedMatchedMarkers) && matched.size !== expectedMatchedMarkers) throw new Error(`SQUARESPACE_LOCATION_MATCHED_MARKER_COUNT_INVALID:${matched.size}/${expectedMatchedMarkers}`);
  if (Number.isInteger(expectedUnmatchedMarkers) && unmatchedMarkers.length !== expectedUnmatchedMarkers) throw new Error(`SQUARESPACE_LOCATION_UNMATCHED_MARKER_COUNT_INVALID:${unmatchedMarkers.length}/${expectedUnmatchedMarkers}`);
  if (records.length === 0) throw new Error("SQUARESPACE_LOCATION_NO_RECORDS");
  return { records, counts: { cards: cards.length, matched_markers: matched.size, unmatched_markers: unmatchedMarkers.length } };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function numberArgument(name) {
  const value = argument(name);
  if (!value) return null;
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number < 0) throw new Error(`SQUARESPACE_LOCATION_${name.slice(2).toUpperCase().replace(/-/g, "_")}_INVALID`);
  return number;
}

function outputPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("SQUARESPACE_LOCATION_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  return absolute;
}

async function main() {
  const url = argument("--url");
  const output = argument("--output");
  const region = argument("--region");
  const country = argument("--country");
  const writeRequested = process.argv.includes("--write");
  if (!url || !output || !region || !country) throw new Error("SQUARESPACE_LOCATION_USAGE:--url <https-url> --output <repo-relative-json> --region <region> --country <country> [--expected-cards <n>] [--expected-matched-markers <n>] [--expected-unmatched-markers <n>] [--write]");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("SQUARESPACE_LOCATION_URL_MUST_USE_HTTPS");
  const response = await fetch(parsed, { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`SQUARESPACE_LOCATION_HTTP_${response.status}`);
  const contentType = text(response.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("text/html")) throw new Error(`SQUARESPACE_LOCATION_CONTENT_TYPE_INVALID:${contentType || "MISSING"}`);
  const result = selectSquarespaceLocationDirectory(await response.text(), {
    region,
    country,
    expectedCards: numberArgument("--expected-cards"),
    expectedMatchedMarkers: numberArgument("--expected-matched-markers"),
    expectedUnmatchedMarkers: numberArgument("--expected-unmatched-markers"),
  });
  const serialized = `${JSON.stringify(result.records, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!writeRequested) {
    console.log(`SQUARESPACE_LOCATION_DRY_RUN cards=${result.counts.cards} matched_markers=${result.counts.matched_markers} unmatched_markers=${result.counts.unmatched_markers} sha256=${sha256} url=${response.url}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("SQUARESPACE_LOCATION_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const target = outputPath(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
  console.log(`SQUARESPACE_LOCATION_WRITTEN cards=${result.counts.cards} matched_markers=${result.counts.matched_markers} unmatched_markers=${result.counts.unmatched_markers} sha256=${sha256} output=${path.relative(ROOT, target)} url=${response.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();

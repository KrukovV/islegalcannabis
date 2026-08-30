#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

function normalized(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function attribute(attributes, name) {
  return String(attributes || "").match(new RegExp(`\\b${name}="([^"]+)"`, "i"))?.[1] || "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseBboxPages(xml) {
  return [...String(xml || "").matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/gi)].map((pageMatch, index) => ({
    page: index + 1,
    words: [...pageMatch[1].matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/gi)]
      .map((wordMatch) => ({
        value: text(decodeXml(wordMatch[2])),
        x_min: Number(attribute(wordMatch[1], "xMin")),
        x_max: Number(attribute(wordMatch[1], "xMax")),
        y_min: Number(attribute(wordMatch[1], "yMin")),
        y_max: Number(attribute(wordMatch[1], "yMax")),
      }))
      .filter((word) => word.value && [word.x_min, word.x_max, word.y_min, word.y_max].every(Number.isFinite)),
  }));
}

function lineText(words) {
  const lines = [];
  for (const word of [...words].sort((left, right) => left.y_min - right.y_min || left.x_min - right.x_min)) {
    const line = lines.findLast((item) => Math.abs(item.y - word.y_min) < 1.1);
    if (line) {
      line.words.push(word);
    } else {
      lines.push({ y: word.y_min, words: [word] });
    }
  }
  return lines
    .map((line) => line.words.sort((left, right) => left.x_min - right.x_min).map((word) => word.value).join(" "))
    .map(text)
    .filter(Boolean)
    .join(" ");
}

function interval(value, range, label) {
  const min = Number(range?.x_min);
  const max = Number(range?.x_max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new Error(`PDF_GRID_${label}_RANGE_INVALID`);
  return value.x_min >= min - 0.25 && value.x_max <= max + 0.25;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`PDF_GRID_${label}_INVALID`);
  return number;
}

function rowAnchors(words, table) {
  const yMin = Number(table?.y_min);
  const yMax = Number(table?.y_max);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin >= yMax) throw new Error("PDF_GRID_TABLE_Y_RANGE_INVALID");
  const anchors = words
    .filter((word) => interval(word, table.number_column, "NUMBER_COLUMN") && word.y_min >= yMin && word.y_min <= yMax && /^\d+$/.test(word.value))
    .map((word) => ({ ...word, number: Number(word.value) }))
    .sort((left, right) => left.y_min - right.y_min || left.number - right.number);
  if (anchors.length === 0) throw new Error(`PDF_GRID_TABLE_ROW_ANCHORS_MISSING:PAGE_${table.page}`);
  if (new Set(anchors.map((anchor) => anchor.number)).size !== anchors.length) throw new Error(`PDF_GRID_TABLE_DUPLICATE_ROW_NUMBER:PAGE_${table.page}`);
  return anchors;
}

function assertTableHeader(page, table) {
  const rendered = normalized(page.words.map((word) => word.value).join(" "));
  const phrases = Array.isArray(table?.required_header_phrases) ? table.required_header_phrases : [];
  if (phrases.length === 0 || phrases.some((phrase) => !rendered.includes(normalized(phrase)))) {
    throw new Error(`PDF_GRID_TABLE_HEADER_MISMATCH:PAGE_${table.page}`);
  }
}

function recordsForTable(page, table, defaults) {
  assertTableHeader(page, table);
  const anchors = rowAnchors(page.words, table);
  const yMin = Number(table.y_min);
  const yMax = Number(table.y_max);
  const expected = table.expected_numbers || {};
  const first = positiveInteger(expected.from, "EXPECTED_FIRST_NUMBER");
  const last = positiveInteger(expected.to, "EXPECTED_LAST_NUMBER");
  const expectedNumbers = Array.from({ length: last - first + 1 }, (_value, index) => first + index);
  if (JSON.stringify(anchors.map((anchor) => anchor.number)) !== JSON.stringify(expectedNumbers)) {
    throw new Error(`PDF_GRID_TABLE_ROW_NUMBER_SEQUENCE_INVALID:PAGE_${table.page}`);
  }
  const columns = table?.columns;
  if (!columns || typeof columns !== "object" || Object.keys(columns).length === 0) throw new Error("PDF_GRID_TABLE_COLUMNS_INVALID");
  for (const range of Object.values(columns)) interval({ x_min: Number(range?.x_min), x_max: Number(range?.x_max) }, range, "COLUMN");
  const tableWords = page.words.filter((word) => word.y_min >= yMin && word.y_min <= yMax);
  const wordsByAnchor = new Map(anchors.map((anchor) => [anchor.number, []]));
  for (const word of tableWords) {
    // In a multi-line PDF table the number is often vertically centred while
    // the wrapped name/address begins above it. Assign to the nearest row
    // anchor instead of treating the reading order as a table boundary.
    const nearest = [...anchors].sort((left, right) => (
      Math.abs(left.y_min - word.y_min) - Math.abs(right.y_min - word.y_min) || left.number - right.number
    ))[0];
    wordsByAnchor.get(nearest.number).push(word);
  }
  return anchors.map((anchor) => {
    const rowWords = wordsByAnchor.get(anchor.number) || [];
    const fields = Object.fromEntries(Object.entries(columns).map(([field, range]) => [field, lineText(rowWords.filter((word) => interval(word, range, "COLUMN")))]));
    const required = Array.isArray(table.required_fields) ? table.required_fields : [];
    if (required.some((field) => !text(fields[field]))) throw new Error(`PDF_GRID_TABLE_REQUIRED_FIELD_MISSING:${anchor.number}`);
    return {
      source_record_id: `PDF:${table.page}:${anchor.number}`,
      legal_name: fields.legal_name || "",
      trade_name: fields.trade_name || "",
      license_number: fields.license_number || "",
      license_type: text(defaults.license_type),
      store_type: text(defaults.store_type),
      address: fields.address || "",
      city: fields.city || "",
      region: fields.region || text(defaults.region),
      postal_code: fields.postal_code || "",
      country: text(defaults.country),
      license_status: text(defaults.license_status || "UNKNOWN_STATUS"),
      operational_status: text(defaults.operational_status || "UNKNOWN_STATUS"),
      ...(defaults.medical === true ? { medical: true } : {}),
      ...(defaults.adult_use === true ? { adult_use: true } : {}),
      confidence: text(defaults.confidence || "STRONG"),
      coordinates_source: text(defaults.coordinates_source || "OFFICIAL_DIRECTORY_NO_COORDINATE_FIELD"),
      coordinates_confidence: text(defaults.coordinates_confidence || "UNKNOWN"),
      location_evidence: text(defaults.location_evidence || "STRONG"),
      public_source_fields: {
        official_pdf_page: String(table.page),
        official_pdf_row: String(anchor.number),
      },
    };
  });
}

/**
 * Extract a visually bounded public-location table from an official PDF using
 * only declarative page, header, row-number and column coordinates. The
 * parser is generic: no GEO, language or operator name is embedded here.
 */
export function extractPdfGridStoreSnapshot({ bboxXml, config }) {
  const sourcePdfSha256 = text(config?.source_pdf_sha256).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sourcePdfSha256)) throw new Error("PDF_GRID_SOURCE_SHA256_INVALID");
  if (!/^https:\/\//i.test(text(config?.source_url)) || !text(config?.country) || !text(config?.store_type)) {
    throw new Error("PDF_GRID_CONFIG_IDENTITY_INVALID");
  }
  const tables = Array.isArray(config?.tables) ? config.tables : [];
  if (tables.length === 0) throw new Error("PDF_GRID_TABLES_MISSING");
  const pages = new Map(parseBboxPages(bboxXml).map((page) => [page.page, page]));
  const records = tables.flatMap((table) => {
    const page = pages.get(positiveInteger(table?.page, "PAGE"));
    if (!page) throw new Error(`PDF_GRID_PAGE_MISSING:${table.page}`);
    return recordsForTable(page, table, config);
  }).sort((left, right) => left.source_record_id.localeCompare(right.source_record_id, "en"));
  if (new Set(records.map((record) => record.source_record_id)).size !== records.length) throw new Error("PDF_GRID_DUPLICATE_SOURCE_RECORD_ID");
  const expectedRecordCount = positiveInteger(config?.expected_record_count, "EXPECTED_RECORD_COUNT");
  if (records.length !== expectedRecordCount) throw new Error(`PDF_GRID_RECORD_COUNT_INVALID:${records.length}`);
  return { records, counts: { retained_public_locations: records.length, configured_tables: tables.length } };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function repositoryPath(value, label) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`PDF_GRID_${label}_MUST_BE_WITHIN_REPOSITORY`);
  return absolute;
}

function bboxXml(pdfPath) {
  try {
    return execFileSync("pdftotext", ["-bbox", pdfPath, "-"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`PDF_GRID_BBOX_EXTRACTION_FAILED:${text(error?.message)}`);
  }
}

function main() {
  const input = argument("--input");
  const configPath = argument("--config");
  const output = argument("--output");
  if (!input || !configPath || !output) {
    throw new Error("PDF_GRID_USAGE:--input <repo-pdf> --config <repo-json> --output <repo-json> [--write]");
  }
  const inputPath = repositoryPath(input, "INPUT");
  const sourceConfigPath = repositoryPath(configPath, "CONFIG");
  const outputPath = repositoryPath(output, "OUTPUT");
  const sourcePdf = fs.readFileSync(inputPath);
  const config = JSON.parse(fs.readFileSync(sourceConfigPath, "utf8"));
  const actualPdfSha256 = sha256(sourcePdf);
  if (actualPdfSha256 !== text(config.source_pdf_sha256).toLowerCase()) throw new Error(`PDF_GRID_SOURCE_SHA256_DRIFT:${actualPdfSha256}`);
  const extracted = extractPdfGridStoreSnapshot({ bboxXml: bboxXml(inputPath), config });
  const snapshot = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    local_only: true,
    source_url: config.source_url,
    source_pdf_sha256: actualPdfSha256,
    extractor: "PDF_DECLARATIVE_BBOX_GRID_LOCATION_TABLE_V1",
    ...extracted,
  };
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (!process.argv.includes("--write")) {
    console.log(`PDF_GRID_STORE_SNAPSHOT_DRY_RUN records=${snapshot.records.length} sha256=${sha256(serialized)}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("PDF_GRID_STORE_SNAPSHOT_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`PDF_GRID_STORE_SNAPSHOT_WRITTEN records=${snapshot.records.length} sha256=${sha256(serialized)} output=${path.relative(ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PYTHON_EXTRACTOR = `
import datetime, json, sys
from io import BytesIO
from openpyxl import load_workbook
workbook = load_workbook(BytesIO(sys.stdin.buffer.read()), read_only=True, data_only=True)
sheet = sys.argv[1]
header_row = int(sys.argv[2])
if sheet not in workbook.sheetnames:
    raise ValueError("STORE_XLSX_SNAPSHOT_SHEET_MISSING:" + sheet)
rows = workbook[sheet].iter_rows(values_only=True)
if header_row < 1:
    raise ValueError("STORE_XLSX_SNAPSHOT_HEADER_ROW_INVALID")
for _ in range(header_row - 1):
    next(rows)
headers = [str(value or "").strip() for value in next(rows)]
def value(item):
    if isinstance(item, (datetime.datetime, datetime.date, datetime.time)):
        return item.isoformat()
    return item
print(json.dumps([dict(zip(headers, [value(cell) for cell in row])) for row in rows], ensure_ascii=False))
`;

function text(value) {
  return String(value ?? "").trim();
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function headerRow() {
  const raw = argument("--header-row");
  if (!raw) return 1;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error("STORE_XLSX_SNAPSHOT_HEADER_ROW_INVALID");
  return Number(raw);
}

function argumentsFor(name) {
  return process.argv.flatMap((value, index) => value === name ? [text(process.argv[index + 1])] : []).filter(Boolean);
}

function selector(value, type) {
  const separator = text(value).indexOf("=");
  if (separator <= 0) throw new Error(`STORE_XLSX_SNAPSHOT_${type}_MUST_BE_FIELD_EQUALS_VALUE`);
  const field = text(value.slice(0, separator));
  const expected = text(value.slice(separator + 1));
  if (!field || !expected) throw new Error(`STORE_XLSX_SNAPSHOT_${type}_MUST_BE_FIELD_EQUALS_VALUE`);
  return { field, expected };
}

function localOutputPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("STORE_XLSX_SNAPSHOT_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  }
  return absolute;
}

export function selectXlsxStoreSnapshot(rows, { equals = [], contains = [], nonempty = [], fields = [], sourceRecordIdFields = [] } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("STORE_XLSX_SNAPSHOT_ROWS_REQUIRED");
  const available = new Set(Object.keys(rows[0] || {}));
  const required = [...equals, ...contains, ...nonempty.map((field) => ({ field })), ...fields.map((field) => ({ field })), ...sourceRecordIdFields.map((field) => ({ field }))];
  for (const item of required) {
    if (!available.has(text(item.field))) throw new Error(`STORE_XLSX_SNAPSHOT_FIELD_MISSING:${text(item.field)}`);
  }
  const selected = rows.filter((row) =>
    equals.every((item) => text(row?.[item.field]) === item.expected) &&
    contains.every((item) => text(row?.[item.field]).includes(item.expected)) &&
    nonempty.every((field) => Boolean(text(row?.[field])) && text(row?.[field]).toUpperCase() !== "N/A"),
  );
  if (selected.length === 0) throw new Error("STORE_XLSX_SNAPSHOT_SELECTION_EMPTY");
  const projected = fields.length === 0
    ? selected
    : selected.map((row) => Object.fromEntries(fields.map((field) => [field, row?.[field] ?? ""])));
  if (sourceRecordIdFields.length === 0) return projected;
  return projected.map((row) => ({
    ...row,
    source_record_id: `XLSX_ROW:${crypto.createHash("sha256").update(sourceRecordIdFields.map((field) => text(row?.[field])).join("\\n")).digest("hex").slice(0, 24)}`,
  }));
}

export function extractXlsxRows({ bytes, sheet, headerRow = 1, pythonPath, spawnSyncImpl = spawnSync }) {
  const interpreter = text(pythonPath);
  if (!interpreter) throw new Error("STORE_XLSX_SNAPSHOT_PYTHON_REQUIRED");
  if (!Number.isInteger(headerRow) || headerRow < 1) throw new Error("STORE_XLSX_SNAPSHOT_HEADER_ROW_INVALID");
  const result = spawnSyncImpl(interpreter, ["-c", PYTHON_EXTRACTOR, text(sheet), String(headerRow)], {
    input: bytes,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`STORE_XLSX_SNAPSHOT_EXTRACTION_FAILED:${text(result.stderr) || result.status}`);
  const rows = JSON.parse(text(result.stdout));
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("STORE_XLSX_SNAPSHOT_ROWS_REQUIRED");
  return rows;
}

async function main() {
  const url = argument("--url");
  const output = argument("--output");
  const sheet = argument("--sheet");
  const selectedHeaderRow = headerRow();
  const equals = argumentsFor("--equals").map((value) => selector(value, "EQUALS"));
  const contains = argumentsFor("--contains").map((value) => selector(value, "CONTAINS"));
  const nonempty = argumentsFor("--nonempty");
  const fields = argument("--fields").split(",").map(text).filter(Boolean);
  const sourceRecordIdFields = argument("--source-record-id-fields").split(",").map(text).filter(Boolean);
  if (!url || !output || !sheet) {
    throw new Error("STORE_XLSX_SNAPSHOT_USAGE:--url <https-xlsx-url> --sheet <sheet-name> --output <repo-relative-json> [--header-row N] [--equals FIELD=VALUE] [--contains FIELD=VALUE] [--nonempty FIELD] [--fields field1,field2] [--source-record-id-fields field1,field2] [--write]");
  }
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") throw new Error("STORE_XLSX_SNAPSHOT_URL_MUST_USE_HTTPS");
  const response = await fetch(parsedUrl, { headers: { accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, redirect: "follow" });
  if (!response.ok) throw new Error(`STORE_XLSX_SNAPSHOT_HTTP_${response.status}`);
  const contentType = text(response.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("spreadsheetml") && !contentType.includes("application/vnd.ms-excel")) {
    throw new Error(`STORE_XLSX_SNAPSHOT_CONTENT_TYPE_INVALID:${contentType || "MISSING"}`);
  }
  const rows = extractXlsxRows({ bytes: Buffer.from(await response.arrayBuffer()), sheet, headerRow: selectedHeaderRow, pythonPath: process.env.STORE_XLSX_PYTHON });
  const payload = selectXlsxStoreSnapshot(rows, { equals, contains, nonempty, fields, sourceRecordIdFields });
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`STORE_XLSX_SNAPSHOT_DRY_RUN rows=${payload.length} sha256=${sha256} url=${response.url}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("STORE_XLSX_SNAPSHOT_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const outputPath = localOutputPath(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`STORE_XLSX_SNAPSHOT_WRITTEN rows=${payload.length} sha256=${sha256} output=${path.relative(ROOT, outputPath)} url=${response.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

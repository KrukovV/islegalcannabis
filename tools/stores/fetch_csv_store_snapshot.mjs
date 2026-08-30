#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value ?? "").trim();
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function outputPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("STORE_CSV_SNAPSHOT_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  }
  return absolute;
}

function csvRecordCount(value) {
  let quoted = false;
  let records = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"' && value[index + 1] === '"') {
      index += 1;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (char === "\n" && !quoted) records += 1;
  }
  if (value.length > 0 && !value.endsWith("\n")) records += 1;
  return records;
}

function csvRows(value) {
  const cells = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (!quoted && cell === "") {
        quoted = true;
      } else if (quoted) {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && value[index + 1] === "\n") index += 1;
      row.push(cell);
      cells.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    cells.push(row);
  }
  return cells.filter((item) => item.some((cellValue) => text(cellValue) !== ""));
}

export function selectCsvStoreSnapshot(csv, { equals = [], fields = [] } = {}) {
  const rows = csvRows(csv);
  if (rows.length < 2) throw new Error("STORE_CSV_SNAPSHOT_ROWS_INVALID");
  const headers = rows[0].map(text);
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const required = [...equals.map((item) => text(item.field)), ...fields.map(text)].filter(Boolean);
  for (const field of required) {
    if (!indexByHeader.has(field)) throw new Error(`STORE_CSV_SNAPSHOT_FIELD_MISSING:${field}`);
  }
  const selected = rows.slice(1).filter((row) => equals.every((item) => text(row[indexByHeader.get(text(item.field))]) === text(item.expected)));
  if (selected.length === 0) throw new Error("STORE_CSV_SNAPSHOT_SELECTION_EMPTY");
  const projectedHeaders = fields.length > 0 ? fields.map(text) : headers;
  const projected = selected.map((row) => projectedHeaders.map((field) => row[indexByHeader.get(field)] ?? ""));
  const encode = (cellValue) => `"${String(cellValue).replace(/"/g, '""')}"`;
  return `${projectedHeaders.map(encode).join(",")}\n${projected.map((row) => row.map(encode).join(",")).join("\n")}\n`;
}

export async function fetchCsvStoreSnapshot({ url, allowOctetStream = false, fetchImpl = globalThis.fetch }) {
  const parsed = new URL(text(url));
  if (parsed.protocol !== "https:") throw new Error("STORE_CSV_SNAPSHOT_URL_MUST_USE_HTTPS");
  if (typeof fetchImpl !== "function") throw new Error("STORE_CSV_SNAPSHOT_FETCH_UNAVAILABLE");
  const response = await fetchImpl(parsed, { headers: { accept: "text/csv" }, redirect: "follow" });
  if (!response?.ok) throw new Error(`STORE_CSV_SNAPSHOT_HTTP_${response?.status || "NETWORK"}`);
  const contentType = text(response.headers?.get?.("content-type")).toLowerCase();
  const acceptedContentType = contentType.startsWith("text/csv")
    || (allowOctetStream && contentType === "application/octet-stream");
  if (!acceptedContentType) throw new Error(`STORE_CSV_SNAPSHOT_CONTENT_TYPE_INVALID:${contentType || "MISSING"}`);
  const csv = await response.text();
  const records = csvRecordCount(csv);
  if (records < 2) throw new Error(`STORE_CSV_SNAPSHOT_ROWS_INVALID:${records}`);
  return {
    csv: csv.endsWith("\n") ? csv : `${csv}\n`,
    records: records - 1,
    sourceUrl: response.url || parsed.toString(),
    sha256: crypto.createHash("sha256").update(csv.endsWith("\n") ? csv : `${csv}\n`).digest("hex"),
  };
}

async function main() {
  const url = argument("--url");
  const output = argument("--output");
  const equals = process.argv.flatMap((value, index) => value === "--equals" ? [text(process.argv[index + 1])] : []).filter(Boolean).map((value) => {
    const separator = value.indexOf("=");
    if (separator <= 0) throw new Error("STORE_CSV_SNAPSHOT_EQUALS_MUST_BE_FIELD_EQUALS_VALUE");
    return { field: text(value.slice(0, separator)), expected: text(value.slice(separator + 1)) };
  });
  const fields = argument("--fields").split(",").map(text).filter(Boolean);
  const allowOctetStream = process.argv.includes("--allow-octet-stream");
  if (!url || !output) {
    throw new Error("STORE_CSV_SNAPSHOT_USAGE:--url <https-csv-url> --output <repo-relative-csv> [--write]");
  }
  const fetched = await fetchCsvStoreSnapshot({ url, allowOctetStream });
  const csv = equals.length > 0 || fields.length > 0 ? selectCsvStoreSnapshot(fetched.csv, { equals, fields }) : fetched.csv;
  const snapshot = {
    ...fetched,
    csv,
    records: csvRecordCount(csv) - 1,
    sha256: crypto.createHash("sha256").update(csv).digest("hex"),
  };
  if (!process.argv.includes("--write")) {
    console.log(`STORE_CSV_SNAPSHOT_DRY_RUN rows=${snapshot.records} sha256=${snapshot.sha256} url=${snapshot.sourceUrl}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("STORE_CSV_SNAPSHOT_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const target = outputPath(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, snapshot.csv);
  console.log(`STORE_CSV_SNAPSHOT_WRITTEN rows=${snapshot.records} sha256=${snapshot.sha256} output=${path.relative(ROOT, target)} url=${snapshot.sourceUrl}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

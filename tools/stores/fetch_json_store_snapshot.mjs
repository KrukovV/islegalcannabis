#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function argumentsFor(name) {
  return process.argv.flatMap((value, index) => value === name ? [String(process.argv[index + 1] || "").trim()] : []);
}

function text(value) {
  return String(value ?? "").trim();
}

export function parseEqualitySelector(value) {
  const separator = text(value).indexOf("=");
  if (separator <= 0) throw new Error("STORE_SNAPSHOT_EQUALS_MUST_BE_FIELD_EQUALS_VALUE");
  const field = text(text(value).slice(0, separator));
  const expected = text(text(value).slice(separator + 1));
  if (!field || !expected) throw new Error("STORE_SNAPSHOT_EQUALS_MUST_BE_FIELD_EQUALS_VALUE");
  return { field, expected };
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["features", "data", "results", "records", "items", "markers"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  // CKAN's public DataStore action wraps a normal record array as
  // `{ result: { records: [...] } }`. Support this standard envelope so an
  // official open-data publisher needs no territory-specific collector.
  if (Array.isArray(payload?.result?.records)) return payload.result.records;
  if (Array.isArray(payload?.collection?.data)) return payload.collection.data;
  return [];
}

export function selectStoreSnapshotPayload(payload, { equals = [], nonempty = [], fields = [] } = {}) {
  const selectors = equals.map(parseEqualitySelector);
  const requiredFields = nonempty.map(text).filter(Boolean);
  const projectionFields = fields.map(text).filter(Boolean);
  if (selectors.length === 0 && requiredFields.length === 0 && projectionFields.length === 0) {
    return { payload, rowCount: rowsFromPayload(payload).length };
  }
  const rows = rowsFromPayload(payload);
  if (rows.length === 0) throw new Error("STORE_SNAPSHOT_JSON_ROWS_FEATURES_OR_MARKERS_REQUIRED");
  const selected = rows.filter((row) =>
    selectors.every(({ field, expected }) => text(row?.[field]) === expected) &&
    requiredFields.every((field) => Boolean(text(row?.[field]))),
  );
  if (selected.length === 0) throw new Error("STORE_SNAPSHOT_SELECTION_EMPTY");
  const projected = projectionFields.length === 0
    ? selected
    : selected.map((row) => Object.fromEntries(projectionFields.map((field) => [field, row?.[field] ?? ""])));
  return { payload: projected, rowCount: projected.length };
}

function localOutputPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("STORE_SNAPSHOT_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  }
  return absolute;
}

async function main() {
  const sourceUrl = argument("--url");
  const output = argument("--output");
  const writeRequested = process.argv.includes("--write");
  const equals = argumentsFor("--equals");
  const nonempty = argumentsFor("--nonempty");
  const fields = argument("--fields").split(",").map(text).filter(Boolean);
  if (!sourceUrl || !output) {
    throw new Error("STORE_SNAPSHOT_USAGE:--url <https-json-url> --output <repo-relative-json> [--equals FIELD=VALUE] [--nonempty FIELD] [--fields field1,field2] [--write]");
  }
  const parsedUrl = new URL(sourceUrl);
  if (parsedUrl.protocol !== "https:") throw new Error("STORE_SNAPSHOT_URL_MUST_USE_HTTPS");
  const response = await fetch(parsedUrl, { headers: { accept: "application/json" }, redirect: "follow" });
  if (!response.ok) throw new Error(`STORE_SNAPSHOT_HTTP_${response.status}`);
  const selected = selectStoreSnapshotPayload(await response.json(), { equals, nonempty, fields });
  const payload = selected.payload;
  const rowCount = selected.rowCount;
  if (rowCount === 0) throw new Error("STORE_SNAPSHOT_JSON_ROWS_FEATURES_OR_MARKERS_REQUIRED");
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!writeRequested) {
    console.log(`STORE_SNAPSHOT_DRY_RUN rows=${rowCount} sha256=${sha256} url=${response.url}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("STORE_SNAPSHOT_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const outputPath = localOutputPath(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`STORE_SNAPSHOT_WRITTEN rows=${rowCount} sha256=${sha256} output=${path.relative(ROOT, outputPath)} url=${response.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();

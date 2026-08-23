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

function repositoryPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("INLINE_JSON_STORE_SNAPSHOT_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  }
  return absolute;
}

function jsonArrayEnd(value, start) {
  let depth = 0;
  let stringQuote = "";
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (stringQuote) {
      if (escaped) escaped = false;
      else if (character === "\\\\") escaped = true;
      else if (character === stringQuote) stringQuote = "";
      continue;
    }
    if (character === '"') {
      stringQuote = character;
      continue;
    }
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/**
 * Extracts a declared inline JSON array from one official HTML page. The
 * caller supplies the exact public variable and an explicit public-field
 * projection, avoiding scraper logic tied to a territory or site layout.
 */
export function extractInlineJsonStoreSnapshot(html, { variableName, fields = [] } = {}) {
  const variable = text(variableName);
  const projection = (Array.isArray(fields) ? fields : []).map(text).filter(Boolean);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(variable)) throw new Error("INLINE_JSON_STORE_SNAPSHOT_VARIABLE_INVALID");
  if (projection.length === 0 || new Set(projection).size !== projection.length) throw new Error("INLINE_JSON_STORE_SNAPSHOT_FIELDS_INVALID");
  const assignment = new RegExp(`\\b(?:const|let|var)\\s+${variable}\\s*=\\s*\\[`, "g");
  const match = assignment.exec(String(html || ""));
  if (!match || match.index === undefined) throw new Error("INLINE_JSON_STORE_SNAPSHOT_VARIABLE_MISSING");
  const start = String(html).indexOf("[", match.index + match[0].length - 1);
  const end = jsonArrayEnd(String(html), start);
  if (start < 0 || end < 0) throw new Error("INLINE_JSON_STORE_SNAPSHOT_ARRAY_UNTERMINATED");
  let rows;
  try {
    rows = JSON.parse(String(html).slice(start, end));
  } catch {
    throw new Error("INLINE_JSON_STORE_SNAPSHOT_ARRAY_INVALID_JSON");
  }
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("INLINE_JSON_STORE_SNAPSHOT_ROWS_INVALID");
  }
  const output = rows.map((row) => Object.fromEntries(projection.map((field) => [field, row[field] ?? ""])));
  if (output.some((row) => projection.some((field) => !text(row[field])))) throw new Error("INLINE_JSON_STORE_SNAPSHOT_REQUIRED_FIELD_MISSING");
  return output;
}

async function main() {
  const sourceUrl = argument("--url");
  const variableName = argument("--variable");
  const output = argument("--output");
  const fields = argument("--fields").split(",").map(text).filter(Boolean);
  if (!sourceUrl || !variableName || !output) {
    throw new Error("INLINE_JSON_STORE_SNAPSHOT_USAGE:--url <https-html-url> --variable <js-variable> --fields <field1,field2> --output <repo-relative-json> [--write]");
  }
  if (new URL(sourceUrl).protocol !== "https:") throw new Error("INLINE_JSON_STORE_SNAPSHOT_URL_MUST_USE_HTTPS");
  const response = await fetch(sourceUrl, { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`INLINE_JSON_STORE_SNAPSHOT_HTTP_${response.status}`);
  const html = await response.text();
  const records = extractInlineJsonStoreSnapshot(html, { variableName, fields });
  const serialized = `${JSON.stringify(records, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`INLINE_JSON_STORE_SNAPSHOT_DRY_RUN rows=${records.length} sha256=${sha256} url=${response.url}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("INLINE_JSON_STORE_SNAPSHOT_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const outputPath = repositoryPath(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`INLINE_JSON_STORE_SNAPSHOT_WRITTEN rows=${records.length} sha256=${sha256} output=${path.relative(ROOT, outputPath)} url=${response.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

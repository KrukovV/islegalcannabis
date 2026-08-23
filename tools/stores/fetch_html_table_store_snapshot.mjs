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

function argumentsFor(name) {
  return process.argv.flatMap((value, index) => value === name ? [text(process.argv[index + 1])] : []);
}

function argument(name) {
  return argumentsFor(name)[0] || "";
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
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z]+;/gi, " ");
}

function cells(row) {
  return [...String(row).matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => text(decodeHtml(match[1])));
}

function tableRows(table) {
  return [...String(table).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => cells(match[1]));
}

export function selectHtmlTableStoreSnapshot(html, { headers, fields }) {
  const requiredHeaders = (Array.isArray(headers) ? headers : []).map(text).filter(Boolean);
  const projectionFields = (Array.isArray(fields) ? fields : []).map(text).filter(Boolean);
  if (requiredHeaders.length === 0) throw new Error("STORE_HTML_TABLE_HEADERS_REQUIRED");
  if (projectionFields.length === 0) throw new Error("STORE_HTML_TABLE_FIELDS_REQUIRED");
  if (new Set(requiredHeaders).size !== requiredHeaders.length || new Set(projectionFields).size !== projectionFields.length) {
    throw new Error("STORE_HTML_TABLE_HEADERS_OR_FIELDS_DUPLICATED");
  }
  const tables = [...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => tableRows(match[0]));
  const matches = tables.filter((rows) => rows.length > 1 && rows[0].length === requiredHeaders.length && rows[0].every((header, index) => header === requiredHeaders[index]));
  if (matches.length !== 1) throw new Error(`STORE_HTML_TABLE_EXPECTED_TABLE_COUNT_INVALID:${matches.length}`);
  const headerIndex = new Map(requiredHeaders.map((header, index) => [header, index]));
  if (projectionFields.some((field) => !headerIndex.has(field))) throw new Error("STORE_HTML_TABLE_FIELD_NOT_DECLARED_IN_HEADERS");
  const rows = matches[0].slice(1);
  if (rows.some((row) => row.length !== requiredHeaders.length || row.some((value) => !value))) throw new Error("STORE_HTML_TABLE_ROW_INVALID");
  const selected = rows.map((row) => Object.fromEntries(projectionFields.map((field) => [field, row[headerIndex.get(field)]])));
  if (selected.length === 0) throw new Error("STORE_HTML_TABLE_NO_ROWS");
  return selected;
}

function outputPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("STORE_HTML_TABLE_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  return absolute;
}

async function main() {
  const url = argument("--url");
  const output = argument("--output");
  const headers = argumentsFor("--header");
  const fields = argumentsFor("--field");
  const writeRequested = process.argv.includes("--write");
  if (!url || !output) throw new Error("STORE_HTML_TABLE_USAGE:--url <https-html-url> --output <repo-relative-json> --header <header>... --field <field>... [--write]");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("STORE_HTML_TABLE_URL_MUST_USE_HTTPS");
  const response = await fetch(parsed, { headers: { accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`STORE_HTML_TABLE_HTTP_${response.status}`);
  const contentType = text(response.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("text/html")) throw new Error(`STORE_HTML_TABLE_CONTENT_TYPE_INVALID:${contentType || "MISSING"}`);
  const records = selectHtmlTableStoreSnapshot(await response.text(), { headers, fields });
  const serialized = `${JSON.stringify(records, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!writeRequested) {
    console.log(`STORE_HTML_TABLE_DRY_RUN rows=${records.length} sha256=${sha256} url=${response.url}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("STORE_HTML_TABLE_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const target = outputPath(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
  console.log(`STORE_HTML_TABLE_WRITTEN rows=${records.length} sha256=${sha256} output=${path.relative(ROOT, target)} url=${response.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();

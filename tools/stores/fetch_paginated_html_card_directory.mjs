#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value ?? "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, encoded) => String.fromCodePoint(String(encoded).toLowerCase().startsWith("x") ? Number.parseInt(String(encoded).slice(1), 16) : Number.parseInt(String(encoded), 10)))
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, " ")
    .trim();
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function required(name) {
  const value = argument(name);
  if (!value) throw new Error(`PAGINATED_HTML_CARD_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
  return value;
}

function requiredInteger(name) {
  const value = Number.parseInt(required(name), 10);
  if (!Number.isInteger(value) || value < 1) throw new Error(`PAGINATED_HTML_CARD_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_INVALID`);
  return value;
}

function outputPath(value) {
  const target = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("PAGINATED_HTML_CARD_DIRECTORY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  return target;
}

export function selectPaginatedHtmlCardDirectory(html, options) {
  const cards = [...String(html).matchAll(/<li\b[^>]*data-latitude="([^"]+)"[^>]*data-longitude="([^"]+)"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>\s*<h3>([\s\S]*?)<\/h3>[\s\S]*?<p class="list-item-link__info-text js-item-address">([\s\S]*?)<\/p>/gi)];
  const records = cards.map((match) => {
    const latitude = Number.parseFloat(text(match[1]).replace(",", "."));
    const longitude = Number.parseFloat(text(match[2]).replace(",", "."));
    const relativeUrl = text(match[3]);
    const legalName = text(match[4]);
    const address = text(match[5]);
    if (!relativeUrl.startsWith("/") || !legalName || !address || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 || longitude === 0) {
      throw new Error("PAGINATED_HTML_CARD_DIRECTORY_RECORD_INVALID");
    }
    return {
      source_record_id: `html-card:${crypto.createHash("sha256").update(relativeUrl).digest("hex").slice(0, 24)}`,
      legal_name: legalName,
      address,
      latitude,
      longitude,
      regulator_url: new URL(relativeUrl, options.sourceUrl).toString(),
    };
  });
  if (records.length === 0) throw new Error("PAGINATED_HTML_CARD_DIRECTORY_NO_RECORDS");
  const identities = new Set();
  for (const record of records) {
    if (identities.has(record.source_record_id)) throw new Error(`PAGINATED_HTML_CARD_DIRECTORY_DUPLICATE_RECORD:${record.source_record_id}`);
    identities.add(record.source_record_id);
  }
  return records;
}

async function main() {
  const urlTemplate = required("--url-template");
  const pageStart = requiredInteger("--page-start");
  const pageEnd = requiredInteger("--page-end");
  const expectedRecords = requiredInteger("--expected-records");
  const sourceUrl = required("--source-url");
  const output = required("--output");
  if (!urlTemplate.includes("{page}") || pageEnd < pageStart || new URL(sourceUrl).protocol !== "https:") throw new Error("PAGINATED_HTML_CARD_DIRECTORY_CONFIGURATION_INVALID");
  const records = [];
  const pageEvidence = [];
  for (let page = pageStart; page <= pageEnd; page += 1) {
    const url = urlTemplate.replace("{page}", String(page));
    const response = await fetch(url, { headers: { accept: "text/html" }, redirect: "follow" });
    if (!response.ok) throw new Error(`PAGINATED_HTML_CARD_DIRECTORY_HTTP_${response.status}`);
    const body = await response.text();
    const pageRecords = selectPaginatedHtmlCardDirectory(body, { sourceUrl });
    records.push(...pageRecords);
    pageEvidence.push({ page, url: response.url, sha256: crypto.createHash("sha256").update(body).digest("hex"), records: pageRecords.length });
  }
  if (records.length !== expectedRecords) throw new Error(`PAGINATED_HTML_CARD_DIRECTORY_RECORD_COUNT_INVALID:${records.length}/${expectedRecords}`);
  const snapshot = { schema_version: 1, local_only: true, source_url: sourceUrl, page_evidence: pageEvidence, records };
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`PAGINATED_HTML_CARD_DIRECTORY_DRY_RUN records=${records.length} sha256=${sha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("PAGINATED_HTML_CARD_DIRECTORY_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const target = outputPath(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
  console.log(`PAGINATED_HTML_CARD_DIRECTORY_WRITTEN records=${records.length} sha256=${sha256} output=${path.relative(ROOT, target)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

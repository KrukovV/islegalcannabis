#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
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
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attribute(attributes, name) {
  return String(attributes || "").match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i"))?.slice(1).find((value) => value !== undefined) || "";
}

function formFields(html) {
  const fields = [];
  for (const match of String(html || "").matchAll(/<input\b([^>]*)>/gi)) {
    const attributes = match[1];
    const name = attribute(attributes, "name");
    const type = text(attribute(attributes, "type")).toLowerCase();
    const checked = /\bchecked(?:\s|=|>)/i.test(attributes);
    if (!name || ["submit", "button", "file", "image", "reset"].includes(type)) continue;
    if (["checkbox", "radio"].includes(type) && !checked) continue;
    fields.push([name, decodeHtml(attribute(attributes, "value"))]);
  }
  for (const match of String(html || "").matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const name = attribute(match[1], "name");
    if (name) fields.push([name, decodeHtml(match[2])]);
  }
  for (const match of String(html || "").matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = attribute(match[1], "name");
    if (!name) continue;
    const options = [...match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
    const selected = options.find((option) => /\bselected(?:\s|=|>)/i.test(option[1])) || options[0];
    fields.push([name, decodeHtml(attribute(selected?.[1] || "", "value"))]);
  }
  if (!fields.some(([name]) => name === "__VIEWSTATE")) {
    throw new Error("ASP_NET_WEBFORMS_REQUIRED_STATE_FIELDS_MISSING");
  }
  return fields;
}

function setField(fields, name, value) {
  const retained = fields.filter(([key]) => key !== name);
  retained.push([name, value]);
  return retained;
}

function integer(value, code) {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`ASP_NET_WEBFORMS_${code}_INVALID`);
  return parsed;
}

function tableById(html, id) {
  const stack = [];
  for (const match of String(html || "").matchAll(/<\/?table\b[^>]*>/gi)) {
    const closing = /^<\/table/i.test(match[0]);
    if (!closing) {
      stack.push({ start: match.index, tagEnd: match.index + match[0].length, attributes: match[0] });
      continue;
    }
    const opening = stack.pop();
    if (opening && attribute(opening.attributes, "id") === id) {
      return { tag: opening.attributes, html: String(html).slice(opening.start, match.index + match[0].length) };
    }
  }
  throw new Error("ASP_NET_WEBFORMS_RESULT_TABLE_NOT_FOUND");
}

function tableRows(tableHtml) {
  return [...String(tableHtml || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => text(decodeHtml(cell[1]))));
}

function tableRecords(tableHtml, headers, recordKeyHeader, recordKeyPattern) {
  const rows = tableRows(tableHtml);
  const wanted = headers.map(text);
  if (wanted.length === 0 || new Set(wanted).size !== wanted.length) throw new Error("ASP_NET_WEBFORMS_HEADERS_INVALID");
  const headerRow = rows.find((row) => wanted.every((header) => row.includes(header)));
  if (!headerRow) throw new Error("ASP_NET_WEBFORMS_RESULT_HEADERS_MISSING");
  const indexes = wanted.map((header) => headerRow.indexOf(header));
  const keyIndex = wanted.indexOf(recordKeyHeader);
  if (keyIndex < 0) throw new Error("ASP_NET_WEBFORMS_RECORD_KEY_HEADER_MISSING");
  const recordMatcher = new RegExp(recordKeyPattern);
  const records = rows
    .filter((row) => indexes.every((index) => row[index] !== undefined) && recordMatcher.test(text(row[indexes[keyIndex]])))
    .map((row) => Object.fromEntries(wanted.map((header, index) => [header, row[indexes[index]]])))
    .filter((row) => text(row[recordKeyHeader]));
  if (records.length === 0) throw new Error("ASP_NET_WEBFORMS_RESULT_ROWS_MISSING");
  return records;
}

function pageTargets(html) {
  const targets = new Map();
  const links = [...String(html || "").matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const link of links) {
    const href = decodeHtml(attribute(link[1], "href"));
    const postback = href.match(/^javascript:__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)$/i);
    if (!postback) continue;
    const label = text(decodeHtml(link[2]));
    if (/^\d+$/.test(label)) targets.set(Number(label), { eventTarget: postback[1], eventArgument: postback[2] });
    if (/^Next\b/i.test(label)) targets.set("next", { eventTarget: postback[1], eventArgument: postback[2] });
  }
  return targets;
}

function pageInfo(html, options) {
  const table = tableById(html, options.tableId);
  const pageCount = integer(attribute(table.tag, "PageCount"), "PAGE_COUNT");
  return {
    pageCount,
    records: tableRecords(table.html, options.headers, options.recordKeyHeader, options.recordKeyPattern),
    targets: pageTargets(table.html),
  };
}

function cookieJar() {
  const values = new Map();
  return {
    absorb(response) {
      const cookies = typeof response?.headers?.getSetCookie === "function" ? response.headers.getSetCookie() : [];
      for (const header of cookies) {
        const pair = String(header || "").split(";", 1)[0];
        const separator = pair.indexOf("=");
        if (separator > 0) values.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    },
    header() {
      return [...values.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    },
  };
}

async function htmlResponse(response, code) {
  if (!response?.ok) throw new Error(`ASP_NET_WEBFORMS_HTTP_${response?.status || "NETWORK"}:${code}`);
  const contentType = text(response.headers?.get?.("content-type")).toLowerCase();
  if (!contentType.includes("text/html")) throw new Error(`ASP_NET_WEBFORMS_CONTENT_TYPE_INVALID:${contentType || "MISSING"}`);
  return response.text();
}

export async function collectAspNetWebFormsStoreDirectory({
  url,
  searchEventTarget,
  searchFields = {},
  tableId,
  headers,
  recordKeyHeader,
  recordKeyPattern,
  expectedMinimumRecords = 1,
  maxPages = 250,
  fetchImpl = globalThis.fetch,
}) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:") throw new Error("ASP_NET_WEBFORMS_URL_MUST_USE_HTTPS");
  if (typeof fetchImpl !== "function") throw new Error("ASP_NET_WEBFORMS_FETCH_UNAVAILABLE");
  if (!text(searchEventTarget) || !text(tableId) || !text(recordKeyHeader) || !text(recordKeyPattern)) throw new Error("ASP_NET_WEBFORMS_REQUIRED_CONFIGURATION_MISSING");
  const minimum = integer(expectedMinimumRecords, "EXPECTED_MINIMUM_RECORDS");
  const pageLimit = integer(maxPages, "MAX_PAGES");
  const jar = cookieJar();
  const requestHeaders = { accept: "text/html,application/xhtml+xml", "user-agent": "isLegalCannabis store-source audit/1.0" };
  const fetchPage = async (init, code) => {
    const response = await fetchImpl(endpoint, init);
    jar.absorb(response);
    return htmlResponse(response, code);
  };
  const initial = await fetchPage({ headers: requestHeaders }, "INITIAL");
  const postback = async (html, eventTarget, eventArgument = "", overrides = {}) => {
    let fields = formFields(html);
    fields = setField(fields, "__EVENTTARGET", eventTarget);
    fields = setField(fields, "__EVENTARGUMENT", eventArgument);
    for (const [name, value] of Object.entries(overrides)) fields = setField(fields, name, String(value));
    return fetchPage({
      method: "POST",
      headers: {
        ...requestHeaders,
        "content-type": "application/x-www-form-urlencoded",
        cookie: jar.header(),
        referer: endpoint.toString(),
      },
      body: new URLSearchParams(fields),
    }, "POSTBACK");
  };

  let currentHtml = await postback(initial, searchEventTarget, "", searchFields);
  let current = pageInfo(currentHtml, { tableId, headers, recordKeyHeader, recordKeyPattern });
  const records = [...current.records];
  const seen = new Set(records.map((record) => text(record[recordKeyHeader])));
  let pagesFetched = 1;
  while (current.targets.has("next")) {
    if (pagesFetched >= pageLimit) throw new Error(`ASP_NET_WEBFORMS_PAGE_LIMIT_EXCEEDED:${pagesFetched}/${pageLimit}`);
    const target = current.targets.get("next");
    currentHtml = await postback(currentHtml, target.eventTarget, target.eventArgument, searchFields);
    current = pageInfo(currentHtml, { tableId, headers, recordKeyHeader, recordKeyPattern });
    pagesFetched += 1;
    for (const record of current.records) {
      const key = text(record[recordKeyHeader]);
      if (seen.has(key)) throw new Error(`ASP_NET_WEBFORMS_DUPLICATE_RECORD_KEY:${key}`);
      seen.add(key);
      records.push(record);
    }
  }
  if (records.length < minimum) throw new Error(`ASP_NET_WEBFORMS_RECORD_COUNT_BELOW_MINIMUM:${records.length}/${minimum}`);
  return {
    source_url: endpoint.toString(),
    pages_fetched: pagesFetched,
    reported_page_count: current.pageCount,
    records_fetched: records.length,
    records,
  };
}

function requiredArg(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? text(process.argv[index + 1]) : "";
  if (!value) throw new Error(`ASP_NET_WEBFORMS_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
  return value;
}

function repeatedArgs(name) {
  return process.argv.flatMap((value, index) => value === name ? [text(process.argv[index + 1])] : []).filter(Boolean);
}

function parseField(value) {
  const separator = value.indexOf("=");
  if (separator < 1) throw new Error("ASP_NET_WEBFORMS_SEARCH_FIELD_INVALID");
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function outputPath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("ASP_NET_WEBFORMS_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  return absolute;
}

async function main() {
  const output = requiredArg("--output");
  const expectedMinimum = process.argv.includes("--expected-minimum-records") ? requiredArg("--expected-minimum-records") : "1";
  const maxPages = process.argv.includes("--max-pages") ? requiredArg("--max-pages") : "250";
  const collection = await collectAspNetWebFormsStoreDirectory({
    url: requiredArg("--url"),
    searchEventTarget: requiredArg("--search-event-target"),
    searchFields: Object.fromEntries(repeatedArgs("--search-field").map(parseField)),
    tableId: requiredArg("--table-id"),
    headers: repeatedArgs("--header"),
    recordKeyHeader: requiredArg("--record-key-header"),
    recordKeyPattern: requiredArg("--record-key-pattern"),
    expectedMinimumRecords: expectedMinimum,
    maxPages,
  });
  const snapshot = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    source: "ASP_NET_WEBFORMS_PAGINATED_PUBLIC_DIRECTORY",
    collection,
    records: collection.records,
  };
  const encoded = `${JSON.stringify(snapshot, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(encoded).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`ASP_NET_WEBFORMS_DIRECTORY_DRY_RUN pages=${collection.pages_fetched} records=${collection.records_fetched} sha256=${sha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("ASP_NET_WEBFORMS_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const target = outputPath(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, encoded);
  console.log(`ASP_NET_WEBFORMS_DIRECTORY_WRITTEN output=${path.relative(ROOT, target)} pages=${collection.pages_fetched} records=${collection.records_fetched} sha256=${sha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

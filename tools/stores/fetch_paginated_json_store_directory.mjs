#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value || "").trim();
}

function requiredArg(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? text(process.argv[index + 1]) : "";
  if (!value) throw new Error(`PAGINATED_STORE_DIRECTORY_${name.slice(2).toUpperCase().replace(/-/g, "_")}_REQUIRED`);
  return value;
}

function integer(value, label) {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`PAGINATED_STORE_DIRECTORY_${label}_INVALID`);
  return parsed;
}

function withinRepository(filePath) {
  const relative = path.relative(ROOT, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function pageUrl(baseUrl, pageParameter, pageNumber) {
  const url = new URL(baseUrl);
  url.searchParams.set(pageParameter, String(pageNumber));
  return url.toString();
}

function metadataOf(payload, pageNumber) {
  const metadata = payload?.metadata;
  if (!metadata || typeof metadata !== "object") throw new Error(`PAGINATED_STORE_DIRECTORY_METADATA_MISSING:${pageNumber}`);
  const currentPage = integer(metadata.currentPage, `CURRENT_PAGE_${pageNumber}`);
  const totalPages = integer(metadata.totalPages, `TOTAL_PAGES_${pageNumber}`);
  const totalCount = integer(metadata.totalCount, `TOTAL_COUNT_${pageNumber}`);
  if (!Array.isArray(payload?.data)) throw new Error(`PAGINATED_STORE_DIRECTORY_DATA_MISSING:${pageNumber}`);
  return { currentPage, totalPages, totalCount, pageSize: integer(metadata.pageSize, `PAGE_SIZE_${pageNumber}`) };
}

async function readPage(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response?.ok) throw new Error(`PAGINATED_STORE_DIRECTORY_HTTP_${response?.status || "NETWORK"}:${url}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`PAGINATED_STORE_DIRECTORY_JSON_INVALID:${url}`);
  }
}

export async function collectPaginatedJsonStoreDirectory({ baseUrl, pageParameter = "pageNumber", fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") throw new Error("PAGINATED_STORE_DIRECTORY_FETCH_UNAVAILABLE");
  const firstUrl = pageUrl(baseUrl, pageParameter, 1);
  const firstPayload = await readPage(firstUrl, fetchImpl);
  const firstMetadata = metadataOf(firstPayload, 1);
  if (firstMetadata.currentPage !== 1) throw new Error(`PAGINATED_STORE_DIRECTORY_PAGE_MISMATCH:expected=1:actual=${firstMetadata.currentPage}`);

  const pages = [firstPayload];
  for (let pageNumber = 2; pageNumber <= firstMetadata.totalPages; pageNumber += 1) {
    const payload = await readPage(pageUrl(baseUrl, pageParameter, pageNumber), fetchImpl);
    const metadata = metadataOf(payload, pageNumber);
    if (metadata.currentPage !== pageNumber) throw new Error(`PAGINATED_STORE_DIRECTORY_PAGE_MISMATCH:expected=${pageNumber}:actual=${metadata.currentPage}`);
    if (metadata.totalPages !== firstMetadata.totalPages || metadata.totalCount !== firstMetadata.totalCount || metadata.pageSize !== firstMetadata.pageSize) {
      throw new Error(`PAGINATED_STORE_DIRECTORY_METADATA_DRIFT:page=${pageNumber}`);
    }
    pages.push(payload);
  }

  const data = pages.flatMap((page) => page.data);
  if (data.length !== firstMetadata.totalCount) {
    throw new Error(`PAGINATED_STORE_DIRECTORY_ROW_COUNT_MISMATCH:expected=${firstMetadata.totalCount}:actual=${data.length}`);
  }
  return {
    source_url: baseUrl,
    page_parameter: pageParameter,
    source_metadata: firstPayload.metadata,
    pages_fetched: pages.length,
    records_fetched: data.length,
    data,
  };
}

async function main() {
  const baseUrl = requiredArg("--url");
  const output = path.resolve(ROOT, requiredArg("--output"));
  if (!withinRepository(output)) throw new Error("PAGINATED_STORE_DIRECTORY_OUTPUT_MUST_BE_WITHIN_REPOSITORY");
  const pageParameter = text(process.argv.includes("--page-parameter") ? requiredArg("--page-parameter") : "pageNumber");
  const collection = await collectPaginatedJsonStoreDirectory({ baseUrl, pageParameter });
  const payload = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    collection,
  };
  const encoded = `${JSON.stringify(payload, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(encoded).digest("hex");
  if (!process.argv.includes("--write")) {
    console.log(`PAGINATED_STORE_DIRECTORY_DRY_RUN pages=${collection.pages_fetched} records=${collection.records_fetched} sha256=${sha256}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("PAGINATED_STORE_DIRECTORY_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, encoded);
  console.log(`PAGINATED_STORE_DIRECTORY_WRITTEN output=${path.relative(ROOT, output)} pages=${collection.pages_fetched} records=${collection.records_fetched} sha256=${sha256}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

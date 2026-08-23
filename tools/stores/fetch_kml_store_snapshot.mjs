#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function validateKmlSnapshotResponse({ url, contentType, body }) {
  const parsed = new URL(text(url));
  if (parsed.protocol !== "https:") throw new Error("STORE_KML_SNAPSHOT_URL_HTTPS_REQUIRED");
  const content = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "");
  const normalizedType = text(contentType).toLowerCase();
  if (normalizedType && !/(?:xml|kml)/.test(normalizedType)) throw new Error("STORE_KML_SNAPSHOT_CONTENT_TYPE_INVALID");
  if (!/<kml(?:\s|>)/i.test(content) || !/<Placemark(?:\s|>)/i.test(content)) {
    throw new Error("STORE_KML_SNAPSHOT_PAYLOAD_INVALID");
  }
  return { placemarks: [...content.matchAll(/<Placemark(?:\s|>)/gi)].length, sha256: sha256(Buffer.from(content, "utf8")) };
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

async function main() {
  const url = readArg("--url");
  const outputPath = readArg("--output");
  const expectedSha256 = readArg("--expected-sha256").toLowerCase();
  if (!url || !outputPath || !expectedSha256) throw new Error("STORE_KML_SNAPSHOT_USAGE:--url <https-url> --output <local-kml> --expected-sha256 <sha256> --write");
  if (!process.argv.includes("--write") || process.env.STORE_TRUTH_WRITE !== "1") throw new Error("STORE_KML_SNAPSHOT_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("STORE_KML_SNAPSHOT_EXPECTED_SHA256_INVALID");
  const output = path.resolve(ROOT, outputPath);
  const relative = path.relative(ROOT, output);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("STORE_KML_SNAPSHOT_OUTPUT_MUST_BE_LOCAL");
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`STORE_KML_SNAPSHOT_HTTP_${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const validated = validateKmlSnapshotResponse({ url, contentType: response.headers.get("content-type"), body });
  if (validated.sha256 !== expectedSha256) throw new Error(`STORE_KML_SNAPSHOT_SHA256_DRIFT:${validated.sha256}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, body);
  console.log(`STORE_KML_SNAPSHOT_WRITTEN placemarks=${validated.placemarks} sha256=${validated.sha256} output=${relative} url=${url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

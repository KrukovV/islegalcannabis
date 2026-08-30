#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractStoreSourcePayload } from "./store_source_adapters.mjs";
import { normalizeStoreSnapshot } from "./store_record_normalizer.mjs";
import { isIndependentlyValidatedStoreSource, isRetainablePendingStoreSource } from "./store_source_validation.mjs";
import { appendStoreObservationHistory } from "./store_observation_history.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES_PATH = path.join(ROOT, "data/store_truth/store_source_registry.json");
const RECORDS_PATH = path.join(ROOT, "data/store_truth/canonical_store_records.json");
const HISTORY_PATH = path.join(ROOT, "data/store_truth/store_snapshot_history.json");
const OBSERVATIONS_PATH = path.join(ROOT, "data/store_truth/store_observation_history.json");

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

export function sourceScopedObservationRecords(records, sourceId) {
  return (Array.isArray(records) ? records : []).filter((record) => String(record?.source_id || "").trim() === String(sourceId || "").trim());
}

function main() {
  const sourceId = readArg("--source-id");
  const snapshotPath = readArg("--snapshot");
  const writeRequested = process.argv.includes("--write");
  const retainPendingSource = process.argv.includes("--retain-pending-source");
  if (!sourceId || !snapshotPath) {
    throw new Error("STORE_INGEST_USAGE:--source-id <id> --snapshot <local-path> [--write]");
  }
  const absoluteSnapshotPath = path.resolve(ROOT, snapshotPath);
  assertLocalSnapshot(absoluteSnapshotPath);
  const sources = readJson(SOURCES_PATH, { sources: [] }).sources || [];
  const source = sources.find((item) => item.source_id === sourceId);
  const validatedSource = isIndependentlyValidatedStoreSource(source);
  const retainablePendingSource = retainPendingSource && isRetainablePendingStoreSource(source);
  if (!validatedSource && !retainablePendingSource) {
    throw new Error("STORE_INGEST_SOURCE_NOT_VALIDATED_OFFICIAL");
  }
  const raw = fs.readFileSync(absoluteSnapshotPath);
  const payload = ["CSV", "KML"].includes(source.source_type) ? raw.toString("utf8") : JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  const extraction = extractStoreSourcePayload(source, payload);
  const observedAt = new Date().toISOString();
  if (extraction.extraction_state !== "EXTRACTED") {
    console.log(`STORE_INGEST_NEEDS_REVIEW source=${sourceId} format=${extraction.format} records=${extraction.records.length} reasons=${extraction.reasons.join(",")}`);
    return;
  }
  const prior = readJson(RECORDS_PATH, { records: [] }).records || [];
  const normalized = normalizeStoreSnapshot({ source, rawRecords: extraction.records, priorRecords: prior, observedAt });
  if (!writeRequested) {
    console.log(`STORE_INGEST_DRY_RUN source=${sourceId} retention=${retainablePendingSource ? "PENDING_C3_BLOCKED" : "VALIDATED"} format=${extraction.format} extracted=${extraction.records.length} normalized=${normalized.summary.normalized} retained_missing=${normalized.summary.retained_missing_from_source}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") {
    throw new Error("STORE_INGEST_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  }
  const history = readJson(HISTORY_PATH, { schema_version: 1, snapshots: [] });
  const observationHistory = readJson(OBSERVATIONS_PATH, { schema_version: 1, observations: [] });
  const snapshotSha256 = crypto.createHash("sha256").update(raw).digest("hex");
  const snapshotEntry = {
    snapshot_id: `${sourceId}:${snapshotSha256.slice(0, 16)}`,
    source_id: sourceId,
    observed_at: observedAt,
    input_path: path.relative(ROOT, absoluteSnapshotPath),
    input_sha256: snapshotSha256,
    extraction_state: extraction.extraction_state,
    format: extraction.format,
    extracted_records: extraction.records.length,
    normalized_records: normalized.summary.normalized,
    retained_missing_from_source: normalized.summary.retained_missing_from_source,
    local_only: true,
  };
  const snapshots = [...(history.snapshots || []).filter((entry) => entry.snapshot_id !== snapshotEntry.snapshot_id), snapshotEntry].slice(-200);
  const observations = appendStoreObservationHistory(observationHistory, sourceScopedObservationRecords(normalized.records, sourceId), observedAt);
  fs.writeFileSync(RECORDS_PATH, `${JSON.stringify({ schema_version: 1, generated_at: observedAt, purpose: "Canonical normalized cannabis-store records. Records remain invisible until all legal/source/location gates pass.", records: normalized.records }, null, 2)}\n`);
  fs.writeFileSync(HISTORY_PATH, `${JSON.stringify({ schema_version: 1, snapshots }, null, 2)}\n`);
  fs.writeFileSync(OBSERVATIONS_PATH, `${JSON.stringify(observations, null, 2)}\n`);
  console.log(`STORE_INGEST_APPLIED_LOCAL source=${sourceId} retention=${retainablePendingSource ? "PENDING_C3_BLOCKED" : "VALIDATED"} format=${extraction.format} extracted=${extraction.records.length} normalized=${normalized.summary.normalized} retained_missing=${normalized.summary.retained_missing_from_source} observations=${observations.observations.length}`);
}

function assertLocalSnapshot(absolutePath) {
  const relative = path.relative(ROOT, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("STORE_INGEST_SNAPSHOT_MUST_BE_WITHIN_REPOSITORY");
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error("STORE_INGEST_SNAPSHOT_NOT_FOUND");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

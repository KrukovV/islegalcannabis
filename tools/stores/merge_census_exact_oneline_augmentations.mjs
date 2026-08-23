#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function text(value) {
  return String(value ?? "").trim();
}

function localPath(value) {
  const absolute = path.resolve(ROOT, text(value));
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("CENSUS_ONELINE_MERGE_PATH_OUTSIDE_REPOSITORY");
  return absolute;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readPayload(value) {
  const absolute = localPath(value);
  const raw = fs.readFileSync(absolute);
  const payload = JSON.parse(raw.toString("utf8"));
  if (text(payload?.census_benchmark) !== "Public_AR_Current" || !Array.isArray(payload?.records)) {
    throw new Error("CENSUS_ONELINE_MERGE_PAYLOAD_INVALID");
  }
  const inputSnapshotPath = text(payload?.input_snapshot_path || payload?.input_path);
  const inputSnapshotSha256 = text(payload?.input_snapshot_sha256 || payload?.input_sha256);
  const legacyCounts = payload?.counts || {};
  const requestedCandidates = Number(payload?.requested_candidates ?? legacyCounts.input_records);
  const acceptedRecords = Number(payload?.accepted_records ?? legacyCounts.one_to_one_exact_census_geocodes ?? payload.records.length);
  const blockedRecords = Number(payload?.blocked_records ?? legacyCounts.blocked_census_no_exact_in_jurisdiction_match);
  if (!inputSnapshotPath || !/^[a-f0-9]{64}$/i.test(inputSnapshotSha256) ||
    !Number.isInteger(requestedCandidates) || !Number.isInteger(acceptedRecords) || !Number.isInteger(blockedRecords) ||
    requestedCandidates !== acceptedRecords + blockedRecords || acceptedRecords !== payload.records.length) {
    throw new Error("CENSUS_ONELINE_MERGE_SOURCE_BINDING_INVALID");
  }
  return {
    absolute,
    raw,
    payload: {
      ...payload,
      input_snapshot_path: inputSnapshotPath,
      input_snapshot_sha256: inputSnapshotSha256,
      requested_candidates: requestedCandidates,
      accepted_records: acceptedRecords,
      blocked_records: blockedRecords,
    },
  };
}

export function mergeCensusExactOnelineAugmentations({ base, append, generatedAt = new Date().toISOString() }) {
  if (text(base?.input_snapshot_path) !== text(append?.input_snapshot_path) ||
    text(base?.input_snapshot_sha256).toLowerCase() !== text(append?.input_snapshot_sha256).toLowerCase()) {
    throw new Error("CENSUS_ONELINE_MERGE_SOURCE_BINDING_MISMATCH");
  }
  const merged = new Map();
  for (const record of [...base.records, ...append.records]) {
    const id = text(record?.source_record_id);
    if (!id) throw new Error("CENSUS_ONELINE_MERGE_RECORD_ID_MISSING");
    const prior = merged.get(id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(record)) throw new Error(`CENSUS_ONELINE_MERGE_RECORD_CONFLICT:${id}`);
    merged.set(id, record);
  }
  const requestedCandidates = Number(base.requested_candidates) + Number(append.requested_candidates);
  const acceptedRecords = merged.size;
  const blockedRecords = Number(base.blocked_records) + Number(append.blocked_records);
  if (!Number.isInteger(requestedCandidates) || !Number.isInteger(blockedRecords) || requestedCandidates !== acceptedRecords + blockedRecords) {
    throw new Error("CENSUS_ONELINE_MERGE_COUNTS_INVALID");
  }
  return {
    schema_version: 1,
    fetched_at: generatedAt,
    local_only: true,
    input_snapshot_path: text(base.input_snapshot_path),
    input_snapshot_sha256: text(base.input_snapshot_sha256).toLowerCase(),
    census_benchmark: "Public_AR_Current",
    match_policy: "ONE_MATCH_OPTIONAL_MATCH_TYPE_MATCH_OR_EXACT_SAME_CANONICAL_ONELINE_ADDRESS_AND_IN_DECLARED_BOUNDS",
    requested_candidates: requestedCandidates,
    accepted_records: acceptedRecords,
    blocked_records: blockedRecords,
    merged_from: [
      { path: text(base.__path), sha256: text(base.__sha256) },
      { path: text(append.__path), sha256: text(append.__sha256) },
    ],
    records: [...merged.values()].sort((left, right) => text(left.source_record_id).localeCompare(text(right.source_record_id))),
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

function main() {
  const basePath = argument("--base");
  const appendPath = argument("--append");
  const outputPath = argument("--output");
  if (!basePath || !appendPath || !outputPath) {
    throw new Error("CENSUS_ONELINE_MERGE_USAGE:--base <json> --append <json> --output <json> [--write]");
  }
  const baseInput = readPayload(basePath);
  const appendInput = readPayload(appendPath);
  const base = { ...baseInput.payload, __path: path.relative(ROOT, baseInput.absolute), __sha256: sha256(baseInput.raw) };
  const append = { ...appendInput.payload, __path: path.relative(ROOT, appendInput.absolute), __sha256: sha256(appendInput.raw) };
  const merged = mergeCensusExactOnelineAugmentations({ base, append });
  const serialized = `${JSON.stringify(merged, null, 2)}\n`;
  const digest = sha256(serialized);
  if (!process.argv.includes("--write")) {
    console.log(`CENSUS_ONELINE_MERGE_DRY_RUN requested=${merged.requested_candidates} accepted=${merged.accepted_records} blocked=${merged.blocked_records} sha256=${digest}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("CENSUS_ONELINE_MERGE_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  const absoluteOutput = localPath(outputPath);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, serialized);
  console.log(`CENSUS_ONELINE_MERGE_WRITTEN requested=${merged.requested_candidates} accepted=${merged.accepted_records} blocked=${merged.blocked_records} sha256=${digest} output=${path.relative(ROOT, absoluteOutput)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES_PATH = path.join(ROOT, "data", "store_truth", "store_source_registry.json");
const RECORDS_PATH = path.join(ROOT, "data", "store_truth", "canonical_store_records.json");
const HISTORY_PATH = path.join(ROOT, "data", "store_truth", "store_snapshot_history.json");
const OBSERVATIONS_PATH = path.join(ROOT, "data", "store_truth", "store_observation_history.json");

function text(value) {
  return String(value || "").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sourceIdArgument() {
  const index = process.argv.indexOf("--source-id");
  return index >= 0 ? text(process.argv[index + 1]) : "";
}

export function retireStoreSourceArtifacts({ sourceId, source, records, history, observations }) {
  if (!sourceId) throw new Error("STORE_SOURCE_RETIRE_SOURCE_ID_REQUIRED");
  if (!source || source.status !== "RETIRED") throw new Error("STORE_SOURCE_RETIRE_REQUIRES_RETIRED_SOURCE");
  const retainedRecords = (records || []).filter((record) => text(record?.source_id) !== sourceId);
  const retainedSnapshots = (history?.snapshots || []).filter((snapshot) => text(snapshot?.source_id) !== sourceId);
  const retainedObservations = (observations?.observations || []).filter((observation) => text(observation?.source_id) !== sourceId);
  return {
    records: retainedRecords,
    history: { ...history, snapshots: retainedSnapshots },
    observations: { ...observations, observations: retainedObservations },
    summary: {
      source_id: sourceId,
      removed_records: (records || []).length - retainedRecords.length,
      removed_snapshots: (history?.snapshots || []).length - retainedSnapshots.length,
      removed_observations: (observations?.observations || []).length - retainedObservations.length,
    },
  };
}

function main() {
  const sourceId = sourceIdArgument();
  const writeRequested = process.argv.includes("--write");
  const sourceRegistry = readJson(SOURCES_PATH);
  const source = (sourceRegistry.sources || []).find((item) => text(item?.source_id) === sourceId);
  const recordsDocument = readJson(RECORDS_PATH);
  const history = readJson(HISTORY_PATH);
  const observations = readJson(OBSERVATIONS_PATH);
  const result = retireStoreSourceArtifacts({
    sourceId,
    source,
    records: recordsDocument.records || [],
    history,
    observations,
  });
  if (!writeRequested) {
    console.log(`STORE_SOURCE_RETIRE_DRY_RUN source=${sourceId} records=${result.summary.removed_records} snapshots=${result.summary.removed_snapshots} observations=${result.summary.removed_observations}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("STORE_SOURCE_RETIRE_WRITE_REQUIRES_STORE_TRUTH_WRITE_1");
  writeJson(RECORDS_PATH, {
    ...recordsDocument,
    generated_at: new Date().toISOString(),
    records: result.records,
  });
  writeJson(HISTORY_PATH, result.history);
  writeJson(OBSERVATIONS_PATH, result.observations);
  console.log(`STORE_SOURCE_RETIRED_LOCAL source=${sourceId} records=${result.summary.removed_records} snapshots=${result.summary.removed_snapshots} observations=${result.summary.removed_observations}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

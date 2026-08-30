#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendStoreObservationHistory } from "./store_observation_history.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RECORDS_PATH = path.join(ROOT, "data/store_truth/canonical_store_records.json");
const OBSERVATIONS_PATH = path.join(ROOT, "data/store_truth/store_observation_history.json");

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function main() {
  const writeRequested = process.argv.includes("--write");
  const recordsEnvelope = readJson(RECORDS_PATH, { records: [] });
  const records = Array.isArray(recordsEnvelope.records) ? recordsEnvelope.records : [];
  const previous = readJson(OBSERVATIONS_PATH, { schema_version: 1, observations: [] });
  const observedAt = String(recordsEnvelope.generated_at || "").trim();
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) throw new Error("STORE_OBSERVATION_BACKFILL_GENERATED_AT_INVALID");
  const next = appendStoreObservationHistory(previous, records, observedAt);
  const added = next.observations.length - (Array.isArray(previous.observations) ? previous.observations.length : 0);
  if (!writeRequested) {
    console.log(`STORE_OBSERVATION_BACKFILL_DRY_RUN records=${records.length} previous=${Array.isArray(previous.observations) ? previous.observations.length : 0} added=${added} total=${next.observations.length}`);
    return;
  }
  if (process.env.STORE_TRUTH_WRITE !== "1") throw new Error("STORE_OBSERVATION_BACKFILL_REQUIRES_STORE_TRUTH_WRITE_1");
  fs.writeFileSync(OBSERVATIONS_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`STORE_OBSERVATION_BACKFILL_APPLIED records=${records.length} previous=${Array.isArray(previous.observations) ? previous.observations.length : 0} added=${added} total=${next.observations.length}`);
}

main();

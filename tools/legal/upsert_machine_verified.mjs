import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { writeMachineVerifiedEntries } from "./write_machine_verified.mjs";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "data", "legal_ssot", "machine_verified.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    iso2: "",
    url: "",
    snapshot: "",
    evidence: "",
    statusRecreational: "unknown",
    statusMedical: "unknown"
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--iso2" && value) options.iso2 = value.toUpperCase();
    if (args[i] === "--url" && value) options.url = value;
    if (args[i] === "--snapshot" && value) options.snapshot = value;
    if (args[i] === "--evidence" && value) options.evidence = value;
    if (args[i] === "--status_recreational" && value) {
      options.statusRecreational = value;
    }
    if (args[i] === "--status_medical" && value) {
      options.statusMedical = value;
    }
  }
  return options;
}

function main() {
  const { iso2, url, snapshot, evidence, statusRecreational, statusMedical } =
    parseArgs();
  if (!iso2 || !url || !snapshot || !evidence) {
    console.error("ERROR: missing required args");
    process.exit(1);
  }
  if (!fs.existsSync(evidence)) {
    console.error("ERROR: evidence file missing");
    process.exit(1);
  }
  const evidencePayload = readJson(evidence, {});
  const evidenceList = Array.isArray(evidencePayload?.evidence)
    ? evidencePayload.evidence
    : [];
  const evidenceKind = evidencePayload?.evidence_kind === "law" ? "law" : "non_law";
  if (evidenceList.length === 0) {
    console.error("ERROR: evidence missing");
    process.exit(1);
  }
  let contentHash = "";
  if (fs.existsSync(snapshot)) {
    contentHash = sha256(fs.readFileSync(snapshot));
  }
  const generatedAt = new Date().toISOString();
  const entry = {
    iso: iso2,
    iso2,
    status_recreational: statusRecreational,
    status_medical: statusMedical,
    medical_allowed: statusMedical === "legal",
    confidence: "machine",
    evidence: evidenceList,
    evidence_kind: evidenceKind,
    sources: [{ url, host: new URL(url).hostname, snapshot_ref: snapshot }],
    source_url: url,
    snapshot_ref: snapshot,
    snapshot_path: snapshot,
    content_hash: contentHash,
    verified_at: generatedAt,
    generated_at: generatedAt,
    model_id: "on_demand_v1"
  };
  writeMachineVerifiedEntries({
    entries: { [iso2]: entry },
    outputPath: OUTPUT_PATH,
    runId: process.env.RUN_ID || "",
    reason: "ON_DEMAND_UPSERT"
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

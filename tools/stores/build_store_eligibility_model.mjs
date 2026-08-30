#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");
const RECONCILIATION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");
const EVIDENCE_PATH = path.join(ROOT, "data/store_truth/store_eligibility_evidence.json");
const OUTPUT_PATH = path.join(ROOT, "data/store_truth/store_eligibility_model.json");
const OFFICIAL_CLASSES = new Set(["OFFICIAL_PRIMARY", "OFFICIAL_REGULATOR", "OFFICIAL_OPEN_DATA", "OFFICIAL_DELEGATED"]);
const AXES = {
  retail_legality: ["ADULT_USE_RETAIL"],
  medical_dispensary_legality: ["MEDICAL_DISPENSARY"],
  pharmacy_dispensing_legality: ["CANNABIS_PHARMACY", "AUTHORIZED_PHARMACY"],
  club_legality: ["CANNABIS_CLUB"],
};
const ALL_STORE_TYPES = [
  "ADULT_USE_RETAIL",
  "MEDICAL_DISPENSARY",
  "CANNABIS_PHARMACY",
  "AUTHORIZED_PHARMACY",
  "PATIENT_ACCESS_CENTER",
  "CANNABIS_CLUB",
  "OTHER_REGULATED_POINT",
];
const C3_VISUAL_REVIEW_PROTOCOL = /C3_(?:DIRECT(?:_OFFICIAL)?_BROWSER|RENDERED(?:_OFFICIAL)?_(?:PDF_)?PAGE)_VISUAL_REVIEW/;

function text(value) {
  return String(value || "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

export function canonicalTruthFingerprint(geoId, color, rule) {
  return [upper(geoId), upper(color), text(rule)].join(":");
}

function fingerprint({ geoId, canonicalTruth, storeType, state, evidenceIds }) {
  return `store-eligibility:${crypto.createHash("sha256").update([
    upper(geoId),
    canonicalTruth.fingerprint,
    storeType,
    state,
    [...evidenceIds].sort().join(","),
  ].join("\n")).digest("hex").slice(0, 24)}`;
}

export function isValidatedStoreEligibilityEvidence(evidence, geoId) {
  return upper(evidence?.geo_id) === upper(geoId) &&
    evidence?.status === "VALIDATED" &&
    ALL_STORE_TYPES.includes(upper(evidence?.store_type)) &&
    ["LEGAL", "NOT_LEGAL"].includes(upper(evidence?.legal_state)) &&
    evidence?.independent_of_store_registry === true &&
    evidence?.official === true &&
    OFFICIAL_CLASSES.has(evidence?.source_classification) &&
    evidence?.jurisdiction_validation === "VALID" &&
    ["PROVEN", "STRONG"].includes(evidence?.confidence) &&
    /^https:\/\//i.test(text(evidence?.source_url)) &&
    Boolean(text(evidence?.authority) && text(evidence?.exact_fragment) && text(evidence?.evidence_id)) &&
    !Number.isNaN(Date.parse(text(evidence?.reviewed_at))) &&
    C3_VISUAL_REVIEW_PROTOCOL.test(text(evidence?.review_protocol));
}

function defaultAxis(canonicalTruth, storeType) {
  const state = canonicalTruth.color === "RED"
    ? "NOT_LEGAL"
    : canonicalTruth.color === "UNKNOWN"
      ? "UNKNOWN"
      : "UNPROVEN";
  const reason = canonicalTruth.color === "RED"
    ? "CANONICAL_RED_TRUTH_EXCLUDES_LICENSED_CANNABIS_STORE_PROJECTION"
    : canonicalTruth.color === "UNKNOWN"
      ? "CANONICAL_LEGAL_TRUTH_UNKNOWN"
      : "CANONICAL_COLOR_ALONE_DOES_NOT_PROVE_STORE_TYPE_LEGALITY";
  return {
    state,
    reason,
    evidence_ids: [],
    fingerprint: fingerprint({ geoId: canonicalTruth.geo_id, canonicalTruth, storeType, state, evidenceIds: [] }),
  };
}

function deriveAxis(canonicalTruth, storeType, evidence) {
  const fallback = defaultAxis(canonicalTruth, storeType);
  if (!["GREEN", "YELLOW"].includes(canonicalTruth.color)) return fallback;
  const accepted = evidence.filter((item) => isValidatedStoreEligibilityEvidence(item, canonicalTruth.geo_id) && upper(item.store_type) === storeType);
  if (accepted.length === 0) return fallback;
  const evidenceIds = [...new Set(accepted.map((item) => text(item.evidence_id)))].sort();
  const states = new Set(accepted.map((item) => upper(item.legal_state)));
  const state = states.size === 1 && states.has("LEGAL")
    ? "PROVEN_LEGAL"
    : states.size === 1 && states.has("NOT_LEGAL")
      ? "NOT_LEGAL"
      : "UNPROVEN";
  const reason = state === "PROVEN_LEGAL"
    ? "INDEPENDENT_OFFICIAL_STORE_TYPE_EVIDENCE"
    : state === "NOT_LEGAL"
      ? "INDEPENDENT_OFFICIAL_STORE_TYPE_PROHIBITION"
      : "CONFLICTING_INDEPENDENT_STORE_TYPE_EVIDENCE";
  return {
    state,
    reason,
    evidence_ids: evidenceIds,
    fingerprint: fingerprint({ geoId: canonicalTruth.geo_id, canonicalTruth, storeType, state, evidenceIds }),
  };
}

function axisForTypes(canonicalTruth, types, evidence) {
  const parts = types.map((type) => deriveAxis(canonicalTruth, type, evidence));
  const states = new Set(parts.map((part) => part.state));
  const evidenceIds = [...new Set(parts.flatMap((part) => part.evidence_ids))].sort();
  const state = states.size === 1 ? parts[0].state : "UNPROVEN";
  const reason = states.size === 1 ? parts[0].reason : "STORE_TYPE_GROUP_EVIDENCE_CONFLICT";
  return {
    state,
    reason,
    evidence_ids: evidenceIds,
    fingerprint: fingerprint({ geoId: canonicalTruth.geo_id, canonicalTruth, storeType: types.join("+"), state, evidenceIds }),
  };
}

export function buildStoreEligibilityModel(reconciliation, evidenceEnvelope = { evidence: [] }) {
  if (!Array.isArray(reconciliation?.rows) || reconciliation.rows.length !== 307) {
    throw new Error(`STORE_ELIGIBILITY_CANONICAL_UNIVERSE_INVALID:${Array.isArray(reconciliation?.rows) ? reconciliation.rows.length : 0}`);
  }
  const evidence = Array.isArray(evidenceEnvelope?.evidence) ? evidenceEnvelope.evidence : [];
  const rows = reconciliation.rows.map((row) => {
    const canonicalTruth = {
      geo_id: upper(row.geo),
      color: upper(row.truthColor),
      rule: text(row.truthRuleId),
    };
    canonicalTruth.fingerprint = canonicalTruthFingerprint(canonicalTruth.geo_id, canonicalTruth.color, canonicalTruth.rule);
    const byStoreType = Object.fromEntries(ALL_STORE_TYPES.map((storeType) => [storeType, deriveAxis(canonicalTruth, storeType, evidence)]));
    const axes = Object.fromEntries(Object.entries(AXES).map(([axis, types]) => [axis, axisForTypes(canonicalTruth, types, evidence)]));
    return {
      geo_id: canonicalTruth.geo_id,
      canonical_truth_color: canonicalTruth.color,
      canonical_truth_rule: canonicalTruth.rule,
      canonical_truth_fingerprint: canonicalTruth.fingerprint,
      ...axes,
      by_store_type: byStoreType,
    };
  });
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    local_only: true,
    legal_truth_input: "data/reviews/wiki-truth-307-final-reconciliation.json",
    evidence_input: "data/store_truth/store_eligibility_evidence.json",
    contract: "Store-type legality is independent of store discovery and cannot be inferred from canonical truth color or a store record.",
    rows,
  };
}

function main() {
  const evidence = readJson(EVIDENCE_PATH, { evidence: [] });
  const model = buildStoreEligibilityModel(readJson(RECONCILIATION_PATH, { rows: [] }), evidence);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(model, null, 2)}\n`);
  const proven = model.rows.reduce((total, row) => total + Object.values(row.by_store_type).filter((axis) => axis.state === "PROVEN_LEGAL").length, 0);
  console.log(`STORE_ELIGIBILITY_MODEL geos=${model.rows.length} proven_store_types=${proven} evidence=${Array.isArray(evidence.evidence) ? evidence.evidence.length : 0} local_only=true`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");
const OUTPUT_PATH = path.join(ROOT, "data/b2b_evidence/source_review_operations.json");
const PENDING_STATES = new Set(["NEEDS_SEMANTIC_REVIEW", "NEEDS_VISUAL_REVIEW", "EFFECTIVE_DATE_REVIEW_DUE", "ACCESS_BLOCKED"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sourceChanged(source) {
  const state = String(source.revalidation?.revalidation_state || "NOT_RECORDED");
  const reason = String(source.revalidation?.change_reason || "NOT_RECORDED");
  return state === "CONTENT_CHANGED"
    || state === "REDIRECT_OR_OWNER_CHANGED"
    || /(?:DOCUMENT_SHA256_CHANGED|FINAL_URL_CHANGED|NEW_(?:DIRECT_)?OFFICIAL_SOURCE|REPLACES_THE_PRIOR)/.test(reason);
}

function categoryFor(kind, state, reason) {
  if (kind === "FRESHNESS_METADATA_GAP") return "FRESHNESS_METADATA_REVIEW";
  if (kind === "SOURCE_CHANGE") {
    if (state === "REDIRECT_OR_OWNER_CHANGED" || /FINAL_URL_CHANGED/.test(reason)) return "SOURCE_OWNER_OR_FINAL_URL_CHANGE";
    if (state === "CONTENT_CHANGED" || /DOCUMENT_SHA256_CHANGED/.test(reason)) return "SOURCE_CONTENT_CHANGE";
    return "SOURCE_IDENTITY_CHANGE";
  }
  if (state === "EFFECTIVE_DATE_REVIEW_DUE") return "EFFECTIVE_DATE_REVIEW";
  if (state === "NEEDS_VISUAL_REVIEW") return "VISUAL_REVIEW";
  if (state === "ACCESS_BLOCKED") return "ACCESS_REVIEW";
  if (/C0_SCHEMA|LOCATOR_MISSING|FRAGMENT_MISSING|OWNER_OR_APPLICABILITY/.test(reason)) return "SCHEMA_METADATA_REVIEW";
  return "SEMANTIC_REVIEW";
}

function outcomeFor(category) {
  if (category === "ACCESS_REVIEW") return "ACCESS_BLOCKED";
  if (category === "SCHEMA_METADATA_REVIEW" || category === "FRESHNESS_METADATA_REVIEW") return "APPLICABILITY_UNRESOLVED";
  return "CANONICAL_REVIEW_REQUIRED";
}

function readSources(sourcePath) {
  const ledger = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  return (ledger.rows || []).flatMap((row) => {
    const seen = new Set();
    return [...(row.primaryLaw?.officialSources || []), ...(row.primaryLaw?.freshAxisOfficialSources || [])]
      .map((source) => ({ source, url: String(source.url || "").trim() }))
      .filter(({ url }) => /^https?:\/\//.test(url) && !seen.has(url) && Boolean(seen.add(url)))
      .map(({ source, url }) => ({ geo: String(row.geo || "").trim().toUpperCase(), source, url }));
  });
}

function operationKey(geo, url, kind, state, reason) {
  return [geo, url, kind, state, reason].join("\u0000");
}

function recorded(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "NOT_RECORDED";
}

function signalIdentity({ geo, url, kind, source }) {
  const revalidation = source.revalidation || {};
  return sha256(JSON.stringify({
    geo,
    sourceUrl: url,
    eventKind: kind,
    revalidationState: recorded(revalidation.revalidation_state),
    changeReason: recorded(revalidation.change_reason),
    finalUrl: recorded(revalidation.final_url),
    httpStatus: revalidation.http_status ?? "NOT_RECORDED",
    accessState: recorded(revalidation.access_state),
    documentSha256: recorded(revalidation.document_sha256),
    relevantFragmentSha256: recorded(revalidation.relevant_fragment_sha256),
    etag: recorded(revalidation.etag),
    lastModified: recorded(revalidation.last_modified),
    sourceOwnerGeo: recorded(source.source_owner_geo),
    appliesToGeos: [...new Set((source.applies_to_geo || []).map((value) => String(value).trim().toUpperCase()).filter(Boolean))].sort()
  }));
}

function legacySignalIdentity(operation) {
  return sha256(JSON.stringify({
    geo: operation.geo,
    sourceUrl: operation.sourceUrl,
    eventKind: operation.eventKind,
    revalidationState: operation.revalidationStateAtOpen,
    changeReason: operation.changeReasonAtOpen,
    migrationState: "LEGACY_SIGNAL_DETAILS_NOT_RECORDED"
  }));
}

function eventKindsForSource(source) {
  const state = String(source.revalidation?.revalidation_state || "NOT_RECORDED");
  const kinds = [];
  if (sourceChanged(source)) kinds.push("SOURCE_CHANGE");
  if (PENDING_STATES.has(state)) kinds.push("PENDING_REVIEW");
  if (state === "NOT_RECORDED") kinds.push("FRESHNESS_METADATA_GAP");
  return kinds;
}

function buildOperation({ geo, source, url, kind, classifiedAt, signal }) {
  const state = String(source.revalidation?.revalidation_state || "NOT_RECORDED");
  const reason = String(source.revalidation?.change_reason || "NOT_RECORDED");
  const checkedAt = String(source.revalidation?.checked_at || "");
  const lastAttemptAt = Number.isFinite(Date.parse(checkedAt)) ? new Date(checkedAt).toISOString() : "NOT_RECORDED";
  const category = categoryFor(kind, state, reason);
  return {
    operationId: `SRCREV-${sha256(`${operationKey(geo, url, kind, state, reason)}\u0000${signal}`).slice(0, 24)}`,
    sourceIdentitySha256: sha256(`${geo}\u0000${url}`),
    geo,
    sourceUrl: url,
    eventKind: kind,
    category,
    openedAt: lastAttemptAt === "NOT_RECORDED" ? classifiedAt : lastAttemptAt,
    sourceChangeDetectedAt: kind === "SOURCE_CHANGE" ? lastAttemptAt : "NOT_RECORDED",
    lastAttemptAt,
    revalidationStateAtOpen: state,
    changeReasonAtOpen: reason,
    outcome: { state: outcomeFor(category), closedAt: null, evidenceUrl: url },
    publicationImpact: "PUBLICATION_RECONCILIATION_GATE_REMAINS_BLOCKED",
    boundary: "REVIEW_METADATA_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
  };
}

function buildAttempt({ operation, source, signal, classifiedAt }) {
  const revalidation = source.revalidation || {};
  const checkedAt = String(revalidation.checked_at || "");
  const sourceCheckedAt = Number.isFinite(Date.parse(checkedAt)) ? new Date(checkedAt).toISOString() : "NOT_RECORDED";
  return {
    attemptId: `SRCATT-${sha256(`${operation.operationId}\u0000${signal}\u0000${sourceCheckedAt}`).slice(0, 24)}`,
    operationId: operation.operationId,
    geo: operation.geo,
    sourceUrl: operation.sourceUrl,
    eventKind: operation.eventKind,
    attemptedAt: classifiedAt,
    sourceCheckedAt,
    signalIdentitySha256: signal,
    revalidationState: operation.revalidationStateAtOpen,
    changeReason: operation.changeReasonAtOpen,
    finalUrl: recorded(revalidation.final_url),
    documentSha256: recorded(revalidation.document_sha256),
    relevantFragmentSha256: recorded(revalidation.relevant_fragment_sha256),
    boundary: "SOURCE_REVIEW_ATTEMPT_ONLY_NO_REVIEW_CLOSURE"
  };
}

function buildLegacyAttempt(operation) {
  const signal = legacySignalIdentity(operation);
  const sourceCheckedAt = Number.isFinite(Date.parse(operation.lastAttemptAt))
    ? new Date(operation.lastAttemptAt).toISOString()
    : "NOT_RECORDED";
  return {
    attemptId: `SRCATT-${sha256(`${operation.operationId}\u0000${signal}\u0000${sourceCheckedAt}`).slice(0, 24)}`,
    operationId: operation.operationId,
    geo: operation.geo,
    sourceUrl: operation.sourceUrl,
    eventKind: operation.eventKind,
    attemptedAt: sourceCheckedAt === "NOT_RECORDED" ? operation.openedAt : sourceCheckedAt,
    sourceCheckedAt,
    signalIdentitySha256: signal,
    revalidationState: operation.revalidationStateAtOpen,
    changeReason: operation.changeReasonAtOpen,
    finalUrl: "NOT_RECORDED",
    documentSha256: "NOT_RECORDED",
    relevantFragmentSha256: "NOT_RECORDED",
    boundary: "SOURCE_REVIEW_ATTEMPT_ONLY_NO_REVIEW_CLOSURE"
  };
}

export function buildSourceReviewOperations({
  sourcePath = SOURCE_PATH,
  outputPath = OUTPUT_PATH,
  classifiedAt = new Date().toISOString()
} = {}) {
  const normalizedClassifiedAt = new Date(classifiedAt).toISOString();
  const existing = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, "utf8"))
    : { schemaVersion: 4, localOnly: true, appendOnly: true, createdAt: normalizedClassifiedAt, operations: [], attempts: [], resolutions: [] };
  if (![3, 4].includes(existing.schemaVersion) || existing.localOnly !== true || existing.appendOnly !== true) {
    throw new Error(`SOURCE_REVIEW_REGISTRY_SCHEMA_INVALID=${existing.schemaVersion || "MISSING"}`);
  }
  const existingOperations = Array.isArray(existing.operations) ? existing.operations : [];
  const existingAttempts = Array.isArray(existing.attempts) ? existing.attempts : [];
  const existingResolutions = Array.isArray(existing.resolutions) ? existing.resolutions : [];
  if (existing.schemaVersion === 3 && existingResolutions.length) {
    throw new Error("SOURCE_REVIEW_V3_RESOLUTION_SIGNAL_IDENTITY_MISSING");
  }
  const resolvedBefore = new Set(existingResolutions.map((resolution) => resolution.operationId));
  const attempts = existingAttempts.map((attempt) => structuredClone(attempt));
  const attemptsByOperation = new Map();
  const attemptIds = new Set();
  for (const attempt of attempts) {
    attemptIds.add(attempt.attemptId);
    const values = attemptsByOperation.get(attempt.operationId) || [];
    values.push(attempt);
    attemptsByOperation.set(attempt.operationId, values);
  }
  const byKey = new Map();
  for (const operation of existingOperations) {
    const key = operationKey(operation.geo, operation.sourceUrl, operation.eventKind, operation.revalidationStateAtOpen, operation.changeReasonAtOpen);
    const values = byKey.get(key) || [];
    values.push(operation);
    byKey.set(key, values);
  }
  const currentSignals = new Set();
  const currentCounts = { SOURCE_CHANGE: 0, PENDING_REVIEW: 0, FRESHNESS_METADATA_GAP: 0 };
  const sources = readSources(sourcePath);
  for (const item of sources) {
    const state = String(item.source.revalidation?.revalidation_state || "NOT_RECORDED");
    const kinds = eventKindsForSource(item.source);
    for (const kind of kinds) {
      const reason = String(item.source.revalidation?.change_reason || "NOT_RECORDED");
      const key = operationKey(item.geo, item.url, kind, state, reason);
      const signal = signalIdentity({ ...item, kind });
      currentSignals.add(`${key}\u0000${signal}`);
      currentCounts[kind] += 1;
      const prior = byKey.get(key) || [];
      let operation = prior.find((candidate) => (
        attemptsByOperation.get(candidate.operationId) || []
      ).some((attempt) => attempt.signalIdentitySha256 === signal));
      if (!operation) {
        const unresolvedLegacy = prior.find((candidate) => (
          !resolvedBefore.has(candidate.operationId) && !(attemptsByOperation.get(candidate.operationId) || []).length
        ));
        operation = unresolvedLegacy || buildOperation({ ...item, kind, classifiedAt: normalizedClassifiedAt, signal });
        if (!unresolvedLegacy) prior.push(operation);
        byKey.set(key, prior);
      }
      const attempt = buildAttempt({ operation, source: item.source, signal, classifiedAt: normalizedClassifiedAt });
      if (!attemptIds.has(attempt.attemptId)) {
        attempts.push(attempt);
        attemptIds.add(attempt.attemptId);
        const values = attemptsByOperation.get(operation.operationId) || [];
        values.push(attempt);
        attemptsByOperation.set(operation.operationId, values);
      }
    }
  }
  const operations = [...byKey.values()].flat().sort((left, right) => left.operationId.localeCompare(right.operationId));
  for (const operation of operations) {
    if ((attemptsByOperation.get(operation.operationId) || []).length) continue;
    const attempt = buildLegacyAttempt(operation);
    if (!attemptIds.has(attempt.attemptId)) attempts.push(attempt);
  }
  // C1 reachability, HTTP 304, or byte equality never closes a semantic,
  // effective-date, visual, applicability, or source-change review. A
  // resolution is appended only by the explicit human-review command, which
  // records reviewer, evidence, note, and real close time.
  const resolutions = [...existingResolutions];
  const resolvedOperationIds = new Set(resolutions.map((resolution) => resolution.operationId));
  const output = { ...existing, schemaVersion: 4, localOnly: true, appendOnly: true, operations, attempts, resolutions };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  const operationsById = new Map(operations.map((operation) => [operation.operationId, operation]));
  const classifiedSignals = new Set(attempts.flatMap((attempt) => {
    const operation = operationsById.get(attempt.operationId);
    if (!operation) return [];
    return [`${operationKey(operation.geo, operation.sourceUrl, operation.eventKind, operation.revalidationStateAtOpen, operation.changeReasonAtOpen)}\u0000${attempt.signalIdentitySha256}`];
  }));
  const currentClassified = [...currentSignals].filter((signal) => classifiedSignals.has(signal)).length;
  if (currentClassified !== currentSignals.size) throw new Error(`SOURCE_REVIEW_CURRENT_CLASSIFICATION_MISMATCH=${currentClassified}/${currentSignals.size}`);
  return {
    sourceCount: sources.length,
    currentEventCount: currentSignals.size,
    currentCounts,
    appendOnlyTotal: operations.length,
    attemptTotal: attempts.length,
    resolutionTotal: resolutions.length,
    openOperationTotal: operations.length - resolutions.length
  };
}

function main() {
  const openedAtArg = process.argv.find((arg) => arg.startsWith("--opened-at="));
  const result = buildSourceReviewOperations({ classifiedAt: openedAtArg ? openedAtArg.slice("--opened-at=".length) : new Date().toISOString() });
  console.log(`SOURCE_REVIEW_SOURCE_COUNT=${result.sourceCount}`);
  console.log(`SOURCE_REVIEW_CURRENT_EVENT_COUNT=${result.currentEventCount}`);
  console.log(`SOURCE_REVIEW_CURRENT_COUNTS=${JSON.stringify(result.currentCounts)}`);
  console.log(`SOURCE_REVIEW_APPEND_ONLY_TOTAL=${result.appendOnlyTotal}`);
  console.log(`SOURCE_REVIEW_ATTEMPT_TOTAL=${result.attemptTotal}`);
  console.log(`SOURCE_REVIEW_RESOLUTION_TOTAL=${result.resolutionTotal}`);
  console.log(`SOURCE_REVIEW_OPEN_OPERATION_TOTAL=${result.openOperationTotal}`);
  console.log("UNCLASSIFIED_CURRENT_REVIEW_EVENTS=0");
  console.log("LEGAL_TRUTH_CHANGED=false");
  console.log("STORE_TRUTH_CHANGED=false");
  console.log("PRODUCTION_TOUCHED=false");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

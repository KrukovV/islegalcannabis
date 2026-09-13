#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  exactFileSnapshot,
  validateRegistry,
  withOwnedRegistryLock
} from "./resolve_source_review_operation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");
const OUTPUT_PATH = path.join(ROOT, "data/b2b_evidence/source_review_operations.json");
const OFFICIAL_REGISTRY_PATH = path.join(ROOT, "data/official/official_domains.ssot.json");
const OWNERSHIP_PATH = path.join(ROOT, "data/ssot/official_link_ownership.json");
const CANONICAL_GEOS_PATH = path.join(ROOT, "data/reviews/geo-list-307.json");
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

function readSources(sourceBytes) {
  const ledger = JSON.parse(sourceBytes.toString("utf8"));
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

function normalizedOwnerAlias(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || "NOT_RECORDED";
}

function sourceOwnerGeo(source) {
  const aliases = [source.sourceOwnerGeo, source.source_owner_geo, source.source_owner_scope]
    .filter((value) => value !== undefined && value !== null)
    .map(normalizedOwnerAlias);
  const distinct = [...new Set(aliases)];
  if (distinct.length > 1) {
    throw new Error(`SOURCE_REVIEW_SOURCE_OWNER_ALIAS_CONFLICT=${distinct.join("|")}`);
  }
  return distinct[0] || "NOT_RECORDED";
}

function appliesToGeos(source) {
  const aliases = [source.appliesToGeos, source.applies_to_geo, source.applies_to_geos]
    .filter((value) => value !== undefined && value !== null)
    .map((values) => {
      if (!Array.isArray(values)) throw new Error("SOURCE_REVIEW_APPLICABILITY_ALIAS_INVALID");
      return [...new Set(values.map((value) => String(value).trim().toUpperCase()).filter(Boolean))].sort();
    });
  const identities = [...new Set(aliases.map((values) => JSON.stringify(values)))];
  if (identities.length > 1) {
    throw new Error(`SOURCE_REVIEW_APPLICABILITY_ALIAS_CONFLICT=${identities.join("|")}`);
  }
  return aliases[0] || [];
}

function signalPayload({ geo, url, kind, source }) {
  const revalidation = source.revalidation || {};
  return {
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
    sourceOwnerGeo: sourceOwnerGeo(source),
    appliesToGeos: appliesToGeos(source)
  };
}

function withoutOwnerApplicability(payload) {
  const { sourceOwnerGeo: _sourceOwnerGeo, appliesToGeos: _appliesToGeos, ...rest } = payload;
  return rest;
}

function isCanonicalOwnershipUpgrade(attempt, payload) {
  if (
    attempt.signalIdentityFormat !== "SOURCE_REVIEW_SIGNAL_V1"
    || attempt.signalPayload?.sourceOwnerGeo !== "NOT_RECORDED"
    || attempt.signalPayload?.appliesToGeos?.length !== 0
    || (payload.sourceOwnerGeo === "NOT_RECORDED" && payload.appliesToGeos.length === 0)
  ) return false;
  return JSON.stringify(withoutOwnerApplicability(attempt.signalPayload))
    === JSON.stringify(withoutOwnerApplicability(payload));
}

function signalIdentity(payload) {
  return sha256(JSON.stringify(payload));
}

function legacySignalPreimage(operation) {
  return {
    geo: operation.geo,
    sourceUrl: operation.sourceUrl,
    eventKind: operation.eventKind,
    revalidationState: operation.revalidationStateAtOpen,
    changeReason: operation.changeReasonAtOpen,
    migrationState: "LEGACY_SIGNAL_DETAILS_NOT_RECORDED"
  };
}

function legacySignalPayload(operation, attempt = {}) {
  return {
    geo: operation.geo,
    sourceUrl: operation.sourceUrl,
    eventKind: operation.eventKind,
    revalidationState: operation.revalidationStateAtOpen,
    changeReason: operation.changeReasonAtOpen,
    finalUrl: recorded(attempt.finalUrl),
    httpStatus: "NOT_RECORDED",
    accessState: "NOT_RECORDED",
    documentSha256: recorded(attempt.documentSha256),
    relevantFragmentSha256: recorded(attempt.relevantFragmentSha256),
    etag: "NOT_RECORDED",
    lastModified: "NOT_RECORDED",
    sourceOwnerGeo: "NOT_RECORDED",
    appliesToGeos: []
  };
}

function attemptSignalFields(payload, preimage, format) {
  return {
    signalPayload: payload,
    signalPayloadSha256: sha256(JSON.stringify(payload)),
    signalIdentityPreimage: JSON.stringify(preimage),
    signalIdentityFormat: format
  };
}

function eventKindsForSource(source) {
  const state = String(source.revalidation?.revalidation_state || "NOT_RECORDED");
  const kinds = [];
  if (sourceChanged(source)) kinds.push("SOURCE_CHANGE");
  if (PENDING_STATES.has(state)) kinds.push("PENDING_REVIEW");
  if (state === "NOT_RECORDED") kinds.push("FRESHNESS_METADATA_GAP");
  return kinds;
}

function buildOperation({ geo, source, url, kind, classifiedAt, signal, reopenAfterResolutionIds = [] }) {
  const state = String(source.revalidation?.revalidation_state || "NOT_RECORDED");
  const reason = String(source.revalidation?.change_reason || "NOT_RECORDED");
  const checkedAt = String(source.revalidation?.checked_at || "");
  const lastAttemptAt = Number.isFinite(Date.parse(checkedAt)) ? new Date(checkedAt).toISOString() : "NOT_RECORDED";
  const category = categoryFor(kind, state, reason);
  const operationIdentity = [operationKey(geo, url, kind, state, reason), signal];
  if (reopenAfterResolutionIds.length) {
    operationIdentity.push("REOPEN_AFTER_DIFFERENT_REVIEWED_SIGNAL", ...reopenAfterResolutionIds);
  }
  return {
    operationId: `SRCREV-${sha256(operationIdentity.join("\u0000")).slice(0, 24)}`,
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

function buildAttempt({ operation, source, signal, payload, classifiedAt, signalFormat = "SOURCE_REVIEW_SIGNAL_V2" }) {
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
    ...attemptSignalFields(payload, payload, signalFormat),
    boundary: "SOURCE_REVIEW_ATTEMPT_ONLY_NO_REVIEW_CLOSURE"
  };
}

function buildLegacyAttempt(operation) {
  const preimage = legacySignalPreimage(operation);
  const signal = signalIdentity(preimage);
  const sourceCheckedAt = Number.isFinite(Date.parse(operation.lastAttemptAt))
    ? new Date(operation.lastAttemptAt).toISOString()
    : "NOT_RECORDED";
  const attempt = {
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
  return {
    ...attempt,
    ...attemptSignalFields(legacySignalPayload(operation, attempt), preimage, "LEGACY_SIGNAL_DETAILS_NOT_RECORDED_V1")
  };
}

function migrateAttemptSignalFields(attempt, operation, sourceByIdentity) {
  if (attempt.signalPayload && attempt.signalPayloadSha256 && attempt.signalIdentityPreimage && attempt.signalIdentityFormat) {
    return structuredClone(attempt);
  }
  const candidates = sourceByIdentity.get(`${operation.geo}\u0000${operation.sourceUrl}`) || [];
  for (const source of candidates) {
    const payload = signalPayload({ geo: operation.geo, url: operation.sourceUrl, kind: operation.eventKind, source });
    if (signalIdentity(payload) === attempt.signalIdentitySha256) {
      return {
        ...structuredClone(attempt),
        ...attemptSignalFields(payload, payload, "SOURCE_REVIEW_SIGNAL_V1")
      };
    }
  }
  const legacyPreimage = legacySignalPreimage(operation);
  if (signalIdentity(legacyPreimage) === attempt.signalIdentitySha256) {
    return {
      ...structuredClone(attempt),
      ...attemptSignalFields(
        legacySignalPayload(operation, attempt),
        legacyPreimage,
        "LEGACY_SIGNAL_DETAILS_NOT_RECORDED_V1"
      )
    };
  }
  throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_UNRECONSTRUCTIBLE=${attempt.attemptId}`);
}

function buildSourceReviewOperationsLocked({
  sourcePath = SOURCE_PATH,
  classifiedAt = new Date().toISOString(),
  officialRegistryPath = OFFICIAL_REGISTRY_PATH,
  ownershipPath = OWNERSHIP_PATH,
  canonicalGeosPath = CANONICAL_GEOS_PATH,
  registrySnapshot,
  stage,
  commit,
  beforeCommit
} = {}) {
  const normalizedClassifiedAt = new Date(classifiedAt).toISOString();
  const existing = registrySnapshot.exists
    ? JSON.parse(registrySnapshot.bytes.toString("utf8"))
    : { schemaVersion: 7, localOnly: true, appendOnly: true, createdAt: normalizedClassifiedAt, operations: [], attempts: [], resolutions: [], evidenceAttestations: [] };
  if (existing.schemaVersion === 6) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_REQUIRED");
  }
  if (![3, 4, 5, 7].includes(existing.schemaVersion) || existing.localOnly !== true || existing.appendOnly !== true) {
    throw new Error(`SOURCE_REVIEW_REGISTRY_SCHEMA_INVALID=${existing.schemaVersion || "MISSING"}`);
  }
  const existingOperations = Array.isArray(existing.operations) ? existing.operations : [];
  const existingAttempts = Array.isArray(existing.attempts) ? existing.attempts : [];
  const existingResolutions = Array.isArray(existing.resolutions) ? existing.resolutions : [];
  const existingEvidenceAttestations = Array.isArray(existing.evidenceAttestations)
    ? existing.evidenceAttestations
    : [];
  if (existing.schemaVersion === 3 && existingResolutions.length) {
    throw new Error("SOURCE_REVIEW_V3_RESOLUTION_SIGNAL_IDENTITY_MISSING");
  }
  const latestExistingAttemptTime = existingAttempts.reduce((latest, attempt) => {
    const timestamp = Date.parse(String(attempt.attemptedAt || ""));
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, Number.NEGATIVE_INFINITY);
  if (latestExistingAttemptTime > Date.parse(normalizedClassifiedAt)) {
    throw new Error("SOURCE_REVIEW_CLASSIFIED_AT_BEFORE_EXISTING_HISTORY");
  }
  const resolvedBefore = new Set(existingResolutions.map((resolution) => resolution.operationId));
  const resolutionsByOperation = new Map(existingResolutions.map((resolution) => [resolution.operationId, resolution]));
  const sourceSnapshot = exactFileSnapshot(sourcePath);
  const canonicalGeosSnapshot = exactFileSnapshot(canonicalGeosPath);
  const sources = readSources(sourceSnapshot.bytes);
  const sourceByIdentity = new Map();
  for (const item of sources) {
    const identity = `${item.geo}\u0000${item.url}`;
    const values = sourceByIdentity.get(identity) || [];
    values.push(item.source);
    sourceByIdentity.set(identity, values);
  }
  const existingOperationsById = new Map(existingOperations.map((operation) => [operation.operationId, operation]));
  const attempts = existingAttempts.map((attempt) => {
    const operation = existingOperationsById.get(attempt.operationId);
    if (!operation) throw new Error(`SOURCE_REVIEW_ATTEMPT_OPERATION_MISSING=${attempt.attemptId}`);
    return migrateAttemptSignalFields(attempt, operation, sourceByIdentity);
  });
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
  for (const item of sources) {
    const state = String(item.source.revalidation?.revalidation_state || "NOT_RECORDED");
    const kinds = eventKindsForSource(item.source);
    for (const kind of kinds) {
      const reason = String(item.source.revalidation?.change_reason || "NOT_RECORDED");
      const key = operationKey(item.geo, item.url, kind, state, reason);
      const payload = signalPayload({ ...item, kind });
      const signal = signalIdentity(payload);
      currentSignals.add(`${key}\u0000${signal}`);
      currentCounts[kind] += 1;
      const prior = byKey.get(key) || [];
      let operation = prior.find((candidate) => {
        const containsCurrentSignal = (attemptsByOperation.get(candidate.operationId) || [])
          .some((attempt) => attempt.signalIdentitySha256 === signal);
        if (!containsCurrentSignal) return false;
        const resolution = resolutionsByOperation.get(candidate.operationId);
        return !resolution || resolution.reviewedSignalIdentitySha256 === signal;
      });
      if (!operation) {
        const mismatchedResolvedSignalIds = prior.flatMap((candidate) => {
          const resolution = resolutionsByOperation.get(candidate.operationId);
          if (!resolution || resolution.reviewedSignalIdentitySha256 === signal) return [];
          const containsCurrentSignal = (attemptsByOperation.get(candidate.operationId) || [])
            .some((attempt) => attempt.signalIdentitySha256 === signal);
          return containsCurrentSignal ? [resolution.resolutionId] : [];
        }).sort();
        const ownershipUpgradeCandidates = prior.filter((candidate) => {
          if (resolvedBefore.has(candidate.operationId)) return false;
          const candidateAttempts = attemptsByOperation.get(candidate.operationId) || [];
          return candidateAttempts.some((attempt) => isCanonicalOwnershipUpgrade(attempt, payload));
        });
        if (ownershipUpgradeCandidates.length > 1) {
          throw new Error(`SOURCE_REVIEW_OWNERSHIP_UPGRADE_AMBIGUOUS=${key}`);
        }
        const unresolvedLegacy = prior.find((candidate) => (
          !resolvedBefore.has(candidate.operationId) && !(attemptsByOperation.get(candidate.operationId) || []).length
        ));
        operation = unresolvedLegacy || ownershipUpgradeCandidates[0]
          || buildOperation({
            ...item,
            kind,
            classifiedAt: normalizedClassifiedAt,
            signal,
            reopenAfterResolutionIds: mismatchedResolvedSignalIds
          });
        if (!unresolvedLegacy && !ownershipUpgradeCandidates.length) prior.push(operation);
        byKey.set(key, prior);
      }
      const attempt = buildAttempt({ operation, source: item.source, signal, payload, classifiedAt: normalizedClassifiedAt });
      if (!attemptIds.has(attempt.attemptId) && !resolvedBefore.has(operation.operationId)) {
        attempts.push(attempt);
        attemptIds.add(attempt.attemptId);
        const values = attemptsByOperation.get(operation.operationId) || [];
        values.push(attempt);
        attemptsByOperation.set(operation.operationId, values);
      }
    }
  }
  const newOperations = [...byKey.values()]
    .flat()
    .filter((operation) => !existingOperationsById.has(operation.operationId))
    .sort((left, right) => left.operationId.localeCompare(right.operationId));
  // The schema-v7 registry is append-only. Existing operation order is part of
  // the migration receipt preimage, so a newly discovered operation must never
  // be inserted into or reorder the retained prefix.
  const operations = [...existingOperations, ...newOperations];
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
  const output = {
    ...existing,
    schemaVersion: 7,
    localOnly: true,
    appendOnly: true,
    operations,
    attempts,
    resolutions,
    evidenceAttestations: existingEvidenceAttestations
  };
  const operationsById = new Map(operations.map((operation) => [operation.operationId, operation]));
  const classifiedSignals = new Set(attempts.flatMap((attempt) => {
    const operation = operationsById.get(attempt.operationId);
    if (!operation) return [];
    return [`${operationKey(operation.geo, operation.sourceUrl, operation.eventKind, operation.revalidationStateAtOpen, operation.changeReasonAtOpen)}\u0000${attempt.signalIdentitySha256}`];
  }));
  const currentClassified = [...currentSignals].filter((signal) => classifiedSignals.has(signal)).length;
  if (currentClassified !== currentSignals.size) throw new Error(`SOURCE_REVIEW_CURRENT_CLASSIFICATION_MISMATCH=${currentClassified}/${currentSignals.size}`);
  if (attempts.length > existingAttempts.length && latestExistingAttemptTime >= Date.parse(normalizedClassifiedAt)) {
    throw new Error("SOURCE_REVIEW_CLASSIFIED_AT_NOT_AFTER_EXISTING_HISTORY");
  }
  const officialRegistrySnapshot = exactFileSnapshot(officialRegistryPath);
  const ownershipSnapshot = exactFileSnapshot(ownershipPath);
  validateRegistry(output, { canonicalGeosPath, officialRegistryPath, ownershipPath });
  const nextBytes = Buffer.from(`${JSON.stringify(output, null, 2)}\n`, "utf8");
  if (!registrySnapshot.exists || !nextBytes.equals(registrySnapshot.bytes)) {
    stage(nextBytes);
    beforeCommit?.();
    commit(registrySnapshot, [
      { path: sourcePath, snapshot: sourceSnapshot },
      { path: canonicalGeosPath, snapshot: canonicalGeosSnapshot },
      { path: officialRegistryPath, snapshot: officialRegistrySnapshot },
      { path: ownershipPath, snapshot: ownershipSnapshot }
    ]);
  }
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

export function buildSourceReviewOperations({
  sourcePath = SOURCE_PATH,
  outputPath = OUTPUT_PATH,
  classifiedAt = new Date().toISOString(),
  officialRegistryPath = OFFICIAL_REGISTRY_PATH,
  ownershipPath = OWNERSHIP_PATH,
  canonicalGeosPath = CANONICAL_GEOS_PATH,
  beforeCommit
} = {}) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  return withOwnedRegistryLock(outputPath, ({ stage, commit }) => {
    const registrySnapshot = exactFileSnapshot(outputPath, { allowMissing: true });
    return buildSourceReviewOperationsLocked({
      sourcePath,
      classifiedAt,
      officialRegistryPath,
      ownershipPath,
      canonicalGeosPath,
      registrySnapshot,
      stage,
      commit,
      beforeCommit
    });
  });
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

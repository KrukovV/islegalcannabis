#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_REGISTRY_PATH = path.join(ROOT, "data/b2b_evidence/source_review_operations.json");
const DEFAULT_OFFICIAL_REGISTRY_PATH = path.join(ROOT, "data/official/official_domains.ssot.json");
const DEFAULT_OWNERSHIP_PATH = path.join(ROOT, "data/ssot/official_link_ownership.json");
const DEFAULT_CANONICAL_GEOS_PATH = path.join(ROOT, "data/reviews/geo-list-307.json");
const OUTCOMES = new Set(["CONFIRMED_CURRENT", "SUPERSEDED"]);
const EVENT_KINDS = new Set(["SOURCE_CHANGE", "PENDING_REVIEW", "FRESHNESS_METADATA_GAP"]);
const CATEGORIES = new Set([
  "SOURCE_CONTENT_CHANGE", "SOURCE_OWNER_OR_FINAL_URL_CHANGE", "SOURCE_IDENTITY_CHANGE",
  "EFFECTIVE_DATE_REVIEW", "SEMANTIC_REVIEW", "VISUAL_REVIEW", "ACCESS_REVIEW",
  "SCHEMA_METADATA_REVIEW", "FRESHNESS_METADATA_REVIEW"
]);
const OPERATION_OUTCOMES = new Set(["CANONICAL_REVIEW_REQUIRED", "ACCESS_BLOCKED", "APPLICABILITY_UNRESOLVED"]);
const MAX_RESOLUTION_CLOCK_SKEW_MS = 60_000;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requiredText(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`SOURCE_REVIEW_RESOLUTION_${field}_REQUIRED`);
  return normalized;
}

function requiredHttpsUrl(value) {
  const normalized = requiredText(value, "EVIDENCE_URL");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EVIDENCE_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EVIDENCE_URL_INVALID");
  }
  return parsed.toString();
}

function urlIdentity(value) {
  const parsed = new URL(value);
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
}

function normalizedHost(value) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function hostMatches(host, registered) {
  const normalized = normalizedHost(registered);
  return Boolean(normalized) && (host === normalized || host.endsWith(`.${normalized}`));
}

function officialOwnerRegistryMatch(evidenceUrl, geo, officialRegistryPath, ownershipPath) {
  const host = normalizedHost(new URL(evidenceUrl).hostname);
  const registry = JSON.parse(fs.readFileSync(officialRegistryPath, "utf8"));
  const registered = (registry.domains || []).some((domain) => hostMatches(host, domain));
  if (!registered) return false;
  const ownership = JSON.parse(fs.readFileSync(ownershipPath, "utf8"));
  return (ownership.items || []).some((item) => (
    item.effective !== false
    && Array.isArray(item.owner_geos)
    && item.owner_geos.map((value) => String(value).trim().toUpperCase()).includes(geo)
    && hostMatches(host, item.domain || item.normalized_url || item.url)
  ));
}

function evidenceRelation({ evidenceUrl, operation, reviewedAttempt, officialRegistryPath, ownershipPath }) {
  const evidenceIdentity = urlIdentity(evidenceUrl);
  if (evidenceIdentity === urlIdentity(operation.sourceUrl)) return "RETAINED_SOURCE_URL";
  if (reviewedAttempt.finalUrl !== "NOT_RECORDED" && evidenceIdentity === urlIdentity(reviewedAttempt.finalUrl)) {
    return "REVALIDATED_FINAL_URL";
  }
  if (officialOwnerRegistryMatch(evidenceUrl, operation.geo, officialRegistryPath, ownershipPath)) {
    return "OFFICIAL_OWNER_REGISTRY";
  }
  throw new Error("SOURCE_REVIEW_RESOLUTION_EVIDENCE_NOT_LINKED_TO_OFFICIAL_OWNER");
}

function registrySha256(bytes) {
  return sha256(bytes);
}

function isRecordedDate(value) {
  return value === "NOT_RECORDED" || Number.isFinite(Date.parse(value));
}

function canonicalSignalPayload(value) {
  return {
    geo: value.geo,
    sourceUrl: value.sourceUrl,
    eventKind: value.eventKind,
    revalidationState: value.revalidationState,
    changeReason: value.changeReason,
    finalUrl: value.finalUrl,
    httpStatus: value.httpStatus,
    accessState: value.accessState,
    documentSha256: value.documentSha256,
    relevantFragmentSha256: value.relevantFragmentSha256,
    etag: value.etag,
    lastModified: value.lastModified,
    sourceOwnerGeo: value.sourceOwnerGeo,
    appliesToGeos: value.appliesToGeos
  };
}

function validateAttemptSignalPayload(attempt, operation) {
  const payload = attempt.signalPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_INVALID=${attempt.attemptId}`);
  }
  const appliesToGeos = Array.isArray(payload.appliesToGeos) ? payload.appliesToGeos : [];
  const normalizedAppliesToGeos = [...new Set(
    appliesToGeos.map((geo) => String(geo).trim().toUpperCase()).filter(Boolean)
  )].sort();
  if (
    payload.geo !== operation.geo
    || payload.sourceUrl !== operation.sourceUrl
    || payload.eventKind !== operation.eventKind
    || payload.revalidationState !== attempt.revalidationState
    || payload.changeReason !== attempt.changeReason
    || payload.finalUrl !== attempt.finalUrl
    || payload.documentSha256 !== attempt.documentSha256
    || payload.relevantFragmentSha256 !== attempt.relevantFragmentSha256
    || ![payload.accessState, payload.etag, payload.lastModified, payload.sourceOwnerGeo]
      .every((field) => typeof field === "string" && field.length > 0)
    || !(payload.httpStatus === "NOT_RECORDED"
      || (Number.isInteger(payload.httpStatus) && payload.httpStatus >= 100 && payload.httpStatus <= 599))
    || appliesToGeos.some((geo) => typeof geo !== "string")
    || JSON.stringify(appliesToGeos) !== JSON.stringify(normalizedAppliesToGeos)
  ) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_INVALID=${attempt.attemptId}`);
  }
  const canonicalPayload = canonicalSignalPayload(payload);
  if (!/^[a-f0-9]{64}$/.test(attempt.signalPayloadSha256)
    || sha256(JSON.stringify(canonicalPayload)) !== attempt.signalPayloadSha256) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_HASH_INVALID=${attempt.attemptId}`);
  }
  if (!String(attempt.signalIdentityPreimage || "").trim()) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_INVALID=${attempt.attemptId}`);
  }
  let identityPreimage;
  try {
    identityPreimage = JSON.parse(attempt.signalIdentityPreimage);
  } catch {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_INVALID=${attempt.attemptId}`);
  }
  if (attempt.signalIdentityPreimage !== JSON.stringify(identityPreimage)
    || sha256(attempt.signalIdentityPreimage) !== attempt.signalIdentitySha256) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_HASH_INVALID=${attempt.attemptId}`);
  }
  if (attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1") {
    if (attempt.signalIdentityPreimage !== JSON.stringify(canonicalPayload)) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_PAYLOAD_MISMATCH=${attempt.attemptId}`);
    }
    return;
  }
  if (attempt.signalIdentityFormat !== "LEGACY_SIGNAL_DETAILS_NOT_RECORDED_V1") {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_FORMAT_INVALID=${attempt.attemptId}`);
  }
  const expectedLegacyPreimage = {
    geo: operation.geo,
    sourceUrl: operation.sourceUrl,
    eventKind: operation.eventKind,
    revalidationState: operation.revalidationStateAtOpen,
    changeReason: operation.changeReasonAtOpen,
    migrationState: "LEGACY_SIGNAL_DETAILS_NOT_RECORDED"
  };
  if (
    attempt.signalIdentityPreimage !== JSON.stringify(expectedLegacyPreimage)
    || payload.httpStatus !== "NOT_RECORDED"
    || payload.accessState !== "NOT_RECORDED"
    || payload.etag !== "NOT_RECORDED"
    || payload.lastModified !== "NOT_RECORDED"
    || payload.sourceOwnerGeo !== "NOT_RECORDED"
    || payload.appliesToGeos.length !== 0
  ) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_LEGACY_PREIMAGE_INVALID=${attempt.attemptId}`);
  }
}

function validateRegistry(registry, { canonicalGeosPath, officialRegistryPath, ownershipPath }) {
  if (
    !registry
    || registry.schemaVersion !== 5
    || registry.localOnly !== true
    || registry.appendOnly !== true
    || !Array.isArray(registry.operations)
    || !Array.isArray(registry.attempts)
    || !Array.isArray(registry.resolutions)
  ) throw new Error("SOURCE_REVIEW_OPERATIONS_REGISTRY_INVALID");
  const canonicalGeos = new Set(JSON.parse(fs.readFileSync(canonicalGeosPath, "utf8")));
  if (canonicalGeos.size !== 307) {
    throw new Error(`SOURCE_REVIEW_CANONICAL_UNIVERSE_INVALID=${canonicalGeos.size}`);
  }
  if (!Number.isFinite(Date.parse(String(registry.createdAt || "")))) {
    throw new Error("SOURCE_REVIEW_OPERATIONS_CREATED_AT_INVALID");
  }
  const operationIds = new Set();
  const operationsById = new Map();
  const operationKeys = new Map();
  for (const operation of registry.operations) {
    if (!operation.operationId || operationIds.has(operation.operationId)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_ID_INVALID=${operation.operationId || "EMPTY"}`);
    }
    operationIds.add(operation.operationId);
    operationsById.set(operation.operationId, operation);
    if (!canonicalGeos.has(operation.geo) || !/^https?:\/\//.test(operation.sourceUrl)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_SOURCE_INVALID=${operation.operationId}`);
    }
    if (!EVENT_KINDS.has(operation.eventKind)
      || !CATEGORIES.has(operation.category)
      || !OPERATION_OUTCOMES.has(operation.outcome?.state)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_CLASSIFICATION_INVALID=${operation.operationId}`);
    }
    if (!/^[a-f0-9]{64}$/.test(operation.sourceIdentitySha256)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_IDENTITY_INVALID=${operation.operationId}`);
    }
    if (!Number.isFinite(Date.parse(operation.openedAt))
      || ![operation.sourceChangeDetectedAt, operation.lastAttemptAt].every(isRecordedDate)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_DATE_INVALID=${operation.operationId}`);
    }
    if (operation.outcome?.closedAt !== null || operation.outcome?.evidenceUrl !== operation.sourceUrl) {
      throw new Error(`SOURCE_REVIEW_OPERATION_OUTCOME_INVALID=${operation.operationId}`);
    }
    if (operation.boundary !== "REVIEW_METADATA_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
      || operation.publicationImpact !== "PUBLICATION_RECONCILIATION_GATE_REMAINS_BLOCKED") {
      throw new Error(`SOURCE_REVIEW_OPERATION_BOUNDARY_INVALID=${operation.operationId}`);
    }
    const key = [
      operation.geo,
      operation.sourceUrl,
      operation.eventKind,
      operation.revalidationStateAtOpen,
      operation.changeReasonAtOpen
    ].join("\u0000");
    const sameKey = operationKeys.get(key) || [];
    sameKey.push(operation);
    operationKeys.set(key, sameKey);
  }

  const attemptIds = new Set();
  const attemptsById = new Map();
  const attemptsByOperation = new Map();
  for (const attempt of registry.attempts) {
    const operation = operationsById.get(attempt.operationId);
    if (!attempt.attemptId || attemptIds.has(attempt.attemptId) || !operation) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_ID_INVALID=${attempt.attemptId || "EMPTY"}`);
    }
    if (attempt.geo !== operation.geo
      || attempt.sourceUrl !== operation.sourceUrl
      || attempt.eventKind !== operation.eventKind) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_SOURCE_INVALID=${attempt.attemptId}`);
    }
    if (
      !Number.isFinite(Date.parse(attempt.attemptedAt))
      || !isRecordedDate(attempt.sourceCheckedAt)
      || !/^[a-f0-9]{64}$/.test(attempt.signalIdentitySha256)
      || !String(attempt.revalidationState || "").trim()
      || !String(attempt.changeReason || "").trim()
      || ![attempt.finalUrl, attempt.documentSha256, attempt.relevantFragmentSha256]
        .every((field) => typeof field === "string" && field.length > 0)
      || attempt.boundary !== "SOURCE_REVIEW_ATTEMPT_ONLY_NO_REVIEW_CLOSURE"
    ) throw new Error(`SOURCE_REVIEW_ATTEMPT_PROVENANCE_INVALID=${attempt.attemptId}`);
    if (attempt.revalidationState !== operation.revalidationStateAtOpen
      || attempt.changeReason !== operation.changeReasonAtOpen) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_CLASS_INVALID=${attempt.attemptId}`);
    }
    validateAttemptSignalPayload(attempt, operation);
    attemptIds.add(attempt.attemptId);
    attemptsById.set(attempt.attemptId, attempt);
    const attempts = attemptsByOperation.get(attempt.operationId) || [];
    attempts.push(attempt);
    attemptsByOperation.set(attempt.operationId, attempts);
  }
  for (const operation of registry.operations) {
    const attempts = attemptsByOperation.get(operation.operationId) || [];
    if (!attempts.length) throw new Error(`SOURCE_REVIEW_OPERATION_ATTEMPT_MISSING=${operation.operationId}`);
    if (new Set(attempts.map((attempt) => attempt.signalIdentitySha256)).size !== 1) {
      throw new Error(`SOURCE_REVIEW_OPERATION_SIGNAL_REWRITE_FORBIDDEN=${operation.operationId}`);
    }
  }

  const resolutionIds = new Set();
  const resolvedOperationIds = new Set();
  for (const resolution of registry.resolutions) {
    if (!resolution.resolutionId || resolutionIds.has(resolution.resolutionId)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_ID_INVALID=${resolution.resolutionId || "EMPTY"}`);
    }
    const operation = operationsById.get(resolution.operationId);
    if (!operation || resolvedOperationIds.has(resolution.operationId)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_OPERATION_INVALID=${resolution.resolutionId}`);
    }
    const reviewedAttempt = attemptsById.get(resolution.reviewedAttemptId);
    if (
      resolution.geo !== operation.geo
      || resolution.sourceUrl !== operation.sourceUrl
      || !reviewedAttempt
      || reviewedAttempt.operationId !== operation.operationId
      || resolution.reviewedSignalIdentitySha256 !== reviewedAttempt.signalIdentitySha256
      || resolution.reviewedSourceCheckedAt !== reviewedAttempt.sourceCheckedAt
    ) throw new Error(`SOURCE_REVIEW_RESOLUTION_SOURCE_INVALID=${resolution.resolutionId}`);
    const resolvedAt = Date.parse(resolution.resolvedAt);
    if (!Number.isFinite(resolvedAt)
      || resolvedAt < Date.parse(operation.openedAt)
      || !OUTCOMES.has(resolution.outcome)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_OUTCOME_INVALID=${resolution.resolutionId}`);
    }
    if (
      !String(resolution.reviewerId || "").trim()
      || !String(resolution.note || "").trim()
      || !/^https:\/\//.test(String(resolution.evidenceUrl || ""))
      || !["RETAINED_SOURCE_URL", "REVALIDATED_FINAL_URL", "OFFICIAL_OWNER_REGISTRY"]
        .includes(resolution.evidenceUrlRelation)
      || resolution.evidenceOwnerGeo !== operation.geo
      || !/^[a-f0-9]{64}$/.test(String(resolution.reviewRegistrySha256 || ""))
      || resolution.resolutionBasis !== "EXPLICIT_HUMAN_EVIDENCE_REVIEW"
      || !String(resolution.resultingRevalidationState || "").trim()
      || !String(resolution.resultingChangeReason || "").trim()
    ) throw new Error(`SOURCE_REVIEW_RESOLUTION_PROVENANCE_INVALID=${resolution.resolutionId}`);
    const evidenceIdentity = urlIdentity(resolution.evidenceUrl);
    const sourceIdentity = urlIdentity(operation.sourceUrl);
    const finalIdentity = reviewedAttempt.finalUrl === "NOT_RECORDED"
      ? ""
      : urlIdentity(reviewedAttempt.finalUrl);
    if (
      (resolution.evidenceUrlRelation === "RETAINED_SOURCE_URL" && evidenceIdentity !== sourceIdentity)
      || (resolution.evidenceUrlRelation === "REVALIDATED_FINAL_URL"
        && (!finalIdentity || evidenceIdentity !== finalIdentity))
      || (resolution.evidenceUrlRelation === "OFFICIAL_OWNER_REGISTRY"
        && !officialOwnerRegistryMatch(resolution.evidenceUrl, operation.geo, officialRegistryPath, ownershipPath))
    ) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_EVIDENCE_RELATION_INVALID=${resolution.resolutionId}`);
    }
    if (resolution.boundary !== "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE") {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_BOUNDARY_INVALID=${resolution.resolutionId}`);
    }
    resolutionIds.add(resolution.resolutionId);
    resolvedOperationIds.add(resolution.operationId);
  }
  for (const [key, operations] of operationKeys) {
    const openBySignal = new Map();
    for (const operation of operations.filter((entry) => !resolvedOperationIds.has(entry.operationId))) {
      const signal = attemptsByOperation.get(operation.operationId)?.[0]?.signalIdentitySha256 || "";
      const open = openBySignal.get(signal) || [];
      open.push(operation);
      openBySignal.set(signal, open);
    }
    for (const [signal, open] of openBySignal) {
      if (open.length > 1) throw new Error(`SOURCE_REVIEW_MULTIPLE_OPEN_OPERATIONS=${key}|${signal}`);
    }
  }
  return registry;
}

function fsyncDirectory(directory) {
  const handle = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function exactFileSnapshot(filePath) {
  const bytes = fs.readFileSync(filePath);
  return { bytes, sha256: registrySha256(bytes) };
}

function withOwnedRegistryLock(registryPath, callback) {
  const lockPath = `${registryPath}.resolve.lock`;
  const ownerToken = crypto.randomUUID();
  const stagedPath = `${registryPath}.resolve-staged-${process.pid}-${ownerToken}`;
  const lockRecord = {
    schemaVersion: 1,
    ownerPid: process.pid,
    ownerToken,
    registryPath: path.resolve(registryPath),
    stagedPath: path.resolve(stagedPath)
  };
  const lockBytes = Buffer.from(`${JSON.stringify(lockRecord)}\n`, "utf8");
  let lockHandle = null;
  let stagedHandle = null;
  try {
    try {
      lockHandle = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(lockHandle, lockBytes);
      fs.fsyncSync(lockHandle);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("SOURCE_REVIEW_RESOLUTION_LOCKED");
      throw error;
    }
    return callback({
      stage(nextBytes) {
        stagedHandle = fs.openSync(stagedPath, "wx", 0o600);
        fs.writeFileSync(stagedHandle, nextBytes);
        fs.fsyncSync(stagedHandle);
        fs.closeSync(stagedHandle);
        stagedHandle = null;
      },
      commit(expectedBytes, expectedRegistrySha256) {
        const immediatelyBeforeRename = exactFileSnapshot(registryPath);
        if (!immediatelyBeforeRename.bytes.equals(expectedBytes)
          || immediatelyBeforeRename.sha256 !== expectedRegistrySha256) {
          throw new Error(`SOURCE_REVIEW_RESOLUTION_REGISTRY_STALE=${immediatelyBeforeRename.sha256}`);
        }
        let currentLockBytes;
        try {
          currentLockBytes = fs.readFileSync(lockPath);
        } catch (error) {
          if (error?.code === "ENOENT") throw new Error("SOURCE_REVIEW_RESOLUTION_LOCK_OWNERSHIP_LOST");
          throw error;
        }
        if (!currentLockBytes.equals(lockBytes)) {
          throw new Error("SOURCE_REVIEW_RESOLUTION_LOCK_OWNERSHIP_LOST");
        }
        fs.renameSync(stagedPath, registryPath);
        fsyncDirectory(path.dirname(registryPath));
      }
    });
  } finally {
    if (stagedHandle !== null) fs.closeSync(stagedHandle);
    try {
      if (fs.existsSync(stagedPath)) fs.unlinkSync(stagedPath);
    } catch {
      // The resolution stays fail-closed; cleanup never removes a foreign path.
    }
    if (lockHandle !== null) {
      fs.closeSync(lockHandle);
      try {
        if (fs.existsSync(lockPath) && fs.readFileSync(lockPath).equals(lockBytes)) {
          fs.unlinkSync(lockPath);
          fsyncDirectory(path.dirname(lockPath));
        }
      } catch {
        // A missing or replaced lock is foreign state and must be preserved.
      }
    }
  }
}

export function resolveSourceReviewOperation({
  registryPath = DEFAULT_REGISTRY_PATH,
  officialRegistryPath = DEFAULT_OFFICIAL_REGISTRY_PATH,
  ownershipPath = DEFAULT_OWNERSHIP_PATH,
  canonicalGeosPath = DEFAULT_CANONICAL_GEOS_PATH,
  operationId,
  reviewedAttemptId,
  expectedSignalIdentitySha256,
  expectedRegistrySha256,
  reviewerId,
  evidenceUrl,
  note,
  outcome,
  resolvedAt = new Date().toISOString(),
  resultingRevalidationState,
  resultingChangeReason,
  humanReviewed = false,
  beforeCommit
} = {}) {
  if (humanReviewed !== true) throw new Error("SOURCE_REVIEW_RESOLUTION_EXPLICIT_HUMAN_REVIEW_REQUIRED");
  const normalizedExpectedRegistrySha256 = requiredText(expectedRegistrySha256, "EXPECTED_REGISTRY_SHA256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedExpectedRegistrySha256)) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EXPECTED_REGISTRY_SHA256_INVALID");
  }
  const normalizedExpectedSignalIdentitySha256 = requiredText(expectedSignalIdentitySha256, "EXPECTED_SIGNAL_IDENTITY_SHA256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedExpectedSignalIdentitySha256)) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EXPECTED_SIGNAL_IDENTITY_SHA256_INVALID");
  }
  const normalizedOperationId = requiredText(operationId, "OPERATION_ID");
  const normalizedReviewedAttemptId = requiredText(reviewedAttemptId, "REVIEWED_ATTEMPT_ID");
  const normalizedOutcome = requiredText(outcome, "OUTCOME");
  if (!OUTCOMES.has(normalizedOutcome)) throw new Error(`SOURCE_REVIEW_RESOLUTION_OUTCOME_INVALID=${normalizedOutcome}`);
  const normalizedResolvedAt = new Date(requiredText(resolvedAt, "RESOLVED_AT")).toISOString();
  if (Date.parse(normalizedResolvedAt) > Date.now() + MAX_RESOLUTION_CLOCK_SKEW_MS) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_DATE_IN_FUTURE");
  }
  const normalizedEvidenceUrl = requiredHttpsUrl(evidenceUrl);
  const normalizedReviewerId = requiredText(reviewerId, "REVIEWER_ID");
  const normalizedNote = requiredText(note, "NOTE");
  const normalizedResultingState = requiredText(resultingRevalidationState, "RESULTING_STATE");
  const normalizedResultingReason = requiredText(resultingChangeReason, "RESULTING_REASON");

  return withOwnedRegistryLock(registryPath, ({ stage, commit }) => {
    const registrySnapshot = exactFileSnapshot(registryPath);
    if (registrySnapshot.sha256 !== normalizedExpectedRegistrySha256) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_REGISTRY_STALE=${registrySnapshot.sha256}`);
    }
    let parsedRegistry;
    try {
      parsedRegistry = JSON.parse(registrySnapshot.bytes.toString("utf8"));
    } catch {
      throw new Error("SOURCE_REVIEW_OPERATIONS_REGISTRY_INVALID");
    }
    const registry = validateRegistry(parsedRegistry, { canonicalGeosPath, officialRegistryPath, ownershipPath });
    const operation = registry.operations.find((entry) => entry.operationId === normalizedOperationId);
    if (!operation) throw new Error(`SOURCE_REVIEW_RESOLUTION_OPERATION_NOT_FOUND=${normalizedOperationId}`);
    if (registry.resolutions.some((entry) => entry.operationId === normalizedOperationId)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_ALREADY_RECORDED=${normalizedOperationId}`);
    }
    const attempts = registry.attempts
      .filter((entry) => entry.operationId === normalizedOperationId)
      .sort((left, right) => {
        const leftAt = Date.parse(left.attemptedAt);
        const rightAt = Date.parse(right.attemptedAt);
        return rightAt - leftAt || right.attemptId.localeCompare(left.attemptId);
      });
    const reviewedAttempt = registry.attempts.find((entry) => entry.attemptId === normalizedReviewedAttemptId);
    if (!reviewedAttempt) throw new Error(`SOURCE_REVIEW_RESOLUTION_ATTEMPT_NOT_FOUND=${normalizedReviewedAttemptId}`);
    if (reviewedAttempt.operationId !== normalizedOperationId) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_ATTEMPT_OPERATION_MISMATCH=${normalizedReviewedAttemptId}`);
    }
    if (!attempts[0] || attempts[0].attemptId !== normalizedReviewedAttemptId) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_ATTEMPT_STALE=${normalizedReviewedAttemptId}`);
    }
    if (reviewedAttempt.signalIdentitySha256 !== normalizedExpectedSignalIdentitySha256) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_SIGNAL_IDENTITY_STALE=${reviewedAttempt.signalIdentitySha256}`);
    }
    if (Date.parse(normalizedResolvedAt) < Date.parse(operation.openedAt)) {
      throw new Error("SOURCE_REVIEW_RESOLUTION_DATE_BEFORE_OPEN");
    }
    const normalizedEvidenceRelation = evidenceRelation({
      evidenceUrl: normalizedEvidenceUrl,
      operation,
      reviewedAttempt,
      officialRegistryPath,
      ownershipPath
    });
    const resolution = {
      resolutionId: `SRCRES-${sha256([
        normalizedOperationId,
        normalizedOutcome,
        normalizedResolvedAt,
        normalizedReviewerId,
        normalizedEvidenceUrl,
        normalizedReviewedAttemptId,
        normalizedExpectedSignalIdentitySha256,
        normalizedExpectedRegistrySha256
      ].join("\u0000")).slice(0, 24)}`,
      operationId: normalizedOperationId,
      geo: operation.geo,
      sourceUrl: operation.sourceUrl,
      resolvedAt: normalizedResolvedAt,
      outcome: normalizedOutcome,
      reviewerId: normalizedReviewerId,
      evidenceUrl: normalizedEvidenceUrl,
      evidenceUrlRelation: normalizedEvidenceRelation,
      evidenceOwnerGeo: operation.geo,
      reviewedAttemptId: reviewedAttempt.attemptId,
      reviewedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
      reviewedSourceCheckedAt: reviewedAttempt.sourceCheckedAt,
      reviewRegistrySha256: normalizedExpectedRegistrySha256,
      note: normalizedNote,
      resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW",
      resultingRevalidationState: normalizedResultingState,
      resultingChangeReason: normalizedResultingReason,
      boundary: "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
    };
    const nextRegistry = { ...registry, resolutions: [...registry.resolutions, resolution] };
    validateRegistry(nextRegistry, { canonicalGeosPath, officialRegistryPath, ownershipPath });
    stage(Buffer.from(`${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8"));
    beforeCommit?.();
    commit(registrySnapshot.bytes, normalizedExpectedRegistrySha256);
    return resolution;
  });
}

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function main() {
  const resolution = resolveSourceReviewOperation({
    operationId: arg("operation-id"),
    reviewedAttemptId: arg("reviewed-attempt-id"),
    expectedSignalIdentitySha256: arg("expected-signal-identity-sha256"),
    expectedRegistrySha256: arg("expected-registry-sha256"),
    reviewerId: arg("reviewer-id"),
    evidenceUrl: arg("evidence-url"),
    note: arg("note"),
    outcome: arg("outcome"),
    resolvedAt: arg("resolved-at") || new Date().toISOString(),
    resultingRevalidationState: arg("resulting-state"),
    resultingChangeReason: arg("resulting-reason"),
    humanReviewed: process.argv.includes("--human-reviewed")
  });
  console.log(`SOURCE_REVIEW_RESOLUTION_ID=${resolution.resolutionId}`);
  console.log(`SOURCE_REVIEW_OPERATION_ID=${resolution.operationId}`);
  console.log(`SOURCE_REVIEW_REVIEWED_ATTEMPT_ID=${resolution.reviewedAttemptId}`);
  console.log(`SOURCE_REVIEW_REVIEWED_SIGNAL_IDENTITY_SHA256=${resolution.reviewedSignalIdentitySha256}`);
  console.log(`SOURCE_REVIEW_REGISTRY_SHA256=${resolution.reviewRegistrySha256}`);
  console.log("LEGAL_TRUTH_CHANGED=false");
  console.log("STORE_TRUTH_CHANGED=false");
  console.log("PRODUCTION_TOUCHED=false");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

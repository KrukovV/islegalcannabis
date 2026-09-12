import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import type { TruthMapCanonicalProjectionSource } from "./truthMapSource";

export type SourceReviewEventKind = "SOURCE_CHANGE" | "PENDING_REVIEW" | "FRESHNESS_METADATA_GAP";
export type SourceReviewCategory =
  | "SOURCE_CONTENT_CHANGE"
  | "SOURCE_OWNER_OR_FINAL_URL_CHANGE"
  | "SOURCE_IDENTITY_CHANGE"
  | "EFFECTIVE_DATE_REVIEW"
  | "SEMANTIC_REVIEW"
  | "VISUAL_REVIEW"
  | "ACCESS_REVIEW"
  | "SCHEMA_METADATA_REVIEW"
  | "FRESHNESS_METADATA_REVIEW";
export type SourceReviewOutcome =
  | "CANONICAL_REVIEW_REQUIRED"
  | "ACCESS_BLOCKED"
  | "APPLICABILITY_UNRESOLVED";
export type SourceReviewResolutionOutcome = "CONFIRMED_CURRENT" | "SUPERSEDED";
export type SourceReviewSignalIdentityFormat =
  | "SOURCE_REVIEW_SIGNAL_V1"
  | "SOURCE_REVIEW_SIGNAL_V2"
  | "LEGACY_SIGNAL_DETAILS_NOT_RECORDED_V1";

export type SourceReviewSignalPayload = {
  geo: string;
  sourceUrl: string;
  eventKind: SourceReviewEventKind;
  revalidationState: string;
  changeReason: string;
  finalUrl: string;
  httpStatus: number | "NOT_RECORDED";
  accessState: string;
  documentSha256: string;
  relevantFragmentSha256: string;
  etag: string;
  lastModified: string;
  sourceOwnerGeo: string;
  appliesToGeos: string[];
};

export type SourceReviewOperation = {
  operationId: string;
  sourceIdentitySha256: string;
  geo: string;
  sourceUrl: string;
  eventKind: SourceReviewEventKind;
  category: SourceReviewCategory;
  openedAt: string;
  sourceChangeDetectedAt: string;
  lastAttemptAt: string;
  revalidationStateAtOpen: string;
  changeReasonAtOpen: string;
  outcome: {
    state: SourceReviewOutcome;
    closedAt: null;
    evidenceUrl: string;
  };
  publicationImpact: "PUBLICATION_RECONCILIATION_GATE_REMAINS_BLOCKED";
  boundary: "REVIEW_METADATA_ONLY_NO_LEGAL_CONCLUSION_CHANGE";
};

export type SourceReviewAttempt = {
  attemptId: string;
  operationId: string;
  geo: string;
  sourceUrl: string;
  eventKind: SourceReviewEventKind;
  attemptedAt: string;
  sourceCheckedAt: string;
  signalIdentitySha256: string;
  revalidationState: string;
  changeReason: string;
  finalUrl: string;
  documentSha256: string;
  relevantFragmentSha256: string;
  signalPayload: SourceReviewSignalPayload;
  signalPayloadSha256: string;
  signalIdentityPreimage: string;
  signalIdentityFormat: SourceReviewSignalIdentityFormat;
  boundary: "SOURCE_REVIEW_ATTEMPT_ONLY_NO_REVIEW_CLOSURE";
};

export type SourceReviewResolution = {
  resolutionId: string;
  operationId: string;
  geo: string;
  sourceUrl: string;
  resolvedAt: string;
  outcome: SourceReviewResolutionOutcome;
  reviewerId: string;
  evidenceUrl: string;
  evidenceUrlRelation: "RETAINED_SOURCE_URL" | "REVALIDATED_FINAL_URL" | "OFFICIAL_OWNER_REGISTRY";
  evidenceOwnerGeo: string;
  reviewedAttemptId: string;
  reviewedSignalIdentitySha256: string;
  reviewedSourceCheckedAt: string;
  reviewRegistrySha256: string;
  note: string;
  resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW";
  resultingRevalidationState: string;
  resultingChangeReason: string;
  boundary: "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE";
};

export type SourceReviewOperationsRegistry = {
  schemaVersion: 6;
  localOnly: true;
  appendOnly: true;
  createdAt: string;
  operations: SourceReviewOperation[];
  attempts: SourceReviewAttempt[];
  resolutions: SourceReviewResolution[];
};

export type SourceReviewOperationsRegistrySnapshot = {
  registry: SourceReviewOperationsRegistry;
  registrySha256: string;
};

export function sourceReviewOperationsPath(repoRoot = findRepoRoot(process.cwd())) {
  return path.join(repoRoot, "data", "b2b_evidence", "source_review_operations.json");
}

function isRecordedDate(value: string) {
  return value === "NOT_RECORDED" || Number.isFinite(Date.parse(value));
}

const EVENT_KINDS = new Set<SourceReviewEventKind>(["SOURCE_CHANGE", "PENDING_REVIEW", "FRESHNESS_METADATA_GAP"]);
const CATEGORIES = new Set<SourceReviewCategory>([
  "SOURCE_CONTENT_CHANGE", "SOURCE_OWNER_OR_FINAL_URL_CHANGE", "SOURCE_IDENTITY_CHANGE",
  "EFFECTIVE_DATE_REVIEW", "SEMANTIC_REVIEW", "VISUAL_REVIEW", "ACCESS_REVIEW",
  "SCHEMA_METADATA_REVIEW", "FRESHNESS_METADATA_REVIEW"
]);
const OUTCOMES = new Set<SourceReviewOutcome>(["CANONICAL_REVIEW_REQUIRED", "ACCESS_BLOCKED", "APPLICABILITY_UNRESOLVED"]);

export function sourceReviewOperationKey(
  geo: string,
  source: Pick<TruthMapCanonicalProjectionSource, "url" | "revalidation">,
  eventKind: SourceReviewEventKind
) {
  return [geo, source.url, eventKind, source.revalidation.state, source.revalidation.changeReason].join("\u0000");
}

type CanonicalSourceReviewSignalSource = {
  url?: unknown;
  sourceOwnerGeo?: unknown;
  source_owner_geo?: unknown;
  source_owner_scope?: unknown;
  appliesToGeos?: unknown;
  applies_to_geo?: unknown;
  applies_to_geos?: unknown;
  revalidation?: {
    revalidation_state?: unknown;
    change_reason?: unknown;
    final_url?: unknown;
    http_status?: unknown;
    access_state?: unknown;
    document_sha256?: unknown;
    relevant_fragment_sha256?: unknown;
    etag?: unknown;
    last_modified?: unknown;
  };
};

type CanonicalSourceReviewSignalLedger = {
  rows?: Array<{
    geo?: unknown;
    primaryLaw?: {
      officialSources?: CanonicalSourceReviewSignalSource[];
      freshAxisOfficialSources?: CanonicalSourceReviewSignalSource[];
    };
  }>;
};

function recordedSignalValue(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || "NOT_RECORDED";
}

function canonicalSourceOwnerGeo(source: CanonicalSourceReviewSignalSource) {
  const aliases = [source.sourceOwnerGeo, source.source_owner_geo, source.source_owner_scope]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim().toUpperCase() || "NOT_RECORDED");
  const distinct = [...new Set(aliases)];
  if (distinct.length > 1) throw new Error(`SOURCE_REVIEW_SOURCE_OWNER_ALIAS_CONFLICT=${distinct.join("|")}`);
  return distinct[0] || "NOT_RECORDED";
}

function canonicalAppliesToGeos(source: CanonicalSourceReviewSignalSource) {
  const aliases = [source.appliesToGeos, source.applies_to_geo, source.applies_to_geos]
    .filter((value) => value !== undefined && value !== null)
    .map((values) => {
      if (!Array.isArray(values)) throw new Error("SOURCE_REVIEW_APPLICABILITY_ALIAS_INVALID");
      return [...new Set(values.map((value) => String(value).trim().toUpperCase()).filter(Boolean))].sort();
    });
  const identities = [...new Set(aliases.map((values) => JSON.stringify(values)))];
  if (identities.length > 1) throw new Error(`SOURCE_REVIEW_APPLICABILITY_ALIAS_CONFLICT=${identities.join("|")}`);
  return aliases[0] || [];
}

function canonicalV2SignalPayload(
  geo: string,
  sourceUrl: string,
  eventKind: SourceReviewEventKind,
  source: CanonicalSourceReviewSignalSource
): SourceReviewSignalPayload {
  const revalidation = source.revalidation || {};
  const httpStatus = revalidation.http_status;
  return canonicalSignalPayload({
    geo,
    sourceUrl,
    eventKind,
    revalidationState: recordedSignalValue(revalidation.revalidation_state),
    changeReason: recordedSignalValue(revalidation.change_reason),
    finalUrl: recordedSignalValue(revalidation.final_url),
    httpStatus: typeof httpStatus === "number" ? httpStatus : "NOT_RECORDED",
    accessState: recordedSignalValue(revalidation.access_state),
    documentSha256: recordedSignalValue(revalidation.document_sha256),
    relevantFragmentSha256: recordedSignalValue(revalidation.relevant_fragment_sha256),
    etag: recordedSignalValue(revalidation.etag),
    lastModified: recordedSignalValue(revalidation.last_modified),
    sourceOwnerGeo: canonicalSourceOwnerGeo(source),
    appliesToGeos: canonicalAppliesToGeos(source)
  });
}

/**
 * Exact current V2 identities are rebuilt from the retained canonical source
 * payload. The Workbench uses this independently of the append-only registry,
 * so an operation cannot become current merely because its key still matches.
 */
export function loadCanonicalSourceReviewV2SignalIdentityIndex(repoRoot = findRepoRoot(process.cwd())) {
  const ledger = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "data", "reviews", "wiki-truth-307-final-reconciliation.json"),
    "utf8"
  )) as CanonicalSourceReviewSignalLedger;
  const index = new Map<string, string>();
  for (const row of ledger.rows || []) {
    const geo = String(row.geo || "").trim().toUpperCase();
    const seen = new Set<string>();
    const sources = [
      ...(row.primaryLaw?.officialSources || []),
      ...(row.primaryLaw?.freshAxisOfficialSources || [])
    ];
    for (const source of sources) {
      const sourceUrl = String(source.url || "").trim();
      if (!geo || !/^https?:\/\//.test(sourceUrl) || seen.has(sourceUrl)) continue;
      seen.add(sourceUrl);
      const revalidationState = recordedSignalValue(source.revalidation?.revalidation_state);
      const changeReason = recordedSignalValue(source.revalidation?.change_reason);
      for (const eventKind of EVENT_KINDS) {
        const payload = canonicalV2SignalPayload(geo, sourceUrl, eventKind, source);
        const key = [geo, sourceUrl, eventKind, revalidationState, changeReason].join("\u0000");
        index.set(key, sha256(JSON.stringify(payload)));
      }
    }
  }
  return index;
}

function normalizedUrlIdentity(value: string) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

function normalizedHost(value: string) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function hostMatches(host: string, registered: string) {
  const normalized = normalizedHost(registered);
  return Boolean(normalized) && (host === normalized || host.endsWith(`.${normalized}`));
}

function officialOwnerRegistryMatch(evidenceUrl: string, geo: string) {
  let host = "";
  try {
    host = normalizedHost(new URL(evidenceUrl).hostname);
  } catch {
    return false;
  }
  const root = findRepoRoot(process.cwd());
  const official = JSON.parse(fs.readFileSync(path.join(root, "data", "official", "official_domains.ssot.json"), "utf8")) as { domains?: string[] };
  if (!(official.domains || []).some((domain) => hostMatches(host, domain))) return false;
  const ownership = JSON.parse(fs.readFileSync(path.join(root, "data", "ssot", "official_link_ownership.json"), "utf8")) as {
    items?: Array<{ effective?: boolean; owner_geos?: string[]; domain?: string; normalized_url?: string; url?: string }>;
  };
  return (ownership.items || []).some((item) => (
    item.effective !== false
    && (item.owner_geos || []).map((value) => String(value).trim().toUpperCase()).includes(geo)
    && hostMatches(host, item.domain || item.normalized_url || item.url || "")
  ));
}

function ownershipUpgradeDirection(left: SourceReviewAttempt, right: SourceReviewAttempt) {
  const candidates = [
    { prior: left, corrected: right, direction: -1 },
    { prior: right, corrected: left, direction: 1 }
  ];
  for (const { prior, corrected, direction } of candidates) {
    if (
      prior.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1"
      && prior.signalPayload.sourceOwnerGeo === "NOT_RECORDED"
      && prior.signalPayload.appliesToGeos.length === 0
      && corrected.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2"
      && (corrected.signalPayload.sourceOwnerGeo !== "NOT_RECORDED"
        || corrected.signalPayload.appliesToGeos.length > 0)
      && JSON.stringify(ownershipIndependentSignalPayload(prior.signalPayload))
        === JSON.stringify(ownershipIndependentSignalPayload(corrected.signalPayload))
    ) return direction;
  }
  return 0;
}

export function compareSourceReviewAttempts(left: SourceReviewAttempt, right: SourceReviewAttempt) {
  const leftCheckedAt = Date.parse(left.sourceCheckedAt);
  const rightCheckedAt = Date.parse(right.sourceCheckedAt);
  const leftHasCheckedAt = Number.isFinite(leftCheckedAt);
  const rightHasCheckedAt = Number.isFinite(rightCheckedAt);
  if (leftHasCheckedAt !== rightHasCheckedAt) return leftHasCheckedAt ? 1 : -1;
  if (leftHasCheckedAt && rightHasCheckedAt && leftCheckedAt !== rightCheckedAt) {
    return leftCheckedAt - rightCheckedAt;
  }
  if (left.signalIdentitySha256 === right.signalIdentitySha256) {
    return left.attemptId.localeCompare(right.attemptId);
  }
  const migrationDirection = ownershipUpgradeDirection(left, right);
  if (migrationDirection !== 0) return migrationDirection;
  throw new Error(`SOURCE_REVIEW_LATEST_ATTEMPT_AMBIGUOUS=${left.operationId}|${left.attemptId}|${right.attemptId}`);
}

export function latestSourceReviewAttempt(attempts: SourceReviewAttempt[]) {
  return [...attempts].sort((left, right) => compareSourceReviewAttempts(right, left))[0] || null;
}

function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalSignalPayload(value: SourceReviewSignalPayload) {
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

function ownershipIndependentSignalPayload(value: SourceReviewSignalPayload) {
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
    lastModified: value.lastModified
  };
}

function validateAttemptSignalPayload(attempt: SourceReviewAttempt, operation: SourceReviewOperation) {
  const payload = attempt.signalPayload;
  if (!payload || typeof payload !== "object") throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_INVALID=${attempt.attemptId}`);
  const appliesToGeos = Array.isArray(payload.appliesToGeos) ? payload.appliesToGeos : [];
  const normalizedAppliesToGeos = [...new Set(appliesToGeos.map((geo) => String(geo).trim().toUpperCase()).filter(Boolean))].sort();
  if (
    payload.geo !== operation.geo
    || payload.sourceUrl !== operation.sourceUrl
    || payload.eventKind !== operation.eventKind
    || payload.revalidationState !== attempt.revalidationState
    || payload.changeReason !== attempt.changeReason
    || payload.finalUrl !== attempt.finalUrl
    || payload.documentSha256 !== attempt.documentSha256
    || payload.relevantFragmentSha256 !== attempt.relevantFragmentSha256
    || ![payload.accessState, payload.etag, payload.lastModified, payload.sourceOwnerGeo].every((field) => typeof field === "string" && field.length > 0)
    || !(payload.httpStatus === "NOT_RECORDED" || (Number.isInteger(payload.httpStatus) && payload.httpStatus >= 100 && payload.httpStatus <= 599))
    || appliesToGeos.some((geo) => typeof geo !== "string")
    || JSON.stringify(appliesToGeos) !== JSON.stringify(normalizedAppliesToGeos)
  ) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_INVALID=${attempt.attemptId}`);
  }
  const canonicalPayload = canonicalSignalPayload(payload);
  if (!/^[a-f0-9]{64}$/.test(attempt.signalPayloadSha256) || sha256(JSON.stringify(canonicalPayload)) !== attempt.signalPayloadSha256) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_HASH_INVALID=${attempt.attemptId}`);
  }
  if (!String(attempt.signalIdentityPreimage || "").trim()) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_INVALID=${attempt.attemptId}`);
  }
  let identityPreimage: unknown;
  try {
    identityPreimage = JSON.parse(attempt.signalIdentityPreimage);
  } catch {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_INVALID=${attempt.attemptId}`);
  }
  if (attempt.signalIdentityPreimage !== JSON.stringify(identityPreimage) || sha256(attempt.signalIdentityPreimage) !== attempt.signalIdentitySha256) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_HASH_INVALID=${attempt.attemptId}`);
  }
  if (["SOURCE_REVIEW_SIGNAL_V1", "SOURCE_REVIEW_SIGNAL_V2"].includes(attempt.signalIdentityFormat)) {
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

export function validateSourceReviewOperationsRegistry(value: unknown): SourceReviewOperationsRegistry {
  const registry = value as Partial<SourceReviewOperationsRegistry> | null;
  if (!registry || registry.schemaVersion !== 6 || registry.localOnly !== true || registry.appendOnly !== true || !Array.isArray(registry.operations) || !Array.isArray(registry.attempts) || !Array.isArray(registry.resolutions)) {
    throw new Error("SOURCE_REVIEW_OPERATIONS_REGISTRY_INVALID");
  }
  const canonicalGeos = new Set<string>(JSON.parse(fs.readFileSync(
    path.join(findRepoRoot(process.cwd()), "data", "reviews", "geo-list-307.json"),
    "utf8"
  )) as string[]);
  if (canonicalGeos.size !== 307) throw new Error(`SOURCE_REVIEW_CANONICAL_UNIVERSE_INVALID=${canonicalGeos.size}`);
  if (!Number.isFinite(Date.parse(String(registry.createdAt || "")))) throw new Error("SOURCE_REVIEW_OPERATIONS_CREATED_AT_INVALID");
  const operationIds = new Set<string>();
  const operationsById = new Map<string, SourceReviewOperation>();
  const operationKeys = new Map<string, SourceReviewOperation[]>();
  for (const operation of registry.operations) {
    if (!operation.operationId || operationIds.has(operation.operationId)) throw new Error(`SOURCE_REVIEW_OPERATION_ID_INVALID=${operation.operationId || "EMPTY"}`);
    operationIds.add(operation.operationId);
    operationsById.set(operation.operationId, operation);
    if (!canonicalGeos.has(operation.geo) || !/^https?:\/\//.test(operation.sourceUrl)) throw new Error(`SOURCE_REVIEW_OPERATION_SOURCE_INVALID=${operation.operationId}`);
    if (!EVENT_KINDS.has(operation.eventKind) || !CATEGORIES.has(operation.category) || !OUTCOMES.has(operation.outcome?.state)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_CLASSIFICATION_INVALID=${operation.operationId}`);
    }
    if (!/^[a-f0-9]{64}$/.test(operation.sourceIdentitySha256)) throw new Error(`SOURCE_REVIEW_OPERATION_IDENTITY_INVALID=${operation.operationId}`);
    if (!Number.isFinite(Date.parse(operation.openedAt)) || ![operation.sourceChangeDetectedAt, operation.lastAttemptAt].every(isRecordedDate)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_DATE_INVALID=${operation.operationId}`);
    }
    if (operation.outcome?.closedAt !== null || operation.outcome?.evidenceUrl !== operation.sourceUrl) {
      throw new Error(`SOURCE_REVIEW_OPERATION_OUTCOME_INVALID=${operation.operationId}`);
    }
    if (operation.boundary !== "REVIEW_METADATA_ONLY_NO_LEGAL_CONCLUSION_CHANGE" || operation.publicationImpact !== "PUBLICATION_RECONCILIATION_GATE_REMAINS_BLOCKED") {
      throw new Error(`SOURCE_REVIEW_OPERATION_BOUNDARY_INVALID=${operation.operationId}`);
    }
    const key = [operation.geo, operation.sourceUrl, operation.eventKind, operation.revalidationStateAtOpen, operation.changeReasonAtOpen].join("\u0000");
    const sameKey = operationKeys.get(key) || [];
    sameKey.push(operation);
    operationKeys.set(key, sameKey);
  }
  const resolutionIds = new Set<string>();
  const resolvedOperationIds = new Set<string>();
  const attemptIds = new Set<string>();
  const attemptsById = new Map<string, SourceReviewAttempt>();
  const attemptsByOperation = new Map<string, SourceReviewAttempt[]>();
  for (const attempt of registry.attempts) {
    const operation = operationsById.get(attempt.operationId);
    if (!attempt.attemptId || attemptIds.has(attempt.attemptId) || !operation) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_ID_INVALID=${attempt.attemptId || "EMPTY"}`);
    }
    if (attempt.geo !== operation.geo || attempt.sourceUrl !== operation.sourceUrl || attempt.eventKind !== operation.eventKind) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_SOURCE_INVALID=${attempt.attemptId}`);
    }
    if (
      !Number.isFinite(Date.parse(attempt.attemptedAt))
      || !isRecordedDate(attempt.sourceCheckedAt)
      || !/^[a-f0-9]{64}$/.test(attempt.signalIdentitySha256)
      || !String(attempt.revalidationState || "").trim()
      || !String(attempt.changeReason || "").trim()
      || ![attempt.finalUrl, attempt.documentSha256, attempt.relevantFragmentSha256].every((field) => typeof field === "string" && field.length > 0)
      || attempt.boundary !== "SOURCE_REVIEW_ATTEMPT_ONLY_NO_REVIEW_CLOSURE"
    ) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_PROVENANCE_INVALID=${attempt.attemptId}`);
    }
    if (attempt.revalidationState !== operation.revalidationStateAtOpen || attempt.changeReason !== operation.changeReasonAtOpen) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_CLASS_INVALID=${attempt.attemptId}`);
    }
    validateAttemptSignalPayload(attempt, operation);
    const expectedAttemptId = `SRCATT-${sha256([
      attempt.operationId,
      attempt.signalIdentitySha256,
      attempt.sourceCheckedAt
    ].join("\u0000")).slice(0, 24)}`;
    if (attempt.attemptId !== expectedAttemptId) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_IDENTITY_INVALID=${attempt.attemptId}`);
    }
    attemptIds.add(attempt.attemptId);
    attemptsById.set(attempt.attemptId, attempt);
    const values = attemptsByOperation.get(attempt.operationId) || [];
    values.push(attempt);
    attemptsByOperation.set(attempt.operationId, values);
  }
  for (const operation of registry.operations) {
    const attempts = attemptsByOperation.get(operation.operationId) || [];
    if (!attempts.length) throw new Error(`SOURCE_REVIEW_OPERATION_ATTEMPT_MISSING=${operation.operationId}`);
    const signals = [...new Map(attempts
      .sort(compareSourceReviewAttempts)
      .map((attempt) => [attempt.signalIdentitySha256, attempt])).values()];
    if (signals.length === 1) continue;
    const [legacy, corrected, ...unexpected] = signals;
    const legacyBase = ownershipIndependentSignalPayload(legacy.signalPayload);
    const correctedBase = ownershipIndependentSignalPayload(corrected.signalPayload);
    if (
      unexpected.length
      || legacy.signalIdentityFormat !== "SOURCE_REVIEW_SIGNAL_V1"
      || legacy.signalPayload.sourceOwnerGeo !== "NOT_RECORDED"
      || legacy.signalPayload.appliesToGeos.length !== 0
      || corrected.signalIdentityFormat !== "SOURCE_REVIEW_SIGNAL_V2"
      || (corrected.signalPayload.sourceOwnerGeo === "NOT_RECORDED" && corrected.signalPayload.appliesToGeos.length === 0)
      || JSON.stringify(legacyBase) !== JSON.stringify(correctedBase)
    ) throw new Error(`SOURCE_REVIEW_OPERATION_SIGNAL_REWRITE_FORBIDDEN=${operation.operationId}`);
  }
  for (const resolution of registry.resolutions) {
    if (!resolution.resolutionId || resolutionIds.has(resolution.resolutionId)) throw new Error(`SOURCE_REVIEW_RESOLUTION_ID_INVALID=${resolution.resolutionId || "EMPTY"}`);
    const operation = operationsById.get(resolution.operationId);
    if (!operation || resolvedOperationIds.has(resolution.operationId)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_OPERATION_INVALID=${resolution.resolutionId}`);
    }
    const reviewedAttempt = attemptsById.get(resolution.reviewedAttemptId);
    const latestAttempt = latestSourceReviewAttempt(attemptsByOperation.get(operation.operationId) || []);
    if (
      resolution.geo !== operation.geo
      || resolution.sourceUrl !== operation.sourceUrl
      || !reviewedAttempt
      || reviewedAttempt.operationId !== operation.operationId
      || latestAttempt?.attemptId !== reviewedAttempt.attemptId
      || resolution.reviewedSignalIdentitySha256 !== reviewedAttempt.signalIdentitySha256
      || resolution.reviewedSourceCheckedAt !== reviewedAttempt.sourceCheckedAt
    ) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_SOURCE_INVALID=${resolution.resolutionId}`);
    }
    const resolvedAt = Date.parse(resolution.resolvedAt);
    if (!Number.isFinite(resolvedAt) || resolvedAt < Date.parse(operation.openedAt) || !["CONFIRMED_CURRENT", "SUPERSEDED"].includes(resolution.outcome)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_OUTCOME_INVALID=${resolution.resolutionId}`);
    }
    if (
      !String(resolution.reviewerId || "").trim()
      || !String(resolution.note || "").trim()
      || !/^https:\/\//.test(String(resolution.evidenceUrl || ""))
      || !["RETAINED_SOURCE_URL", "REVALIDATED_FINAL_URL", "OFFICIAL_OWNER_REGISTRY"].includes(resolution.evidenceUrlRelation)
      || resolution.evidenceOwnerGeo !== operation.geo
      || !/^[a-f0-9]{64}$/.test(String(resolution.reviewRegistrySha256 || ""))
      || resolution.resolutionBasis !== "EXPLICIT_HUMAN_EVIDENCE_REVIEW"
      || !String(resolution.resultingRevalidationState || "").trim()
      || !String(resolution.resultingChangeReason || "").trim()
    ) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_PROVENANCE_INVALID=${resolution.resolutionId}`);
    }
    const evidenceIdentity = normalizedUrlIdentity(resolution.evidenceUrl);
    const sourceIdentity = normalizedUrlIdentity(operation.sourceUrl);
    const finalIdentity = reviewedAttempt.finalUrl === "NOT_RECORDED" ? "" : normalizedUrlIdentity(reviewedAttempt.finalUrl);
    if (
      (resolution.evidenceUrlRelation === "RETAINED_SOURCE_URL" && evidenceIdentity !== sourceIdentity)
      || (resolution.evidenceUrlRelation === "REVALIDATED_FINAL_URL" && (!finalIdentity || evidenceIdentity !== finalIdentity))
      || (resolution.evidenceUrlRelation === "OFFICIAL_OWNER_REGISTRY" && !officialOwnerRegistryMatch(resolution.evidenceUrl, operation.geo))
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
    const openBySignal = new Map<string, SourceReviewOperation[]>();
    for (const operation of operations.filter((entry) => !resolvedOperationIds.has(entry.operationId))) {
      const signal = latestSourceReviewAttempt(attemptsByOperation.get(operation.operationId) || [])
        ?.signalIdentitySha256 || "";
      const values = openBySignal.get(signal) || [];
      values.push(operation);
      openBySignal.set(signal, values);
    }
    for (const [signal, open] of openBySignal) {
      if (open.length > 1) throw new Error(`SOURCE_REVIEW_MULTIPLE_OPEN_OPERATIONS=${key}|${signal}`);
    }
  }
  return registry as SourceReviewOperationsRegistry;
}

export function loadSourceReviewOperationsRegistry(repoRoot?: string) {
  return loadSourceReviewOperationsRegistrySnapshot(repoRoot).registry;
}

export function loadSourceReviewOperationsRegistrySnapshot(repoRoot?: string): SourceReviewOperationsRegistrySnapshot {
  const bytes = fs.readFileSync(sourceReviewOperationsPath(repoRoot));
  return {
    registry: validateSourceReviewOperationsRegistry(JSON.parse(bytes.toString("utf8"))),
    registrySha256: sha256(bytes)
  };
}

export function sourceReviewOperationsIndex(registry = loadSourceReviewOperationsRegistry()) {
  const operationsById = new Map(registry.operations.map((operation) => [operation.operationId, operation]));
  const latestAttemptByOperation = new Map<string, SourceReviewAttempt>();
  for (const attempt of registry.attempts) {
    const previous = latestAttemptByOperation.get(attempt.operationId);
    if (!previous || compareSourceReviewAttempts(attempt, previous) > 0) {
      latestAttemptByOperation.set(attempt.operationId, attempt);
    }
  }
  const selected = new Map<string, { operation: SourceReviewOperation; attempt: SourceReviewAttempt }>();
  for (const [operationId, attempt] of latestAttemptByOperation) {
    const operation = operationsById.get(operationId);
    if (!operation) continue;
    const key = [operation.geo, operation.sourceUrl, operation.eventKind, operation.revalidationStateAtOpen, operation.changeReasonAtOpen].join("\u0000");
    const previous = selected.get(key);
    if (!previous || compareSourceReviewAttempts(attempt, previous.attempt) > 0) {
      selected.set(key, { operation, attempt });
    }
  }
  return new Map([...selected].map(([key, value]) => [key, value.operation]));
}

export function sourceReviewResolutionsIndex(registry = loadSourceReviewOperationsRegistry()) {
  return new Map(registry.resolutions.map((resolution) => [resolution.operationId, resolution]));
}

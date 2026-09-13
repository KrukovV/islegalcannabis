import {
  isEvidencePassportPendingReview,
  isEvidencePassportSourceChange
} from "./evidencePassport";
import {
  compareSourceReviewAttempts,
  loadCanonicalSourceReviewEvidenceRecordIndex,
  loadCanonicalSourceReviewV2SignalIdentityIndex,
  loadSourceReviewOperationsRegistrySnapshot,
  sourceReviewOperationKey,
  sourceReviewEvidenceSourceKey,
  sourceReviewOperationsIndex,
  sourceReviewEvidenceAttestationsIndex,
  sourceReviewResolutionsIndex,
  type SourceReviewAttempt,
  type SourceReviewCategory,
  type SourceReviewEvidenceAttestation,
  type SourceReviewOperation,
  type SourceReviewOperationsRegistrySnapshot,
  type SourceReviewResolution
} from "./sourceReviewOperations";
import {
  listTruthMapCanonicalProjectionRecords,
  type TruthMapCanonicalProjectionRecord,
  type TruthMapCanonicalProjectionSource
} from "./truthMapSource";

export const SOURCE_REVIEW_WORKBENCH_STATES = ["current", "historical", "resolved", "open"] as const;
export const SOURCE_REVIEW_WORKBENCH_CATEGORIES = [
  "SOURCE_OWNER_OR_FINAL_URL_CHANGE",
  "SOURCE_IDENTITY_CHANGE",
  "SOURCE_CONTENT_CHANGE",
  "EFFECTIVE_DATE_REVIEW",
  "VISUAL_REVIEW",
  "SEMANTIC_REVIEW",
  "ACCESS_REVIEW",
  "SCHEMA_METADATA_REVIEW",
  "FRESHNESS_METADATA_REVIEW"
] as const satisfies readonly SourceReviewCategory[];

export type SourceReviewWorkbenchState = typeof SOURCE_REVIEW_WORKBENCH_STATES[number];
export type SourceReviewWorkbenchFilters = {
  geo?: string;
  category?: SourceReviewCategory | string;
  state?: SourceReviewWorkbenchState | string;
  operationId?: string;
};

export type SourceReviewWorkbenchInput = {
  records?: TruthMapCanonicalProjectionRecord[];
  registrySnapshot?: SourceReviewOperationsRegistrySnapshot;
};

export type SourceReviewCloseTokens = {
  operationId: string;
  reviewedAttemptId: string;
  expectedSignalIdentitySha256: string;
  expectedRegistrySha256: string;
};

export type SourceReviewWorkbenchDossier = {
  lifecycle: "CURRENT_ACTIVE" | "HISTORICAL_OPEN" | "RESOLVED";
  currentSignal: boolean;
  operation: SourceReviewOperation;
  attemptHistory: SourceReviewAttempt[];
  latestAttempt: SourceReviewAttempt;
  latestAttemptContentSha256: string;
  closeTokens: SourceReviewCloseTokens | null;
  resolution: SourceReviewResolution | null;
  evidenceAttestation: SourceReviewEvidenceAttestation | null;
  evidenceAttestationState: "BOUND_PRE_CLOSE" | "BOUND_POST_HOC" | "UNBOUND_LEGACY" | null;
  currentSource: TruthMapCanonicalProjectionSource | null;
};

export type SourceReviewWorkbench = {
  schemaVersion: 4;
  localOnly: true;
  readOnly: true;
  registrySha256: string;
  filters: {
    geo: string | null;
    category: SourceReviewCategory | null;
    state: SourceReviewWorkbenchState | null;
    operationId: string | null;
  };
  summary: {
    canonicalGeos: number;
    totalOperations: number;
    currentSignals: number;
    currentActive: number;
    openHistorical: number;
    resolved: number;
    evidenceAttested: number;
    evidenceBoundPreClose: number;
    evidenceBoundPostHoc: number;
    evidenceUnboundLegacy: number;
    matchingOperations: number;
    matchingCurrentActive: number;
    matchingOpenHistorical: number;
    matchingResolved: number;
    matchingEvidenceAttested: number;
    matchingEvidenceBoundPreClose: number;
    matchingEvidenceBoundPostHoc: number;
    matchingEvidenceUnboundLegacy: number;
    returnedOperations: number;
    truncated: boolean;
  };
  dossiers: SourceReviewWorkbenchDossier[];
  boundary: "READ_ONLY_SOURCE_REVIEW_VIEW_NO_TRUTH_MUTATION";
};

const MAX_RETURNED_DOSSIERS = 100;
const WORKBENCH_QUERY_FILTERS = new Set(["geo", "category", "state", "operationId"]);
const WORKBENCH_STATES = new Set<string>(SOURCE_REVIEW_WORKBENCH_STATES);
const WORKBENCH_CATEGORIES = new Set<string>(SOURCE_REVIEW_WORKBENCH_CATEGORIES);

function requiredSingleFilter(searchParams: URLSearchParams, name: string) {
  const values = searchParams.getAll(name);
  if (!values.length) return undefined;
  if (values.length > 1) throw new Error(`SOURCE_REVIEW_WORKBENCH_DUPLICATE_FILTER=${name}`);
  const value = values[0].trim();
  if (!value) throw new Error(`SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=${name}`);
  return value;
}

export function parseSourceReviewWorkbenchSearchParams(searchParams: URLSearchParams): SourceReviewWorkbenchFilters {
  for (const name of new Set(searchParams.keys())) {
    if (!WORKBENCH_QUERY_FILTERS.has(name)) throw new Error(`SOURCE_REVIEW_WORKBENCH_UNKNOWN_QUERY_FILTER=${name}`);
  }
  return {
    geo: requiredSingleFilter(searchParams, "geo"),
    category: requiredSingleFilter(searchParams, "category"),
    state: requiredSingleFilter(searchParams, "state"),
    operationId: requiredSingleFilter(searchParams, "operationId")
  };
}

function normalizeFilters(filters: SourceReviewWorkbenchFilters, canonicalGeos: Set<string>, operationIds: Set<string>) {
  const explicitGeo = filters.geo !== undefined;
  const explicitCategory = filters.category !== undefined;
  const explicitState = filters.state !== undefined;
  const explicitOperationId = filters.operationId !== undefined;
  const geo = String(filters.geo || "").trim().toUpperCase();
  const category = String(filters.category || "").trim().toUpperCase();
  const state = String(filters.state || "").trim().toLowerCase();
  const operationId = String(filters.operationId || "").trim();
  if (explicitGeo && !geo) throw new Error("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=geo");
  if (explicitCategory && !category) throw new Error("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=category");
  if (explicitState && !state) throw new Error("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=state");
  if (explicitOperationId && !operationId) throw new Error("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=operationId");
  if (geo && !canonicalGeos.has(geo)) throw new Error(`SOURCE_REVIEW_WORKBENCH_UNKNOWN_GEO=${geo}`);
  if (category && !WORKBENCH_CATEGORIES.has(category)) throw new Error(`SOURCE_REVIEW_WORKBENCH_UNKNOWN_CATEGORY=${category}`);
  if (state && !WORKBENCH_STATES.has(state)) throw new Error(`SOURCE_REVIEW_WORKBENCH_UNKNOWN_STATE=${state}`);
  if (operationId && !operationIds.has(operationId)) throw new Error(`SOURCE_REVIEW_WORKBENCH_UNKNOWN_OPERATION=${operationId}`);
  return {
    geo: geo || null,
    category: (category || null) as SourceReviewCategory | null,
    state: (state || null) as SourceReviewWorkbenchState | null,
    operationId: operationId || null
  };
}

function currentEventKinds(source: TruthMapCanonicalProjectionSource) {
  const eventKinds: SourceReviewOperation["eventKind"][] = [];
  if (isEvidencePassportSourceChange(source)) eventKinds.push("SOURCE_CHANGE");
  if (source.revalidation.state === "NOT_RECORDED") eventKinds.push("FRESHNESS_METADATA_GAP");
  else if (isEvidencePassportPendingReview(source)) eventKinds.push("PENDING_REVIEW");
  return eventKinds;
}

function latestAttemptsByOperation(attempts: SourceReviewAttempt[]) {
  const index = new Map<string, SourceReviewAttempt>();
  for (const attempt of attempts) {
    const previous = index.get(attempt.operationId);
    if (!previous || compareSourceReviewAttempts(attempt, previous) > 0) {
      index.set(attempt.operationId, attempt);
    }
  }
  return index;
}

function orderedAttemptsByOperation(attempts: SourceReviewAttempt[]) {
  const index = new Map<string, SourceReviewAttempt[]>();
  for (const attempt of attempts) {
    const values = index.get(attempt.operationId) || [];
    values.push(attempt);
    index.set(attempt.operationId, values);
  }
  for (const values of index.values()) {
    values.sort((left, right) => (
      compareSourceReviewAttempts(left, right)
    ));
  }
  return index;
}

function lifecycle(currentSignal: boolean, resolution: SourceReviewResolution | null): SourceReviewWorkbenchDossier["lifecycle"] {
  if (resolution) return "RESOLVED";
  return currentSignal ? "CURRENT_ACTIVE" : "HISTORICAL_OPEN";
}

function partition(dossiers: SourceReviewWorkbenchDossier[]) {
  return {
    currentActive: dossiers.filter((dossier) => dossier.lifecycle === "CURRENT_ACTIVE").length,
    openHistorical: dossiers.filter((dossier) => dossier.lifecycle === "HISTORICAL_OPEN").length,
    resolved: dossiers.filter((dossier) => dossier.lifecycle === "RESOLVED").length,
    evidenceAttested: dossiers.filter((dossier) => dossier.evidenceAttestation !== null).length,
    evidenceBoundPreClose: dossiers.filter((dossier) => dossier.evidenceAttestationState === "BOUND_PRE_CLOSE").length,
    evidenceBoundPostHoc: dossiers.filter((dossier) => dossier.evidenceAttestationState === "BOUND_POST_HOC").length,
    evidenceUnboundLegacy: dossiers.filter((dossier) => dossier.evidenceAttestationState === "UNBOUND_LEGACY").length
  };
}

function evidenceAttestationState(
  resolution: SourceReviewResolution | null,
  attestation: SourceReviewEvidenceAttestation | null
): SourceReviewWorkbenchDossier["evidenceAttestationState"] {
  if (!resolution) return null;
  if (!attestation) return "UNBOUND_LEGACY";
  return attestation.attestationMode === "PRE_CLOSE_ATOMIC" ? "BOUND_PRE_CLOSE" : "BOUND_POST_HOC";
}

function matchesState(dossier: SourceReviewWorkbenchDossier, state: SourceReviewWorkbenchState | null) {
  if (!state) return true;
  if (state === "current") return dossier.currentSignal;
  if (state === "historical") return !dossier.currentSignal;
  if (state === "resolved") return dossier.resolution !== null;
  return dossier.resolution === null;
}

function dossierRank(dossier: SourceReviewWorkbenchDossier) {
  const lifecycleRank = dossier.lifecycle === "CURRENT_ACTIVE" ? 0 : dossier.lifecycle === "HISTORICAL_OPEN" ? 1 : 2;
  const categoryRank = SOURCE_REVIEW_WORKBENCH_CATEGORIES.indexOf(dossier.operation.category);
  return { lifecycleRank, categoryRank: categoryRank < 0 ? SOURCE_REVIEW_WORKBENCH_CATEGORIES.length : categoryRank };
}

export function buildSourceReviewWorkbench(
  filters: SourceReviewWorkbenchFilters = {},
  input: SourceReviewWorkbenchInput = {}
): SourceReviewWorkbench {
  const records = input.records || listTruthMapCanonicalProjectionRecords();
  const canonicalGeos = new Set(records.map((record) => record.geo));
  if (records.length !== 307 || canonicalGeos.size !== 307) {
    throw new Error(`SOURCE_REVIEW_WORKBENCH_CANONICAL_UNIVERSE_INVALID=${records.length}/${canonicalGeos.size}`);
  }
  const registrySnapshot = input.registrySnapshot || loadSourceReviewOperationsRegistrySnapshot();
  const registry = registrySnapshot.registry;
  const normalized = normalizeFilters(filters, canonicalGeos, new Set(registry.operations.map((operation) => operation.operationId)));
  const currentOperationIndex = sourceReviewOperationsIndex(registry);
  const resolutions = sourceReviewResolutionsIndex(registry);
  const evidenceAttestations = sourceReviewEvidenceAttestationsIndex(registry);
  const latestAttempts = latestAttemptsByOperation(registry.attempts);
  const attemptHistories = orderedAttemptsByOperation(registry.attempts);
  const canonicalV2Signals = loadCanonicalSourceReviewV2SignalIdentityIndex();
  const canonicalEvidenceRecords = loadCanonicalSourceReviewEvidenceRecordIndex();
  const currentSourcesByOperation = new Map<string, TruthMapCanonicalProjectionSource>();

  for (const record of records) {
    for (const source of record.sources) {
      for (const eventKind of currentEventKinds(source)) {
        const operation = currentOperationIndex.get(sourceReviewOperationKey(record.geo, source, eventKind));
        if (!operation) {
          throw new Error(`SOURCE_REVIEW_WORKBENCH_CURRENT_OPERATION_MISSING=${record.geo}|${eventKind}|${source.url}`);
        }
        const latestAttempt = latestAttempts.get(operation.operationId);
        const expectedSignalIdentitySha256 = canonicalV2Signals.get(sourceReviewOperationKey(record.geo, source, eventKind));
        if (!latestAttempt || !expectedSignalIdentitySha256) {
          throw new Error(`SOURCE_REVIEW_WORKBENCH_CURRENT_OPERATION_MISSING=${record.geo}|${eventKind}|${source.url}`);
        }
        if (latestAttempt.signalIdentitySha256 !== expectedSignalIdentitySha256) {
          throw new Error(`SOURCE_REVIEW_WORKBENCH_CURRENT_OPERATION_STALE=${operation.operationId}`);
        }
        currentSourcesByOperation.set(operation.operationId, source);
      }
    }
  }

  const dossiers = registry.operations.map((operation): SourceReviewWorkbenchDossier => {
    const latestAttempt = latestAttempts.get(operation.operationId);
    if (!latestAttempt) throw new Error(`SOURCE_REVIEW_WORKBENCH_ATTEMPT_MISSING=${operation.operationId}`);
    const resolution = resolutions.get(operation.operationId) || null;
    const evidenceAttestation = evidenceAttestations.get(operation.operationId) || null;
    const currentSource = currentSourcesByOperation.get(operation.operationId) || null;
    const currentSignal = currentSource !== null;
    if (currentSignal && evidenceAttestation) {
      const canonicalEvidenceRecord = canonicalEvidenceRecords.get(
        sourceReviewEvidenceSourceKey(operation.geo, operation.sourceUrl)
      );
      if (!canonicalEvidenceRecord
        || JSON.stringify(canonicalEvidenceRecord) !== JSON.stringify(evidenceAttestation.sourceRecord)) {
        throw new Error(`SOURCE_REVIEW_WORKBENCH_ACTIVE_ATTESTATION_STALE=${operation.operationId}`);
      }
    }
    const attemptHistory = attemptHistories.get(operation.operationId) || [];
    if (!attemptHistory.length) throw new Error(`SOURCE_REVIEW_WORKBENCH_ATTEMPT_HISTORY_MISSING=${operation.operationId}`);
    return {
      lifecycle: lifecycle(currentSignal, resolution),
      currentSignal,
      operation,
      attemptHistory,
      latestAttempt,
      latestAttemptContentSha256: latestAttempt.documentSha256,
      closeTokens: resolution ? null : {
        operationId: operation.operationId,
        reviewedAttemptId: latestAttempt.attemptId,
        expectedSignalIdentitySha256: latestAttempt.signalIdentitySha256,
        expectedRegistrySha256: registrySnapshot.registrySha256
      },
      resolution,
      evidenceAttestation,
      evidenceAttestationState: evidenceAttestationState(resolution, evidenceAttestation),
      currentSource
    };
  }).sort((left, right) => {
    const leftRank = dossierRank(left);
    const rightRank = dossierRank(right);
    return leftRank.lifecycleRank - rightRank.lifecycleRank
      || leftRank.categoryRank - rightRank.categoryRank
      || left.operation.geo.localeCompare(right.operation.geo)
      || right.operation.openedAt.localeCompare(left.operation.openedAt)
      || left.operation.operationId.localeCompare(right.operation.operationId);
  });

  const overall = partition(dossiers);
  const matching = dossiers.filter((dossier) => (
    (!normalized.geo || dossier.operation.geo === normalized.geo)
    && (!normalized.category || dossier.operation.category === normalized.category)
    && matchesState(dossier, normalized.state)
    && (!normalized.operationId || dossier.operation.operationId === normalized.operationId)
  ));
  const matchingPartition = partition(matching);
  const returned = matching.slice(0, MAX_RETURNED_DOSSIERS);

  return {
    schemaVersion: 4,
    localOnly: true,
    readOnly: true,
    registrySha256: registrySnapshot.registrySha256,
    filters: normalized,
    summary: {
      canonicalGeos: canonicalGeos.size,
      totalOperations: dossiers.length,
      currentSignals: currentSourcesByOperation.size,
      ...overall,
      matchingOperations: matching.length,
      matchingCurrentActive: matchingPartition.currentActive,
      matchingOpenHistorical: matchingPartition.openHistorical,
      matchingResolved: matchingPartition.resolved,
      matchingEvidenceAttested: matchingPartition.evidenceAttested,
      matchingEvidenceBoundPreClose: matchingPartition.evidenceBoundPreClose,
      matchingEvidenceBoundPostHoc: matchingPartition.evidenceBoundPostHoc,
      matchingEvidenceUnboundLegacy: matchingPartition.evidenceUnboundLegacy,
      returnedOperations: returned.length,
      truncated: returned.length < matching.length
    },
    dossiers: returned,
    boundary: "READ_ONLY_SOURCE_REVIEW_VIEW_NO_TRUTH_MUTATION"
  };
}

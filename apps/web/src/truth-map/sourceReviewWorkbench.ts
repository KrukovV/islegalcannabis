import {
  isEvidencePassportPendingReview,
  isEvidencePassportSourceChange
} from "./evidencePassport";
import {
  loadSourceReviewOperationsRegistry,
  sourceReviewOperationKey,
  sourceReviewOperationsIndex,
  sourceReviewResolutionsIndex,
  type SourceReviewAttempt,
  type SourceReviewCategory,
  type SourceReviewOperation,
  type SourceReviewResolution
} from "./sourceReviewOperations";
import {
  listTruthMapCanonicalProjectionRecords,
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
};

export type SourceReviewWorkbenchDossier = {
  lifecycle: "CURRENT_ACTIVE" | "HISTORICAL_OPEN" | "RESOLVED";
  currentSignal: boolean;
  operation: SourceReviewOperation;
  latestAttempt: SourceReviewAttempt;
  latestAttemptContentSha256: string;
  resolution: SourceReviewResolution | null;
  currentSource: TruthMapCanonicalProjectionSource | null;
};

export type SourceReviewWorkbench = {
  schemaVersion: 1;
  localOnly: true;
  readOnly: true;
  filters: {
    geo: string | null;
    category: SourceReviewCategory | null;
    state: SourceReviewWorkbenchState | null;
  };
  summary: {
    canonicalGeos: number;
    totalOperations: number;
    currentSignals: number;
    currentActive: number;
    openHistorical: number;
    resolved: number;
    matchingOperations: number;
    matchingCurrentActive: number;
    matchingOpenHistorical: number;
    matchingResolved: number;
    returnedOperations: number;
    truncated: boolean;
  };
  dossiers: SourceReviewWorkbenchDossier[];
  boundary: "READ_ONLY_SOURCE_REVIEW_VIEW_NO_TRUTH_MUTATION";
};

const MAX_RETURNED_DOSSIERS = 100;
const WORKBENCH_QUERY_FILTERS = new Set(["geo", "category", "state"]);
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
    state: requiredSingleFilter(searchParams, "state")
  };
}

function normalizeFilters(filters: SourceReviewWorkbenchFilters, canonicalGeos: Set<string>) {
  const explicitGeo = filters.geo !== undefined;
  const explicitCategory = filters.category !== undefined;
  const explicitState = filters.state !== undefined;
  const geo = String(filters.geo || "").trim().toUpperCase();
  const category = String(filters.category || "").trim().toUpperCase();
  const state = String(filters.state || "").trim().toLowerCase();
  if (explicitGeo && !geo) throw new Error("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=geo");
  if (explicitCategory && !category) throw new Error("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=category");
  if (explicitState && !state) throw new Error("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=state");
  if (geo && !canonicalGeos.has(geo)) throw new Error(`SOURCE_REVIEW_WORKBENCH_UNKNOWN_GEO=${geo}`);
  if (category && !WORKBENCH_CATEGORIES.has(category)) throw new Error(`SOURCE_REVIEW_WORKBENCH_UNKNOWN_CATEGORY=${category}`);
  if (state && !WORKBENCH_STATES.has(state)) throw new Error(`SOURCE_REVIEW_WORKBENCH_UNKNOWN_STATE=${state}`);
  return {
    geo: geo || null,
    category: (category || null) as SourceReviewCategory | null,
    state: (state || null) as SourceReviewWorkbenchState | null
  };
}

function currentEventKinds(source: TruthMapCanonicalProjectionSource) {
  const eventKinds: SourceReviewOperation["eventKind"][] = [];
  if (isEvidencePassportSourceChange(source)) eventKinds.push("SOURCE_CHANGE");
  if (source.revalidation.state === "NOT_RECORDED") eventKinds.push("FRESHNESS_METADATA_GAP");
  else if (isEvidencePassportPendingReview(source)) eventKinds.push("PENDING_REVIEW");
  return eventKinds;
}

function attemptTimestamp(attempt: SourceReviewAttempt) {
  const sourceCheckedAt = Date.parse(attempt.sourceCheckedAt);
  return Number.isFinite(sourceCheckedAt) ? sourceCheckedAt : Date.parse(attempt.attemptedAt);
}

function latestAttemptsByOperation(attempts: SourceReviewAttempt[]) {
  const index = new Map<string, SourceReviewAttempt>();
  for (const attempt of attempts) {
    const previous = index.get(attempt.operationId);
    if (!previous || attemptTimestamp(attempt) > attemptTimestamp(previous) || (
      attemptTimestamp(attempt) === attemptTimestamp(previous)
      && attempt.attemptId.localeCompare(previous.attemptId) > 0
    )) index.set(attempt.operationId, attempt);
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
    resolved: dossiers.filter((dossier) => dossier.lifecycle === "RESOLVED").length
  };
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

export function buildSourceReviewWorkbench(filters: SourceReviewWorkbenchFilters = {}): SourceReviewWorkbench {
  const records = listTruthMapCanonicalProjectionRecords();
  const canonicalGeos = new Set(records.map((record) => record.geo));
  if (records.length !== 307 || canonicalGeos.size !== 307) {
    throw new Error(`SOURCE_REVIEW_WORKBENCH_CANONICAL_UNIVERSE_INVALID=${records.length}/${canonicalGeos.size}`);
  }
  const normalized = normalizeFilters(filters, canonicalGeos);
  const registry = loadSourceReviewOperationsRegistry();
  const currentOperationIndex = sourceReviewOperationsIndex(registry);
  const resolutions = sourceReviewResolutionsIndex(registry);
  const latestAttempts = latestAttemptsByOperation(registry.attempts);
  const currentSourcesByOperation = new Map<string, TruthMapCanonicalProjectionSource>();

  for (const record of records) {
    for (const source of record.sources) {
      for (const eventKind of currentEventKinds(source)) {
        const operation = currentOperationIndex.get(sourceReviewOperationKey(record.geo, source, eventKind));
        if (!operation) {
          throw new Error(`SOURCE_REVIEW_WORKBENCH_CURRENT_OPERATION_MISSING=${record.geo}|${eventKind}|${source.url}`);
        }
        currentSourcesByOperation.set(operation.operationId, source);
      }
    }
  }

  const dossiers = registry.operations.map((operation): SourceReviewWorkbenchDossier => {
    const latestAttempt = latestAttempts.get(operation.operationId);
    if (!latestAttempt) throw new Error(`SOURCE_REVIEW_WORKBENCH_ATTEMPT_MISSING=${operation.operationId}`);
    const resolution = resolutions.get(operation.operationId) || null;
    const currentSource = currentSourcesByOperation.get(operation.operationId) || null;
    const currentSignal = currentSource !== null;
    return {
      lifecycle: lifecycle(currentSignal, resolution),
      currentSignal,
      operation,
      latestAttempt,
      latestAttemptContentSha256: latestAttempt.documentSha256,
      resolution,
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
  ));
  const matchingPartition = partition(matching);
  const returned = matching.slice(0, MAX_RETURNED_DOSSIERS);

  return {
    schemaVersion: 1,
    localOnly: true,
    readOnly: true,
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
      returnedOperations: returned.length,
      truncated: returned.length < matching.length
    },
    dossiers: returned,
    boundary: "READ_ONLY_SOURCE_REVIEW_VIEW_NO_TRUTH_MUTATION"
  };
}

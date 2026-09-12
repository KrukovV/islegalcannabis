import { buildEvidencePassportCollection, isEvidencePassportPendingReview, isEvidencePassportSourceChange, type EvidencePassport } from "./evidencePassport";
import {
  createCanonicalProjectionSnapshot,
  loadCanonicalProjectionLedger,
  selectPreviousCanonicalProjectionSnapshot,
  type CanonicalProjectionSnapshot
} from "./canonicalProjectionLedger";
import { listTruthMapCanonicalProjectionRecords, type TruthMapCanonicalProjectionSource } from "./truthMapSource";
import {
  loadSourceReviewOperationsRegistry,
  sourceReviewOperationKey,
  sourceReviewOperationsIndex,
  sourceReviewResolutionsIndex,
  type SourceReviewEventKind,
  type SourceReviewAttempt,
  type SourceReviewOperation,
  type SourceReviewOperationsRegistry,
  type SourceReviewResolution
} from "./sourceReviewOperations";

export type ChangeMonitorEvent = {
  kind: "SOURCE_CHANGE" | "PENDING_REVIEW" | "CANONICAL_LEGAL_CONCLUSION_CHANGE";
  geo: string;
  territory: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  occurredAt: string | null;
  sourceCheckedAt: string | null;
  previousEvidenceIdentity: string | null;
  currentEvidenceIdentity: string;
  detail: string;
  boundary: string;
  reviewOperationId: string | null;
  reviewCategory: string | null;
  reviewOutcome: string | null;
};

export type ChangeMonitor = {
  schemaVersion: 2;
  localOnly: true;
  watchlist: {
    mode: "ALL_CANONICAL_GEOS" | "EXPLICIT_GEOS";
    geos: string[];
  };
  canonicalComparison: {
    status: "BASELINE_ONLY_NO_PRIOR_CANONICAL_COMPARISON" | "COMPARISON_AVAILABLE";
    currentVersionId: string;
    previousVersionId: string | null;
    note: string;
  };
  summary: {
    geosWatched: number;
    sourceChanges: number;
    pendingReviews: number;
    canonicalLegalConclusionChanges: number;
    classifiedReviewEvents: number;
    unclassifiedReviewEvents: 0;
    reviewOperations: number;
    openReviewOperations: number;
    resolvedReviewOperations: number;
  };
  sourceChanges: ChangeMonitorEvent[];
  pendingReviews: ChangeMonitorEvent[];
  canonicalLegalConclusionChanges: ChangeMonitorEvent[];
  reviewHistory: SourceReviewHistoryEvent[];
};

export type SourceReviewHistoryEvent = {
  operationId: string;
  geo: string;
  territory: string;
  sourceUrl: string;
  eventKind: SourceReviewEventKind;
  category: string;
  openedAt: string;
  lastAttemptAt: string;
  initialOutcome: string;
  resolvedAt: string | null;
  resolutionOutcome: string | null;
  resolutionReviewerId: string | null;
  resolutionEvidenceUrl: string | null;
  resolutionNote: string | null;
  resolutionBasis: string | null;
  resultingRevalidationState: string | null;
  boundary: string;
};

type WatchlistSearchParamValue = string | string[] | undefined;

function normalizeGeo(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function normalizeGeos(values: readonly string[] | undefined) {
  return [...new Set((values || []).map(normalizeGeo).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

/**
 * The watchlist is deliberately just canonical GEO identifiers. It cannot
 * select a Store, company, account or any non-canonical legal record.
 */
function resolveWatchlist(requestedGeos: readonly string[] | undefined, passports: EvidencePassport[]) {
  const requested = normalizeGeos(requestedGeos);
  const canonical = new Set(passports.map((passport) => passport.geo));
  const unknown = requested.filter((geo) => !canonical.has(geo));
  if (unknown.length) throw new Error(`CHANGE_MONITOR_UNKNOWN_WATCHLIST_GEOS=${unknown.join(",")}`);
  const geos = requested.length ? requested : passports.map((passport) => passport.geo);
  return {
    mode: requested.length ? "EXPLICIT_GEOS" as const : "ALL_CANONICAL_GEOS" as const,
    geos
  };
}

function searchParamValues(value: WatchlistSearchParamValue) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export function parseChangeMonitorWatchlistValues({
  geo,
  watch
}: {
  geo?: WatchlistSearchParamValue;
  watch?: WatchlistSearchParamValue;
}) {
  const geoValues = searchParamValues(geo);
  const watchValues = searchParamValues(watch);
  const explicit = geoValues.length > 0 || watchValues.length > 0;
  const requested = [
    ...geoValues,
    ...watchValues.flatMap((value) => value.split(","))
  ].map((value) => value.trim()).filter(Boolean);
  if (explicit && requested.length === 0) throw new Error("CHANGE_MONITOR_EMPTY_EXPLICIT_WATCHLIST");
  return requested;
}

export function parseChangeMonitorWatchlistQuery(searchParams: URLSearchParams) {
  return parseChangeMonitorWatchlistValues({
    geo: searchParams.has("geo") ? searchParams.getAll("geo") : undefined,
    watch: searchParams.has("watch") ? searchParams.getAll("watch") : undefined
  });
}

function detailForSource(source: TruthMapCanonicalProjectionSource) {
  return [source.revalidation.state, source.revalidation.changeReason]
    .filter((value) => value && value !== "NOT_RECORDED")
    .join(" · ") || "Retained source event recorded without a more specific reason.";
}

function sourceEvent(
  kind: ChangeMonitorEvent["kind"],
  passport: EvidencePassport,
  source: TruthMapCanonicalProjectionSource,
  operation: SourceReviewOperation
): ChangeMonitorEvent {
  const occurredAt = kind === "SOURCE_CHANGE" ? operation.sourceChangeDetectedAt : operation.openedAt;
  return {
    kind,
    geo: passport.geo,
    territory: passport.territory,
    sourceUrl: source.url,
    sourceTitle: source.title,
    occurredAt: occurredAt === "NOT_RECORDED" ? null : occurredAt,
    sourceCheckedAt: source.revalidation.checkedAt,
    previousEvidenceIdentity: null,
    currentEvidenceIdentity: `${source.sourceOwnerGeo || passport.geo}|${source.revalidation.finalUrl || source.url}`,
    detail: detailForSource(source),
    boundary: kind === "SOURCE_CHANGE"
      ? "A source event never changes the current legal conclusion without a separate canonical projection update."
      : "Pending review is a review queue signal, not a legal conclusion or map-colour change.",
    reviewOperationId: operation.operationId,
    reviewCategory: operation.category,
    reviewOutcome: operation.outcome.state
  };
}

function operationForSource(
  operations: Map<string, SourceReviewOperation>,
  passport: EvidencePassport,
  source: TruthMapCanonicalProjectionSource,
  eventKind: SourceReviewEventKind
) {
  const operation = operations.get(sourceReviewOperationKey(passport.geo, source, eventKind));
  if (!operation) throw new Error(`CHANGE_MONITOR_UNCLASSIFIED_SOURCE_REVIEW=${passport.geo}|${eventKind}|${source.url}`);
  return operation;
}

export function compareCanonicalProjectionSnapshots(
  previous: CanonicalProjectionSnapshot,
  current: CanonicalProjectionSnapshot,
  passportsByGeo: Map<string, EvidencePassport>
) {
  const previousByGeo = new Map(previous.entries.map((entry) => [entry.geo, entry]));
  return current.entries.flatMap((entry) => {
    const prior = previousByGeo.get(entry.geo);
    const passport = passportsByGeo.get(entry.geo);
    if (!prior || !passport || (prior.legalTruthColor === entry.legalTruthColor && prior.ruleId === entry.ruleId)) return [];
    return [{
      kind: "CANONICAL_LEGAL_CONCLUSION_CHANGE" as const,
      geo: entry.geo,
      territory: passport.territory,
      sourceUrl: null,
      sourceTitle: null,
      occurredAt: entrySnapshotPublishedAt(current),
      sourceCheckedAt: null,
      previousEvidenceIdentity: previous.versionId,
      currentEvidenceIdentity: current.versionId,
      detail: `Canonical projection changed from ${prior.legalTruthColor} / ${prior.ruleId} to ${entry.legalTruthColor} / ${entry.ruleId}.`,
      boundary: "Only two canonical projection versions can produce this event; source, SSOT and legacy display records cannot.",
      reviewOperationId: null,
      reviewCategory: null,
      reviewOutcome: null
    }];
  });
}

function entrySnapshotPublishedAt(snapshot: CanonicalProjectionSnapshot) {
  return snapshot.generatedAt === "NOT_RECORDED" ? null : snapshot.generatedAt;
}

export function buildChangeMonitor({
  origin = "",
  geos,
  previousCanonicalSnapshot,
  reviewRegistry = loadSourceReviewOperationsRegistry()
}: {
  origin?: string;
  geos?: string[];
  previousCanonicalSnapshot?: CanonicalProjectionSnapshot;
  reviewRegistry?: SourceReviewOperationsRegistry;
} = {}): ChangeMonitor {
  const { passports } = buildEvidencePassportCollection(origin, { reviewRegistry });
  const watchlist = resolveWatchlist(geos, passports);
  const watchedGeos = new Set(watchlist.geos);
  const watchedPassports = passports.filter((passport) => watchedGeos.has(passport.geo));
  const passportsByGeo = new Map(watchedPassports.map((passport) => [passport.geo, passport]));
  const recordsByGeo = new Map(listTruthMapCanonicalProjectionRecords().map((record) => [record.geo, record]));
  const canonicalLedger = loadCanonicalProjectionLedger();
  const registeredCurrentSnapshot = canonicalLedger.snapshots.find(
    (snapshot) => snapshot.versionId === passports[0]?.version.id
  );
  if (!registeredCurrentSnapshot) {
    throw new Error(`CHANGE_MONITOR_CANONICAL_VERSION_NOT_REGISTERED=${passports[0]?.version.id || "UNKNOWN"}`);
  }
  const currentSnapshot = createCanonicalProjectionSnapshot(passports, registeredCurrentSnapshot.publicationReceipt);
  if (currentSnapshot.snapshotSha256 !== registeredCurrentSnapshot.snapshotSha256) {
    throw new Error(`CHANGE_MONITOR_CANONICAL_VERSION_REWRITE=${currentSnapshot.versionId}`);
  }
  const operations = sourceReviewOperationsIndex(reviewRegistry);
  const resolutions = sourceReviewResolutionsIndex(reviewRegistry);
  const latestAttemptByOperation = new Map<string, SourceReviewAttempt>();
  for (const attempt of reviewRegistry.attempts) {
    const previous = latestAttemptByOperation.get(attempt.operationId);
    const attemptAt = Date.parse(attempt.sourceCheckedAt === "NOT_RECORDED" ? attempt.attemptedAt : attempt.sourceCheckedAt);
    const previousAt = previous
      ? Date.parse(previous.sourceCheckedAt === "NOT_RECORDED" ? previous.attemptedAt : previous.sourceCheckedAt)
      : Number.NEGATIVE_INFINITY;
    if (!previous || attemptAt > previousAt || (attemptAt === previousAt && attempt.attemptId.localeCompare(previous.attemptId) > 0)) {
      latestAttemptByOperation.set(attempt.operationId, attempt);
    }
  }
  const sourceChanges: ChangeMonitorEvent[] = [];
  const pendingReviews: ChangeMonitorEvent[] = [];

  for (const passport of watchedPassports) {
    const record = recordsByGeo.get(passport.geo);
    if (!record) throw new Error(`CHANGE_MONITOR_SOURCE_RECORD_MISSING=${passport.geo}`);
    for (const source of record.sources) {
      if (isEvidencePassportSourceChange(source)) {
        const operation = operationForSource(operations, passport, source, "SOURCE_CHANGE");
        if (!resolutions.has(operation.operationId)) sourceChanges.push(sourceEvent("SOURCE_CHANGE", passport, source, operation));
      }
      if (isEvidencePassportPendingReview(source)) {
        const eventKind = source.revalidation.state === "NOT_RECORDED" ? "FRESHNESS_METADATA_GAP" : "PENDING_REVIEW";
        const operation = operationForSource(operations, passport, source, eventKind);
        if (!resolutions.has(operation.operationId)) pendingReviews.push(sourceEvent("PENDING_REVIEW", passport, source, operation));
      }
    }
  }

  const ledgerPreviousSnapshot = previousCanonicalSnapshot === undefined
    ? selectPreviousCanonicalProjectionSnapshot(canonicalLedger, currentSnapshot)
    : previousCanonicalSnapshot;
  const canonicalLegalConclusionChanges = ledgerPreviousSnapshot
    ? compareCanonicalProjectionSnapshots(ledgerPreviousSnapshot, currentSnapshot, passportsByGeo)
      .filter((event) => watchedGeos.has(event.geo))
    : [];
  const comparisonAvailable = Boolean(ledgerPreviousSnapshot);
  const reviewHistory = reviewRegistry.operations
    .filter((operation) => watchedGeos.has(operation.geo))
    .map((operation): SourceReviewHistoryEvent => {
      const resolution: SourceReviewResolution | undefined = resolutions.get(operation.operationId);
      const latestAttempt = latestAttemptByOperation.get(operation.operationId);
      if (!latestAttempt) throw new Error(`CHANGE_MONITOR_REVIEW_ATTEMPT_MISSING=${operation.operationId}`);
      return {
        operationId: operation.operationId,
        geo: operation.geo,
        territory: passportsByGeo.get(operation.geo)?.territory || operation.geo,
        sourceUrl: operation.sourceUrl,
        eventKind: operation.eventKind,
        category: operation.category,
        openedAt: operation.openedAt,
        lastAttemptAt: latestAttempt.sourceCheckedAt === "NOT_RECORDED" ? latestAttempt.attemptedAt : latestAttempt.sourceCheckedAt,
        initialOutcome: operation.outcome.state,
        resolvedAt: resolution?.resolvedAt || null,
        resolutionOutcome: resolution?.outcome || null,
        resolutionReviewerId: resolution?.reviewerId || null,
        resolutionEvidenceUrl: resolution?.evidenceUrl || null,
        resolutionNote: resolution?.note || null,
        resolutionBasis: resolution?.resolutionBasis || null,
        resultingRevalidationState: resolution?.resultingRevalidationState || null,
        boundary: resolution?.boundary || operation.boundary
      };
    })
    .sort((left, right) => `${left.openedAt}:${left.operationId}`.localeCompare(`${right.openedAt}:${right.operationId}`));
  const resolvedReviewOperations = reviewHistory.filter((event) => event.resolvedAt).length;
  return {
    schemaVersion: 2,
    localOnly: true,
    watchlist,
    canonicalComparison: {
      status: comparisonAvailable ? "COMPARISON_AVAILABLE" : "BASELINE_ONLY_NO_PRIOR_CANONICAL_COMPARISON",
      currentVersionId: currentSnapshot.versionId,
      previousVersionId: ledgerPreviousSnapshot?.versionId || null,
      note: comparisonAvailable
        ? "Canonical legal-conclusion changes compare two canonical projection versions only."
        : "No earlier canonical projection version is retained by this local MVP, so legal-conclusion changes are intentionally empty."
    },
    summary: {
      geosWatched: watchedPassports.length,
      sourceChanges: sourceChanges.length,
      pendingReviews: pendingReviews.length,
      canonicalLegalConclusionChanges: canonicalLegalConclusionChanges.length,
      classifiedReviewEvents: sourceChanges.length + pendingReviews.length,
      unclassifiedReviewEvents: 0,
      reviewOperations: reviewHistory.length,
      openReviewOperations: reviewHistory.length - resolvedReviewOperations,
      resolvedReviewOperations
    },
    sourceChanges: sourceChanges.sort((left, right) => `${left.geo}:${left.sourceUrl}`.localeCompare(`${right.geo}:${right.sourceUrl}`)),
    pendingReviews: pendingReviews.sort((left, right) => `${left.geo}:${left.sourceUrl}`.localeCompare(`${right.geo}:${right.sourceUrl}`)),
    canonicalLegalConclusionChanges: canonicalLegalConclusionChanges.sort((left, right) => left.geo.localeCompare(right.geo)),
    reviewHistory
  };
}

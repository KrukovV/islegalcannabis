import { buildEvidencePassportCollection, isEvidencePassportPendingReview, isEvidencePassportSourceChange, type EvidencePassport } from "./evidencePassport";
import {
  createCanonicalProjectionSnapshot,
  loadCanonicalProjectionLedger,
  selectPreviousCanonicalProjectionSnapshot,
  type CanonicalProjectionSnapshot
} from "./canonicalProjectionLedger";
import { listTruthMapCanonicalProjectionRecords, type TruthMapCanonicalProjectionSource } from "./truthMapSource";

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
};

export type ChangeMonitor = {
  schemaVersion: 1;
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
  };
  sourceChanges: ChangeMonitorEvent[];
  pendingReviews: ChangeMonitorEvent[];
  canonicalLegalConclusionChanges: ChangeMonitorEvent[];
};

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

export function parseChangeMonitorWatchlistQuery(searchParams: URLSearchParams) {
  return [
    ...searchParams.getAll("geo"),
    ...searchParams.getAll("watch").flatMap((value) => value.split(","))
  ];
}

function detailForSource(source: TruthMapCanonicalProjectionSource) {
  return [source.revalidation.state, source.revalidation.changeReason]
    .filter((value) => value && value !== "NOT_RECORDED")
    .join(" · ") || "Retained source event recorded without a more specific reason.";
}

function sourceEvent(
  kind: ChangeMonitorEvent["kind"],
  passport: EvidencePassport,
  source: TruthMapCanonicalProjectionSource
): ChangeMonitorEvent {
  return {
    kind,
    geo: passport.geo,
    territory: passport.territory,
    sourceUrl: source.url,
    sourceTitle: source.title,
    occurredAt: null,
    sourceCheckedAt: source.revalidation.checkedAt,
    previousEvidenceIdentity: null,
    currentEvidenceIdentity: `${source.sourceOwnerGeo || passport.geo}|${source.revalidation.finalUrl || source.url}`,
    detail: detailForSource(source),
    boundary: kind === "SOURCE_CHANGE"
      ? "A source event never changes the current legal conclusion without a separate canonical projection update."
      : "Pending review is a review queue signal, not a legal conclusion or map-colour change."
  };
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
      occurredAt: null,
      sourceCheckedAt: null,
      previousEvidenceIdentity: previous.versionId,
      currentEvidenceIdentity: current.versionId,
      detail: `Canonical projection changed from ${prior.legalTruthColor} / ${prior.ruleId} to ${entry.legalTruthColor} / ${entry.ruleId}.`,
      boundary: "Only two canonical projection versions can produce this event; source, SSOT and legacy display records cannot."
    }];
  });
}

export function buildChangeMonitor({
  origin = "",
  geos,
  previousCanonicalSnapshot
}: {
  origin?: string;
  geos?: string[];
  previousCanonicalSnapshot?: CanonicalProjectionSnapshot;
} = {}): ChangeMonitor {
  const { passports } = buildEvidencePassportCollection(origin);
  const watchlist = resolveWatchlist(geos, passports);
  const watchedGeos = new Set(watchlist.geos);
  const watchedPassports = passports.filter((passport) => watchedGeos.has(passport.geo));
  const passportsByGeo = new Map(watchedPassports.map((passport) => [passport.geo, passport]));
  const recordsByGeo = new Map(listTruthMapCanonicalProjectionRecords().map((record) => [record.geo, record]));
  const currentSnapshot = createCanonicalProjectionSnapshot(passports);
  const sourceChanges: ChangeMonitorEvent[] = [];
  const pendingReviews: ChangeMonitorEvent[] = [];

  for (const passport of watchedPassports) {
    const record = recordsByGeo.get(passport.geo);
    if (!record) throw new Error(`CHANGE_MONITOR_SOURCE_RECORD_MISSING=${passport.geo}`);
    for (const source of record.sources) {
      if (isEvidencePassportSourceChange(source)) sourceChanges.push(sourceEvent("SOURCE_CHANGE", passport, source));
      if (isEvidencePassportPendingReview(source)) pendingReviews.push(sourceEvent("PENDING_REVIEW", passport, source));
    }
  }

  const ledgerPreviousSnapshot = previousCanonicalSnapshot === undefined
    ? selectPreviousCanonicalProjectionSnapshot(loadCanonicalProjectionLedger(), currentSnapshot)
    : previousCanonicalSnapshot;
  const canonicalLegalConclusionChanges = ledgerPreviousSnapshot
    ? compareCanonicalProjectionSnapshots(ledgerPreviousSnapshot, currentSnapshot, passportsByGeo)
      .filter((event) => watchedGeos.has(event.geo))
    : [];
  const comparisonAvailable = Boolean(ledgerPreviousSnapshot);
  return {
    schemaVersion: 1,
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
      canonicalLegalConclusionChanges: canonicalLegalConclusionChanges.length
    },
    sourceChanges: sourceChanges.sort((left, right) => `${left.geo}:${left.sourceUrl}`.localeCompare(`${right.geo}:${right.sourceUrl}`)),
    pendingReviews: pendingReviews.sort((left, right) => `${left.geo}:${left.sourceUrl}`.localeCompare(`${right.geo}:${right.sourceUrl}`)),
    canonicalLegalConclusionChanges: canonicalLegalConclusionChanges.sort((left, right) => left.geo.localeCompare(right.geo))
  };
}

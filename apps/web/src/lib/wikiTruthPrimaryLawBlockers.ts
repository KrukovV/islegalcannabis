export type WikiTruthPrimaryLawBlockerSearchResult = {
  uri: string;
  country: string;
  title: string;
  chapter: string;
  article: string;
};

export type WikiTruthPrimaryLawBlockerSearch = {
  source: string;
  countryFilter: string;
  term: string;
  query: string;
  found: number;
  url: string;
  results: WikiTruthPrimaryLawBlockerSearchResult[];
};

export type WikiTruthPrimaryLawBlockerContext = {
  title: string;
  url: string;
  sourceKind: string;
  legalUse: string;
};

export type WikiTruthPrimaryLawBlockerBoundary = {
  status: string;
  proven: string;
  missing: string;
  legalConclusion: string;
};

export type WikiTruthPrimaryLawBlockerCollectorCandidate = {
  idx: number;
  url: string;
  sourceKind: string;
  candidateKind: string;
  fetchedOk: boolean;
  fetchedStatus: number;
  hasCannabis: boolean;
  confidence: string;
};

export type WikiTruthPrimaryLawBlockerCollectorAudit = {
  source: string;
  path: string;
  selectedCandidates: number;
  fetchedCandidates: number;
  hasCannabisPages: boolean;
  candidateSample: WikiTruthPrimaryLawBlockerCollectorCandidate[];
  conclusion: string;
};

export type WikiTruthPrimaryLawBlockerVisualContextLink = {
  title: string;
  url: string;
  sourceKind: string;
  evidenceScope: string;
  verification: string;
  visualReview: string;
  screenshotPath: string;
};

export type WikiTruthPrimaryLawBlockerVisualEvidence = {
  source: string;
  path: string;
  sourceCoverage: string;
  differenceStatus: string;
  visualReviewStatus: string;
  screenshotPaths: string[];
  officialContextLinks: WikiTruthPrimaryLawBlockerVisualContextLink[];
  conclusion: string;
};

export type WikiTruthPrimaryLawBlockerFreshSearchQuery = {
  query: string;
  outcome: string;
  directCannabisPrimaryLawFound: boolean;
};

export type WikiTruthPrimaryLawBlockerFreshSearchSource = {
  title: string;
  url: string;
  finding: string;
  directCannabisPrimaryLawFound: boolean;
};

export type WikiTruthPrimaryLawBlockerFreshSearchAudit = {
  source: string;
  executedAt: string;
  result: string;
  officialSourceStandard: string;
  queries: WikiTruthPrimaryLawBlockerFreshSearchQuery[];
  officialSourcesReviewed: WikiTruthPrimaryLawBlockerFreshSearchSource[];
  conclusion: string;
};

export type WikiTruthPrimaryLawBlockerRow = {
  geo: string;
  territory: string;
  status: string;
  blockerType: string;
  currentTruthRule: string;
  proposedTruthColor: string;
  requiredNextEvidence: string;
  evidenceSummary: string;
  knownPrimaryLawBoundary: WikiTruthPrimaryLawBlockerBoundary;
  freshPrimaryLawSearchAudit: WikiTruthPrimaryLawBlockerFreshSearchAudit;
  localCollectorAudit: WikiTruthPrimaryLawBlockerCollectorAudit;
  visualReviewEvidence: WikiTruthPrimaryLawBlockerVisualEvidence;
  officialContextSearch: WikiTruthPrimaryLawBlockerSearch;
  negativeSearches: WikiTruthPrimaryLawBlockerSearch[];
  supportingPrimaryLawContext: WikiTruthPrimaryLawBlockerContext[];
  nonMutationDecision: string;
};

export type WikiTruthPrimaryLawBlockersView = {
  generatedAt: string;
  reportVersion: string;
  nonMutating: boolean;
  purpose: string;
  blockersTotal: number;
  blockers: WikiTruthPrimaryLawBlockerRow[];
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .filter((item) => item && typeof item === "object")
        .map((item) => item as Record<string, unknown>)
    : [];
}

function readText(value: unknown) {
  return String(value || "").trim();
}

function readNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeSearchResult(
  value: unknown,
): WikiTruthPrimaryLawBlockerSearchResult {
  const row = readRecord(value);
  return {
    uri: readText(row.uri),
    country: readText(row.country),
    title: readText(row.title),
    chapter: readText(row.chapter),
    article: readText(row.article),
  };
}

function normalizeSearch(value: unknown): WikiTruthPrimaryLawBlockerSearch {
  const row = readRecord(value);
  return {
    source: readText(row.source) || "UNKNOWN",
    countryFilter: readText(row.countryFilter),
    term: readText(row.term),
    query: readText(row.query),
    found: readNumber(row.found),
    url: readText(row.url),
    results: readArray(row.results).map(normalizeSearchResult),
  };
}

function normalizeContext(value: unknown): WikiTruthPrimaryLawBlockerContext {
  const row = readRecord(value);
  return {
    title: readText(row.title),
    url: readText(row.url),
    sourceKind: readText(row.sourceKind) || "UNKNOWN",
    legalUse: readText(row.legalUse),
  };
}

function normalizeBoundary(value: unknown): WikiTruthPrimaryLawBlockerBoundary {
  const row = readRecord(value);
  return {
    status: readText(row.status) || "UNKNOWN",
    proven: readText(row.proven),
    missing: readText(row.missing),
    legalConclusion: readText(row.legalConclusion),
  };
}

function normalizeCollectorCandidate(
  value: unknown,
): WikiTruthPrimaryLawBlockerCollectorCandidate {
  const row = readRecord(value);
  return {
    idx: readNumber(row.idx),
    url: readText(row.url),
    sourceKind: readText(row.sourceKind),
    candidateKind: readText(row.candidateKind),
    fetchedOk: row.fetchedOk === true,
    fetchedStatus: readNumber(row.fetchedStatus),
    hasCannabis: row.hasCannabis === true,
    confidence: readText(row.confidence),
  };
}

function normalizeCollectorAudit(
  value: unknown,
): WikiTruthPrimaryLawBlockerCollectorAudit {
  const row = readRecord(value);
  return {
    source: readText(row.source) || "UNKNOWN",
    path: readText(row.path),
    selectedCandidates: readNumber(row.selectedCandidates),
    fetchedCandidates: readNumber(row.fetchedCandidates),
    hasCannabisPages: row.hasCannabisPages === true,
    candidateSample: readArray(row.candidateSample).map(
      normalizeCollectorCandidate,
    ),
    conclusion: readText(row.conclusion),
  };
}

function normalizeVisualContextLink(
  value: unknown,
): WikiTruthPrimaryLawBlockerVisualContextLink {
  const row = readRecord(value);
  return {
    title: readText(row.title),
    url: readText(row.url),
    sourceKind: readText(row.sourceKind),
    evidenceScope: readText(row.evidenceScope),
    verification: readText(row.verification),
    visualReview: readText(row.visualReview),
    screenshotPath: readText(row.screenshotPath),
  };
}

function normalizeVisualEvidence(
  value: unknown,
): WikiTruthPrimaryLawBlockerVisualEvidence {
  const row = readRecord(value);
  return {
    source: readText(row.source) || "UNKNOWN",
    path: readText(row.path),
    sourceCoverage: readText(row.sourceCoverage),
    differenceStatus: readText(row.differenceStatus),
    visualReviewStatus: readText(row.visualReviewStatus),
    screenshotPaths: Array.isArray(row.screenshotPaths)
      ? row.screenshotPaths.map(readText).filter(Boolean)
      : [],
    officialContextLinks: readArray(row.officialContextLinks).map(
      normalizeVisualContextLink,
    ),
    conclusion: readText(row.conclusion),
  };
}

function normalizeFreshSearchAudit(
  value: unknown,
): WikiTruthPrimaryLawBlockerFreshSearchAudit {
  const row = readRecord(value);
  return {
    source: readText(row.source) || "UNKNOWN",
    executedAt: readText(row.executedAt),
    result: readText(row.result) || "UNKNOWN",
    officialSourceStandard: readText(row.officialSourceStandard),
    queries: readArray(row.queries).map((item) => {
      const query = readRecord(item);
      return {
        query: readText(query.query),
        outcome: readText(query.outcome),
        directCannabisPrimaryLawFound:
          query.directCannabisPrimaryLawFound === true,
      };
    }),
    officialSourcesReviewed: readArray(row.officialSourcesReviewed).map(
      (item) => {
        const source = readRecord(item);
        return {
          title: readText(source.title),
          url: readText(source.url),
          finding: readText(source.finding),
          directCannabisPrimaryLawFound:
            source.directCannabisPrimaryLawFound === true,
        };
      },
    ),
    conclusion: readText(row.conclusion),
  };
}

function normalizeBlockerRow(
  value: unknown,
): WikiTruthPrimaryLawBlockerRow {
  const row = readRecord(value);
  return {
    geo: readText(row.geo),
    territory: readText(row.territory),
    status: readText(row.status) || "UNKNOWN",
    blockerType: readText(row.blockerType) || "UNKNOWN",
    currentTruthRule: readText(row.currentTruthRule) || "UNKNOWN",
    proposedTruthColor: readText(row.proposedTruthColor) || "UNKNOWN",
    requiredNextEvidence: readText(row.requiredNextEvidence),
    evidenceSummary: readText(row.evidenceSummary),
    knownPrimaryLawBoundary: normalizeBoundary(row.knownPrimaryLawBoundary),
    freshPrimaryLawSearchAudit: normalizeFreshSearchAudit(
      row.freshPrimaryLawSearchAudit,
    ),
    localCollectorAudit: normalizeCollectorAudit(row.localCollectorAudit),
    visualReviewEvidence: normalizeVisualEvidence(row.visualReviewEvidence),
    officialContextSearch: normalizeSearch(row.officialContextSearch),
    negativeSearches: readArray(row.negativeSearches).map(normalizeSearch),
    supportingPrimaryLawContext: readArray(
      row.supportingPrimaryLawContext,
    ).map(normalizeContext),
    nonMutationDecision: readText(row.nonMutationDecision),
  };
}

export function normalizeWikiTruthPrimaryLawBlockers(
  payload: unknown,
): WikiTruthPrimaryLawBlockersView {
  const record = readRecord(payload);
  const blockers = readArray(record.blockers)
    .map(normalizeBlockerRow)
    .filter((row) => row.geo);
  return {
    generatedAt: readText(record.generatedAt) || "-",
    reportVersion: readText(record.reportVersion) || "UNKNOWN",
    nonMutating: record.nonMutating === true,
    purpose: readText(record.purpose),
    blockersTotal: readNumber(record.blockersTotal) || blockers.length,
    blockers,
  };
}

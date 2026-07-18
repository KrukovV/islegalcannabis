export type WikiTruthCannabisLawLink = {
  title: string;
  url: string;
  note?: string;
  sourceKind: string;
  verification: string;
  confidence: string;
  screenshotPath?: string | null;
  visualReview?: string;
};

export type WikiTruthCannabisLawRow = {
  geo: string;
  territory: string;
  projectStatus: {
    recreational: string;
    medical: string;
    enforcement: string;
  } | null;
  officialStatus: {
    recreational: string;
    medical: string;
    enforcement: string | null;
  } | null;
  directOfficialCannabisLawLinks: WikiTruthCannabisLawLink[];
  candidateLinksAwaitingVisualReview: WikiTruthCannabisLawLink[];
  officialContextLinks: WikiTruthCannabisLawLink[];
  sourceCoverage:
    | "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW"
    | "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW"
    | "CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW"
    | "OFFICIAL_CONTEXT_ONLY"
    | "NO_CANDIDATE_PAGE_FOUND";
  differenceStatus: string;
  differenceDescription: string;
  parserSignals: string[];
  derivedStatus: {
    recreational: string;
    medical: string;
    enforcement: string;
  } | null;
  visualReviewStatus: string;
  screenshotPaths: string[];
  reviewConfidence: string;
  reviewNotes: string;
};

export type WikiTruthCannabisLawMatrix = {
  generatedAt: string;
  sourceCorpusGeneratedAt: string;
  scope: string;
  counts: {
    total: number;
    manualVisualReviewComplete: number;
    visuallyVerifiedOfficialCannabisLaw: number;
    visuallyReviewedNoDirectPageFound: number;
    visuallyReviewedOfficialContextOnly: number;
    visualReviewRemaining: number;
    officialSourceAwaitingVisualReview: number;
    candidateRowsAwaitingVisualReview: number;
    officialContextOnly: number;
    noCandidatePageFound: number;
    rawParserSignalRows: number;
    projectStatusMismatch: number;
    taxonomyReviewRequired: number;
    visualCaptureBlocked: number;
    noProjectStatus: number;
  };
  rows: WikiTruthCannabisLawRow[];
};

export const emptyWikiTruthCannabisLawMatrix: WikiTruthCannabisLawMatrix = {
  generatedAt: "",
  sourceCorpusGeneratedAt: "",
  scope: "",
  counts: {
    total: 0,
    manualVisualReviewComplete: 0,
    visuallyVerifiedOfficialCannabisLaw: 0,
    visuallyReviewedNoDirectPageFound: 0,
    visuallyReviewedOfficialContextOnly: 0,
    visualReviewRemaining: 0,
    officialSourceAwaitingVisualReview: 0,
    candidateRowsAwaitingVisualReview: 0,
    officialContextOnly: 0,
    noCandidatePageFound: 0,
    rawParserSignalRows: 0,
    projectStatusMismatch: 0,
    taxonomyReviewRequired: 0,
    visualCaptureBlocked: 0,
    noProjectStatus: 0
  },
  rows: []
};

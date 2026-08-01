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

export type WikiTruthCannabisLawReauditSource = {
  title: string;
  url: string;
  role: string;
  visualReview: string;
  screenshotPath?: string | null;
  freshScreenshotPaths?: string[];
  freshVisualAnalysisRu?: string | null;
};

export type WikiTruthCannabisLawColorReaudit = {
  reviewedAt: string;
  result: "COLOR_RESOLVED" | "HONEST_GREY_RETAINED";
  reasonRu: string;
  freshOfficialSources: WikiTruthCannabisLawReauditSource[];
};

export type WikiTruthLayerMatchState = "MATCH" | "MISMATCH" | "UNKNOWN";

export type WikiTruthLawAxis = {
  recreational: string;
  medical: string;
  enforcement: string;
  industrial_use: string;
  cultivation_personal: string;
  cultivation_commercial: string;
  production: string;
  import: string;
  export: string;
  distribution: string;
  patient_access: string;
  prescription: string;
  pharmacy_access: string;
  enforcement_mode: string;
  legal_state: "SOA" | "ACTIVE" | "INACTIVE" | "UNCLEAR" | "UNKNOWN";
};

export type WikiTruthTruthLayer = {
  source:
    | "DIRECT_OFFICIAL_LAW"
    | "OFFICIAL_CONTEXT"
    | "PARSER_ONLY"
    | "PENDING_REVIEW"
    | "NONE";
  axis: WikiTruthLawAxis;
  notes: string;
};

export type WikiTruthLegalInterpretation = {
  source:
    | "MANUAL_INTERPRETATION"
    | "OFFICIAL_TEXT_DERIVED"
    | "PENDING_REVIEW"
    | "UNAVAILABLE";
  axis: WikiTruthLawAxis;
  notes: string;
};

export type WikiTruthWikipediaLayer = {
  source: "NOT_AUDITED_IN_MATRIX" | "UNAVAILABLE";
  matchToSsot: WikiTruthLayerMatchState;
  notes: string;
};

export type WikiTruthTruthLayerModel = {
  primaryLaw: WikiTruthTruthLayer;
  legalInterpretation: WikiTruthLegalInterpretation;
  wikipedia: WikiTruthWikipediaLayer;
  ssot: {
    source: "PROJECT_STATUS_SNAPSHOT";
    axis: WikiTruthLawAxis;
  };
  mismatch: {
    recreational: WikiTruthLayerMatchState;
    medical: WikiTruthLayerMatchState;
    enforcement: WikiTruthLayerMatchState;
  };
  trust: "LOW" | "MEDIUM" | "HIGH";
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
  supplementalOfficialLinks: WikiTruthCannabisLawLink[];
  freshSecondPassOfficialLinks?: WikiTruthCannabisLawLink[];
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
  latestColorReaudit: WikiTruthCannabisLawColorReaudit | null;
  truthLayers?: WikiTruthTruthLayerModel;
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
    colorReauditRows: number;
    colorReauditResolved: number;
    colorReauditRetainedGrey: number;
    colorReauditHumanVisualAccepted: number;
    colorReauditDirectOrComposite: number;
    colorReauditContextClaimantOrNegative: number;
    supplementalOfficialLinks: number;
    allPublishedOfficialLinks: number;
    rowsWithPublishedOfficialLinks: number;
    rowsWithAnyOfficialUrl: number;
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
    noProjectStatus: 0,
    colorReauditRows: 0,
    colorReauditResolved: 0,
    colorReauditRetainedGrey: 0,
    colorReauditHumanVisualAccepted: 0,
    colorReauditDirectOrComposite: 0,
    colorReauditContextClaimantOrNegative: 0,
    supplementalOfficialLinks: 0,
    allPublishedOfficialLinks: 0,
    rowsWithPublishedOfficialLinks: 0,
    rowsWithAnyOfficialUrl: 0
  },
  rows: []
};

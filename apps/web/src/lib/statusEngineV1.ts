export const STATUS_ENGINE_COLOR_VALUES = [
  "DARK_GREEN",
  "LIGHT_GREEN",
  "YELLOW",
  "ORANGE",
  "RED",
  "UNKNOWN"
] as const;

export type StatusEngineColorV1 = (typeof STATUS_ENGINE_COLOR_VALUES)[number];

export type StatusEngineFactsV1 = {
  recreationalLegal?: boolean;
  recreationalIllegal?: boolean;
  medicalLegal?: boolean;
  medicalLimited?: boolean;
  industrialLegal?: boolean;
  decriminalized?: boolean;
  weakEnforcement?: boolean;
  fineBased?: boolean;
  activeEnforcement?: boolean;
  strictEnforcement?: boolean;
  prisonExposure?: boolean;
  deathPenalty?: boolean;
  severeTraffickingPenalty?: boolean;
  reformMomentum?: boolean;
  socialUseEvidence?: boolean;
  legalChannel?: boolean;
};

export type StatusEngineInputV1 = {
  recreationalStatus?: string | null;
  medicalStatus?: string | null;
  distributionStatus?: string | null;
  enforcementLevel?: string | null;
  penalties?: {
    prison?: boolean;
    arrest?: boolean;
    fine?: boolean;
    severity_score?: number;
    possession?: {
      prison?: boolean;
      arrest?: boolean;
      fine?: boolean;
      severe?: boolean;
    };
    trafficking?: {
      prison?: boolean;
      arrest?: boolean;
      fine?: boolean;
      severe?: boolean;
    };
  } | null;
  facts?: StatusEngineFactsV1;
};

export type StatusEngineScoreLineV1 = {
  factor: string;
  score: number;
  reason: string;
};

export type StatusEngineResultV1 = {
  color: StatusEngineColorV1;
  score: number;
  legalStatus: {
    recreational: string;
    medical: string;
    distribution: string;
  };
  realityStatus: {
    enforcement: "WEAK" | "FINE_BASED" | "ACTIVE" | "STRICT" | "STANDARD" | "UNKNOWN";
    access: "RECREATIONAL" | "MEDICAL" | "INDUSTRIAL" | "NONE" | "UNKNOWN";
    reform: "PRESENT" | "NONE";
    socialPractice: "PRESENT" | "NONE";
  };
  scoreLines: StatusEngineScoreLineV1[];
  status_explanation: string[];
  redCriteria: {
    recreationalIllegal: boolean;
    noMedicalAccess: boolean;
    noDecriminalization: boolean;
    activeOrStrictEnforcement: boolean;
    noLegalChannel: boolean;
  };
  reviewRequired: boolean;
  reviewReasons: string[];
};

function normalizeStatus(value: string | null | undefined) {
  return String(value || "UNKNOWN").trim().toUpperCase();
}

function addLine(lines: StatusEngineScoreLineV1[], factor: string, score: number, reason: string) {
  lines.push({ factor, score, reason });
}

function normalizeFacts(input: StatusEngineInputV1): Required<StatusEngineFactsV1> {
  const recStatus = normalizeStatus(input.recreationalStatus);
  const medStatus = normalizeStatus(input.medicalStatus);
  const distributionStatus = normalizeStatus(input.distributionStatus);
  const enforcementLevel = normalizeStatus(input.enforcementLevel);
  const penalties = input.penalties || {};
  const possession = penalties.possession || {};
  const trafficking = penalties.trafficking || {};
  const explicit = input.facts || {};

  return {
    recreationalLegal: Boolean(explicit.recreationalLegal || recStatus === "LEGAL"),
    recreationalIllegal: Boolean(explicit.recreationalIllegal || recStatus === "ILLEGAL"),
    medicalLegal: Boolean(explicit.medicalLegal || medStatus === "LEGAL"),
    medicalLimited: Boolean(explicit.medicalLimited || medStatus === "LIMITED" || medStatus === "MEDICAL"),
    industrialLegal: Boolean(explicit.industrialLegal),
    decriminalized: Boolean(explicit.decriminalized || recStatus === "DECRIMINALIZED" || recStatus === "DECRIM"),
    weakEnforcement: Boolean(
      explicit.weakEnforcement ||
        recStatus === "TOLERATED" ||
        enforcementLevel === "RARE" ||
        enforcementLevel === "UNENFORCED"
    ),
    fineBased: Boolean(explicit.fineBased || penalties.fine || possession.fine),
    activeEnforcement: Boolean(explicit.activeEnforcement || penalties.arrest || possession.arrest),
    strictEnforcement: Boolean(explicit.strictEnforcement),
    prisonExposure: Boolean(explicit.prisonExposure || penalties.prison || possession.prison),
    deathPenalty: Boolean(explicit.deathPenalty),
    severeTraffickingPenalty: Boolean(explicit.severeTraffickingPenalty || trafficking.severe),
    reformMomentum: Boolean(explicit.reformMomentum),
    socialUseEvidence: Boolean(explicit.socialUseEvidence),
    legalChannel: Boolean(
      explicit.legalChannel ||
        distributionStatus === "LEGAL" ||
        distributionStatus === "REGULATED" ||
        distributionStatus === "TOLERATED" ||
        distributionStatus === "MIXED"
    )
  };
}

function resolveEnforcementReality(facts: Required<StatusEngineFactsV1>): StatusEngineResultV1["realityStatus"]["enforcement"] {
  if (facts.strictEnforcement) return "STRICT";
  if (facts.activeEnforcement || facts.prisonExposure) return "ACTIVE";
  if (facts.weakEnforcement) return "WEAK";
  if (facts.deathPenalty || facts.severeTraffickingPenalty) return "STRICT";
  if (facts.fineBased) return "FINE_BASED";
  return "STANDARD";
}

function resolveAccessReality(facts: Required<StatusEngineFactsV1>): StatusEngineResultV1["realityStatus"]["access"] {
  if (facts.recreationalLegal) return "RECREATIONAL";
  if (facts.medicalLegal || facts.medicalLimited) return "MEDICAL";
  if (facts.industrialLegal || facts.legalChannel) return "INDUSTRIAL";
  return "NONE";
}

export function evaluateStatusEngineV1(input: StatusEngineInputV1): StatusEngineResultV1 {
  const facts = normalizeFacts(input);
  const scoreLines: StatusEngineScoreLineV1[] = [];

  if (facts.recreationalLegal) addLine(scoreLines, "LAW_RECREATIONAL", 6, "Recreational legal");
  else if (facts.decriminalized) addLine(scoreLines, "LAW_DECRIMINALIZATION", 3, "Personal-use law is decriminalized");
  else if (facts.recreationalIllegal) addLine(scoreLines, "LAW_RECREATIONAL", -2, "Recreational illegal");

  if (facts.medicalLegal) addLine(scoreLines, "MEDICAL", 3, "Medical legal");
  else if (facts.medicalLimited) addLine(scoreLines, "MEDICAL", 2, "Medical access limited");

  if (facts.industrialLegal) addLine(scoreLines, "INDUSTRIAL", 1, "Industrial hemp or industrial cannabis channel exists");
  if (facts.legalChannel) addLine(scoreLines, "LEGAL_CHANNEL", 2, "Confirmed legal or regulated access channel exists");

  if (facts.weakEnforcement) addLine(scoreLines, "ENFORCEMENT", 2, "Weak or uneven enforcement");
  else if (facts.fineBased) addLine(scoreLines, "ENFORCEMENT", 1, "Fine-based enforcement");

  if (facts.activeEnforcement) addLine(scoreLines, "ENFORCEMENT", -2, "Active police or prosecution risk");
  if (facts.prisonExposure) addLine(scoreLines, "ENFORCEMENT", -2, "Prison exposure");
  if (facts.strictEnforcement) addLine(scoreLines, "ENFORCEMENT", -2, "Strict enforcement");
  if (facts.deathPenalty) addLine(scoreLines, "ENFORCEMENT", -4, "Death penalty exposure");
  if (facts.severeTraffickingPenalty) addLine(scoreLines, "TRAFFICKING", -2, "Severe trafficking penalty");

  if (facts.reformMomentum) addLine(scoreLines, "REFORM", 1, "Documented reform momentum");
  if (facts.socialUseEvidence) addLine(scoreLines, "SOCIAL_REALITY", 1, "Documented social or practical use");

  const score = scoreLines.reduce((sum, line) => sum + line.score, 0);
  const hasMedicalAccess = facts.medicalLegal || facts.medicalLimited;
  const activeOrStrictEnforcement =
    facts.activeEnforcement ||
    facts.strictEnforcement ||
    facts.prisonExposure ||
    facts.deathPenalty ||
    facts.severeTraffickingPenalty;
  const redCriteria = {
    recreationalIllegal: facts.recreationalIllegal,
    noMedicalAccess: !hasMedicalAccess,
    noDecriminalization: !facts.decriminalized && !facts.weakEnforcement,
    activeOrStrictEnforcement,
    noLegalChannel: !facts.legalChannel && !facts.industrialLegal
  };
  const strictRed =
    redCriteria.recreationalIllegal &&
    redCriteria.noMedicalAccess &&
    redCriteria.noDecriminalization &&
    redCriteria.activeOrStrictEnforcement &&
    redCriteria.noLegalChannel;

  let color: StatusEngineColorV1 = "UNKNOWN";
  if (facts.recreationalLegal) color = "DARK_GREEN";
  else if (hasMedicalAccess || facts.legalChannel) color = "LIGHT_GREEN";
  else if (facts.decriminalized || facts.weakEnforcement) color = "YELLOW";
  else if (strictRed) color = "RED";
  else if (facts.recreationalIllegal) color = "ORANGE";

  const reviewReasons: string[] = [];
  if (normalizeStatus(input.recreationalStatus) === "ILLEGAL" && color !== "RED") {
    reviewReasons.push("Formal law is illegal but mitigating legal/reality signals prevent RED.");
  }
  if (strictRed && (facts.reformMomentum || facts.socialUseEvidence)) {
    reviewReasons.push("Strict-law signals conflict with reform or social-reality signals.");
  }
  if (hasMedicalAccess && activeOrStrictEnforcement) {
    reviewReasons.push("Medical access coexists with active or strict enforcement; check whether access is practical or only theoretical.");
  }

  const status_explanation = [
    ...scoreLines.map((line) => `${line.reason} (${line.score >= 0 ? "+" : ""}${line.score})`),
    `Result: ${color}`
  ];

  return {
    color,
    score,
    legalStatus: {
      recreational: facts.recreationalLegal ? "LEGAL" : facts.decriminalized ? "DECRIMINALIZED" : facts.recreationalIllegal ? "ILLEGAL" : "UNKNOWN",
      medical: facts.medicalLegal ? "LEGAL" : facts.medicalLimited ? "LIMITED" : "NONE",
      distribution: facts.legalChannel ? "LEGAL_OR_REGULATED" : normalizeStatus(input.distributionStatus)
    },
    realityStatus: {
      enforcement: resolveEnforcementReality(facts),
      access: resolveAccessReality(facts),
      reform: facts.reformMomentum ? "PRESENT" : "NONE",
      socialPractice: facts.socialUseEvidence ? "PRESENT" : "NONE"
    },
    scoreLines,
    status_explanation,
    redCriteria,
    reviewRequired: reviewReasons.length > 0,
    reviewReasons
  };
}

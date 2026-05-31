export const STATUS_ENGINE_V3_COLORS = ["GREEN", "YELLOW", "RED"] as const;

export type StatusEngineColorV3 = (typeof STATUS_ENGINE_V3_COLORS)[number];

export type StatusEngineV3ProfileSignal = {
  kind:
    | "history"
    | "culture"
    | "local_name"
    | "product"
    | "traditional_use"
    | "cannabis_food"
    | "slang"
    | "cultivation"
    | "market"
    | "enforcement_note";
  text: string;
};

export type StatusEngineFactsV3 = {
  recreationalLegal?: boolean;
  recreationalIllegal?: boolean;
  medicalLegal?: boolean;
  medicalIllegal?: boolean;
  decriminalization?: boolean;
  toleratedPossession?: boolean;
  weakEnforcement?: boolean;
  rarelyEnforced?: boolean;
  legalIndustrialCannabis?: boolean;
  stableCannabisEcosystem?: boolean;
  prisonCriminalExposureActive?: boolean;
  enforcementOverridePhrases?: string[];
};

export type StatusEngineInputV3 = {
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
  statusText?: string | null;
  facts?: StatusEngineFactsV3;
  profileSignals?: StatusEngineV3ProfileSignal[];
};

export type StatusEngineV3DecisionLine = {
  signal: string;
  layer: "STATUS_ENGINE" | "CANNABIS_PROFILE";
  usedForColor: boolean;
  reason: string;
};

export type StatusEngineResultV3 = {
  color: StatusEngineColorV3;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string[];
  facts: Required<StatusEngineFactsV3>;
  redCriteria: {
    medicalIllegal: boolean;
    recreationalIllegal: boolean;
    noDecriminalization: boolean;
    noWeakEnforcementSignal: boolean;
    prisonCriminalExposureActive: boolean;
  };
  yellowSignals: string[];
  greenSignals: string[];
  decisionLines: StatusEngineV3DecisionLine[];
  reviewRequired: boolean;
  reviewReasons: string[];
};

const ENFORCEMENT_OVERRIDE_PATTERNS = [
  "often not enforced",
  "often not strictly enforced",
  "rarely enforced",
  "opportunistically enforced",
  "enforced opportunistically",
  "police do not harass users",
  "law was unenforced",
  "law remained unenforced",
  "remained unenforced"
];

function normalize(value: string | null | undefined) {
  return String(value || "UNKNOWN").trim().toUpperCase();
}

function lower(value: string | null | undefined) {
  return String(value || "").toLowerCase();
}

function hasAny(text: string, probes: string[]) {
  return probes.some((probe) => text.includes(probe));
}

function hasAffirmativeMedical(text: string) {
  if (/unlike.{0,100}medical cannabis|continues to ban.{0,100}medical/i.test(text)) return false;
  return (
    /\bmedical cannabis (?:is |was )?legal\b/i.test(text) ||
    /\blegali[sz](?:e|ed|ation).{0,100}medical cannabis\b/i.test(text) ||
    /\bmedical and industrial purposes\b/i.test(text) ||
    /\bexcept for medical purposes\b/i.test(text)
  );
}

function hasAffirmativeIndustrial(text: string) {
  if (/continues to ban.{0,100}(?:industrial hemp|cbd)/i.test(text)) return false;
  return (
    /\bindustrial (?:cannabis|hemp).{0,100}(?:legal|allowed|permitted|approved)\b/i.test(text) ||
    /\b(?:legal|allowed|permitted|approved).{0,100}industrial (?:cannabis|hemp)\b/i.test(text) ||
    /\bmedical and industrial purposes\b/i.test(text)
  );
}

function hasCurrentDecriminalization(text: string) {
  if (/(?:no|not|without).{0,80}decriminali[sz]ation/i.test(text)) return false;
  if (/rumou?rs? that cannabis would become decriminali[sz]ed/i.test(text)) return false;
  if (/decriminali[sz]ed.{0,120}(?:jail|prison|imprison|sentence)/i.test(text)) return false;
  return /\b(?:decriminali[sz]ed|decriminali[sz]ation|civil fine|administrative fine)\b/i.test(text);
}

function extractOverridePhrases(text: string) {
  return ENFORCEMENT_OVERRIDE_PATTERNS.filter((phrase) => text.includes(phrase));
}

function normalizeFacts(input: StatusEngineInputV3): Required<StatusEngineFactsV3> {
  const statusText = lower(input.statusText);
  const recreationalStatus = normalize(input.recreationalStatus);
  const medicalStatus = normalize(input.medicalStatus);
  const enforcementLevel = normalize(input.enforcementLevel);
  const penalties = input.penalties || {};
  const possession = penalties.possession || {};
  const explicit = input.facts || {};
  const overridePhrases = [
    ...(explicit.enforcementOverridePhrases || []),
    ...extractOverridePhrases(statusText)
  ].filter((value, index, all) => value && all.indexOf(value) === index);
  const recreationalLegal =
    Boolean(explicit.recreationalLegal) ||
    recreationalStatus === "LEGAL" ||
    /\brecreational(?: cannabis| marijuana)? (?:is |was )?legal\b/.test(statusText);
  const medicalLegal =
    Boolean(explicit.medicalLegal) ||
    medicalStatus === "LEGAL" ||
    medicalStatus === "LIMITED" ||
    hasAffirmativeMedical(statusText);
  const legalIndustrialCannabis =
    Boolean(explicit.legalIndustrialCannabis) ||
    hasAffirmativeIndustrial(statusText);
  const decriminalization =
    Boolean(explicit.decriminalization) ||
    recreationalStatus === "DECRIMINALIZED" ||
    recreationalStatus === "DECRIM" ||
    hasCurrentDecriminalization(statusText);
  const prisonCriminalExposureActive =
    Boolean(explicit.prisonCriminalExposureActive) ||
    Boolean(penalties.prison || penalties.arrest || possession.prison || possession.arrest || possession.severe) ||
    (
      (enforcementLevel === "ACTIVE" || enforcementLevel === "STRICT") &&
      (recreationalStatus === "ILLEGAL" || medicalStatus === "ILLEGAL")
    ) ||
    hasAny(statusText, [
      "prison exposure",
      "imprisonment",
      " jail",
      "death penalty",
      "criminal penalties",
      "crackdown",
      "harsh on marijuana laws",
      "strict enforcement",
      "zero tolerance"
    ]);
  const toleratedPossession =
    Boolean(explicit.toleratedPossession) ||
    recreationalStatus === "TOLERATED" ||
    hasAny(statusText, [
      "tolerated possession",
      "possession is tolerated",
      "personal possession is tolerated",
      "small-scale personal use in urban areas",
      "openly sold",
      "publicly offer",
      "police do not harass users"
    ]);
  const rarelyEnforced =
    Boolean(explicit.rarelyEnforced) ||
    hasAny(statusText, ["rarely enforced", "rarely prosecuted", "convictions are rare"]);
  const weakEnforcement =
    Boolean(explicit.weakEnforcement) ||
    overridePhrases.length > 0 ||
    rarelyEnforced ||
    toleratedPossession ||
    (
      (enforcementLevel === "RARE" || enforcementLevel === "UNENFORCED") &&
      !(possession.prison || penalties.prison)
    );

  return {
    recreationalLegal,
    recreationalIllegal: Boolean(explicit.recreationalIllegal) || (!recreationalLegal && recreationalStatus === "ILLEGAL"),
    medicalLegal,
    medicalIllegal: Boolean(explicit.medicalIllegal) || (!medicalLegal && medicalStatus === "ILLEGAL"),
    decriminalization,
    toleratedPossession,
    weakEnforcement,
    rarelyEnforced,
    legalIndustrialCannabis,
    stableCannabisEcosystem:
      Boolean(explicit.stableCannabisEcosystem) ||
      (medicalLegal && legalIndustrialCannabis && hasAny(statusText, ["medical and industrial purposes", "legal for medical"])),
    prisonCriminalExposureActive,
    enforcementOverridePhrases: overridePhrases
  };
}

function confidenceFor(facts: Required<StatusEngineFactsV3>, input: StatusEngineInputV3): StatusEngineResultV3["confidence"] {
  if (facts.recreationalLegal || facts.medicalLegal || facts.prisonCriminalExposureActive || facts.weakEnforcement) return "HIGH";
  if (input.statusText && input.statusText.length > 120) return "MEDIUM";
  return "LOW";
}

export function evaluateStatusEngineV3(input: StatusEngineInputV3): StatusEngineResultV3 {
  const facts = normalizeFacts(input);
  const decisionLines: StatusEngineV3DecisionLine[] = [];
  const addStatusLine = (signal: string, reason: string) => {
    decisionLines.push({ signal, layer: "STATUS_ENGINE", usedForColor: true, reason });
  };
  const addProfileLine = (signal: StatusEngineV3ProfileSignal) => {
    decisionLines.push({
      signal: signal.kind,
      layer: "CANNABIS_PROFILE",
      usedForColor: false,
      reason: signal.text
    });
  };

  if (facts.recreationalLegal) addStatusLine("recreational_legal", "Recreational cannabis is legal.");
  if (facts.medicalLegal) addStatusLine("medical_legal", "Medical cannabis access is legal or limited-lawful.");
  if (facts.legalIndustrialCannabis) addStatusLine("legal_industrial_cannabis", "Industrial cannabis/hemp legality is confirmed.");
  if (facts.stableCannabisEcosystem) addStatusLine("stable_cannabis_ecosystem", "Medical plus industrial legality forms a stable cannabis ecosystem.");
  if (facts.decriminalization) addStatusLine("decriminalization", "Current personal-use decriminalization signal is present.");
  if (facts.toleratedPossession) addStatusLine("tolerated_possession", "Tolerated possession or public personal-use practice is present.");
  if (facts.weakEnforcement) addStatusLine("weak_enforcement", "Weak enforcement signal is present.");
  if (facts.rarelyEnforced) addStatusLine("rarely_enforced", "Rarely-enforced signal is present.");
  if (facts.prisonCriminalExposureActive) addStatusLine("prison_criminal_exposure_active", "Active prison/criminal exposure is present.");
  for (const signal of input.profileSignals || []) addProfileLine(signal);

  const greenSignals: string[] = [];
  if (facts.recreationalLegal) greenSignals.push("recreational legal");
  if (facts.medicalLegal && facts.legalIndustrialCannabis && facts.stableCannabisEcosystem) {
    greenSignals.push("medical legal + industrial legal + stable cannabis ecosystem");
  }

  const yellowSignals = [
    facts.medicalLegal ? "medical legal" : null,
    facts.weakEnforcement ? "weak enforcement" : null,
    facts.rarelyEnforced ? "rarely enforced" : null,
    facts.toleratedPossession ? "tolerated possession" : null,
    facts.decriminalization ? "decriminalization" : null
  ].filter((value): value is string => Boolean(value));

  const redCriteria = {
    medicalIllegal: facts.medicalIllegal,
    recreationalIllegal: facts.recreationalIllegal,
    noDecriminalization: !facts.decriminalization,
    noWeakEnforcementSignal: !facts.weakEnforcement && !facts.rarelyEnforced && !facts.toleratedPossession,
    prisonCriminalExposureActive: facts.prisonCriminalExposureActive
  };
  const hardRed = Object.values(redCriteria).every(Boolean);

  let color: StatusEngineColorV3;
  if (greenSignals.length) color = "GREEN";
  else if (yellowSignals.length) color = "YELLOW";
  else color = "RED";

  const reviewReasons: string[] = [];
  if (color === "RED" && !hardRed) {
    reviewReasons.push("RED chosen by prohibition default, but one or more hard RED criteria are not explicitly proven.");
  }
  if (facts.enforcementOverridePhrases.length && color === "RED") {
    reviewReasons.push("Enforcement override phrases must prohibit RED.");
    color = "YELLOW";
  }
  if (facts.decriminalization && facts.prisonCriminalExposureActive) {
    reviewReasons.push("Decriminalization signal conflicts with active prison/criminal exposure.");
  }
  if (facts.medicalLegal && facts.medicalIllegal) {
    reviewReasons.push("Medical legality signal conflicts with medical-illegal status.");
  }

  const reason = [
    color === "GREEN"
      ? `GREEN: ${greenSignals.join("; ")}.`
      : color === "YELLOW"
        ? `YELLOW: ${yellowSignals.join("; ")}.`
        : "RED: recreational and medical cannabis remain illegal with active criminal exposure and no mitigating status signal.",
    facts.enforcementOverridePhrases.length
      ? `Enforcement override: ${facts.enforcementOverridePhrases.join(", ")}.`
      : null,
    "Cannabis Profile signals are stored separately and do not change color."
  ].filter((value): value is string => Boolean(value));

  return {
    color,
    confidence: confidenceFor(facts, input),
    reason,
    facts,
    redCriteria,
    yellowSignals,
    greenSignals,
    decisionLines,
    reviewRequired: reviewReasons.length > 0,
    reviewReasons
  };
}

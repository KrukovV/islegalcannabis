import type { CountryPageData } from "@/lib/countryPageStorage";
import type { MapCategory, ResultStatus } from "@/lib/resultStatus";

export const STATUS_ENGINE_V9_COLORS = ["GREEN", "YELLOW", "RED"] as const;
export type StatusEngineV9Color = (typeof STATUS_ENGINE_V9_COLORS)[number];
export type StatusEngineV9Recreational = "LEGAL" | "ILLEGAL";
export type StatusEngineV9Medical = "NONE" | "LIMITED" | "REGULATED";
export type StatusEngineV9Enforcement = "SOFT" | "STRICT";
export type StatusEngineV9Confidence = "HIGH" | "MEDIUM" | "LOW";

export type StatusEngineV9Input = {
  recreational: StatusEngineV9Recreational | null;
  medical: StatusEngineV9Medical | null;
  enforcement: StatusEngineV9Enforcement | null;
};

export type StatusEngineV9DerivedInput = StatusEngineV9Input & {
  reason: string[];
  missingSignal: string[];
  conflictingFacts: string[];
  triggeredSignals: string[];
  sourceUrl: string | null;
  confidence: StatusEngineV9Confidence;
};

export type StatusEngineV9Result = StatusEngineV9DerivedInput & {
  color: StatusEngineV9Color;
  mapCategory: MapCategory;
  resultStatus: ResultStatus;
  triggeredRule: "GREEN_RECREATIONAL_LEGAL" | "GREEN_MEDICAL_REGULATED" | "YELLOW_MEDICAL_LIMITED" | "YELLOW_SOFT_ENFORCEMENT" | "RED_STRICT_NONE" | "STATUS_REVIEW_REQUIRED";
  reviewRequired: boolean;
};

const SOFT_ENFORCEMENT_PATTERNS = [
  /\brarely enforced\b/i,
  /\brarely prosecuted\b/i,
  /\bconvictions are rare\b/i,
  /\boften not enforced\b/i,
  /\boften unenforced\b/i,
  /\blaw often unenforced\b/i,
  /\bnot strictly enforced\b/i,
  /\bopportunistically enforced\b/i,
  /\benforced opportunistically\b/i,
  /\btolerated possession\b/i,
  /\bpossession is tolerated\b/i,
  /\bpersonal possession is tolerated\b/i,
  /\bpolice do not normally prosecute users\b/i,
  /\bpolice do not harass users\b/i,
  /\bopenly sold despite prohibition\b/i,
  /\bpublicly offer\b/i,
  /\bprohibition is lax\b/i,
  /\blax and enforced opportunistically\b/i,
  /\bunenforced\b/i
];

const STRICT_ENFORCEMENT_PATTERNS = [
  /\bstrictly enforced\b/i,
  /\bstrict enforcement\b/i,
  /\bzero tolerance\b/i,
  /\bmandatory minimum\b/i,
  /\bdeath penalty\b/i,
  /\bcapital punishment\b/i
];

function hasPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasAny(value: string, probes: string[]) {
  const folded = value.toLowerCase();
  return probes.some((probe) => folded.includes(probe));
}

function sourceTextFromCountryPage(data: CountryPageData) {
  return [
    data.notes_normalized,
    data.notes_raw,
    data.facts.possession_limit,
    data.facts.cultivation,
    data.facts.penalty,
    ...(data.legal_model.signals?.explain || []),
    ...(data.legal_model.distribution.flags || []),
    ...(data.legal_model.enforcement_flags || []),
    ...(data.legal_model.signals?.sources || []).map((item) => item.title),
    ...(data.sources.citations || []).map((item) => item.title)
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeRecreationalStatus(value: string | null | undefined): StatusEngineV9Recreational | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "LEGAL") return "LEGAL";
  if (["ILLEGAL", "DECRIMINALIZED", "DECRIM", "TOLERATED", "MIXED", "LIMITED", "UNENFORCED"].includes(normalized)) {
    return "ILLEGAL";
  }
  return null;
}

function normalizeMedicalStatus(data: CountryPageData, sourceText: string): {
  medical: StatusEngineV9Medical | null;
  reason: string[];
  missing: string[];
  conflicts: string[];
} {
  const reason: string[] = [];
  const missing: string[] = [];
  const conflicts: string[] = [];
  const status = String(data.legal_model.medical.status || "").trim().toUpperCase();
  const raw = String(data.legal_model.medical.raw_status || "").trim().toUpperCase();
  const folded = sourceText.toLowerCase();
  const positiveMedical =
    /\bmedical (?:use|cannabis|marijuana).{0,80}\b(?:legalized|allowed|approved|regulated|licensed)\b/i.test(sourceText) ||
    /\b(?:legalized|allowed|approved|regulated|licensed).{0,80}\bmedical (?:use|cannabis|marijuana)\b/i.test(sourceText) ||
    /\bmedical and industrial purposes\b/i.test(sourceText);
  const limitedMedical =
    /\blimited medical\b/i.test(sourceText) ||
    /\bcbd oil\b/i.test(sourceText) ||
    /\blow[- ]thc\b/i.test(sourceText) ||
    /\bmedical use is limited\b/i.test(sourceText) ||
    /\bspecial permit\b/i.test(sourceText) ||
    /\bnon-psychoactive cannabidiol\b/i.test(sourceText);
  const negativeMedical =
    hasAny(folded, [
      "medical cannabis is illegal",
      "medical marijuana is illegal",
      "medical use is illegal",
      "no medical cannabis",
      "continues to ban medical"
    ]);

  if (positiveMedical && negativeMedical) {
    conflicts.push("medical negative and positive signals conflict");
  }
  if (status === "LEGAL" || raw === "LEGAL") {
    reason.push("medical structured status is legal");
    return { medical: "REGULATED", reason, missing, conflicts };
  }
  if (limitedMedical) {
    reason.push(status === "LIMITED" || raw === "LIMITED" ? "medical structured status is limited" : "medical source text says limited/CBD-only access");
    return { medical: "LIMITED", reason, missing, conflicts };
  }
  if (positiveMedical) {
    reason.push("medical source text says legal or regulated");
    return { medical: "REGULATED", reason, missing, conflicts };
  }
  if (status === "LIMITED" || raw === "LIMITED" || limitedMedical) {
    reason.push(status === "LIMITED" || raw === "LIMITED" ? "medical structured status is limited" : "medical source text says limited/CBD-only access");
    return { medical: "LIMITED", reason, missing, conflicts };
  }
  if (status === "ILLEGAL" || raw === "ILLEGAL" || negativeMedical) {
    reason.push(status === "ILLEGAL" || raw === "ILLEGAL" ? "medical structured status is none/illegal" : "medical source text says none/illegal");
    return { medical: "NONE", reason, missing, conflicts };
  }

  missing.push("medical");
  return { medical: null, reason, missing, conflicts };
}

function normalizeEnforcement(data: CountryPageData, sourceText: string, recreational: StatusEngineV9Recreational | null): {
  enforcement: StatusEngineV9Enforcement | null;
  reason: string[];
  missing: string[];
  conflicts: string[];
  signals: string[];
} {
  const reason: string[] = [];
  const missing: string[] = [];
  const conflicts: string[] = [];
  const signals: string[] = [];
  const recStatus = String(data.legal_model.recreational.status || "").trim().toUpperCase();
  const recEnforcement = String(data.legal_model.recreational.enforcement || "").trim().toUpperCase();
  const enforcementLevel = String(data.legal_model.signals?.enforcement_level || "").trim().toLowerCase();
  const flags = data.legal_model.enforcement_flags || [];
  const penalties = data.legal_model.signals?.penalties;
  const softByText = hasPattern(sourceText, SOFT_ENFORCEMENT_PATTERNS);
  const strictByText = hasPattern(sourceText, STRICT_ENFORCEMENT_PATTERNS);
  const softByStructured =
    recStatus === "DECRIMINALIZED" ||
    recStatus === "TOLERATED" ||
    enforcementLevel === "rare" ||
    enforcementLevel === "unenforced" ||
    flags.includes("weak_enforcement");

  if (recreational === "LEGAL") {
    reason.push("recreational legal means no strict recreational prohibition is evaluated");
    return { enforcement: "SOFT", reason, missing, conflicts, signals: ["RECREATIONAL_LEGAL"] };
  }

  if (softByStructured || softByText) {
    if (softByStructured) signals.push("SOFT_STRUCTURED_SIGNAL");
    if (softByText) signals.push("SOFT_ENFORCEMENT_TEXT");
    reason.push("soft enforcement signal present");
    return { enforcement: "SOFT", reason, missing, conflicts, signals };
  }

  if (strictByText || recEnforcement === "STRICT" || enforcementLevel === "active" || penalties?.possession?.prison || penalties?.possession?.arrest || penalties?.prison || penalties?.arrest) {
    if (strictByText) signals.push("STRICT_ENFORCEMENT_TEXT");
    if (recEnforcement === "STRICT" || enforcementLevel === "active") signals.push("STRICT_STRUCTURED_SIGNAL");
    if (penalties?.possession?.prison || penalties?.possession?.arrest || penalties?.prison || penalties?.arrest) signals.push("CRIMINAL_PENALTY_SIGNAL");
    reason.push("strict enforcement signal present");
    return { enforcement: "STRICT", reason, missing, conflicts, signals };
  }

  missing.push("enforcement");
  return { enforcement: null, reason, missing, conflicts, signals };
}

export function mapStatusEngineV9ColorToCategory(color: StatusEngineV9Color): MapCategory {
  if (color === "GREEN") return "LEGAL_OR_DECRIM";
  if (color === "YELLOW") return "LIMITED_OR_MEDICAL";
  return "ILLEGAL";
}

export function mapStatusEngineV9ColorToResultStatus(color: StatusEngineV9Color): ResultStatus {
  if (color === "GREEN") return "LEGAL";
  if (color === "YELLOW") return "ILLEGAL";
  return "ILLEGAL";
}

export function evaluateStatusEngineV9(input: StatusEngineV9DerivedInput): StatusEngineV9Result {
  const reason = [...input.reason];
  const reviewRequired = input.missingSignal.length > 0 || input.conflictingFacts.length > 0;
  if (reviewRequired) {
    reason.push("STATUS_REVIEW_REQUIRED: medical/enforcement missing or conflicting.");
    return {
      ...input,
      color: "RED",
      mapCategory: "ILLEGAL",
      resultStatus: "ILLEGAL",
      triggeredRule: "STATUS_REVIEW_REQUIRED",
      reviewRequired,
      reason
    };
  }
  if (input.recreational === "LEGAL") {
    reason.push("GREEN: recreational == LEGAL.");
    return {
      ...input,
      color: "GREEN",
      mapCategory: "LEGAL_OR_DECRIM",
      resultStatus: "LEGAL",
      triggeredRule: "GREEN_RECREATIONAL_LEGAL",
      reviewRequired: false,
      reason
    };
  }
  if (input.medical === "REGULATED") {
    reason.push("GREEN: medical == REGULATED.");
    return {
      ...input,
      color: "GREEN",
      mapCategory: "LEGAL_OR_DECRIM",
      resultStatus: "LEGAL",
      triggeredRule: "GREEN_MEDICAL_REGULATED",
      reviewRequired: false,
      reason
    };
  }
  if (input.recreational === "ILLEGAL" && input.medical === "LIMITED") {
    reason.push("YELLOW: recreational == ILLEGAL and medical == LIMITED.");
    return {
      ...input,
      color: "YELLOW",
      mapCategory: "LIMITED_OR_MEDICAL",
      resultStatus: "ILLEGAL",
      triggeredRule: "YELLOW_MEDICAL_LIMITED",
      reviewRequired: false,
      reason
    };
  }
  if (input.recreational === "ILLEGAL" && input.enforcement === "SOFT") {
    reason.push("YELLOW: recreational == ILLEGAL and enforcement == SOFT.");
    return {
      ...input,
      color: "YELLOW",
      mapCategory: "LIMITED_OR_MEDICAL",
      resultStatus: "ILLEGAL",
      triggeredRule: "YELLOW_SOFT_ENFORCEMENT",
      reviewRequired: false,
      reason
    };
  }
  reason.push("RED: recreational == ILLEGAL, medical == NONE, enforcement == STRICT.");
  return {
    ...input,
    color: "RED",
    mapCategory: "ILLEGAL",
    resultStatus: "ILLEGAL",
    triggeredRule: "RED_STRICT_NONE",
    reviewRequired: false,
    reason
  };
}

export function deriveStatusEngineV9FromCountryPageData(data: CountryPageData): StatusEngineV9Result {
  const sourceText = sourceTextFromCountryPage(data);
  const recreational = normalizeRecreationalStatus(data.legal_model.recreational.status);
  const medical = normalizeMedicalStatus(data, sourceText);
  const enforcement = normalizeEnforcement(data, sourceText, recreational);
  const missingSignal = [
    ...(recreational ? [] : ["recreational"]),
    ...medical.missing,
    ...enforcement.missing
  ];
  const confidence: StatusEngineV9Confidence =
    missingSignal.length || medical.conflicts.length || enforcement.conflicts.length
      ? "LOW"
      : enforcement.signals.includes("SOFT_ENFORCEMENT_TEXT") || enforcement.signals.includes("STRICT_ENFORCEMENT_TEXT")
        ? "HIGH"
        : "MEDIUM";

  return evaluateStatusEngineV9({
    recreational,
    medical: medical.medical,
    enforcement: enforcement.enforcement,
    reason: [
      ...(recreational ? [`recreational=${recreational}`] : []),
      ...medical.reason,
      ...enforcement.reason
    ],
    missingSignal,
    conflictingFacts: [...medical.conflicts, ...enforcement.conflicts],
    triggeredSignals: enforcement.signals,
    sourceUrl: data.sources.legal || data.sources.wiki_truth || null,
    confidence
  });
}

import type { CountryPageData } from "@/lib/countryPageStorage";
import type { MapCategory, ResultStatus } from "@/lib/resultStatus";

export const STATUS_ENGINE_V9_COLORS = ["GREEN", "YELLOW", "RED", "UNKNOWN"] as const;
export type StatusEngineV9Color = (typeof STATUS_ENGINE_V9_COLORS)[number];
export type StatusEngineV9Recreational = "LEGAL" | "DECRIMINALIZED" | "ILLEGAL";
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
  mapCategory: MapCategory | "UNKNOWN";
  resultStatus: ResultStatus;
  triggeredRule:
    | "GREEN_ADULT_USE"
    | "GREEN_OPERATIONAL_PATIENT_ACCESS"
    | "YELLOW_DECRIM"
    | "YELLOW_MEDICAL_LIMITED"
    | "RED_NO_LEGAL_PATIENT_ACCESS"
    | "UNKNOWN_MISSING_SIGNALS";
  reviewRequired: boolean;
};

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
  if ([
    "DECRIMINALIZED",
    "DECRIM",
    "DECRIMINAL",
    "TOLERATED",
    "MIXED",
    "RESTRICTED",
    "LIMITED",
    "UNENFORCED",
    "TOLERANCE"
  ].includes(normalized)) {
    return "DECRIMINALIZED";
  }
  if (normalized === "ILLEGAL") return "ILLEGAL";
  return null;
}

const MEDICAL_LIMITED_KEYWORDS = [
  "limited",
  "prescription",
  "special permit",
  "compassionate use",
  "pharmaceutical",
  "production",
  "cultivation",
  "export",
  "import",
  "research",
  "cbd",
  "sativex",
  "epidiolex",
  "cannabinoid drugs",
  "cannabinoid"
];

function normalizeMedicalStatus(
  status: string | null | undefined,
  rawStatus: string | null | undefined,
  sourceText: string
): {
  medical: StatusEngineV9Medical | null;
  reason: string[];
  missing: string[];
  conflicts: string[];
} {
  const reason: string[] = [];
  const missing: string[] = [];
  const conflicts: string[] = [];
  const normalizedStatus = String(status || "").trim().toUpperCase();
  const raw = String(rawStatus || "").trim().toUpperCase();
  const folded = sourceText.toLowerCase();

  if (normalizedStatus === "LEGAL") {
    reason.push("medical structured status is regulated");
    return { medical: "REGULATED", reason, missing, conflicts };
  }

  if (normalizedStatus === "LIMITED") {
    reason.push("medical structured status is limited");
    return { medical: "LIMITED", reason, missing, conflicts };
  }

  if (normalizedStatus === "ILLEGAL") {
    reason.push("medical structured status is none/illegal");
    return { medical: "NONE", reason, missing, conflicts };
  }

  if (raw === "LIMITED" || raw === "REGULATED" || raw === "NONE") {
    reason.push(`medical raw_status is ${raw.toLowerCase()}`);
    return {
      medical: raw === "REGULATED"
        ? "REGULATED"
        : raw === "NONE"
          ? "NONE"
          : "LIMITED",
      reason,
      missing,
      conflicts
    };
  }

  const sourceSignalsLimited = MEDICAL_LIMITED_KEYWORDS.some((signal) => folded.includes(signal));
  if (sourceSignalsLimited) {
    reason.push("medical source text contains non-retail permissive pathways (pharma/research/export/etc).");
    return { medical: "LIMITED", reason, missing, conflicts };
  }

  missing.push("medical");
  return { medical: null, reason, missing, conflicts };
}

export function mapStatusEngineV9ColorToCategory(color: StatusEngineV9Color | "UNKNOWN"): MapCategory | "UNKNOWN" {
  if (color === "GREEN") return "LEGAL_OR_DECRIM";
  if (color === "YELLOW") return "LIMITED_OR_MEDICAL";
  if (color === "UNKNOWN") return "UNKNOWN";
  return "ILLEGAL";
}

export function mapStatusEngineV9ColorToResultStatus(color: StatusEngineV9Color | "UNKNOWN"): ResultStatus {
  if (color === "GREEN") return "LEGAL";
  if (color === "YELLOW") return "DECRIM";
  if (color === "UNKNOWN") return "UNKNOWN";
  return "ILLEGAL";
}

function hasOperationalPatientAccess(medical: StatusEngineV9Medical | null) {
  return medical === "REGULATED";
}

export function evaluateStatusEngineV9(input: StatusEngineV9DerivedInput): StatusEngineV9Result {
  const reason = [...input.reason];
  const recreational = input.recreational;
  const medical = input.medical;
  const isAdultUse = recreational === "LEGAL";
  const isOperationalPatientAccess = hasOperationalPatientAccess(medical);
  const isDecriminalized = recreational === "DECRIMINALIZED";
  const isPatientLimited = medical === "LIMITED";

  if (isAdultUse || isOperationalPatientAccess) {
    reason.push(
      isOperationalPatientAccess
        ? "GREEN: operational patient access found (REGULATED medical)."
        : "GREEN: recreational legal.",
    );
    return {
      ...input,
      color: "GREEN",
      mapCategory: "LEGAL_OR_DECRIM",
      resultStatus: "LEGAL",
      triggeredRule: isOperationalPatientAccess ? "GREEN_OPERATIONAL_PATIENT_ACCESS" : "GREEN_ADULT_USE",
      reviewRequired: false,
      reason
    };
  }

  if (isDecriminalized || isPatientLimited) {
    reason.push(
      isDecriminalized
        ? "YELLOW: recreational decriminalized/limited regime."
        : "YELLOW: medical pathway is limited/non-operational patient access mode."
    );
    return {
      ...input,
      color: "YELLOW",
      mapCategory: "LIMITED_OR_MEDICAL",
      resultStatus: "DECRIM",
      triggeredRule: isDecriminalized ? "YELLOW_DECRIM" : "YELLOW_MEDICAL_LIMITED",
      reviewRequired: false,
      reason
    };
  }

  if (!recreational && !medical) {
    reason.push("UNKNOWN: no reliable legal axis could be derived from source rows.");
    return {
      ...input,
      color: "UNKNOWN",
      mapCategory: "UNKNOWN",
      resultStatus: "UNKNOWN",
      triggeredRule: "UNKNOWN_MISSING_SIGNALS",
      reviewRequired: true,
      reason
    };
  }

  const hasNoAdultUse = recreational === "ILLEGAL";
  const hasNoPatientAccess = medical === "NONE";
  if (!(hasNoAdultUse && hasNoPatientAccess)) {
    reason.push("UNKNOWN: legal axes are incomplete and cannot be conclusively mapped.");
    return {
      ...input,
      color: "UNKNOWN",
      mapCategory: "UNKNOWN",
      resultStatus: "UNKNOWN",
      triggeredRule: "UNKNOWN_MISSING_SIGNALS",
      reviewRequired: true,
      reason
    };
  }

  reason.push("RED: no legal adult-use and no operational patient access.");
  return {
    ...input,
    color: "RED",
    mapCategory: "ILLEGAL",
    resultStatus: "ILLEGAL",
    triggeredRule: "RED_NO_LEGAL_PATIENT_ACCESS",
    reviewRequired: input.missingSignal.length > 0,
    reason
  };
}

function buildStatusEngineInputFromCountryPageData(data: CountryPageData): StatusEngineV9DerivedInput {
  const sourceText = sourceTextFromCountryPage(data);
  const recreational = normalizeRecreationalStatus(data.legal_model.recreational.status);
  const medical = normalizeMedicalStatus(
    data.legal_model.medical.status,
    data.legal_model.medical.raw_status,
    sourceText
  );

  const missingSignal: string[] = [];
  if (!recreational) missingSignal.push("recreational");
  if (!medical.medical) missingSignal.push("medical");
  const confidence: StatusEngineV9Confidence =
    missingSignal.length || medical.conflicts.length ? "LOW" : "MEDIUM";

  return {
    recreational,
    medical: medical.medical,
    enforcement: null,
    reason: [
      ...(recreational ? [`recreational=${recreational}`] : []),
      ...medical.reason
    ],
    missingSignal,
    conflictingFacts: [...medical.conflicts],
    triggeredSignals: [],
    sourceUrl: data.sources.legal || data.sources.wiki_truth || null,
    confidence
  };
}

export function deriveStatusEngineV9FromCountryPageData(data: CountryPageData): StatusEngineV9Result {
  return evaluateStatusEngineV9(buildStatusEngineInputFromCountryPageData(data));
}

export function buildStatusEngineFromPairStatuses(
  recStatus: string | null | undefined,
  medStatus: string | null | undefined,
  missingSignal: string[]
): StatusEngineV9Result {
  const recreational = mapRecPairToStatusEngine(recStatus);
  const medical = mapMedPairToStatusEngine(medStatus);
  const additionalMissingSignals = [...missingSignal];
  if (!recreational) additionalMissingSignals.push("recreational");
  if (!medical) additionalMissingSignals.push("medical");
  return evaluateStatusEngineV9({
    recreational,
    medical,
    enforcement: null,
    reason: [
      ...(recreational ? [`recreational=${recreational}`] : []),
      ...(medical ? [`medical=${medical}`] : [])
    ],
    missingSignal: additionalMissingSignals,
    conflictingFacts: [],
    triggeredSignals: [],
    sourceUrl: null,
    confidence: recreational && medical ? "MEDIUM" : "LOW"
  });
}

function mapRecPairToStatusEngine(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "legal") return "LEGAL" as const;
  if (["decrim", "decriminalized", "mixed", "unenforced", "limited", "tolerated"].includes(normalized)) {
    return "DECRIMINALIZED" as const;
  }
  if (normalized === "illegal") return "ILLEGAL" as const;
  if (normalized === "unknown" || !normalized) return null;
  return "ILLEGAL" as const;
}

function mapMedPairToStatusEngine(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "legal") return "REGULATED" as const;
  if (normalized === "limited" || normalized === "unenforced") return "LIMITED" as const;
  if (normalized === "illegal" || normalized === "none" || !normalized || normalized === "unknown") {
    if (normalized === "illegal" || normalized === "none") return "NONE" as const;
    return null;
  }
  return "NONE" as const;
}

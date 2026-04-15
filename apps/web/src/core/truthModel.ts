import type { CountryPageData } from "@/lib/countryPageStorage";
import { getSocialReality } from "@/data/socialRealityIndex";

export type TruthVector = {
  law: number;
  enforcement: number;
  social: number;
  access: number;
};

export type TruthClass =
  | "LEGAL"
  | "MOSTLY_ALLOWED"
  | "LIMITED"
  | "RISKY_TOLERATED"
  | "STRICT";

export type TruthAccessType =
  | "legal"
  | "mostly_allowed"
  | "limited"
  | "tolerated"
  | "strict";

export type TruthAssessment = {
  vector: TruthVector;
  truthScore: number;
  truthClass: TruthClass;
  accessType: TruthAccessType;
  explanation: string;
  reason: "status" | "notes" | "social" | "mixed";
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function includesAny(text: string, probes: string[]) {
  return probes.some((probe) => text.includes(probe));
}

function normalizeReasonText(data: CountryPageData, socialSummary: string | null) {
  return [
    data.notes_normalized,
    data.notes_raw,
    data.facts.possession_limit,
    data.facts.penalty,
    data.facts.cultivation,
    socialSummary
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function computeLawScore(data: CountryPageData) {
  const recreational = String(data.legal_model.recreational.status || "").toUpperCase();
  const medical = String(data.legal_model.medical.status || "").toUpperCase();
  if (recreational === "LEGAL") return 1;
  if (recreational === "TOLERATED") return 0.75;
  if (recreational === "DECRIMINALIZED") return 0.5;
  if (medical === "LEGAL" || medical === "LIMITED") return 0.35;
  return 0.1;
}

function computeEnforcementScore(data: CountryPageData, noteText: string, socialLowEnforcement: boolean) {
  const enforcement = String(data.legal_model.signals?.enforcement_level || "").toLowerCase();
  let score =
    enforcement === "unenforced" ? 0.85 :
    enforcement === "rare" ? 0.65 :
    0.25;
  const penalties = data.legal_model.signals?.penalties;
  if (socialLowEnforcement) score += 0.25;
  if (penalties?.fine && !penalties?.prison && !penalties?.arrest) score += 0.15;
  if (includesAny(noteText, ["summary fine", "fine", "fined", "small-scale enforcement is often low-priority", "low-priority"])) {
    score += 0.1;
  }
  if (penalties?.prison) score -= 0.2;
  if (penalties?.arrest) score -= 0.1;
  if (includesAny(noteText, ["zero tolerance", "strictly enforced", "strict enforcement", "death penalty"])) {
    score -= 0.2;
  }
  return clamp01(score);
}

function computeSocialScore(noteText: string, socialSummary: string | null, socialSignals?: Record<string, boolean>) {
  let score = 0.08;
  if (socialSignals?.tolerated) score += 0.35;
  if (socialSignals?.widely_used) score += 0.25;
  if (socialSignals?.low_enforcement) score += 0.15;
  if (socialSignals?.not_prosecuted_small_amount) score += 0.12;
  if (
    includesAny(noteText, [
      "tolerated in practice",
      "de facto",
      "widely used",
      "common",
      "social club",
      "coffee shop",
      "small-scale enforcement is often low-priority",
      "informal tolerance",
      "low-priority"
    ])
  ) {
    score += 0.2;
  }
  if (socialSummary && includesAny(String(socialSummary).toLowerCase(), ["practice", "tolerated", "low-priority", "widely"])) {
    score += 0.12;
  }
  return clamp01(score);
}

function computeAccessScore(data: CountryPageData, noteText: string, socialSignals?: Record<string, boolean>) {
  const recreational = String(data.legal_model.recreational.status || "").toUpperCase();
  const medical = String(data.legal_model.medical.status || "").toUpperCase();
  const distribution = String(data.legal_model.distribution.status || "").toLowerCase();
  let score =
    recreational === "LEGAL" ? 0.95 :
    recreational === "TOLERATED" ? 0.75 :
    recreational === "DECRIMINALIZED" ? 0.55 :
    0.15;

  if (distribution === "legal" || distribution === "regulated") score = Math.max(score, 0.95);
  if (distribution === "mixed" || distribution === "tolerated") score = Math.max(score, 0.7);
  if (distribution === "restricted") score = Math.max(score, 0.45);
  if (medical === "LEGAL" || medical === "LIMITED") score = Math.max(score, 0.35);
  if (socialSignals?.low_enforcement) score += 0.15;
  if (includesAny(noteText, ["small amounts are usually fined", "summary fine", "coffee shop", "social club", "personal use"])) {
    score += 0.12;
  }
  if (data.legal_model.signals?.penalties?.prison) score -= 0.1;
  return clamp01(score);
}

function classifyTruthScore(score: number): TruthClass {
  if (score >= 0.8) return "LEGAL";
  if (score >= 0.6) return "MOSTLY_ALLOWED";
  if (score >= 0.4) return "LIMITED";
  if (score >= 0.2) return "RISKY_TOLERATED";
  return "STRICT";
}

function truthClassToAccessType(truthClass: TruthClass): TruthAccessType {
  if (truthClass === "LEGAL") return "legal";
  if (truthClass === "MOSTLY_ALLOWED") return "mostly_allowed";
  if (truthClass === "LIMITED") return "limited";
  if (truthClass === "RISKY_TOLERATED") return "tolerated";
  return "strict";
}

function deriveReason(vector: TruthVector, data: CountryPageData, socialSummary: string | null): TruthAssessment["reason"] {
  const components = [
    { key: "status", value: vector.law },
    { key: "notes", value: vector.enforcement + vector.access },
    { key: "social", value: vector.social + (socialSummary ? 0.1 : 0) }
  ].sort((left, right) => right.value - left.value);
  const top = components[0];
  const second = components[1];
  if (!top || !second) return "mixed";
  if (Math.abs(top.value - second.value) < 0.1) return "mixed";
  return top.key as TruthAssessment["reason"];
}

function buildExplanation(
  data: CountryPageData,
  truthClass: TruthClass,
  noteText: string,
  socialSummary: string | null
) {
  const parts: string[] = [];
  const recreational = String(data.legal_model.recreational.status || "").toLowerCase();
  const medical = String(data.legal_model.medical.status || "").toLowerCase();
  const distribution = String(data.legal_model.distribution.status || "").toLowerCase();
  parts.push(
    recreational === "legal"
      ? "Cannabis is legal by law."
      : recreational === "decriminalized"
        ? "Cannabis is decriminalized by law."
        : recreational === "tolerated"
          ? "Cannabis is not fully legal, but it is tolerated in practice."
          : "Cannabis stays illegal by law."
  );
  if (medical === "legal" || medical === "limited") {
    parts.push("Medical access exists.");
  }
  if (distribution === "illegal" || distribution === "restricted") {
    parts.push("Buying or cross-border supply still carries real risk.");
  }
  if (includesAny(noteText, ["summary fine", "fine", "small amounts are usually fined"])) {
    parts.push("Small-amount cases are often handled with fines.");
  }
  if (includesAny(noteText, ["low-priority", "rarely enforced", "unenforced", "informal tolerance"])) {
    parts.push("Enforcement looks softer than the formal law.");
  }
  if (socialSummary && includesAny(String(socialSummary).toLowerCase(), ["practice", "tolerated", "widely"])) {
    parts.push("Reality on the ground is looser than a strict ban.");
  }
  if (truthClass === "STRICT" && parts.length < 2) {
    parts.push("This still reads as a genuinely strict destination.");
  }
  return parts.join(" ").trim();
}

export function assessTruth(data: CountryPageData): TruthAssessment {
  const socialEntry = getSocialReality(data.iso2 || data.geo_code) || null;
  const socialSummary = socialEntry?.note_summary || null;
  const noteText = normalizeReasonText(data, socialSummary);
  const vector: TruthVector = {
    law: computeLawScore(data),
    enforcement: computeEnforcementScore(data, noteText, Boolean(socialEntry?.signals?.low_enforcement)),
    social: computeSocialScore(noteText, socialSummary, socialEntry?.signals),
    access: computeAccessScore(data, noteText, socialEntry?.signals)
  };
  let truthScore = clamp01(
    vector.law * 0.5 +
      vector.enforcement * 0.2 +
      vector.social * 0.2 +
      vector.access * 0.1
  );
  const fineOnlyPossession =
    !!data.legal_model.signals?.penalties?.fine &&
    !data.legal_model.signals?.penalties?.prison &&
    !data.legal_model.signals?.penalties?.arrest;
  const restrictedButNotStrict =
    String(data.legal_model.signals?.final_risk || "").toUpperCase() === "RESTRICTED" &&
    fineOnlyPossession;
  if (restrictedButNotStrict) {
    truthScore = Math.max(truthScore, 0.35);
  }
  const truthClass = classifyTruthScore(truthScore);
  return {
    vector,
    truthScore,
    truthClass,
    accessType: truthClassToAccessType(truthClass),
    explanation: buildExplanation(data, truthClass, noteText, socialSummary),
    reason: deriveReason(vector, data, socialSummary)
  };
}

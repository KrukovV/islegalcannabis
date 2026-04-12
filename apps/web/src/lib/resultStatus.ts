import type { CountryPageData } from "@/lib/countryPageStorage";

export const RESULT_STATUS_VALUES = [
  "LEGAL",
  "MIXED",
  "DECRIM",
  "ILLEGAL",
  "UNKNOWN"
] as const;

export type ResultStatus = (typeof RESULT_STATUS_VALUES)[number];

export const MAP_CATEGORY_VALUES = [
  "LEGAL_OR_DECRIM",
  "LIMITED_OR_MEDICAL",
  "ILLEGAL",
  "UNKNOWN"
] as const;

export type MapCategory = (typeof MAP_CATEGORY_VALUES)[number];

export const REFERENCE_MAP_CATEGORY_COLORS: Record<MapCategory, string> = Object.freeze({
  LEGAL_OR_DECRIM: "#cde7cf",
  LIMITED_OR_MEDICAL: "#f4e9c2",
  ILLEGAL: "#ead0d1",
  UNKNOWN: "#d7dcdc"
});

export const REFERENCE_MAP_CATEGORY_HOVER_COLORS: Record<MapCategory, string> = Object.freeze({
  LEGAL_OR_DECRIM: "#daf0dc",
  LIMITED_OR_MEDICAL: "#f7edd0",
  ILLEGAL: "#efdadb",
  UNKNOWN: "#e0e3e3"
});

type InputStatus =
  | "LEGAL"
  | "TOLERATED"
  | "DECRIMINALIZED"
  | "LIMITED"
  | "MEDICAL"
  | "UNENFORCED"
  | "ILLEGAL"
  | "UNKNOWN";

function normalizeInputStatus(value: string): InputStatus {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "DECRIM") return "DECRIMINALIZED";
  if (normalized === "RESTRICTED") return "LIMITED";
  if (normalized === "MEDICAL_ONLY") return "MEDICAL";
  if (normalized === "MIXED") return "TOLERATED";
  if (
    [
      "LEGAL",
      "TOLERATED",
      "DECRIMINALIZED",
      "LIMITED",
      "MEDICAL",
      "UNENFORCED",
      "ILLEGAL",
      "UNKNOWN"
    ].includes(normalized)
  ) {
    return normalized as InputStatus;
  }
  return "UNKNOWN";
}

export function normalizeStatus(value: string): ResultStatus {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "DECRIMINALIZED") return "DECRIM";
  if (RESULT_STATUS_VALUES.includes(normalized as ResultStatus)) {
    return normalized as ResultStatus;
  }
  throw new Error(`INVALID_STATUS: ${value}`);
}

export function deriveMapCategoryFromResultStatus(status: ResultStatus): MapCategory {
  switch (status) {
    case "LEGAL":
    case "MIXED":
    case "DECRIM":
      return "LEGAL_OR_DECRIM";
    case "ILLEGAL":
      return "ILLEGAL";
    case "UNKNOWN":
      return "UNKNOWN";
    default:
      throw new Error(`INVALID_STATUS_FOR_MAP: ${status satisfies never}`);
  }
}

export function statusToColor(status: ResultStatus): string {
  return REFERENCE_MAP_CATEGORY_COLORS[deriveMapCategoryFromResultStatus(status)];
}

export function statusToHoverColor(status: ResultStatus): string {
  return REFERENCE_MAP_CATEGORY_HOVER_COLORS[deriveMapCategoryFromResultStatus(status)];
}

export function mapCategoryToColor(category: MapCategory): string {
  const color = REFERENCE_MAP_CATEGORY_COLORS[category];
  if (!color) {
    throw new Error(`UNKNOWN_MAP_CATEGORY: ${category}`);
  }
  return color;
}

export function mapCategoryToHoverColor(category: MapCategory): string {
  const color = REFERENCE_MAP_CATEGORY_HOVER_COLORS[category];
  if (!color) {
    throw new Error(`UNKNOWN_MAP_CATEGORY_HOVER: ${category}`);
  }
  return color;
}

type StatusFlags = {
  hasFine: boolean;
  hasWeakEnforcement: boolean;
  isTolerated: boolean;
  hasLicensedSale: boolean;
  hasCurrentLiberalization: boolean;
  hasPrison: boolean;
  hasArrest: boolean;
  hasLongPrison: boolean;
  hasDeathPenalty: boolean;
  isStrictlyEnforced: boolean;
  hasMedicalAccess: boolean;
  personalUseOnly: boolean;
};

function buildPrimaryText(data: CountryPageData) {
  return [
    data.notes_raw,
    data.facts.possession_limit,
    data.facts.penalty,
    data.facts.cultivation
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildSecondaryText(data: CountryPageData) {
  return [
    ...(data.sources.citations || []).map((item) => item.title),
    ...(data.legal_model.signals?.sources || []).map((item) => item.title),
    ...(data.legal_model.signals?.explain || []),
    ...(data.legal_model.distribution.flags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasAny(text: string, probes: string[]) {
  return probes.some((probe) => text.includes(probe));
}

function isPersonalUseContext(text: string): boolean {
  return hasAny(text, [
    "personal use",
    "small amount",
    "possession up to",
    "possession of up to",
    "use and possession of up to",
    "for own use",
    "not prosecuted in court"
  ]);
}

function getBaseStatus(recreational: InputStatus): ResultStatus {
  if (recreational === "LEGAL") return "LEGAL";
  if (recreational === "DECRIMINALIZED") return "DECRIM";
  if (recreational === "TOLERATED") return "MIXED";
  if (recreational === "ILLEGAL") return "ILLEGAL";
  return "UNKNOWN";
}

function extractStatusFlags(data: CountryPageData): StatusFlags {
  const primaryText = buildPrimaryText(data);
  const secondaryText = buildSecondaryText(data);
  const penalties = data.legal_model.signals?.penalties;
  const distribution = String(data.legal_model.distribution.status || "").trim().toLowerCase();
  const personalUseOnly = isPersonalUseContext(primaryText);
  const medicalStatus = normalizeInputStatus(data.legal_model.medical.status || "");
  return {
    hasFine:
      Boolean(penalties?.possession?.fine) ||
      hasAny(primaryText, ["penalty_fine", " fine ", "fixed fine", "penalty fee", "€200 fine", "summary fine", "heavy fines", "fines"]),
    hasWeakEnforcement:
      Boolean(
        personalUseOnly &&
          (
            data.legal_model.signals?.enforcement_level === "rare" ||
            data.legal_model.signals?.enforcement_level === "unenforced" ||
            hasAny(primaryText, [
              "rarely prosecuted",
              "rarely enforced",
              "convictions are rare",
              "often unenforced",
              "not enforced",
              "generally not prosecuted",
              "not prosecuted in court"
            ])
          )
      ),
    isTolerated:
      normalizeInputStatus(data.legal_model.recreational.status || "") === "TOLERATED" ||
      distribution === "mixed" ||
      distribution === "tolerated" ||
      hasAny(primaryText, [" tolerated", "coffee shop", "coffeeshop"]),
    hasLicensedSale:
      distribution === "legal" ||
      distribution === "regulated" ||
      hasAny(primaryText, ["licensed", "dispensary", "regulated market", "government-owned shops sell cannabis", "shops sell cannabis"]),
    hasCurrentLiberalization: hasAny(`${primaryText} ${secondaryText}`, [
      "decriminalize small amounts",
      "decriminalized since",
      "removes marijuana possession penalties",
      "removes possession penalties",
      "first medical cannabis dispensary",
      "dispensary opened",
      "social club",
      "social_club_distribution",
      "private_cultivation",
      "government-owned shops sell cannabis",
      "allowed to grow",
      "grow two plants",
      "3 cannabis plants",
      "three plants"
    ]),
    hasPrison:
      Boolean(penalties?.possession?.prison) ||
      hasAny(primaryText, ["penalty_prison", " imprisonment", " jail", "detention"]),
    hasArrest: Boolean(penalties?.possession?.arrest),
    hasLongPrison:
      hasAny(primaryText, ["penalty_years", "years imprisonment", "years in prison", "life sentence", "up to 5 years", "up to 10 years"]),
    hasDeathPenalty: hasAny(primaryText, ["death penalty", "capital punishment", "automatic death penalty"]),
    isStrictlyEnforced: hasAny(primaryText, ["zero tolerance", "strictly enforced", "strict enforcement"]),
    hasMedicalAccess: medicalStatus === "LEGAL" || medicalStatus === "LIMITED" || medicalStatus === "MEDICAL",
    personalUseOnly
  };
}

function applyStatusModifiers(base: ResultStatus, flags: StatusFlags): ResultStatus {
  if (flags.hasDeathPenalty) return "ILLEGAL";
  if ((base === "ILLEGAL" || base === "UNKNOWN") && flags.hasLongPrison && !flags.personalUseOnly) return "ILLEGAL";
  if ((base === "ILLEGAL" || base === "UNKNOWN") && flags.isStrictlyEnforced) return "ILLEGAL";
  if (base === "LEGAL") return "LEGAL";
  if (base === "MIXED") return "MIXED";
  if (base === "DECRIM") {
    if (flags.isTolerated || flags.hasLicensedSale || flags.hasCurrentLiberalization) return "MIXED";
    return "DECRIM";
  }
  if (base === "ILLEGAL") {
    if ((flags.isTolerated || flags.hasLicensedSale) && flags.hasCurrentLiberalization && !flags.hasArrest) {
      return "MIXED";
    }
    if (flags.hasFine && flags.personalUseOnly && !flags.hasLongPrison && !flags.isStrictlyEnforced && !flags.hasArrest) {
      return "DECRIM";
    }
    return "ILLEGAL";
  }
  return "UNKNOWN";
}

function deriveUsaStatus(data: CountryPageData): ResultStatus {
  if (data.node_type === "country" && data.iso2 === "US") {
    return "MIXED";
  }
  return "UNKNOWN";
}

export function deriveResultStatusFromCountryPageData(data: CountryPageData): ResultStatus {
  const usaStatus = deriveUsaStatus(data);
  if (usaStatus !== "UNKNOWN") {
    return usaStatus;
  }
  const recreational = normalizeInputStatus(data.legal_model.recreational.status || "");
  const base = getBaseStatus(recreational);
  const flags = extractStatusFlags(data);
  return applyStatusModifiers(base, flags);
}

export function deriveMapCategoryFromCountryPageDataSignals(data: CountryPageData, status?: ResultStatus): MapCategory {
  const finalStatus = status || deriveResultStatusFromCountryPageData(data);
  if (finalStatus === "LEGAL" || finalStatus === "MIXED" || finalStatus === "DECRIM") return "LEGAL_OR_DECRIM";
  if (finalStatus === "UNKNOWN") return "UNKNOWN";
  const flags = extractStatusFlags(data);
  if (flags.hasMedicalAccess) {
    return "LIMITED_OR_MEDICAL";
  }
  if (
    flags.hasWeakEnforcement &&
    flags.personalUseOnly &&
    !flags.hasPrison &&
    !flags.hasLongPrison &&
    !flags.hasDeathPenalty &&
    !flags.isStrictlyEnforced
  ) {
    return "LIMITED_OR_MEDICAL";
  }
  return "ILLEGAL";
}

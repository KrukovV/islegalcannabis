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
      return "LEGAL_OR_DECRIM";
    case "DECRIM":
      return "LIMITED_OR_MEDICAL";
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
  isRarelyProsecuted: boolean;
  isTolerated: boolean;
  hasLicensedSale: boolean;
  hasPrison: boolean;
  hasLongPrison: boolean;
  hasDeathPenalty: boolean;
  isStrictlyEnforced: boolean;
};

function buildSearchText(data: CountryPageData) {
  return [
    data.notes_normalized,
    data.notes_raw,
    ...(data.legal_model.signals?.explain || []),
    ...(data.legal_model.applied_rules || []),
    ...(data.legal_model.distribution.flags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasAny(text: string, probes: string[]) {
  return probes.some((probe) => text.includes(probe));
}

function getBaseStatus(recreational: InputStatus): ResultStatus {
  if (recreational === "LEGAL") return "LEGAL";
  if (recreational === "DECRIMINALIZED") return "DECRIM";
  if (recreational === "TOLERATED") return "MIXED";
  if (recreational === "ILLEGAL") return "ILLEGAL";
  return "UNKNOWN";
}

function extractStatusFlags(data: CountryPageData): StatusFlags {
  const text = buildSearchText(data);
  const penalties = data.legal_model.signals?.penalties;
  const distribution = String(data.legal_model.distribution.status || "").trim().toLowerCase();
  const enforcement = String(data.legal_model.signals?.enforcement_level || "").trim().toLowerCase();
  return {
    hasFine: Boolean(penalties?.fine) || hasAny(text, ["penalty_fine", " fine ", " fine-based", "fines"]),
    isRarelyProsecuted:
      enforcement === "rare" ||
      enforcement === "unenforced" ||
      hasAny(text, ["rarely enforced", "rarely prosecuted", "convictions are rare", "often unenforced", "not enforced"]),
    isTolerated:
      normalizeInputStatus(data.legal_model.recreational.status || "") === "TOLERATED" ||
      distribution === "mixed" ||
      distribution === "tolerated" ||
      hasAny(text, ["sale_tolerated", "rec_tolerated", " tolerated", "coffeeshop"]),
    hasLicensedSale:
      distribution === "legal" ||
      distribution === "regulated" ||
      hasAny(text, ["sale_regulated", "licensed", "dispensary", "regulated market"]),
    hasPrison: Boolean(penalties?.prison) || hasAny(text, ["penalty_prison", " prison", " imprisonment", " jail"]),
    hasLongPrison:
      hasAny(text, ["penalty_years", "years in prison", "long prison", "life sentence"]),
    hasDeathPenalty: hasAny(text, ["death penalty", "capital punishment"]),
    isStrictlyEnforced: hasAny(text, ["zero_tolerance", "zero tolerance", "strictly enforced", "strict enforcement"])
  };
}

function applyStatusModifiers(base: ResultStatus, flags: StatusFlags): ResultStatus {
  if (base === "LEGAL") return "LEGAL";
  if (base === "MIXED") return "MIXED";
  if (base === "DECRIM") {
    if (flags.isTolerated) return "MIXED";
    return "DECRIM";
  }
  if (base === "ILLEGAL") {
    if (flags.hasDeathPenalty) return "ILLEGAL";
    if (flags.hasLongPrison || flags.isStrictlyEnforced) return "ILLEGAL";
    if (flags.hasFine || flags.isRarelyProsecuted) return "DECRIM";
    if (flags.isTolerated || flags.hasLicensedSale) return "MIXED";
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

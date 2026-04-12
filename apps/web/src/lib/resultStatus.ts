import type { CountryPageData } from "@/lib/countryPageStorage";

export const RESULT_STATUS_VALUES = [
  "LEGAL",
  "MIXED",
  "DECRIMINALIZED",
  "MEDICAL",
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
  if (RESULT_STATUS_VALUES.includes(normalized as ResultStatus)) {
    return normalized as ResultStatus;
  }
  throw new Error(`INVALID_STATUS: ${value}`);
}

export function deriveMapCategoryFromResultStatus(status: ResultStatus): MapCategory {
  switch (status) {
    case "LEGAL":
    case "MIXED":
    case "DECRIMINALIZED":
      return "LEGAL_OR_DECRIM";
    case "MEDICAL":
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

export function deriveResultStatusFromCountryPageData(data: CountryPageData): ResultStatus {
  const recreational = normalizeInputStatus(data.legal_model.recreational.status || "");
  const medical = normalizeInputStatus(data.legal_model.medical.status || "");
  const distribution = String(data.legal_model.distribution.status || "").trim().toUpperCase();
  const signalStatus = String(data.legal_model.signals?.status || "").trim().toUpperCase();

  if (recreational === "LEGAL") return "LEGAL";
  if (recreational === "TOLERATED" || distribution === "MIXED" || signalStatus === "MIXED") {
    return "MIXED";
  }
  if (recreational === "DECRIMINALIZED") return "DECRIMINALIZED";
  if (medical === "LEGAL") return "MEDICAL";
  if (recreational === "ILLEGAL") return "ILLEGAL";
  return "UNKNOWN";
}

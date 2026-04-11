import type { CountryPageData } from "@/lib/countryPageStorage";

export const RESULT_STATUS_VALUES = [
  "LEGAL",
  "DECRIMINALIZED",
  "ILLEGAL",
  "LIMITED",
  "UNENFORCED",
  "UNKNOWN"
] as const;

export type ResultStatus = (typeof RESULT_STATUS_VALUES)[number];

export const RESULT_STATUS_COLORS: Record<ResultStatus, string> = {
  LEGAL: "#cde7cf",
  DECRIMINALIZED: "#f4e9c2",
  ILLEGAL: "#ead0d1",
  LIMITED: "#f4e9c2",
  UNENFORCED: "#efd7ba",
  UNKNOWN: "#d7dcdc"
};

export function normalizeStatus(value: string): ResultStatus {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "TOLERATED" || normalized === "DECRIM") return "DECRIMINALIZED";
  if (RESULT_STATUS_VALUES.includes(normalized as ResultStatus)) {
    return normalized as ResultStatus;
  }
  throw new Error(`INVALID_STATUS: ${value}`);
}

export function statusToColor(status: ResultStatus): string {
  if (!(status in RESULT_STATUS_COLORS)) {
    throw new Error(`UNKNOWN_STATUS: ${status}`);
  }
  return RESULT_STATUS_COLORS[status];
}

export function deriveResultStatusFromCountryPageData(data: CountryPageData): ResultStatus {
  const recreational = normalizeStatus(data.legal_model.recreational.status);
  const medical = normalizeStatus(data.legal_model.medical.status);

  if (recreational === "LEGAL") return "LEGAL";
  if (recreational === "DECRIMINALIZED") return "DECRIMINALIZED";
  if (recreational === "ILLEGAL") return "ILLEGAL";
  if (recreational === "UNENFORCED") return "UNENFORCED";
  if (recreational === "LIMITED") return "LIMITED";

  if (medical === "LEGAL" || medical === "LIMITED") return "LIMITED";
  if (medical === "UNENFORCED") return "UNENFORCED";
  return "UNKNOWN";
}

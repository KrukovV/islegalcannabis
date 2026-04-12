import type { CountryPageData } from "@/lib/countryPageStorage";

export const RESULT_STATUS_VALUES = [
  "LEGAL",
  "MIXED",
  "DECRIMINALIZED",
  "MEDICAL",
  "ILLEGAL",
  "LIMITED",
  "UNENFORCED",
  "UNKNOWN"
] as const;

export type ResultStatus = (typeof RESULT_STATUS_VALUES)[number];

export const RESULT_STATUS_COLORS: Record<ResultStatus, string> = {
  LEGAL: "#2ECC71",
  MIXED: "#9B59B6",
  DECRIMINALIZED: "#F1C40F",
  MEDICAL: "#3498DB",
  ILLEGAL: "#E74C3C",
  LIMITED: "#3498DB",
  UNENFORCED: "#F39C12",
  UNKNOWN: "#BDC3C7"
};

export const RESULT_STATUS_HOVER_COLORS: Record<ResultStatus, string> = {
  LEGAL: "#27AE60",
  MIXED: "#8E44AD",
  DECRIMINALIZED: "#D4AC0D",
  MEDICAL: "#2E86C1",
  ILLEGAL: "#C0392B",
  LIMITED: "#2E86C1",
  UNENFORCED: "#CA6F1E",
  UNKNOWN: "#95A5A6"
};

export function normalizeStatus(value: string): ResultStatus {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "TOLERATED" || normalized === "MIXED") return "MIXED";
  if (normalized === "DECRIM") return "DECRIMINALIZED";
  if (normalized === "MEDICAL_ONLY") return "MEDICAL";
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

export function statusToHoverColor(status: ResultStatus): string {
  if (!(status in RESULT_STATUS_HOVER_COLORS)) {
    throw new Error(`UNKNOWN_STATUS_HOVER: ${status}`);
  }
  return RESULT_STATUS_HOVER_COLORS[status];
}

export function deriveResultStatusFromCountryPageData(data: CountryPageData): ResultStatus {
  const recreationalRaw = String(data.legal_model.recreational.status || "").trim().toUpperCase();
  const medicalRaw = String(data.legal_model.medical.status || "").trim().toUpperCase();
  const distributionRaw = String(data.legal_model.distribution.status || "").trim().toUpperCase();
  const signalRaw = String(data.legal_model.signals?.status || "").trim().toUpperCase();
  const recreational = normalizeStatus(recreationalRaw || "UNKNOWN");
  const medical = normalizeStatus(medicalRaw || "UNKNOWN");

  if (recreationalRaw === "LEGAL") return "LEGAL";
  if (signalRaw === "MIXED" || distributionRaw === "MIXED" || recreationalRaw === "TOLERATED") return "MIXED";
  if (recreational === "DECRIMINALIZED") return "DECRIMINALIZED";
  if (recreational === "UNENFORCED") return "UNENFORCED";
  if (recreational === "ILLEGAL") return "ILLEGAL";
  if (recreational === "LIMITED") return "MEDICAL";
  if (medical === "LEGAL" || medical === "LIMITED" || medical === "MEDICAL") return "MEDICAL";
  if (medical === "UNENFORCED") return "UNENFORCED";
  return "UNKNOWN";
}

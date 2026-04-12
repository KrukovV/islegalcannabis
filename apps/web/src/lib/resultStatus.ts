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
  LEGAL: "#A8E6CF",
  MIXED: "#D7BDE2",
  DECRIMINALIZED: "#FFF3B0",
  MEDICAL: "#D7BDE2",
  ILLEGAL: "#F5B7B1",
  LIMITED: "#D7BDE2",
  UNENFORCED: "#FFF3B0",
  UNKNOWN: "#D5DCE3"
};

export const RESULT_STATUS_HOVER_COLORS: Record<ResultStatus, string> = {
  LEGAL: "#82E0AA",
  MIXED: "#C39BD3",
  DECRIMINALIZED: "#F9E79F",
  MEDICAL: "#C39BD3",
  ILLEGAL: "#EC7063",
  LIMITED: "#C39BD3",
  UNENFORCED: "#F5E4AA",
  UNKNOWN: "#BCC8D3"
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
  const cultivationFact = String(data.facts?.cultivation || "").trim().toLowerCase();
  const explainLines = Array.isArray(data.legal_model.signals?.explain) ? data.legal_model.signals.explain.join("\n") : "";
  const recreational = normalizeStatus(recreationalRaw || "UNKNOWN");
  const medical = normalizeStatus(medicalRaw || "UNKNOWN");
  const hasPermissiveCultivationFact =
    /(?:grow|plant|possess)/.test(cultivationFact) && !/(?:illegal|prohibit|forbid|ban)/.test(cultivationFact);
  const hasRegulatedMedicalSignal =
    explainLines.includes("rule: sale_regulated") || explainLines.includes("rule: medical_legal |") && explainLines.includes("scope: sale");

  if (recreationalRaw === "LEGAL") return "LEGAL";
  if (signalRaw === "MIXED" || distributionRaw === "MIXED" || recreationalRaw === "TOLERATED") return "MIXED";
  if (recreational === "DECRIMINALIZED") return "DECRIMINALIZED";
  if (recreational === "ILLEGAL" && medical === "LEGAL" && (hasPermissiveCultivationFact || hasRegulatedMedicalSignal)) {
    return "MIXED";
  }
  if (recreational === "UNENFORCED") return "UNENFORCED";
  if (recreational === "ILLEGAL") return "ILLEGAL";
  if (recreational === "LIMITED") return "MIXED";
  if (medical === "LEGAL" || medical === "LIMITED" || medical === "MEDICAL") return "MEDICAL";
  if (medical === "UNENFORCED") return "UNENFORCED";
  return "UNKNOWN";
}

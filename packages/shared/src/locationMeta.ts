import type { ConfidenceLevel, LocationMeta } from "./types";

export function toDisplayLabel(meta: LocationMeta): string {
  switch (meta.method) {
    case "gps":
      return "Detected via GPS";
    case "ip":
      return "Detected via IP (approx.)";
    case "manual":
      return "Selected manually";
    default:
      return "Location source";
  }
}

export function toConfidenceLabel(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "Unknown";
  }
}

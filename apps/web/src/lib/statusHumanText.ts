import type { CountryCardEntry } from "@/new-map/map.types";

export function getHumanStatusSummary(mapCategory: CountryCardEntry["mapCategory"]) {
  if (mapCategory === "LEGAL_OR_DECRIM") {
    return "Cannabis can be legally accessed through recreational or regulated medical programs.";
  }
  if (mapCategory === "LIMITED_OR_MEDICAL") {
    return "Cannabis remains restricted, but enforcement is limited or access is partially allowed.";
  }
  if (mapCategory === "ILLEGAL") {
    return "Cannabis remains prohibited and criminal penalties remain in force.";
  }
  return "Current cannabis access needs confirmation from reviewed sources.";
}

export function getHumanStatusHeadline(mapCategory: CountryCardEntry["mapCategory"]) {
  if (mapCategory === "LEGAL_OR_DECRIM") {
    return "Legal access is confirmed.";
  }
  if (mapCategory === "LIMITED_OR_MEDICAL") {
    return "Access remains restricted or partially allowed.";
  }
  if (mapCategory === "ILLEGAL") {
    return "Access remains prohibited.";
  }
  return "Current access needs confirmation.";
}

export function getHumanStatusLevel(mapCategory: CountryCardEntry["mapCategory"]) {
  if (mapCategory === "LEGAL_OR_DECRIM") return "GREEN";
  if (mapCategory === "LIMITED_OR_MEDICAL") return "YELLOW";
  if (mapCategory === "ILLEGAL") return "RED";
  return "UNCONFIRMED";
}

import type { RiskFlag } from "./types";

export const riskTextMap: Record<RiskFlag, string> = {
  border_crossing: "Crossing borders with cannabis remains illegal.",
  public_use: "Public use can still lead to penalties.",
  driving: "Driving with cannabis can trigger DUI enforcement.",
  federal_property_us: "Federal property in the U.S. has separate enforcement."
};

export function riskTextFor(flag: RiskFlag) {
  return riskTextMap[flag];
}

import type { RiskFlag } from "@/lib/types";

export const riskTextMap: Record<RiskFlag, string> = {
  border_crossing: "Crossing borders with cannabis is illegal.",
  public_use: "Public use can lead to citations or criminal penalties.",
  driving: "Driving with cannabis can trigger DUI enforcement.",
  federal_property_us: "Federal property has separate enforcement rules."
};

export function riskTextFor(flag: RiskFlag) {
  return riskTextMap[flag];
}

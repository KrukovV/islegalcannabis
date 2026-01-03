import type { JurisdictionLawProfile } from "@islegal/shared";
import { riskTextFor } from "@islegal/shared";

export type SummaryBullet = { label: string; value: string };

export function formatStatusValue(value: string | undefined) {
  if (!value) return "Not specified";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildBullets(profile: JurisdictionLawProfile): SummaryBullet[] {
  return [
    { label: "Medical", value: formatStatusValue(profile.medical) },
    { label: "Recreational", value: formatStatusValue(profile.recreational) },
    {
      label: "Possession limit",
      value: profile.possession_limit ?? "Not specified"
    },
    { label: "Public use", value: formatStatusValue(profile.public_use) },
    { label: "Home grow", value: formatStatusValue(profile.home_grow) },
    { label: "Cross-border", value: formatStatusValue(profile.cross_border) }
  ];
}

export function buildRisks(profile: JurisdictionLawProfile): string[] {
  if (profile.risks.length === 0) {
    return ["No key risks flagged in this summary."];
  }

  return profile.risks.map((risk) => riskTextFor(risk) ?? risk);
}

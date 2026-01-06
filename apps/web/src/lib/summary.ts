import type { JurisdictionLawProfile } from "@islegal/shared";
import { riskTextFor } from "@islegal/shared";

export type SummaryBullet = { label: string; value: string };

function normalizeStatus(value?: string) {
  if (!value) return null;
  return value.replace(/_/g, " ").toLowerCase();
}

function formatStatusValue(value?: string) {
  const normalized = normalizeStatus(value);
  if (!normalized) return "Not specified";
  if (normalized === "allowed") return "Allowed";
  if (normalized === "restricted") return "Restricted";
  if (normalized === "illegal") return "Illegal";
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildBullets(profile: JurisdictionLawProfile): SummaryBullet[] {
  const isVerified = profile.status === "known";
  const unverifiedSuffix = isVerified ? "" : " (unverified)";

  return [
    {
      label: "Medical",
      value: `${formatStatusValue(profile.medical)}${unverifiedSuffix}`
    },
    {
      label: "Recreational",
      value: `${formatStatusValue(profile.recreational)}${unverifiedSuffix}`
    },
    {
      label: "Possession limit",
      value: isVerified
        ? profile.possession_limit ?? "Not specified"
        : "Unverified"
    },
    {
      label: "Public use",
      value: `${formatStatusValue(profile.public_use)}${unverifiedSuffix}`
    },
    {
      label: "Home grow",
      value: isVerified ? formatStatusValue(profile.home_grow) : "Unverified"
    },
    {
      label: "Cross-border",
      value: `${formatStatusValue(profile.cross_border)}${unverifiedSuffix}`
    }
  ];
}

export function buildRisks(profile: JurisdictionLawProfile): string[] {
  if (profile.risks.length === 0) {
    return ["No key risks flagged in this summary."];
  }

  return profile.risks.map((risk) => riskTextFor(risk) ?? risk);
}

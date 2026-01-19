import type { JurisdictionLawProfile } from "./types";

function formatLawStatus(value: string): string {
  if (value === "allowed") return "allowed";
  if (value === "restricted") return "restricted";
  if (value === "illegal") return "illegal";
  return "unknown";
}

export function buildWhyBullets(profile: JurisdictionLawProfile): string[] {
  if (profile.status !== "known") {
    return [
      "Medical use: unknown.",
      "We don't have verified data for this location yet.",
      "Check official sources below."
    ];
  }

  const bullets: string[] = [];

  switch (profile.medical) {
    case "allowed":
      bullets.push("Medical use: allowed.");
      break;
    case "restricted":
      bullets.push("Medical use: restricted.");
      break;
    case "illegal":
      bullets.push("Medical use: not allowed.");
      break;
    default:
      bullets.push("Medical use: unknown.");
      break;
  }

  bullets.push(`Recreational use: ${formatLawStatus(profile.recreational)}.`);

  if (profile.possession_limit) {
    bullets.push(`Possession limit: ${profile.possession_limit}.`);
  }

  bullets.push(`Public use: ${formatLawStatus(profile.public_use)}.`);
  bullets.push("Cross-border: illegal.");

  if (profile.risks.includes("driving")) {
    bullets.push("Driving under the influence is illegal.");
  }
  if (profile.risks.includes("federal_property_us")) {
    bullets.push("Federal property remains illegal.");
  }

  return bullets.slice(0, 6);
}

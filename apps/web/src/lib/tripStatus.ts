import type { JurisdictionLawProfile } from "@islegal/shared";

export function buildTripStatusCode(profile: JurisdictionLawProfile) {
  if (profile.status !== "known") {
    return "needs_review";
  }
  if (profile.recreational === "allowed") {
    return "recreational_legal";
  }
  if (profile.medical === "allowed") {
    return "medical_only";
  }
  return "illegal";
}

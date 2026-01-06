import { computeStatus } from "@islegal/shared";
import type { JurisdictionLawProfile, ResultViewModel } from "@islegal/shared";
import type { LocationContext } from "@/lib/location/locationContext";
import { buildBullets, buildRisks } from "@/lib/summary";

function bulletsToText(profile: JurisdictionLawProfile) {
  return buildBullets(profile).map((item) => `${item.label}: ${item.value}`);
}

function toLocation(context?: LocationContext): ResultViewModel["location"] {
  if (!context) {
    return { mode: "query" };
  }

  return {
    mode: context.mode,
    method: context.method,
    confidence: context.confidence
  };
}

export function buildResultViewModel(input: {
  profile: JurisdictionLawProfile;
  title: string;
  locationContext?: LocationContext;
  meta?: ResultViewModel["meta"];
  statusOverride?: { level: ResultViewModel["statusLevel"]; title: string };
}): ResultViewModel {
  const computed = computeStatus(input.profile);
  const statusLevel = input.statusOverride?.level ?? computed.level;
  const statusTitle = input.statusOverride?.title ?? computed.label;

  return {
    jurisdictionKey: input.profile.id,
    title: input.title,
    statusLevel,
    statusTitle,
    bullets: bulletsToText(input.profile),
    keyRisks: buildRisks(input.profile),
    sources: input.profile.sources,
    verifiedAt: input.profile.verified_at ?? undefined,
    updatedAt: input.profile.updated_at,
    location: toLocation(input.locationContext),
    meta: input.meta ?? {}
  };
}

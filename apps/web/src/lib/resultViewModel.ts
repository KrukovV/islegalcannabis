import { computeStatus, STATUS_BANNERS } from "@islegal/shared";
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
  extrasPreview?: ResultViewModel["extrasPreview"];
  extrasFull?: ResultViewModel["extrasFull"];
  nearestLegal?: ResultViewModel["nearestLegal"];
}): ResultViewModel {
  const computed = computeStatus(input.profile);
  let statusLevel = input.statusOverride?.level ?? computed.level;
  let statusTitle = input.statusOverride?.title ?? computed.label;

  if (input.profile.status === "provisional") {
    statusLevel = "yellow";
    statusTitle = STATUS_BANNERS.provisional.title;
  } else if (input.profile.status === "needs_review") {
    statusLevel = "gray";
    statusTitle = STATUS_BANNERS.needs_review.title;
  } else if (input.profile.status === "unknown") {
    statusLevel = "gray";
    statusTitle = "Data not available";
  }

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
    extrasPreview: input.extrasPreview,
    extrasFull: input.extrasFull,
    nearestLegal: input.nearestLegal,
    location: toLocation(input.locationContext),
    meta: input.meta ?? {}
  };
}

import type { JurisdictionLawProfile, StatusResult } from "@islegal/shared";
import { computeStatus } from "@islegal/shared";
import type { SummaryBullet } from "@/lib/summary";
import { buildBullets, buildRisks } from "@/lib/summary";

export type ExplanationInput = {
  status: StatusResult;
  bullets: SummaryBullet[];
  risksText: string[];
};

export function buildExplanationInput(
  profile: JurisdictionLawProfile
): ExplanationInput {
  const status = computeStatus(profile);
  const bullets = buildBullets(profile);
  const risksText = buildRisks(profile);

  return { status, bullets, risksText };
}

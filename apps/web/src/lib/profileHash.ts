import crypto from "node:crypto";
import type { JurisdictionLawProfile } from "@islegal/shared";

export function hashLawProfile(profile: JurisdictionLawProfile) {
  const normalized = {
    id: profile.id,
    country: profile.country,
    region: profile.region ?? null,
    medical: profile.medical,
    recreational: profile.recreational,
    possession_limit: profile.possession_limit ?? null,
    public_use: profile.public_use,
    home_grow: profile.home_grow ?? null,
    cross_border: profile.cross_border,
    risks: [...profile.risks].sort(),
    updated_at: profile.updated_at,
    verified_at: profile.verified_at,
    confidence: profile.confidence,
    status: profile.status
  };
  const payload = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

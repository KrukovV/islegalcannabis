import type { ConfidenceLevel, JurisdictionLawProfile } from "./types";

export type ReviewStatus = "provisional" | "needs_review" | "reviewed" | "unknown";

type ReviewMeta = {
  review_status: ReviewStatus;
  review_confidence: ConfidenceLevel;
  review_sources: Array<unknown>;
};

const REVIEW_STATUSES = new Set(["provisional", "needs_review", "reviewed"]);
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);

function normalizeReviewStatus(value?: unknown): ReviewStatus | null {
  const normalized = String(value ?? "").toLowerCase();
  if (REVIEW_STATUSES.has(normalized)) return normalized as ReviewStatus;
  if (normalized === "known") return "reviewed";
  return null;
}

function normalizeConfidence(value?: unknown): ConfidenceLevel | null {
  const normalized = String(value ?? "").toLowerCase();
  if (CONFIDENCE_LEVELS.has(normalized)) return normalized as ConfidenceLevel;
  return null;
}

function hasReviewSources(profile: Partial<JurisdictionLawProfile>): boolean {
  return Array.isArray((profile as { review_sources?: unknown[] }).review_sources) &&
    (profile as { review_sources?: unknown[] }).review_sources!.length > 0;
}

function isConveyorProfile(profile: Partial<JurisdictionLawProfile>): boolean {
  const provenance = profile.provenance as { model_id?: string } | undefined;
  return hasReviewSources(profile) && provenance?.model_id === "registry";
}

export function normalizeReviewMeta(profile: Partial<JurisdictionLawProfile>): ReviewMeta {
  const reviewStatus =
    normalizeReviewStatus((profile as { review_status?: string }).review_status) ??
    normalizeReviewStatus(profile.status) ??
    (isConveyorProfile(profile) ? "provisional" : "unknown");
  const reviewConfidence =
    normalizeConfidence((profile as { review_confidence?: string }).review_confidence) ??
    normalizeConfidence(profile.confidence) ??
    "low";
  const reviewSources = hasReviewSources(profile)
    ? (profile as { review_sources?: unknown[] }).review_sources ?? []
    : (profile.sources ?? []);

  return {
    review_status: reviewStatus,
    review_confidence: reviewConfidence,
    review_sources: reviewSources
  };
}

export function getEffectiveReviewStatus(profile: Partial<JurisdictionLawProfile>): ReviewStatus {
  return normalizeReviewMeta(profile).review_status;
}

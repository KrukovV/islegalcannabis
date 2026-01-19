const REVIEW_STATUSES = new Set(["provisional", "needs_review", "reviewed"]);
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);

function normalizeReviewStatus(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (REVIEW_STATUSES.has(normalized)) return normalized;
  if (normalized === "known") return "reviewed";
  return null;
}

function normalizeConfidence(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (CONFIDENCE_LEVELS.has(normalized)) return normalized;
  return null;
}

function hasReviewSources(profile) {
  return Array.isArray(profile?.review_sources) && profile.review_sources.length > 0;
}

function isConveyorProfile(profile) {
  return hasReviewSources(profile) && profile?.provenance?.model_id === "registry";
}

function normalizeReviewMeta(profile) {
  const reviewStatus =
    normalizeReviewStatus(profile?.review_status) ??
    normalizeReviewStatus(profile?.status) ??
    (isConveyorProfile(profile) ? "provisional" : "unknown");
  const reviewConfidence =
    normalizeConfidence(profile?.review_confidence) ??
    normalizeConfidence(profile?.confidence) ??
    "low";
  const reviewSources = hasReviewSources(profile)
    ? profile.review_sources
    : Array.isArray(profile?.sources)
      ? profile.sources
      : [];

  return {
    review_status: reviewStatus,
    review_confidence: reviewConfidence,
    review_sources: reviewSources
  };
}

function getEffectiveReviewStatus(profile) {
  return normalizeReviewMeta(profile).review_status;
}

module.exports = {
  normalizeReviewMeta,
  getEffectiveReviewStatus
};

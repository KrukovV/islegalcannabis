import {
  DISCUSSION_TYPES,
  type CreateDiscussionInput,
} from "@/social/domain";
import {
  assertNoRawLocationInSocialPayload,
  assertSafeSocialNetworkGeoAttachment,
} from "@/social/privacy";

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value.trim() || null : null;
}

export function parseCreateDiscussionPayload(value: unknown): CreateDiscussionInput {
  assertNoRawLocationInSocialPayload(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SOCIAL_REQUEST_BODY_INVALID");
  const raw = value as Record<string, unknown>;
  const type = String(raw.type || "").trim().toUpperCase();
  if (!DISCUSSION_TYPES.includes(type as CreateDiscussionInput["type"])) throw new Error("SOCIAL_DISCUSSION_TYPE_INVALID");
  if (raw.postLocation !== undefined || raw.post_location !== undefined) {
    throw new Error("SOCIAL_EXACT_POST_LOCATION_NOT_AVAILABLE");
  }
  const rawGeo = raw.geo;
  const geo = rawGeo && typeof rawGeo === "object" && !Array.isArray(rawGeo)
    ? assertSafeSocialNetworkGeoAttachment({
      geoCell: String((rawGeo as Record<string, unknown>).geoCell || ""),
      geoResolution: Number((rawGeo as Record<string, unknown>).geoResolution),
    })
    : null;
  return {
    type: type as CreateDiscussionInput["type"],
    geoId: stringOrNull(raw.geoId),
    geo: geo ? { geoCell: geo.geoCell, geoResolution: geo.geoResolution } : null,
    lawId: stringOrNull(raw.lawId),
    newsId: stringOrNull(raw.newsId),
    sourceId: stringOrNull(raw.sourceId),
    title: stringOrNull(raw.title),
    body: typeof raw.body === "string" ? raw.body : "",
    language: stringOrNull(raw.language) || "und",
    eventEndsAt: stringOrNull(raw.eventEndsAt),
  };
}

import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import {
  DISCUSSION_TYPES,
  resolveDiscussionExpiry,
  type CreateDiscussionInput,
  validateDiscussionInput,
} from "@/social/domain";
import { parseCreateDiscussionPayload } from "@/social/discussionRequest";
import { getSocialSql } from "@/social/database";
import { assertNoRawLocationInSocialPayload, assertSafeSocialNetworkGeoAttachment } from "@/social/privacy";
import {
  type SocialRealtimeEvent,
} from "@/social/providers";
import { getSocialIdentity } from "@/social/identity";
import { PostgresRealtimeProvider } from "@/social/realtime";
import { PostgresSocialDiscussionRepository } from "@/social/repository";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { PostgresRateLimitProvider, RuleModerationProvider } from "@/social/safety";
import { isSocialQueryCell, MAX_SOCIAL_VIEWPORT_QUERY_CELLS } from "@/social/viewport";
import { rejectRawSocialRequestLocation } from "../requestGuard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_SOCIAL_WRITE_BYTES = 16 * 1024;

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value.trim() || null : null;
}

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  const config = getSocialRuntimeConfig();
  if (!config.publicSocialEnabled) {
    return errorResponse(requestId, 503, "SOCIAL_PUBLIC_DISABLED", "Public Social is currently disabled.");
  }
  const url = new URL(request.url);
  try {
    assertNoRawLocationInSocialPayload(Object.fromEntries(url.searchParams.entries()));
  } catch (error) {
    return errorResponse(requestId, 400, error instanceof Error ? error.message : "SOCIAL_RAW_LOCATION_QUERY_FORBIDDEN", "Raw location is forbidden in Social queries.");
  }
  const type = String(url.searchParams.get("type") || "MAP").toUpperCase();
  if (!DISCUSSION_TYPES.includes(type as CreateDiscussionInput["type"])) {
    return errorResponse(requestId, 400, "SOCIAL_DISCUSSION_TYPE_INVALID", "Invalid Social discussion type.");
  }
  const cells = [...new Set(String(url.searchParams.get("cells") || "").split(",").map((cell) => cell.trim()).filter(Boolean))];
  if (type === "MAP" && (cells.length === 0 || cells.length > MAX_SOCIAL_VIEWPORT_QUERY_CELLS || !cells.every(isSocialQueryCell))) {
    return errorResponse(requestId, 400, "SOCIAL_VIEWPORT_CELLS_INVALID", "A bounded privacy-safe cell viewport is required.");
  }
  const geoId = stringOrNull(url.searchParams.get("geoId"));
  const lawId = stringOrNull(url.searchParams.get("lawId"));
  const newsId = stringOrNull(url.searchParams.get("newsId"));
  if (type === "GEO" && !geoId) return errorResponse(requestId, 400, "SOCIAL_GEO_ID_REQUIRED", "GEO discussion requires geoId.");
  if (type === "LAW" && !lawId) return errorResponse(requestId, 400, "SOCIAL_LAW_ID_REQUIRED", "LAW discussion requires lawId.");
  if (type === "NEWS" && !newsId) return errorResponse(requestId, 400, "SOCIAL_NEWS_ID_REQUIRED", "NEWS discussion requires newsId.");
  const sort = url.searchParams.get("sort") === "TOP" ? "TOP" : "NEW";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);
  const cursor = stringOrNull(url.searchParams.get("cursor"));
  try {
    const sql = getSocialSql();
    const viewer = config.identityConfigured ? await getSocialIdentity(sql, request) : null;
    const discussions = await new PostgresSocialDiscussionRepository(sql).listDiscussions({
      type: type as CreateDiscussionInput["type"],
      queryCells: cells,
      geoId,
      lawId,
      newsId,
      viewerId: viewer?.userId || null,
      sort,
      cursor,
      limit,
    });
    return okResponse(requestId, {
      discussions,
      nextCursor: discussions.length === limit ? discussions.at(-1)?.createdAt || null : null,
      meta: { durableTruth: "POSTGRESQL", sort, cache: "NO_STORE" },
    });
  } catch {
    return errorResponse(requestId, 503, "SOCIAL_STORAGE_UNAVAILABLE", "Public Social storage is unavailable.");
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (Number(request.headers.get("content-length") || 0) > MAX_SOCIAL_WRITE_BYTES) {
    return errorResponse(requestId, 413, "SOCIAL_PAYLOAD_TOO_LARGE", "Social payload exceeds the allowed size.");
  }
  let input: CreateDiscussionInput;
  try {
    input = parseCreateDiscussionPayload(await request.json());
    validateDiscussionInput(input);
  } catch (error) {
    return errorResponse(requestId, 400, error instanceof Error ? error.message : "SOCIAL_REQUEST_BODY_INVALID", "Invalid Social discussion payload.");
  }
  const config = getSocialRuntimeConfig();
  if (!config.publicSocialEnabled || (input.type === "MAP" && !config.geoChatEnabled)) {
    return errorResponse(requestId, 503, "SOCIAL_WRITE_DISABLED", "Social discussion creation is currently disabled.");
  }
  const sql = getSocialSql();
  const actor = await getSocialIdentity(sql, request);
  if (!actor) return errorResponse(requestId, 401, "SOCIAL_IDENTITY_REQUIRED", "A verified isLegal user identity is required.");
  const now = new Date();
  const discussion = {
    id: crypto.randomUUID(),
    type: input.type,
    authorId: actor.userId,
    authorDisplayName: actor.displayName,
    geoId: input.geoId || null,
    geo: input.geo ? assertSafeSocialNetworkGeoAttachment(input.geo) : null,
    lawId: input.lawId || null,
    newsId: input.newsId || null,
    sourceId: input.sourceId || null,
    title: input.title || null,
    body: input.body.trim(),
    language: input.language || "und",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: resolveDiscussionExpiry(input, now),
    status: "ACTIVE" as const,
    replyCount: 0,
    voteScore: 0,
    version: `${now.toISOString()}:new`,
  };
  const moderation = await new RuleModerationProvider().allowCreateDiscussion({ actor, discussion });
  if (!moderation.allowed) {
    return errorResponse(requestId, 422, moderation.code || "SOCIAL_CONTENT_REJECTED", "Social content was rejected by moderation policy.");
  }
  const rateLimit = await new PostgresRateLimitProvider(sql).allowDiscussionCreate({ actor, geoCell: discussion.geo?.geoQueryCell || null });
  if (!rateLimit.allowed) {
    return errorResponse(requestId, 429, rateLimit.code || "SOCIAL_RATE_LIMITED", "Social rate limit exceeded.");
  }
  try {
    const saved = await new PostgresSocialDiscussionRepository(sql).createDiscussion(discussion);
    const event: SocialRealtimeEvent = {
      id: crypto.randomUUID(),
      type: "DISCUSSION_CREATED",
      discussionId: saved.id,
      version: saved.version,
      queryCell: saved.geo?.geoQueryCell || null,
    };
    let realtimeDelivered = true;
    try {
      await new PostgresRealtimeProvider(sql).publish(saved.geo?.geoQueryCell || `discussion:${saved.id}`, event);
    } catch {
      realtimeDelivered = false;
    }
    return okResponse(requestId, { discussion: saved, realtimeDelivered }, 201);
  } catch {
    return errorResponse(requestId, 503, "SOCIAL_STORAGE_UNAVAILABLE", "Social storage is unavailable.");
  }
}

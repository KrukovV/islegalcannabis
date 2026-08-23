import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { getSocialIdentity } from "@/social/identity";
import { PostgresSocialInteractionRepository, validateCommentBody } from "@/social/interactions";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";
import { PostgresRealtimeProvider } from "@/social/realtime";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { PostgresRateLimitProvider } from "@/social/safety";
import { rejectRawSocialRequestLocation } from "../../../requestGuard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function discussionIdFrom(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return UUID.test(id) ? id : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (!getSocialRuntimeConfig().publicSocialEnabled) {
    return errorResponse(requestId, 503, "SOCIAL_PUBLIC_DISABLED", "Public Social is currently disabled.");
  }
  const discussionId = await discussionIdFrom(context);
  if (!discussionId) return errorResponse(requestId, 400, "SOCIAL_DISCUSSION_ID_INVALID", "Invalid discussion id.");
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  try {
    const sql = getSocialSql();
    const viewer = getSocialRuntimeConfig().identityConfigured ? await getSocialIdentity(sql, request) : null;
    const comments = await new PostgresSocialInteractionRepository(sql).listComments(discussionId, cursor, limit, viewer?.userId || null);
    return okResponse(requestId, {
      comments,
      nextCursor: comments.length === limit ? comments.at(-1)?.createdAt || null : null,
      meta: { durableTruth: "POSTGRESQL", cache: "NO_STORE" },
    });
  } catch {
    return errorResponse(requestId, 503, "SOCIAL_STORAGE_UNAVAILABLE", "Social comments are unavailable.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (Number(request.headers.get("content-length") || 0) > 16 * 1024) {
    return errorResponse(requestId, 413, "SOCIAL_PAYLOAD_TOO_LARGE", "Social payload exceeds the allowed size.");
  }
  if (!getSocialRuntimeConfig().publicSocialEnabled) {
    return errorResponse(requestId, 503, "SOCIAL_PUBLIC_DISABLED", "Public Social is currently disabled.");
  }
  const discussionId = await discussionIdFrom(context);
  if (!discussionId) return errorResponse(requestId, 400, "SOCIAL_DISCUSSION_ID_INVALID", "Invalid discussion id.");
  let body: string;
  let parentCommentId: string | null;
  try {
    const payload = await request.json() as Record<string, unknown>;
    assertNoRawLocationInSocialPayload(payload);
    body = validateCommentBody(payload.body);
    parentCommentId = typeof payload.parentCommentId === "string" && UUID.test(payload.parentCommentId)
      ? payload.parentCommentId
      : null;
  } catch (error) {
    return errorResponse(requestId, 400, error instanceof Error ? error.message : "SOCIAL_COMMENT_BODY_INVALID", "Invalid comment payload.");
  }
  try {
    const sql = getSocialSql();
    const actor = await getSocialIdentity(sql, request);
    if (!actor) return errorResponse(requestId, 401, "SOCIAL_IDENTITY_REQUIRED", "A verified isLegal user identity is required.");
    const rate = await new PostgresRateLimitProvider(sql).allowAction(actor, "COMMENT_CREATE", 30);
    if (!rate.allowed) return errorResponse(requestId, 429, rate.code || "SOCIAL_RATE_LIMITED", "Social rate limit exceeded.");
    const saved = await new PostgresSocialInteractionRepository(sql).createComment(actor, discussionId, parentCommentId, body);
    let realtimeDelivered = true;
    try {
      await new PostgresRealtimeProvider(sql).publish(saved.queryCell || `discussion:${discussionId}`, {
        id: crypto.randomUUID(),
        type: "DISCUSSION_UPDATED",
        discussionId,
        version: saved.version,
        queryCell: saved.queryCell,
      });
    } catch {
      realtimeDelivered = false;
    }
    return okResponse(requestId, { comment: saved.comment, realtimeDelivered }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SOCIAL_COMMENT_CREATE_FAILED";
    const status = code.endsWith("NOT_FOUND") || code.endsWith("INVALID") ? 404 : 503;
    return errorResponse(requestId, status, code, status === 404 ? "Discussion or parent comment was not found." : "Social comment storage is unavailable.");
  }
}

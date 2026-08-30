import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { getSocialIdentity } from "@/social/identity";
import { PostgresSocialInteractionRepository } from "@/social/interactions";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";
import { PostgresRealtimeProvider } from "@/social/realtime";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { PostgresRateLimitProvider } from "@/social/safety";
import { rejectRawSocialRequestLocation } from "../requestGuard";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (!getSocialRuntimeConfig().publicSocialEnabled) return errorResponse(requestId, 503, "SOCIAL_PUBLIC_DISABLED", "Public Social is currently disabled.");
  try {
    const payload = await request.json() as Record<string, unknown>;
    assertNoRawLocationInSocialPayload(payload);
    const targetType = payload.targetType === "COMMENT" ? "COMMENT" : payload.targetType === "DISCUSSION" ? "DISCUSSION" : null;
    const targetId = typeof payload.targetId === "string" && UUID.test(payload.targetId) ? payload.targetId : null;
    const value = payload.value === -1 || payload.value === 0 || payload.value === 1 ? payload.value : null;
    if (!targetType || !targetId || value === null) throw new Error("SOCIAL_VOTE_PAYLOAD_INVALID");
    const sql = getSocialSql();
    const actor = await getSocialIdentity(sql, request);
    if (!actor) return errorResponse(requestId, 401, "SOCIAL_IDENTITY_REQUIRED", "A verified isLegal user identity is required.");
    const rate = await new PostgresRateLimitProvider(sql).allowAction(actor, "VOTE", 120);
    if (!rate.allowed) return errorResponse(requestId, 429, rate.code || "SOCIAL_RATE_LIMITED", "Social rate limit exceeded.");
    const vote = await new PostgresSocialInteractionRepository(sql).setVote(actor, targetType, targetId, value);
    let realtimeDelivered = true;
    try {
      await new PostgresRealtimeProvider(sql).publish(vote.queryCell || `discussion:${vote.discussionId}`, {
        id: crypto.randomUUID(),
        type: "DISCUSSION_UPDATED",
        discussionId: vote.discussionId,
        version: vote.version,
        queryCell: vote.queryCell,
      });
    } catch {
      realtimeDelivered = false;
    }
    return okResponse(requestId, { targetType, targetId, voteScore: vote.voteScore, realtimeDelivered });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SOCIAL_VOTE_PAYLOAD_INVALID";
    return errorResponse(requestId, code === "SOCIAL_VOTE_TARGET_NOT_FOUND" ? 404 : 400, code, "Invalid Social vote.");
  }
}

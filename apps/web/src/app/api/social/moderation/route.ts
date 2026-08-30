import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { getSocialIdentity } from "@/social/identity";
import { PostgresSocialManagementRepository } from "@/social/management";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";
import { PostgresRealtimeProvider } from "@/social/realtime";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { rejectRawSocialRequestLocation } from "../requestGuard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (!getSocialRuntimeConfig().publicSocialEnabled) return errorResponse(requestId, 503, "SOCIAL_PUBLIC_DISABLED", "Public Social is currently disabled.");
  try {
    const payload = await request.json() as Record<string, unknown>;
    assertNoRawLocationInSocialPayload(payload);
    const targetType = ["DISCUSSION", "COMMENT", "USER"].includes(String(payload.targetType)) ? String(payload.targetType) as "DISCUSSION" | "COMMENT" | "USER" : null;
    const action = ["HIDE", "REMOVE", "RESTORE"].includes(String(payload.action)) ? String(payload.action) as "HIDE" | "REMOVE" | "RESTORE" : null;
    const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
    const reason = typeof payload.reason === "string" ? payload.reason.normalize("NFKC").trim() : "";
    if (!targetType || !action || !targetId || reason.length < 3 || reason.length > 2_000) throw new Error("SOCIAL_MODERATION_PAYLOAD_INVALID");
    const sql = getSocialSql();
    const actor = await getSocialIdentity(sql, request);
    if (!actor) return errorResponse(requestId, 401, "SOCIAL_IDENTITY_REQUIRED", "A verified isLegal user identity is required.");
    const moderation = await new PostgresSocialManagementRepository(sql).moderate(actor, targetType, targetId, action, reason);
    if (moderation.discussionId && moderation.version) {
      await new PostgresRealtimeProvider(sql).publish(moderation.queryCell || `discussion:${moderation.discussionId}`, {
        id: crypto.randomUUID(),
        type: action === "RESTORE" ? "DISCUSSION_UPDATED" : "DISCUSSION_REMOVED",
        discussionId: moderation.discussionId,
        version: moderation.version,
        queryCell: moderation.queryCell,
      }).catch(() => {});
    }
    return okResponse(requestId, { moderation }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SOCIAL_MODERATION_PAYLOAD_INVALID";
    const status = code === "SOCIAL_MODERATOR_REQUIRED" ? 403 : code === "SOCIAL_MODERATION_TARGET_NOT_FOUND" ? 404 : 400;
    return errorResponse(requestId, status, code, "Social moderation request was rejected.");
  }
}

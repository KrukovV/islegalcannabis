import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { getSocialIdentity } from "@/social/identity";
import { PostgresSocialManagementRepository, type SocialRelation } from "@/social/management";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
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
    const relation: SocialRelation | null = payload.relation === "BLOCK" || payload.relation === "MUTE" ? payload.relation : null;
    const targetUserId = typeof payload.targetUserId === "string" && UUID.test(payload.targetUserId) ? payload.targetUserId : null;
    const active = payload.active !== false;
    if (!relation || !targetUserId) throw new Error("SOCIAL_RELATION_PAYLOAD_INVALID");
    const sql = getSocialSql();
    const actor = await getSocialIdentity(sql, request);
    if (!actor) return errorResponse(requestId, 401, "SOCIAL_IDENTITY_REQUIRED", "A verified isLegal user identity is required.");
    const result = await new PostgresSocialManagementRepository(sql).setRelation(actor, relation, targetUserId, active);
    return okResponse(requestId, { relation: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SOCIAL_RELATION_PAYLOAD_INVALID";
    return errorResponse(requestId, code === "SOCIAL_USER_NOT_FOUND" ? 404 : 400, code, "Invalid Social relationship request.");
  }
}

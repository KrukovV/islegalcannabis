import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { getSocialIdentity } from "@/social/identity";
import { PostgresSocialManagementRepository } from "@/social/management";
import { PostgresRealtimeProvider } from "@/social/realtime";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { rejectRawSocialRequestLocation } from "../../requestGuard";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (!getSocialRuntimeConfig().publicSocialEnabled) return errorResponse(requestId, 503, "SOCIAL_PUBLIC_DISABLED", "Public Social is currently disabled.");
  const { id } = await context.params;
  if (!UUID.test(id)) return errorResponse(requestId, 400, "SOCIAL_DISCUSSION_ID_INVALID", "Invalid discussion id.");
  try {
    const sql = getSocialSql();
    const actor = await getSocialIdentity(sql, request);
    if (!actor) return errorResponse(requestId, 401, "SOCIAL_IDENTITY_REQUIRED", "A verified isLegal user identity is required.");
    const removed = await new PostgresSocialManagementRepository(sql).removeOwnDiscussion(actor, id);
    if (!removed) return errorResponse(requestId, 404, "SOCIAL_DISCUSSION_NOT_OWNED_OR_FOUND", "Discussion was not found or is not owned by this identity.");
    await new PostgresRealtimeProvider(sql).publish(removed.geo_query_cell || `discussion:${id}`, {
      id: crypto.randomUUID(), type: "DISCUSSION_REMOVED", discussionId: id,
      version: `${removed.updated_at.toISOString()}:${id}`, queryCell: removed.geo_query_cell,
    }).catch(() => {});
    return okResponse(requestId, { removed: true, discussionId: id });
  } catch {
    return errorResponse(requestId, 503, "SOCIAL_STORAGE_UNAVAILABLE", "Social storage is unavailable.");
  }
}

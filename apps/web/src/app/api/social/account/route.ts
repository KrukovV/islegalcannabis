import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { getSocialIdentity, socialSessionCookie } from "@/social/identity";
import { PostgresSocialManagementRepository } from "@/social/management";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { rejectRawSocialRequestLocation } from "../requestGuard";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (!getSocialRuntimeConfig().identityConfigured) return errorResponse(requestId, 503, "SOCIAL_IDENTITY_DISABLED", "Social identity is not configured.");
  try {
    const sql = getSocialSql();
    const actor = await getSocialIdentity(sql, request);
    if (!actor) return errorResponse(requestId, 401, "SOCIAL_IDENTITY_REQUIRED", "A verified isLegal user identity is required.");
    await new PostgresSocialManagementRepository(sql).deleteAccount(actor);
    const response = okResponse(requestId, { accountDeleted: true, publicContentAnonymized: true });
    response.headers.set("Set-Cookie", socialSessionCookie("", 0));
    return response;
  } catch {
    return errorResponse(requestId, 503, "SOCIAL_ACCOUNT_DELETE_FAILED", "Social account deletion failed.");
  }
}

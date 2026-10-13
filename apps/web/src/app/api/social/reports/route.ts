import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { getSocialIdentity } from "@/social/identity";
import { PostgresSocialInteractionRepository } from "@/social/interactions";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";
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
    const targetType = ["DISCUSSION", "COMMENT", "USER"].includes(String(payload.targetType))
      ? String(payload.targetType) as "DISCUSSION" | "COMMENT" | "USER"
      : null;
    const targetId = typeof payload.targetId === "string" && (targetType === "USER" || UUID.test(payload.targetId)) ? payload.targetId : null;
    const reason = typeof payload.reason === "string" ? payload.reason.normalize("NFKC").trim() : "";
    if (!targetType || !targetId || reason.length < 3 || reason.length > 2_000) throw new Error("SOCIAL_REPORT_PAYLOAD_INVALID");
    const sql = getSocialSql();
    const actor = await getSocialIdentity(sql, request);
    if (!actor) return errorResponse(requestId, 401, "SOCIAL_IDENTITY_REQUIRED", "A verified isLegal user identity is required.");
    const rate = await new PostgresRateLimitProvider(sql).allowAction(actor, "REPORT", 20);
    if (!rate.allowed) return errorResponse(requestId, 429, rate.code || "SOCIAL_RATE_LIMITED", "Social rate limit exceeded.");
    const report = await new PostgresSocialInteractionRepository(sql).createReport(actor, targetType, targetId, reason);
    return okResponse(requestId, { report }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SOCIAL_REPORT_PAYLOAD_INVALID";
    return errorResponse(requestId, 400, code, "Invalid Social report.");
  }
}

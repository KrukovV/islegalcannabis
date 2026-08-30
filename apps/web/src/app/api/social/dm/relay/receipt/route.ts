import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";
import { rejectRawSocialRequestLocation } from "@/app/api/social/requestGuard";
import { PostgresDmRepository } from "@/dm/repository";
import { dmErrorCode, dmErrorStatus, HEX_64_PATTERN, objectPayload, RECEIPT_TOKEN_PATTERN, requireDmActor } from "@/dm/serverApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  try {
    await requireDmActor(request);
    const payload = objectPayload(await request.json());
    assertNoRawLocationInSocialPayload(payload);
    const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
    const receiptToken = typeof payload.receiptToken === "string" ? payload.receiptToken : "";
    if (!HEX_64_PATTERN.test(messageId)) throw new Error("DM_MESSAGE_ID_INVALID");
    if (!RECEIPT_TOKEN_PATTERN.test(receiptToken)) throw new Error("DM_RECEIPT_TOKEN_INVALID");
    return okResponse(requestId, await new PostgresDmRepository(getSocialSql()).receipt(messageId, receiptToken));
  } catch (error) {
    const code = dmErrorCode(error);
    return errorResponse(requestId, dmErrorStatus(code), code, "Private-message receipt is unavailable.");
  }
}

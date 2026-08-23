import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { getNotificationProvider } from "@/social/notifications";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";
import { PostgresRateLimitProvider } from "@/social/safety";
import { rejectRawSocialRequestLocation } from "@/app/api/social/requestGuard";
import { validateDmGiftWrap, validateDmSubmissionAuthorization } from "@/dm/nip17Candidate";
import { PostgresDmRepository } from "@/dm/repository";
import {
  dmErrorCode,
  dmErrorStatus,
  HEX_64_PATTERN,
  objectPayload,
  RECEIPT_TOKEN_PATTERN,
  requireDmActor,
  UUID_PATTERN,
  validateDmExpiry,
} from "@/dm/serverApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (Number(request.headers.get("content-length") || 0) > 80 * 1024) {
    return errorResponse(requestId, 413, "DM_PAYLOAD_TOO_LARGE", "Encrypted private-message payload is too large.");
  }
  try {
    const actor = await requireDmActor(request);
    const payload = objectPayload(await request.json());
    assertNoRawLocationInSocialPayload(payload);
    const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
    const senderDeviceId = typeof payload.senderDeviceId === "string" ? payload.senderDeviceId : "";
    const recipientDeviceId = typeof payload.recipientDeviceId === "string" ? payload.recipientDeviceId : "";
    const recipientPublicKey = typeof payload.recipientPublicKey === "string" ? payload.recipientPublicKey : "";
    const receiptToken = typeof payload.receiptToken === "string" ? payload.receiptToken : "";
    if (!HEX_64_PATTERN.test(messageId)) throw new Error("DM_MESSAGE_ID_INVALID");
    if (!UUID_PATTERN.test(senderDeviceId) || !UUID_PATTERN.test(recipientDeviceId)) throw new Error("DM_DEVICE_ID_INVALID");
    if (!HEX_64_PATTERN.test(recipientPublicKey)) throw new Error("DM_MESSAGING_PUBLIC_KEY_INVALID");
    if (!RECEIPT_TOKEN_PATTERN.test(receiptToken)) throw new Error("DM_RECEIPT_TOKEN_INVALID");

    const repository = new PostgresDmRepository(getSocialSql());
    const senderDevice = await repository.activeDeviceForActor(actor, senderDeviceId);
    if (!senderDevice) throw new Error("DM_DEVICE_NOT_AUTHORIZED");
    const recipientDevice = await repository.activeRecipientDevice(recipientDeviceId, recipientPublicKey);
    if (!recipientDevice) {
      throw new Error("DM_RECIPIENT_DEVICE_INVALID");
    }
    const rate = await new PostgresRateLimitProvider(getSocialSql()).allowPrivateMessageSend(actor);
    if (!rate.allowed) throw new Error(rate.code || "DM_SEND_RATE_LIMITED");
    const giftWrap = validateDmGiftWrap(payload.giftWrap, recipientPublicKey);
    validateDmSubmissionAuthorization(
      payload.submissionAuthorization,
      senderDevice.messaging_public_key,
      messageId,
      recipientPublicKey,
    );
    const result = await repository.submitEnvelope({
      messageId,
      recipientDeviceId,
      recipientPublicKey,
      giftWrap,
      receiptToken,
      expiresAt: validateDmExpiry(payload.expiresAt),
    });
    if (!result.duplicate) {
      await getNotificationProvider().notify({
        userId: recipientDevice.user_id,
        type: "DM_RECEIVED",
        opaqueEntityId: messageId,
      });
    }
    return okResponse(requestId, result, result.duplicate ? 200 : 202);
  } catch (error) {
    const code = dmErrorCode(error);
    return errorResponse(requestId, dmErrorStatus(code), code, "Encrypted private-message relay submission was rejected.");
  }
}

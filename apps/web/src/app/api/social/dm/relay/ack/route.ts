import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";
import { rejectRawSocialRequestLocation } from "@/app/api/social/requestGuard";
import { PostgresDmRepository } from "@/dm/repository";
import { dmErrorCode, dmErrorStatus, HEX_64_PATTERN, objectPayload, requireDmActor, UUID_PATTERN } from "@/dm/serverApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  try {
    const actor = await requireDmActor(request);
    const payload = objectPayload(await request.json());
    assertNoRawLocationInSocialPayload(payload);
    const deviceId = typeof payload.deviceId === "string" ? payload.deviceId : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
    const state = payload.state === "DELIVERED" || payload.state === "READ" ? payload.state : null;
    if (!UUID_PATTERN.test(deviceId)) throw new Error("DM_DEVICE_ID_INVALID");
    if (!HEX_64_PATTERN.test(messageId)) throw new Error("DM_MESSAGE_ID_INVALID");
    if (!state) throw new Error("DM_ACK_STATE_INVALID");
    const result = await new PostgresDmRepository(getSocialSql()).acknowledge(actor, deviceId, messageId, state);
    return okResponse(requestId, result);
  } catch (error) {
    const code = dmErrorCode(error);
    return errorResponse(requestId, dmErrorStatus(code), code, "Private-message acknowledgement was rejected.");
  }
}

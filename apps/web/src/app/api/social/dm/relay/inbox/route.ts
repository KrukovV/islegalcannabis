import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { rejectRawSocialRequestLocation } from "@/app/api/social/requestGuard";
import { PostgresDmRepository } from "@/dm/repository";
import { dmErrorCode, dmErrorStatus, requireDmActor, UUID_PATTERN } from "@/dm/serverApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  try {
    const actor = await requireDmActor(request);
    const deviceId = new URL(request.url).searchParams.get("deviceId") || "";
    if (!UUID_PATTERN.test(deviceId)) throw new Error("DM_DEVICE_ID_INVALID");
    const envelopes = await new PostgresDmRepository(getSocialSql()).inbox(actor, deviceId);
    return okResponse(requestId, { envelopes, meta: { persistence: "CIPHERTEXT_ONLY", cache: "NO_STORE" } });
  } catch (error) {
    const code = dmErrorCode(error);
    return errorResponse(requestId, dmErrorStatus(code), code, "Private-message inbox is unavailable.");
  }
}

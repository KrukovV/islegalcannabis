import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";
import { rejectRawSocialRequestLocation } from "@/app/api/social/requestGuard";
import { validateDmDeviceRegistration } from "@/dm/nip17Candidate";
import { PostgresDmRepository } from "@/dm/repository";
import { dmErrorCode, dmErrorStatus, objectPayload, requireDmActor, validateDeviceLabel } from "@/dm/serverApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  try {
    const actor = await requireDmActor(request);
    const devices = await new PostgresDmRepository(getSocialSql()).listDevices(actor);
    return okResponse(requestId, { devices });
  } catch (error) {
    const code = dmErrorCode(error);
    return errorResponse(requestId, dmErrorStatus(code), code, "Private-device list is unavailable.");
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (Number(request.headers.get("content-length") || 0) > 16 * 1024) {
    return errorResponse(requestId, 413, "DM_PAYLOAD_TOO_LARGE", "Private-device payload is too large.");
  }
  try {
    const actor = await requireDmActor(request);
    const payload = objectPayload(await request.json());
    assertNoRawLocationInSocialPayload(payload);
    const challenge = typeof payload.challenge === "string" ? payload.challenge : "";
    const registration = validateDmDeviceRegistration(payload.registrationEvent, challenge);
    const device = await new PostgresDmRepository(getSocialSql()).registerDevice(
      actor,
      challenge,
      registration.publicKey,
      validateDeviceLabel(payload.label),
    );
    return okResponse(requestId, { device }, 201);
  } catch (error) {
    const code = dmErrorCode(error);
    return errorResponse(requestId, dmErrorStatus(code), code, "Private-device registration was rejected.");
  }
}

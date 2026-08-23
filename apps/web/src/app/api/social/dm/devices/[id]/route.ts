import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { rejectRawSocialRequestLocation } from "@/app/api/social/requestGuard";
import { PostgresDmRepository } from "@/dm/repository";
import { dmErrorCode, dmErrorStatus, requireDmActor, UUID_PATTERN } from "@/dm/serverApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  try {
    const actor = await requireDmActor(request);
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw new Error("DM_DEVICE_ID_INVALID");
    const revoked = await new PostgresDmRepository(getSocialSql()).revokeDevice(actor, id);
    if (!revoked) throw new Error("DM_DEVICE_NOT_FOUND");
    return okResponse(requestId, { deviceId: id, state: "REVOKED" });
  } catch (error) {
    const code = dmErrorCode(error);
    return errorResponse(requestId, dmErrorStatus(code), code, "Private-device revocation was rejected.");
  }
}

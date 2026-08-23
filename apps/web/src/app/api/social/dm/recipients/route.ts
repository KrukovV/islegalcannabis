import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { rejectRawSocialRequestLocation } from "@/app/api/social/requestGuard";
import { PostgresDmRepository } from "@/dm/repository";
import { dmErrorCode, dmErrorStatus, HEX_64_PATTERN, requireDmActor } from "@/dm/serverApi";
import { validateSocialDisplayName } from "@/social/identity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  try {
    await requireDmActor(request);
    const url = new URL(request.url);
    const repository = new PostgresDmRepository(getSocialSql());
    const publicKey = url.searchParams.get("publicKey");
    if (publicKey !== null) {
      if (!HEX_64_PATTERN.test(publicKey)) throw new Error("DM_MESSAGING_PUBLIC_KEY_INVALID");
      return okResponse(requestId, { sender: await repository.resolveSender(publicKey) });
    }
    const displayName = validateSocialDisplayName(url.searchParams.get("displayName"));
    return okResponse(requestId, { recipients: await repository.resolveRecipient(displayName) });
  } catch (error) {
    const code = dmErrorCode(error);
    return errorResponse(requestId, dmErrorStatus(code), code, "Private-message recipient lookup was rejected.");
  }
}

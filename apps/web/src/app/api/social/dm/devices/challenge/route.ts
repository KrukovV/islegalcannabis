import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { rejectRawSocialRequestLocation } from "@/app/api/social/requestGuard";
import { PostgresDmRepository } from "@/dm/repository";
import { dmErrorCode, dmErrorStatus, requireDmActor } from "@/dm/serverApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  try {
    const actor = await requireDmActor(request);
    return okResponse(requestId, await new PostgresDmRepository(getSocialSql()).issueChallenge(actor));
  } catch (error) {
    const code = dmErrorCode(error);
    return errorResponse(requestId, dmErrorStatus(code), code, "Private-device challenge was rejected.");
  }
}

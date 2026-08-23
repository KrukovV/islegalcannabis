import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import { PostgresSocialDiscussionRepository } from "@/social/repository";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import {
  MAX_SOCIAL_MAP_ACTIVITY_ITEMS,
} from "@/social/viewport";
import { parseSocialMapQuery, type SocialMapQuery } from "@/social/mapRequest";
import { rejectRawSocialRequestLocation } from "../requestGuard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_CONTROL = "no-store, max-age=0";

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  let query: SocialMapQuery;
  try {
    query = parseSocialMapQuery(new URL(request.url));
  } catch (error) {
    return errorResponse(requestId, 400, error instanceof Error ? error.message : "SOCIAL_VIEWPORT_INVALID", "Invalid privacy-safe Social viewport query.");
  }
  if (!getSocialRuntimeConfig().publicSocialEnabled) {
    return errorResponse(requestId, 503, "SOCIAL_PUBLIC_DISABLED", "Public Social is currently disabled.");
  }
  try {
    const repository = new PostgresSocialDiscussionRepository(getSocialSql());
    const activity = await repository.listActiveMapActivity({
      queryCells: query.cells,
      limit: MAX_SOCIAL_MAP_ACTIVITY_ITEMS,
    });
    const response = okResponse(requestId, {
      activity,
      meta: { socialLayer: "MAP_ACTIVITY", cache: "NO_STORE" },
    });
    response.headers.set("Cache-Control", CACHE_CONTROL);
    return response;
  } catch {
    return errorResponse(requestId, 503, "SOCIAL_STORAGE_UNAVAILABLE", "Public Social storage is unavailable.");
  }
}

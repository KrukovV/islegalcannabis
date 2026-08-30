import { errorResponse } from "@/lib/api/response";
import { assertNoRawLocationInSocialPayload } from "@/social/privacy";

export function rejectRawSocialRequestLocation(requestId: string, request: Request) {
  try {
    assertNoRawLocationInSocialPayload(Object.fromEntries(new URL(request.url).searchParams.entries()), "query");
    return null;
  } catch (error) {
    return errorResponse(
      requestId,
      400,
      error instanceof Error ? error.message : "SOCIAL_RAW_LOCATION_QUERY_FORBIDDEN",
      "Raw location is forbidden in Social requests.",
    );
  }
}

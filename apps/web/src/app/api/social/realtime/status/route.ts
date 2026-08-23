import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialRealtimeMetrics } from "@/social/realtime";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { rejectRawSocialRequestLocation } from "../../requestGuard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (process.env.NODE_ENV === "production" || request.headers.get("x-social-load-probe") !== "1") {
    return errorResponse(requestId, 404, "SOCIAL_LOAD_METRICS_DISABLED", "Social load metrics are unavailable.");
  }
  if (!getSocialRuntimeConfig().publicSocialEnabled) {
    return errorResponse(requestId, 503, "SOCIAL_PUBLIC_DISABLED", "Public Social is currently disabled.");
  }
  return okResponse(requestId, {
    realtime: getSocialRealtimeMetrics(),
    privacy: "AGGREGATE_ONLY",
  });
}

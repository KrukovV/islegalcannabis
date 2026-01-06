import { resolveIpToJurisdiction } from "@/lib/geo/ip";
import { buildLocationResolution } from "@/lib/geo/locationResolution";
import { createRequestId, okResponse } from "@/lib/api/response";

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const rawIp = forwardedFor ?? realIp ?? "";
  const ip = rawIp.split(",")[0]?.trim() || null;

  const result = resolveIpToJurisdiction(ip);
  const resolution = buildLocationResolution("ip", result.region);
  console.info(`[${requestId}] whereami_resolved`);

  return okResponse(requestId, {
    ...result,
    confidence: resolution.confidence
  });
}

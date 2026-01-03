import { resolveIpToJurisdiction } from "@/lib/geo/ip";
import { createRequestId, okJson } from "@/lib/api/response";

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const rawIp = forwardedFor ?? realIp ?? "";
  const ip = rawIp.split(",")[0]?.trim() || null;

  const result = resolveIpToJurisdiction(ip);

  return okJson(requestId, result);
}

import { getLawProfile, normalizeKey } from "@/lib/lawStore";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { findNearbyStatus } from "@/lib/geo/nearbyStatus";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const premium =
    process.env.NEXT_PUBLIC_PREMIUM === "1" ||
    process.env.PREMIUM === "1";
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") ?? "";
  const region = searchParams.get("region") ?? undefined;

  if (!country.trim()) {
    return errorResponse(
      requestId,
      400,
      "MISSING_COUNTRY",
      "Missing country.",
      "Provide country (and region for US)."
    );
  }

  const key = normalizeKey({ country, region });
  if (!key) {
    return errorResponse(
      requestId,
      400,
      "INVALID_JURISDICTION",
      "Invalid jurisdiction.",
      "Provide a valid country and region."
    );
  }

  const profile = getLawProfile({ country, region });
  if (!profile) {
    return errorResponse(
      requestId,
      404,
      "NOT_FOUND",
      "Jurisdiction not found.",
      "Try another country or region."
    );
  }

  if (!premium) {
    console.warn("NEARBY_SKIP_FREE=1");
    return okResponse(requestId, {
      current: { id: profile.id, status: "yellow", summary: "Status locked" },
      nearby: []
    });
  }

  const result = findNearbyStatus(profile) ?? {
    current: { id: profile.id, status: "yellow", summary: "Status unknown" },
    nearby: []
  };

  return okResponse(requestId, {
    current: result.current,
    nearby: result.nearby
  });
}

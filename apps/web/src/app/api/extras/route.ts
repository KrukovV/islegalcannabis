import { getLawProfile, normalizeKey } from "@/lib/lawStore";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";

export const runtime = "nodejs";

function parseId(id?: string | null) {
  if (!id) return { country: "", region: undefined as string | undefined };
  const [country, region] = id.split("-");
  return { country: country ?? "", region: region || undefined };
}

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const parsed = parseId(id);
  const country = (parsed.country || searchParams.get("country") || "").trim();
  const region = parsed.region ?? searchParams.get("region") ?? undefined;

  if (!country) {
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

  return okResponse(requestId, {
    id: profile.id,
    extras: {
      public_use: profile.public_use ?? "unknown",
      driving: profile.risks.includes("driving") ? "risk" : "unknown",
      purchase: profile.extras?.purchase ?? "unknown",
      home_grow: profile.home_grow ?? "unknown",
      cbd: profile.extras?.cbd ?? "unknown",
      edibles: profile.extras?.edibles ?? "unknown"
    }
  });
}

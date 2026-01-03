import { getLawProfile } from "@/lib/lawStore";
import { computeStatus } from "@islegal/shared";
import { incrementCounter } from "@/lib/metrics";
import { createRequestId, errorJson, okJson } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") ?? "";
  const region = searchParams.get("region") ?? undefined;

  if (!country.trim()) {
    return errorJson(
      requestId,
      400,
      "MISSING_COUNTRY",
      "Missing country.",
      "Provide country (and region for US)."
    );
  }

  const profile = getLawProfile({ country, region });

  if (!profile) {
    return errorJson(
      requestId,
      404,
      "UNKNOWN_JURISDICTION",
      "Unknown jurisdiction.",
      "Provide country (and region for US)."
    );
  }

  incrementCounter("check_performed");
  console.info(`[${requestId}] check_performed`);
  return okJson(requestId, { status: computeStatus(profile), profile });
}

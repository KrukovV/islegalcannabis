import { getLawProfile } from "@/lib/lawStore";
import { computeStatus } from "@islegal/shared";
import { incrementCounter } from "@/lib/metrics";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getCatalogEntry } from "@/lib/jurisdictionCatalog";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = createRequestId(req);
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

  const profile = getLawProfile({ country, region });

  if (!profile) {
    const entry = getCatalogEntry(country);
    if (entry) {
      return okResponse(requestId, {
        status: {
          level: "yellow",
          label: "Information requires verification",
          icon: "⚠️"
        },
        profile: null,
        verification: {
          status: entry.status,
          verified_at: entry.lastVerifiedAt,
          sources: entry.sources
        },
        actions: {
          open_sources_url: entry.sources?.[0]?.url ?? null
        },
        message: "No law profile yet. Use official sources or select manually."
      });
    }

    return errorResponse(
      requestId,
      404,
      "UNKNOWN_JURISDICTION",
      "Unknown jurisdiction.",
      "Provide country (and region for US)."
    );
  }

  incrementCounter("check_performed");
  console.info(`[${requestId}] check_performed`);
  return okResponse(requestId, { status: computeStatus(profile), profile });
}

import { getLawProfile, normalizeKey } from "@/lib/lawStore";
import { computeStatus } from "@islegal/shared";
import { incrementCounter } from "@/lib/metrics";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getCatalogEntry } from "@/lib/jurisdictionCatalog";
import {
  addCachedCheck,
  buildApproxCell,
  findNearbyCached
} from "@/lib/nearbyCache";
import { hashLawProfile } from "@/lib/profileHash";
import { verifyJurisdictionFreshness } from "@/lib/verification";
import { buildTripStatusCode } from "@/lib/tripStatus";

const CACHE_WINDOW_MINUTES = 120;

function buildNeedsReviewStatus() {
  return {
    level: "yellow" as const,
    label: "Information requires verification",
    icon: "⚠️"
  };
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") ?? "";
  const region = searchParams.get("region") ?? undefined;
  const method = searchParams.get("method") as "gps" | "ip" | "manual" | null;
  const confidence = searchParams.get("confidence") as
    | "high"
    | "medium"
    | "low"
    | null;
  const cell = searchParams.get("cell");

  if (!country.trim()) {
    return errorResponse(
      requestId,
      400,
      "MISSING_COUNTRY",
      "Missing country.",
      "Provide country (and region for US)."
    );
  }

  const jurisdictionKey = normalizeKey({ country, region });
  const approxCell = buildApproxCell({
    method: method ?? undefined,
    country,
    region: region ?? undefined,
    cell
  });

  if (jurisdictionKey) {
    const cached = findNearbyCached(
      method === "gps" ? approxCell : null,
      jurisdictionKey,
      CACHE_WINDOW_MINUTES
    );
    if (cached) {
      const profile = getLawProfile({ country, region });
      const profileHash = profile ? hashLawProfile(profile) : null;
      if (profile && profileHash === cached.profileHash) {
        const verification = await verifyJurisdictionFreshness(
          jurisdictionKey,
          profile.sources ?? []
        );
        if (verification.needsReview) {
          return okResponse(requestId, {
            status: buildNeedsReviewStatus(),
            profile,
            meta: {
              cacheHit: true,
              cacheAgeSec: Math.floor(
                (Date.now() - new Date(cached.ts).getTime()) / 1000
              ),
              verifiedFresh: false,
              needsReview: true
            }
          });
        }

        return okResponse(requestId, {
          status: computeStatus(profile),
          profile,
          meta: {
            cacheHit: true,
            cacheAgeSec: Math.floor(
              (Date.now() - new Date(cached.ts).getTime()) / 1000
            ),
            verifiedFresh: true
          }
        });
      }
    }
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

  const status = computeStatus(profile);
  const statusCode = buildTripStatusCode(profile);
  if (jurisdictionKey && method && confidence) {
    addCachedCheck({
      ts: new Date().toISOString(),
      jurisdictionKey,
      country: profile.country,
      region: profile.region,
      statusCode,
      statusLevel: status.level,
      profileHash: hashLawProfile(profile),
      verifiedAt: profile.verified_at ?? undefined,
      lawUpdatedAt: profile.updated_at,
      sources: profile.sources,
      location: { method, confidence },
      approxCell: method === "gps" ? approxCell : buildApproxCell({
        method,
        country,
        region: region ?? undefined
      })
    });
  }

  return okResponse(requestId, {
    status,
    profile,
    meta: { cacheHit: false }
  });
}

import { getLawProfile, normalizeKey } from "@/lib/lawStore";
import { computeStatus } from "@islegal/shared";
import { incrementCounter } from "@/lib/metrics";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getCatalogEntry } from "@/lib/jurisdictionCatalog";
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
  const cell = searchParams.get("cell");
  const cacheTs = searchParams.get("cacheTs");
  const cacheProfileHash = searchParams.get("cacheProfileHash");
  const cacheVerifiedAt = searchParams.get("cacheVerifiedAt");
  const cacheApproxCell = searchParams.get("cacheApproxCell");

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
  if (jurisdictionKey && cacheTs && cacheProfileHash) {
    const ageSec = Math.floor(
      (Date.now() - new Date(cacheTs).getTime()) / 1000
    );
    if (ageSec <= CACHE_WINDOW_MINUTES * 60) {
      const profile = getLawProfile({ country, region });
      const profileHash = profile ? hashLawProfile(profile) : null;
      if (profile && profileHash === cacheProfileHash) {
        if (method === "gps") {
          if (!cacheApproxCell || !cell || cacheApproxCell !== cell) {
            // skip mismatch
          } else {
            const verification = await verifyJurisdictionFreshness(
              jurisdictionKey,
              profile.sources ?? [],
              new Date(),
              undefined,
              cacheVerifiedAt ?? undefined
            );
            if (verification.needsReview) {
              return okResponse(requestId, {
                status: buildNeedsReviewStatus(),
                profile,
                meta: {
                  cacheHit: true,
                  cacheAgeSec: ageSec,
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
                cacheAgeSec: ageSec,
                verifiedFresh: true
              }
            });
          }
        } else {
          const verification = await verifyJurisdictionFreshness(
            jurisdictionKey,
            profile.sources ?? [],
            new Date(),
            undefined,
            cacheVerifiedAt ?? undefined
          );
          if (verification.needsReview) {
            return okResponse(requestId, {
              status: buildNeedsReviewStatus(),
              profile,
              meta: {
                cacheHit: true,
                cacheAgeSec: ageSec,
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
              cacheAgeSec: ageSec,
              verifiedFresh: true
            }
          });
        }
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

  return okResponse(requestId, {
    status,
    profile,
    meta: { cacheHit: false, statusCode }
  });
}

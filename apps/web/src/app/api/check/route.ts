import { getLawProfile, normalizeKey } from "@/lib/lawStore";
import { computeStatus, STATUS_BANNERS } from "@islegal/shared";
import { incrementCounter } from "@/lib/metrics";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getCatalogEntry } from "@/lib/jurisdictionCatalog";
import { hashLawProfile } from "@/lib/profileHash";
import { verifyJurisdictionFreshness } from "@/lib/verification";
import { buildTripStatusCode } from "@/lib/tripStatus";
import { buildResultViewModel } from "@/lib/resultViewModel";
import {
  fromDetected,
  fromManual,
  fromQuery,
  type LocationContext
} from "@/lib/location/locationContext";
import { confidenceForLocation } from "@/lib/geo/locationResolution";
import { titleForJurisdiction } from "@/lib/jurisdictionTitle";
import { buildExtrasItems, extrasPreview } from "@/lib/extras";
import { findNearestLegalForProfile } from "@/lib/geo/nearestLegal";

const CACHE_WINDOW_MINUTES = 120;

function buildNeedsReviewStatus() {
  return {
    level: "gray" as const,
    label: STATUS_BANNERS.needs_review.title,
    icon: "⚠️"
  };
}

function buildProvisionalStatus() {
  return {
    level: "yellow" as const,
    label: STATUS_BANNERS.provisional.title,
    icon: "⚠️"
  };
}

function buildDisplayStatus(profile: { status: string }) {
  if (profile.status === "needs_review" || profile.status === "unknown") {
    return buildNeedsReviewStatus();
  }
  if (profile.status === "provisional") {
    return buildProvisionalStatus();
  }
  return computeStatus(profile as Parameters<typeof computeStatus>[0]);
}

export const runtime = "nodejs";

function isPaidRequest(req: Request) {
  if (process.env.NODE_ENV === "production") return false;
  const url = new URL(req.url);
  if (url.searchParams.get("paid") === "1") return true;
  const cookie = req.headers.get("cookie") ?? "";
  return cookie.split(";").some((part) => part.trim() === "ilc_paid=1");
}

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") ?? "";
  const region = searchParams.get("region") ?? undefined;
  const method = searchParams.get("method") as "gps" | "ip" | "manual" | null;
  const confidence = searchParams.get("confidence");
  const cell = searchParams.get("cell");
  const cacheTs = searchParams.get("cacheTs");
  const cacheProfileHash = searchParams.get("cacheProfileHash");
  const cacheVerifiedAt = searchParams.get("cacheVerifiedAt");
  const cacheApproxCell = searchParams.get("cacheApproxCell");
  const approxLatRaw = searchParams.get("approxLat");
  const approxLonRaw = searchParams.get("approxLon");
  const approxLat =
    approxLatRaw === null ? null : Number(approxLatRaw);
  const approxLon =
    approxLonRaw === null ? null : Number(approxLonRaw);

  const withRequestId = (meta: Record<string, unknown>) => ({
    requestId,
    ...meta
  });
  const approxPoint =
    approxLat !== null &&
    approxLon !== null &&
    Number.isFinite(approxLat) &&
    Number.isFinite(approxLon)
      ? { lat: approxLat, lon: approxLon }
      : null;

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
  const title = titleForJurisdiction({ country, region });
  const paid = isPaidRequest(req);
  const normalizedConfidence =
    confidence === "high" || confidence === "medium" || confidence === "low"
      ? confidence
      : null;
  const locationContext: LocationContext = method
    ? method === "manual"
      ? fromManual(country, region)
      : fromDetected({
          country,
          region,
          method,
          confidence: normalizedConfidence ?? confidenceForLocation(method)
        })
    : fromQuery({ country, region });

  const baseViewModelMeta = {
    requestId,
    paid,
    paywallHint: !paid
  };

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
                const nearestLegal =
                  approxPoint &&
                  locationContext.mode === "detected" &&
                  profile.status === "known" &&
                  (computeStatus(profile).level === "red" ||
                    profile.risks.includes("border_crossing"))
                    ? findNearestLegalForProfile(profile, approxPoint)
                    : null;
                const viewModel = buildResultViewModel({
                  profile,
                  title,
                  locationContext,
                  meta: {
                    ...baseViewModelMeta,
                    cacheHit: true,
                    verifiedFresh: false,
                    needsReview: true,
                  },
                  extrasPreview: paid
                    ? undefined
                    : extrasPreview(buildExtrasItems(profile)),
                  extrasFull: paid ? buildExtrasItems(profile) : undefined,
                  nearestLegal: nearestLegal ?? undefined,
                  statusOverride: {
                    level: "gray",
                    title: STATUS_BANNERS.needs_review.title
                  }
                });
              return okResponse(requestId, {
                status: buildNeedsReviewStatus(),
                profile,
                viewModel,
                meta: withRequestId({
                  cacheHit: true,
                  cacheAgeSec: ageSec,
                  verifiedFresh: false,
                  needsReview: true
                })
              });
            }

            const nearestLegal =
              approxPoint &&
              locationContext.mode === "detected" &&
              profile.status === "known" &&
              (computeStatus(profile).level === "red" ||
                profile.risks.includes("border_crossing"))
                ? findNearestLegalForProfile(profile, approxPoint)
                : null;
            const viewModel = buildResultViewModel({
              profile,
              title,
              locationContext,
              meta: {
                ...baseViewModelMeta,
                cacheHit: true,
                verifiedFresh: true
              },
              extrasPreview: paid
                ? undefined
                : extrasPreview(buildExtrasItems(profile)),
              extrasFull: paid ? buildExtrasItems(profile) : undefined,
              nearestLegal: nearestLegal ?? undefined
            });
            return okResponse(requestId, {
              status: buildDisplayStatus(profile),
              profile,
              viewModel,
              meta: withRequestId({
                cacheHit: true,
                cacheAgeSec: ageSec,
                verifiedFresh: true
              })
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
            const nearestLegal =
              approxPoint &&
              locationContext.mode === "detected" &&
              profile.status === "known" &&
              (computeStatus(profile).level === "red" ||
                profile.risks.includes("border_crossing"))
                ? findNearestLegalForProfile(profile, approxPoint)
                : null;
            const viewModel = buildResultViewModel({
              profile,
              title,
              locationContext,
              meta: {
                ...baseViewModelMeta,
                cacheHit: true,
                verifiedFresh: false,
                needsReview: true,
              },
              extrasPreview: paid
                ? undefined
                : extrasPreview(buildExtrasItems(profile)),
              extrasFull: paid ? buildExtrasItems(profile) : undefined,
              nearestLegal: nearestLegal ?? undefined,
            statusOverride: {
              level: "gray",
              title: STATUS_BANNERS.needs_review.title
            }
            });
            return okResponse(requestId, {
              status: buildNeedsReviewStatus(),
              profile,
              viewModel,
              meta: withRequestId({
                cacheHit: true,
                cacheAgeSec: ageSec,
                verifiedFresh: false,
                needsReview: true
              })
            });
          }

          const nearestLegal =
            approxPoint &&
            locationContext.mode === "detected" &&
            profile.status === "known" &&
            (computeStatus(profile).level === "red" ||
              profile.risks.includes("border_crossing"))
              ? findNearestLegalForProfile(profile, approxPoint)
              : null;
          const viewModel = buildResultViewModel({
            profile,
            title,
            locationContext,
            meta: {
              ...baseViewModelMeta,
              cacheHit: true,
              verifiedFresh: true
            },
            extrasPreview: paid
              ? undefined
              : extrasPreview(buildExtrasItems(profile)),
            extrasFull: paid ? buildExtrasItems(profile) : undefined,
            nearestLegal: nearestLegal ?? undefined
          });
          return okResponse(requestId, {
            status: buildDisplayStatus(profile),
            profile,
            viewModel,
            meta: withRequestId({
              cacheHit: true,
              cacheAgeSec: ageSec,
              verifiedFresh: true
            })
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
          level: "gray",
          label: STATUS_BANNERS.needs_review.title,
          icon: "⚪"
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
        message: "No law profile yet. Use official sources or select manually.",
        meta: withRequestId({})
      });
    }

    return errorResponse(
      requestId,
      400,
      "BAD_REQUEST",
      "Invalid country code.",
      "Provide ISO 3166-1 alpha-2 (and region for US)."
    );
  }

  incrementCounter("check_performed");
  console.info(`[${requestId}] check_performed`);

  const status = buildDisplayStatus(profile);
  const statusCode = buildTripStatusCode(profile);
  const nearestLegal =
    approxPoint &&
    locationContext.mode === "detected" &&
    profile.status === "known" &&
    (status.level === "red" || profile.risks.includes("border_crossing"))
      ? findNearestLegalForProfile(profile, approxPoint)
      : null;
  const viewModel = buildResultViewModel({
    profile,
    title,
    locationContext,
    meta: { ...baseViewModelMeta, cacheHit: false },
    extrasPreview: paid ? undefined : extrasPreview(buildExtrasItems(profile)),
    extrasFull: paid ? buildExtrasItems(profile) : undefined,
    nearestLegal: nearestLegal ?? undefined
  });

  return okResponse(requestId, {
    status,
    profile,
    viewModel,
    meta: withRequestId({ cacheHit: false, statusCode })
  });
}

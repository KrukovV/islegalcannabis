import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { findNearbyTruth } from "@/lib/geo/nearbyTruth";
import { getCountryPageData } from "@/lib/countryPageStorage";

export const runtime = "nodejs";

function sanitizeCountry(value: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  if (/^[A-Z]{3}$/.test(normalized)) return normalized.toLowerCase();
  return null;
}

function sanitizeRegion(value: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function sanitizeCoordinate(value: string | null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function resolveGeoHint(country: string | null, region: string | null) {
  if (!country) return null;
  if (country === "US" && region) return `US-${region}`;
  if (country.length === 2) return country;
  const page = getCountryPageData(country);
  return page?.geo_code?.toUpperCase() || null;
}

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const premium =
    process.env.NEXT_PUBLIC_PREMIUM === "1" ||
    process.env.PREMIUM === "1";
  const { searchParams } = new URL(req.url);
  const country = sanitizeCountry(searchParams.get("country"));
  const region = sanitizeRegion(searchParams.get("region"));
  const lat = sanitizeCoordinate(searchParams.get("lat") || searchParams.get("approxLat"));
  const lng = sanitizeCoordinate(searchParams.get("lng") || searchParams.get("approxLon"));

  if (!country) {
    return errorResponse(
      requestId,
      400,
      "MISSING_COUNTRY",
      "Missing country.",
      "Provide country and optional region."
    );
  }

  const geoHint = resolveGeoHint(country, region);
  if (!geoHint) {
    return errorResponse(
      requestId,
      404,
      "NOT_FOUND",
      "Jurisdiction not found.",
      "Try another country or region."
    );
  }

  if (!premium) {
    return okResponse(requestId, {
      current: null,
      nearby: [],
      warning: "Upgrade to unlock nearby results."
    });
  }

  const result = findNearbyTruth({ geoHint, lat, lng });
  if (!result) {
    return errorResponse(
      requestId,
      404,
      "NOT_FOUND",
      "Nearby truth data is unavailable for this jurisdiction."
    );
  }

  return okResponse(requestId, {
    origin: result.origin,
    current: result.current,
    nearby: result.nearby,
    warning: result.warning
  });
}

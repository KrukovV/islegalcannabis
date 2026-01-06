import { reverseGeocode } from "@/lib/geo/reverseGeocode";
import { incrementReverseGeocodeMethod } from "@/lib/metrics";
import { buildLocationResolution } from "@/lib/geo/locationResolution";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return errorResponse(
      requestId,
      400,
      "INVALID_COORDS",
      "Provide valid lat and lon query parameters."
    );
  }

  try {
    const resolved = await reverseGeocode(lat, lon);
    const resolution = buildLocationResolution("gps", resolved.region);
    incrementReverseGeocodeMethod(resolved.method);
    console.info(`[${requestId}] reverse_geocode ${resolved.method}`);
    return okResponse(requestId, {
      country: resolved.country,
      region: resolved.region,
      method: "gps",
      provider: resolved.method,
      confidence: resolution.confidence
    });
  } catch {
    return errorResponse(
      requestId,
      500,
      "REVERSE_GEOCODE_FAILED",
      "Reverse geocoding failed."
    );
  }
}

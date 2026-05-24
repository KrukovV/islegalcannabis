import { resolveRequestIpToJurisdiction } from "@/lib/geo/ip";
import { buildLocationResolution } from "@/lib/geo/locationResolution";
import { createRequestId, okResponse } from "@/lib/api/response";

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const result = await resolveRequestIpToJurisdiction(req.headers);
  const resolution = buildLocationResolution("ip", result.region);
  const geo = result.region ? `${result.country}-${result.region}` : result.country;

  return okResponse(requestId, {
    geo,
    iso: result.country,
    iso2: result.country,
    country: result.countryName ?? result.country,
    region: result.region ?? null,
    lat: result.lat ?? null,
    lng: result.lng ?? null,
    provider: result.provider ?? "stub",
    confidence: resolution.confidence
  });
}

export async function POST(req: Request) {
  const requestId = createRequestId(req);
  try {
    await req.json();
  } catch {
    // Ignore body parse errors; client-side SSOT writes are best-effort.
  }
  return okResponse(requestId, { ok: true });
}

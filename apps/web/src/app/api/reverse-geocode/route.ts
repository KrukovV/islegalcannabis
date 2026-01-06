import { reverseGeocode } from "@/lib/geo/reverseGeocode";
import { incrementReverseGeocodeMethod } from "@/lib/metrics";
import { buildLocationResolution } from "@/lib/geo/locationResolution";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

type Fixture = {
  name: string;
  lat: number;
  lon: number;
  expectedCountry: string;
  expectedRegion?: string;
  expectedJurisdictionKey: string;
};

function fixturesPath() {
  const cwd = process.cwd();
  const direct = path.resolve(cwd, "tools", "smoke", "fixtures.json");
  if (fs.existsSync(direct)) return direct;
  return path.resolve(cwd, "..", "..", "tools", "smoke", "fixtures.json");
}

function loadFixtures(): Fixture[] {
  const fp = fixturesPath();
  if (!fs.existsSync(fp)) return [];
  const raw = fs.readFileSync(fp, "utf-8");
  return JSON.parse(raw) as Fixture[];
}

function roundCoord(value: number) {
  return Number(value.toFixed(4));
}

function matchFixture(fixtures: Fixture[], lat: number, lon: number) {
  const targetLat = roundCoord(lat);
  const targetLon = roundCoord(lon);
  return fixtures.find(
    (item) => roundCoord(item.lat) === targetLat && roundCoord(item.lon) === targetLon
  );
}

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const mode = searchParams.get("mode") ?? "live";

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return errorResponse(
      requestId,
      400,
      "INVALID_COORDS",
      "Provide valid lat and lon query parameters."
    );
  }

  try {
    if (mode === "mock") {
      const fixture = matchFixture(loadFixtures(), lat, lon);
      if (!fixture) {
        return errorResponse(
          requestId,
          404,
          "MOCK_NOT_FOUND",
          "Mock fixture not found for these coordinates."
        );
      }
      const resolution = buildLocationResolution("gps", fixture.expectedRegion);
      incrementReverseGeocodeMethod("mock");
      console.info(`[${requestId}] reverse_geocode mock`);
      return okResponse(requestId, {
        country: fixture.expectedCountry,
        region: fixture.expectedRegion,
        method: "gps",
        provider: "mock",
        confidence: resolution.confidence
      });
    }

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

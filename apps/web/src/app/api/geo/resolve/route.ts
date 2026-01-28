import { reverseGeocode } from "@/lib/geo/reverseGeocode";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import fs from "node:fs";
import path from "node:path";

type GeoResolvePayload = {
  lat?: number;
  lon?: number;
  accuracy?: number;
  permission?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function appendSsotLine(line: string) {
  const reportsPath = path.join(process.cwd(), "Reports", "ci-final.txt");
  const runId = process.env.RUN_ID;
  const runPath = runId
    ? path.join(process.cwd(), "Artifacts", "runs", runId, "ci-final.txt")
    : null;
  try {
    fs.mkdirSync(path.dirname(reportsPath), { recursive: true });
    fs.appendFileSync(reportsPath, `${line}\n`);
  } catch {
    // Ignore SSOT append failures.
  }
  if (runPath) {
    try {
      fs.mkdirSync(path.dirname(runPath), { recursive: true });
      fs.appendFileSync(runPath, `${line}\n`);
    } catch {
      // Ignore run-scoped SSOT failures.
    }
  }
}

function isNetworkAllowed() {
  if (process.env.NET_MODE === "OFFLINE") return false;
  if (process.env.ALLOW_NETWORK === "0") return false;
  if (process.env.FETCH_NETWORK === "0") return false;
  return true;
}

export async function POST(req: Request) {
  const requestId = createRequestId(req);
  let payload: GeoResolvePayload = {};
  try {
    payload = (await req.json()) as GeoResolvePayload;
  } catch {
    return errorResponse(requestId, 400, "BAD_INPUT", "Invalid JSON body.");
  }

  const lat = payload.lat;
  const lon = payload.lon;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) {
    return errorResponse(requestId, 400, "BAD_INPUT", "Missing coordinates.");
  }

  const permission = payload.permission ?? "prompt";

  if (!isNetworkAllowed()) {
    appendSsotLine(
      `GEO_RESOLVE ok=0 source=BROWSER permission=${permission} reason=OFFLINE_NO_GEO`
    );
    return errorResponse(
      requestId,
      503,
      "OFFLINE_NO_GEO",
      "Geolocation is unavailable while offline.",
      "Choose a location manually."
    );
  }

  const resolved = await reverseGeocode(lat, lon);
  appendSsotLine(
    `GEO_RESOLVE ok=1 source=BROWSER permission=${permission} iso=${resolved.country} geo=${resolved.country}${resolved.region ? `-${resolved.region}` : ""} reason=OK`
  );

  return okResponse(requestId, {
    source: "BROWSER",
    permission,
    iso: resolved.country,
    region: resolved.region ?? null,
    provider: resolved.method,
    confidence: resolved.method === "bbox" ? "LOW" : "HIGH"
  });
}

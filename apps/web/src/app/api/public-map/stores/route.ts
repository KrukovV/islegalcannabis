import { NextResponse } from "next/server";
import {
  queryVisibleStores,
  STORE_TYPES,
  type StoreBounds,
  type StoreType,
} from "@/lib/storeTruth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_CONTROL = "no-store, max-age=0";

function readNumber(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseBounds(searchParams: URLSearchParams): StoreBounds | null {
  const west = readNumber(searchParams.get("west"));
  const south = readNumber(searchParams.get("south"));
  const east = readNumber(searchParams.get("east"));
  const north = readNumber(searchParams.get("north"));
  if ([west, south, east, north].some((value) => value === null)) return null;
  if (west! < -180 || west! > 180 || east! < -180 || east! > 180) return null;
  if (south! < -90 || south! > 90 || north! < -90 || north! > 90 || south! > north!) return null;
  return { west: west!, south: south!, east: east!, north: north! };
}

function parseTypes(value: string | null): StoreType[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is StoreType => STORE_TYPES.includes(item as StoreType));
}

/** Public read-only Store Truth adapter. It applies the canonical visibility gate unchanged. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bounds = parseBounds(searchParams);
  const zoom = readNumber(searchParams.get("zoom"));
  if (!bounds || zoom === null || zoom < 0 || zoom > 24) {
    return NextResponse.json(
      { error: "INVALID_VIEWPORT_QUERY" },
      { status: 400, headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }
  const result = queryVisibleStores({ ...bounds, zoom, types: parseTypes(searchParams.get("types")) });
  const payload = {
    type: "FeatureCollection",
    features: result.features,
    meta: {
      level: result.level,
      visibleStores: result.visibleStores,
      blockedStores: result.blockedStores,
      circularTruthDependencies: result.circularTruthDependencies,
      spatialCandidateStores: result.spatialCandidateStores,
      queryDurationMs: result.queryDurationMs,
      query: { ...bounds, zoom },
    },
  };
  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  return NextResponse.json(
    {
      ...payload,
      meta: { ...payload.meta, estimatedPayloadBytes: payloadBytes },
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}

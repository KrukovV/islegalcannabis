import { NextResponse } from "next/server";
import { buildAntarcticaLandSourceSnapshot } from "@/new-map/countrySource";

const ANTARCTICA_LAND_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

export const dynamic = "force-dynamic";
export const revalidate = 0;

let cachedSnapshot: ReturnType<typeof buildAntarcticaLandSourceSnapshot> | null = null;

export async function GET() {
  const snapshot = cachedSnapshot || buildAntarcticaLandSourceSnapshot();
  cachedSnapshot = snapshot;
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": ANTARCTICA_LAND_CACHE_CONTROL,
      "cdn-cache-control": ANTARCTICA_LAND_CACHE_CONTROL,
      "vercel-cdn-cache-control": ANTARCTICA_LAND_CACHE_CONTROL
    }
  });
}

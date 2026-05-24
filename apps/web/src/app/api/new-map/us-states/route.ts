import { NextResponse } from "next/server";
import { buildUsStateSourceSnapshot } from "@/new-map/countrySource";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const STATIC_MAP_CACHE = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

export async function GET() {
  return NextResponse.json(buildUsStateSourceSnapshot(), {
    headers: {
      "cache-control": STATIC_MAP_CACHE
    }
  });
}

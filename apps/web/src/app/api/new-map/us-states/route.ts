import { NextResponse } from "next/server";
import { buildUsStateSourceSnapshot } from "@/new-map/countrySource";

export const dynamic = "force-static";
export const revalidate = 86400;
const STATIC_MAP_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET() {
  return NextResponse.json(buildUsStateSourceSnapshot(), {
    headers: {
      "Cache-Control": STATIC_MAP_CACHE
    }
  });
}

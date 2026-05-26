import { NextResponse } from "next/server";
import { buildCardIndexSnapshot } from "@/new-map/countrySource";

export const dynamic = "force-static";
export const revalidate = 86400;
const STATIC_MAP_CACHE = "public, max-age=31536000, immutable";

export async function GET() {
  return NextResponse.json(buildCardIndexSnapshot(), {
    headers: {
      "Cache-Control": STATIC_MAP_CACHE
    }
  });
}

import { NextResponse } from "next/server";
import { buildCardIndexSnapshot } from "@/new-map/countrySource";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const RUNTIME_MAP_CACHE = "no-store";

export async function GET() {
  return NextResponse.json(buildCardIndexSnapshot({ fresh: true }), {
    headers: {
      "Cache-Control": RUNTIME_MAP_CACHE
    }
  });
}

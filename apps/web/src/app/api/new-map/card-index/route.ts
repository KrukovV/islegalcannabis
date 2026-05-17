import { NextResponse } from "next/server";
import { buildCardIndexSnapshot } from "@/new-map/countrySource";

const CARD_INDEX_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

export const dynamic = "force-dynamic";
export const revalidate = 0;

let cachedSnapshot: ReturnType<typeof buildCardIndexSnapshot> | null = null;

export async function GET() {
  const snapshot = cachedSnapshot || buildCardIndexSnapshot();
  cachedSnapshot = snapshot;
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": CARD_INDEX_CACHE_CONTROL,
      "cdn-cache-control": CARD_INDEX_CACHE_CONTROL,
      "vercel-cdn-cache-control": CARD_INDEX_CACHE_CONTROL
    }
  });
}

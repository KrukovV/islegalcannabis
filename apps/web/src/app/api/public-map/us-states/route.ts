import {
  STATIC_TRUTH_MAP_US_STATES_HASH,
  STATIC_TRUTH_MAP_US_STATES_URL
} from "@/truth-map/staticTruthMap";

export const dynamic = "force-static";
export const revalidate = false;

/** Public compatibility adapter for the proven content-addressed static asset. */
export async function GET() {
  return new Response(null, {
    status: 308,
    headers: {
      Location: STATIC_TRUTH_MAP_US_STATES_URL,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Truth-Map-Hash": STATIC_TRUTH_MAP_US_STATES_HASH
    }
  });
}

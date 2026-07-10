import {
  STATIC_COUNTRIES_HASH,
  STATIC_COUNTRIES_URL
} from "@/new-map/staticCountries";

export const dynamic = "force-static";
export const revalidate = false;

export async function GET() {
  return new Response(null, {
    status: 308,
    headers: {
      Location: STATIC_COUNTRIES_URL,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-New-Map-Countries-Hash": STATIC_COUNTRIES_HASH
    }
  });
}

import { NextResponse } from "next/server";
import { buildCountrySourceSnapshot } from "@/new-map/countrySource";

const COUNTRY_SOURCE_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

export const dynamic = "force-dynamic";
export const revalidate = 0;

let cachedSnapshot: ReturnType<typeof buildCountrySourceSnapshot> | null = null;

export async function GET() {
  const snapshot = cachedSnapshot || buildCountrySourceSnapshot();
  cachedSnapshot = snapshot;
  console.warn(
    `NEW_MAP_COUNTRIES_SNAPSHOT features=${snapshot.features.length} statuses=${snapshot.features
      .slice(0, 5)
      .map((feature) => `${feature.properties.geo}:${feature.properties.status || feature.properties.result?.status}`)
      .join(",")}`
  );
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": COUNTRY_SOURCE_CACHE_CONTROL,
      "cdn-cache-control": COUNTRY_SOURCE_CACHE_CONTROL,
      "vercel-cdn-cache-control": COUNTRY_SOURCE_CACHE_CONTROL
    }
  });
}

import { NextResponse } from "next/server";
import { buildCountrySourceSnapshot } from "@/new-map/countrySource";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const STATIC_MAP_CACHE = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

export async function GET() {
  const snapshot = buildCountrySourceSnapshot();
  console.warn(
    `NEW_MAP_COUNTRIES_SNAPSHOT features=${snapshot.features.length} statuses=${snapshot.features
      .slice(0, 5)
      .map((feature) => `${feature.properties.geo}:${feature.properties.result.status}`)
      .join(",")}`
  );
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": STATIC_MAP_CACHE
    }
  });
}

import { STATIC_BASEMAP_STYLE } from "@/new-map/staticBasemapStyle";

const STATIC_MAP_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export const revalidate = 86400;
export const dynamic = "force-dynamic";

export async function GET() {
  // The shared map runtime requires the accepted OpenMapTiles source schema.
  // Reuse the public map's committed style instead of a mutable upstream URL.
  return Response.json(STATIC_BASEMAP_STYLE, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": STATIC_MAP_CACHE
    }
  });
}

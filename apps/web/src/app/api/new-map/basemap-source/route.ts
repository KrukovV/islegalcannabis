import { getPublicOrigin } from "../_lib/publicOrigin";

const UPSTREAM_TILEJSON_URL = "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json";
const BASEMAP_SOURCE_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const response = await fetch(UPSTREAM_TILEJSON_URL, {
    headers: {
      accept: "application/json"
    },
    next: {
      revalidate: 86400
    }
  });

  if (!response.ok) {
    return new Response(`basemap_source_fetch_failed:${response.status}`, { status: 502 });
  }

  const tilejson = await response.json();
  const origin = getPublicOrigin(request);
  tilejson.tiles = [`${origin}/api/new-map/basemap-tile/{z}/{x}/{y}`];

  return Response.json(tilejson, {
    headers: {
      "cache-control": BASEMAP_SOURCE_CACHE_CONTROL,
      "cdn-cache-control": BASEMAP_SOURCE_CACHE_CONTROL,
      "vercel-cdn-cache-control": BASEMAP_SOURCE_CACHE_CONTROL
    }
  });
}

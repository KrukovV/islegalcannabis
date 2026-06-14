const UPSTREAM_TILEJSON_URL = "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json";
const STATIC_MAP_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export const revalidate = 86400;

export async function GET() {
  const response = await fetch(UPSTREAM_TILEJSON_URL, {
    headers: {
      accept: "application/json"
    },
    next: { revalidate: 86400 }
  });

  if (!response.ok) {
    return new Response(`basemap_source_fetch_failed:${response.status}`, { status: 502 });
  }

  const tilejson = await response.json();

  return Response.json(tilejson, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": STATIC_MAP_CACHE
    }
  });
}

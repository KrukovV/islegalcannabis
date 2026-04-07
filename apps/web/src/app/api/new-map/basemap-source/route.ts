import { getPublicOrigin } from "../_lib/publicOrigin";

const UPSTREAM_TILEJSON_URL = "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const response = await fetch(UPSTREAM_TILEJSON_URL, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return new Response(`basemap_source_fetch_failed:${response.status}`, { status: 502 });
  }

  const tilejson = await response.json();
  const origin = getPublicOrigin(request);
  tilejson.tiles = [`${origin}/api/new-map/basemap-tile/{z}/{x}/{y}`];

  return Response.json(tilejson, {
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}

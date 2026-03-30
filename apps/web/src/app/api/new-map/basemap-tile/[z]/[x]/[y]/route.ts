const SHARDS = ["a", "b", "c", "d"] as const;
const EMPTY_TILE_BYTES = new Uint8Array();

function pickShard(x: number, y: number) {
  return SHARDS[Math.abs(x + y) % SHARDS.length];
}

function buildUpstreamTileUrl(z: string, x: string, y: string) {
  const xi = Number.parseInt(x, 10);
  const yi = Number.parseInt(y, 10);
  const shard = pickShard(Number.isFinite(xi) ? xi : 0, Number.isFinite(yi) ? yi : 0);
  return `https://tiles-${shard}.basemaps.cartocdn.com/vectortiles/carto.streets/v1/${z}/${x}/${y}.mvt`;
}

function buildTileHeaders() {
  return {
    "content-type": "application/x-protobuf",
    "cache-control": "public, max-age=300, stale-while-revalidate=86400"
  };
}

export async function GET(_request: Request, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await context.params;
  const upstreamUrl = buildUpstreamTileUrl(z, x, y);
  const response = await fetch(upstreamUrl, {
    headers: {
      accept: "application/x-protobuf"
    },
    cache: "force-cache"
  });

  if (response.status === 404) {
    return new Response(EMPTY_TILE_BYTES, {
      status: 200,
      headers: buildTileHeaders()
    });
  }

  if (!response.ok) {
    return new Response(`basemap_tile_fetch_failed:${response.status}`, { status: 502 });
  }

  return new Response(response.body, {
    status: 200,
    headers: buildTileHeaders()
  });
}

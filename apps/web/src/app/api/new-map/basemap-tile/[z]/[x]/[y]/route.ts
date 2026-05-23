const SHARDS = ["a", "b", "c", "d"] as const;
const EMPTY_TILE_BYTES = new Uint8Array();

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    "cache-control": "no-store, no-cache, must-revalidate"
  };
}

export async function GET(_request: Request, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await context.params;
  const upstreamUrl = buildUpstreamTileUrl(z, x, y);
  let response;
  try {
    response = await fetch(upstreamUrl, {
      headers: {
        accept: "application/x-protobuf"
      },
      cache: "no-store"
    });
  } catch {
    return new Response(EMPTY_TILE_BYTES, {
      status: 200,
      headers: buildTileHeaders()
    });
  }

  if (response.status === 404) {
    return new Response(EMPTY_TILE_BYTES, {
      status: 200,
      headers: buildTileHeaders()
    });
  }

  if (!response.ok) {
    return new Response(EMPTY_TILE_BYTES, {
      status: 200,
      headers: buildTileHeaders()
    });
  }

  return new Response(response.body, {
    status: 200,
    headers: buildTileHeaders()
  });
}

const GLYPH_CACHE = "public, max-age=31536000, immutable";

export const revalidate = 31536000;

function glyphHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": GLYPH_CACHE,
    "Content-Type": "application/x-protobuf"
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ fontstack: string; range: string }> }
) {
  const { fontstack, range } = await context.params;
  if (!/^\d+-\d+\.pbf$/u.test(range)) {
    return new Response("bad_glyph_range", { status: 400, headers: glyphHeaders() });
  }

  const upstreamUrl = `https://tiles.basemaps.cartocdn.com/fonts/${encodeURIComponent(fontstack)}/${encodeURIComponent(range)}`;
  const response = await fetch(upstreamUrl, {
    headers: {
      accept: "application/x-protobuf"
    },
    next: { revalidate: 31536000 }
  }).catch(() => null);

  if (!response?.ok) {
    return new Response(`basemap_glyph_fetch_failed:${response?.status || 0}`, {
      status: 502,
      headers: glyphHeaders()
    });
  }

  return new Response(response.body, {
    status: 200,
    headers: glyphHeaders()
  });
}

const SPRITE_CACHE = "public, max-age=31536000, immutable";
const ALLOWED_SPRITES = new Set(["sprite.json", "sprite@2x.json", "sprite.png", "sprite@2x.png"]);

export const revalidate = 31536000;

function spriteHeaders(file: string) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": SPRITE_CACHE,
    "Content-Type": file.endsWith(".png") ? "image/png" : "application/json; charset=utf-8"
  };
}

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (!ALLOWED_SPRITES.has(file)) {
    return new Response("bad_sprite_file", { status: 400, headers: spriteHeaders("sprite.json") });
  }

  const upstreamUrl = `https://tiles.basemaps.cartocdn.com/gl/positron-gl-style/${file}`;
  const response = await fetch(upstreamUrl, {
    headers: {
      accept: file.endsWith(".png") ? "image/png" : "application/json"
    },
    next: { revalidate: 31536000 }
  }).catch(() => null);

  if (!response?.ok) {
    return new Response(`basemap_sprite_fetch_failed:${response?.status || 0}`, {
      status: 502,
      headers: spriteHeaders(file)
    });
  }

  return new Response(response.body, {
    status: 200,
    headers: spriteHeaders(file)
  });
}

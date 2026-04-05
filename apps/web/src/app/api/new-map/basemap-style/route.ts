import { getPublicOrigin } from "../_lib/publicOrigin";

const UPSTREAM_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export async function GET(request: Request) {
  const response = await fetch(UPSTREAM_STYLE_URL, {
    headers: {
      accept: "application/json"
    },
    cache: "force-cache"
  });

  if (!response.ok) {
    return new Response(`basemap_style_fetch_failed:${response.status}`, { status: 502 });
  }

  const style = await response.json();
  const origin = getPublicOrigin(request);
  const sources = style && typeof style === "object" ? style.sources : null;
  if (sources && typeof sources === "object" && sources.carto && typeof sources.carto === "object") {
    sources.carto = {
      ...sources.carto,
      url: `${origin}/api/new-map/basemap-source`
    };
  }

  return Response.json(style, {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400"
    }
  });
}

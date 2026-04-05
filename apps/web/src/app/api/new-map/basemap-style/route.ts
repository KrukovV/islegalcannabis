import { getPublicOrigin } from "../_lib/publicOrigin";

const UPSTREAM_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const OCEAN_BACKGROUND = "#c6d0d7";

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
  if (style && typeof style === "object" && Array.isArray(style.layers)) {
    const backgroundLayer = style.layers.find((layer: { id?: string; type?: string }) => layer?.id === "background" && layer?.type === "background");
    if (backgroundLayer && backgroundLayer.paint && typeof backgroundLayer.paint === "object") {
      backgroundLayer.paint = {
        ...backgroundLayer.paint,
        "background-color": OCEAN_BACKGROUND,
        "background-opacity": 1
      };
    }
  }
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

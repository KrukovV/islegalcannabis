import { getPublicOrigin } from "../_lib/publicOrigin";

const UPSTREAM_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const OCEAN_BACKGROUND = "#c6d0d7";
const SUBTLE_BOUNDARY = "rgba(198, 208, 215, 0.18)";

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
    for (const layer of style.layers as Array<{ id?: string; type?: string; paint?: Record<string, unknown> }>) {
      if (!layer?.paint || typeof layer.paint !== "object") continue;
      if (layer.id === "background" && layer.type === "background") {
        layer.paint = {
          ...layer.paint,
          "background-color": OCEAN_BACKGROUND,
          "background-opacity": 1
        };
        continue;
      }
      if (layer.id === "water" && layer.type === "fill") {
        layer.paint = {
          ...layer.paint,
          "fill-color": OCEAN_BACKGROUND,
          "fill-opacity": 1
        };
        continue;
      }
      if (layer.id === "boundary_country_outline" && layer.type === "line") {
        layer.paint = {
          ...layer.paint,
          "line-color": SUBTLE_BOUNDARY,
          "line-opacity": 0.18
        };
        continue;
      }
      if (layer.id === "boundary_country_inner" && layer.type === "line") {
        layer.paint = {
          ...layer.paint,
          "line-color": "rgba(141, 154, 168, 0.2)",
          "line-opacity": 0.2
        };
      }
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

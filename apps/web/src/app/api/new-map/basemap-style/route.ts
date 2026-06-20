import { NEW_MAP_WATER_COLOR } from "@/new-map/mapPalette";

const UPSTREAM_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const SUBTLE_BOUNDARY = "rgba(198, 208, 215, 0.18)";
const STATIC_MAP_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export const revalidate = 86400;
export const dynamic = "force-dynamic";

export async function GET() {
  const styleResponse = await fetch(UPSTREAM_STYLE_URL, {
    headers: {
      accept: "application/json"
    },
    next: { revalidate: 86400 }
  });

  if (!styleResponse.ok) {
    return new Response(`basemap_style_fetch_failed:${styleResponse.status}`, { status: 502 });
  }

  const style = await styleResponse.json();
  if (style && typeof style === "object" && Array.isArray(style.layers)) {
    delete (style as Record<string, unknown>).light;
    delete (style as Record<string, unknown>).fog;
    delete (style as Record<string, unknown>).sky;
    delete (style as Record<string, unknown>).terrain;
    for (const layer of style.layers as Array<{ id?: string; type?: string; paint?: Record<string, unknown> }>) {
      if (layer.paint && typeof layer.paint === "object") {
        for (const key of Object.keys(layer.paint)) {
          if (/color-adjust/i.test(key)) {
            delete layer.paint[key];
          }
        }
      }
      if (!layer?.paint || typeof layer.paint !== "object") continue;
      if (layer.type === "background") {
        layer.paint = {
          ...layer.paint,
          "background-color": NEW_MAP_WATER_COLOR
        };
        continue;
      }
      if (layer.id === "water" && layer.type === "fill") {
        layer.paint = {
          ...layer.paint,
          "fill-color": NEW_MAP_WATER_COLOR,
          "fill-antialias": false
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

  return Response.json(style, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": STATIC_MAP_CACHE
    }
  });
}
